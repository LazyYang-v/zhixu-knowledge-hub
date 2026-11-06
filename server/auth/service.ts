import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../db/session.js";
import { AppError } from "../http/errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { roleCapabilities, type AuthUser } from "../../shared/auth.js";
export { roleCapabilities } from "../../shared/auth.js";

export type Principal = AuthUser;
export const digestToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const csrfToken = (token: string) => digestToken(`zhixu-csrf:${token}`);
const unauthenticated = () =>
  new AppError(401, "UNAUTHENTICATED", "请登录后继续");
const forbidden = () => new AppError(403, "FORBIDDEN", "没有执行此操作的权限");
export async function authEvent(
  client: PoolClient,
  tenant: string,
  actor: string | null,
  action: string,
  target?: string,
  outcome = "committed",
  request?: { id: string; method: string; status: number },
) {
  await client.query(
    "INSERT INTO auth_events(id,tenant_id,actor_membership_id,action,target_id,outcome,request_id,method,http_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      randomUUID(),
      tenant,
      actor,
      action,
      target ?? null,
      outcome,
      request?.id ?? null,
      request?.method ?? null,
      request?.status ?? null,
    ],
  );
}
async function lockTenant(client: PoolClient, tenant: string) {
  const row = await client.query(
    "SELECT status FROM tenants WHERE id=$1 FOR UPDATE",
    [tenant],
  );
  if (row.rows[0]?.status !== "active") throw forbidden();
}
export class AuthService {
  private activeLogins = 0;
  constructor(
    readonly pool: Pool,
    readonly schema: string,
    readonly tenantId: string,
  ) {}
  async principal(client: PoolClient, token: string): Promise<Principal> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw unauthenticated();
    const result = await client.query(
      `SELECT u.id AS user_id,u.email_normalized,u.display_name,m.id AS member_id,m.tenant_id,m.role_id,m.revision,r.permissions
      FROM auth_sessions s JOIN memberships m ON (m.tenant_id=s.tenant_id AND m.id=s.membership_id)
      JOIN users u ON u.id=m.user_id JOIN roles r ON (r.tenant_id=m.tenant_id AND r.id=m.role_id)
      JOIN tenants t ON t.id=m.tenant_id
      WHERE s.token_hash=$1 AND s.tenant_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()
      AND m.status='active' AND u.status='active' AND t.status='active'`,
      [digestToken(token), this.tenantId],
    );
    const row = result.rows[0];
    if (!row) throw unauthenticated();
    const grants = await client.query(
      "SELECT base_id,permissions FROM knowledge_grants WHERE tenant_id=$1 AND membership_id=$2",
      [this.tenantId, row.member_id],
    );
    const accounts = await client.query(
      "SELECT count(*) AS n FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='active' AND u.status='active' AND ($2::boolean OR m.id=$3)",
      [
        this.tenantId,
        row.permissions.includes("workspace.manage"),
        row.member_id,
      ],
    );
    return {
      userId: row.user_id,
      memberId: row.member_id,
      tenantId: row.tenant_id,
      email: row.email_normalized,
      name: row.display_name,
      role: row.role_id,
      revision: Number(row.revision),
      capabilities: row.permissions,
      grants: Object.fromEntries(
        grants.rows.map((grant) => [grant.base_id, grant.permissions]),
      ),
      visibleAccountCount: Number(accounts.rows[0].n),
    };
  }
  session(token: string) {
    return transaction(this.pool, this.schema, false, (client) =>
      this.principal(client, token),
    );
  }
  async bootstrap(
    input: { email: string; name: string; password: string },
    prepare?: (client: PoolClient) => Promise<void>,
  ) {
    const password = await hashPassword(input.password);
    return transaction(this.pool, this.schema, true, async (client) => {
      await prepare?.(client);
      await lockTenant(client, this.tenantId);
      if (
        (
          await client.query("SELECT 1 FROM memberships WHERE tenant_id=$1", [
            this.tenantId,
          ])
        ).rowCount
      )
        throw new AppError(
          409,
          "BOOTSTRAP_ALREADY_USED",
          "工作空间已有账户，不能再次初始化",
        );
      for (const [id, capabilities] of Object.entries(roleCapabilities))
        await client.query(
          "INSERT INTO roles(tenant_id,id,permissions) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [this.tenantId, id, capabilities],
        );
      const id = await this.insertUser(client, input, password, "admin");
      await authEvent(client, this.tenantId, id, "bootstrap", id);
      return id;
    });
  }
  private async insertUser(
    client: PoolClient,
    input: { email: string; name: string },
    password: string,
    role: string,
  ) {
    const user = randomUUID(),
      member = randomUUID(),
      email = input.email.trim().toLowerCase();
    if (
      (
        await client.query("SELECT 1 FROM users WHERE email_normalized=$1", [
          email,
        ])
      ).rowCount
    )
      throw new AppError(
        409,
        "EMAIL_ALREADY_REGISTERED",
        "此邮箱已登记，需通过身份关联流程加入工作空间",
      );
    await client.query(
      "INSERT INTO users(id,email_normalized,display_name,status) VALUES($1,$2,$3,'active')",
      [user, email, input.name],
    );
    await client.query(
      "INSERT INTO auth_identities(user_id,provider,provider_subject,password_hash) VALUES($1,'local',$2,$3)",
      [user, email, password],
    );
    await client.query(
      "INSERT INTO memberships(tenant_id,id,user_id,role_id,status) VALUES($1,$2,$3,$4,'active')",
      [this.tenantId, member, user, role],
    );
    return member;
  }
  async login(email: string, password: string) {
    if (this.activeLogins >= 2)
      throw new AppError(429, "LOGIN_BUSY", "登录服务繁忙，请稍后重试");
    this.activeLogins++;
    try {
      const key = digestToken(`${this.tenantId}:${email.trim().toLowerCase()}`);
      const identity = await transaction(
        this.pool,
        this.schema,
        true,
        async (client) => {
          await client.query(
            "DELETE FROM login_attempts WHERE window_start<now()-interval '15 minutes'",
          );
          const admitted = await client.query(
            `INSERT INTO login_attempts(key_hash,attempts,window_start) VALUES($1,1,now())
            ON CONFLICT(key_hash) DO UPDATE SET attempts=login_attempts.attempts+1 WHERE login_attempts.attempts<120 RETURNING attempts`,
            [digestToken(`global:${this.tenantId}`)],
          );
          if (!admitted.rowCount) return null;
          const attempts = await client.query(
            `INSERT INTO login_attempts(key_hash,attempts,window_start) VALUES($1,1,now())
          ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
          window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END
          WHERE login_attempts.attempts<5 OR login_attempts.window_start<now()-interval '15 minutes' RETURNING attempts`,
            [key],
          );
          if (!attempts.rowCount) return null;
          const found = await client.query(
            "SELECT i.password_hash,i.user_id FROM auth_identities i WHERE provider='local' AND provider_subject=$1",
            [email.trim().toLowerCase()],
          );
          return { identity: found.rows[0] };
        },
      );
      if (!identity)
        throw new AppError(
          429,
          "LOGIN_RATE_LIMITED",
          "登录尝试过多，请稍后重试",
        );
      const valid = await verifyPassword(
        password,
        identity.identity?.password_hash,
      );
      if (!valid) {
        await transaction(this.pool, this.schema, true, (client) =>
          authEvent(client, this.tenantId, null, "login", undefined, "denied"),
        );
        throw new AppError(401, "INVALID_CREDENTIALS", "邮箱或密码无效");
      }
      const token = randomBytes(32).toString("hex");
      await transaction(this.pool, this.schema, true, async (client) => {
        await lockTenant(client, this.tenantId);
        const member = await client.query(
          "SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='active' AND u.status='active'",
          [this.tenantId, identity.identity.user_id],
        );
        if (!member.rows[0])
          throw new AppError(401, "INVALID_CREDENTIALS", "邮箱或密码无效");
        await client.query(
          "INSERT INTO auth_sessions(token_hash,tenant_id,membership_id,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
          [digestToken(token), this.tenantId, member.rows[0].id],
        );
        await client.query("DELETE FROM login_attempts WHERE key_hash=$1", [
          key,
        ]);
        await authEvent(
          client,
          this.tenantId,
          member.rows[0].id,
          "login",
          member.rows[0].id,
        );
      });
      return {
        token,
        principal: await this.session(token),
        csrfToken: csrfToken(token),
      };
    } finally {
      this.activeLogins--;
    }
  }
  async logout(token: string) {
    return transaction(this.pool, this.schema, true, async (client) => {
      await lockTenant(client, this.tenantId);
      const principal = await this.principal(client, token);
      await client.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",
        [digestToken(token)],
      );
      await authEvent(
        client,
        this.tenantId,
        principal.memberId,
        "logout",
        principal.memberId,
      );
    });
  }
  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword)
      throw new AppError(400, "PASSWORD_UNCHANGED", "新密码不能与当前密码相同");
    const previous = await transaction(
      this.pool,
      this.schema,
      true,
      async (client) => {
        const actor = await this.principal(client, token);
        const key = digestToken(`password:${this.tenantId}:${actor.memberId}`);
        const attempts = await client.query(
          `INSERT INTO login_attempts(key_hash,attempts,window_start) VALUES($1,1,now())
        ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
        window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END
        WHERE login_attempts.attempts<5 OR login_attempts.window_start<now()-interval '15 minutes' RETURNING attempts`,
          [key],
        );
        if (!attempts.rowCount) return null;
        const identity = (
          await client.query(
            "SELECT password_hash FROM auth_identities WHERE user_id=$1 AND provider='local'",
            [actor.userId],
          )
        ).rows[0];
        return { actor, key, hash: identity?.password_hash };
      },
    );
    if (!previous)
      throw new AppError(
        429,
        "PASSWORD_RATE_LIMITED",
        "密码校验尝试过多，请稍后重试",
      );
    if (!(await verifyPassword(currentPassword, previous.hash))) {
      await transaction(this.pool, this.schema, true, (client) =>
        authEvent(
          client,
          this.tenantId,
          previous.actor.memberId,
          "password.change",
          previous.actor.memberId,
          "denied",
        ),
      );
      throw new AppError(400, "CURRENT_PASSWORD_INVALID", "当前密码无效");
    }
    const password = await hashPassword(newPassword);
    await transaction(this.pool, this.schema, true, async (client) => {
      await lockTenant(client, this.tenantId);
      const actor = await this.principal(client, token);
      const current = (
        await client.query(
          "SELECT password_hash FROM auth_identities WHERE user_id=$1 AND provider='local' FOR UPDATE",
          [actor.userId],
        )
      ).rows[0];
      if (current?.password_hash !== previous.hash)
        throw new AppError(409, "PASSWORD_CHANGED", "密码已被更新，请重新登录");
      await client.query(
        "UPDATE auth_identities SET password_hash=$2 WHERE user_id=$1 AND provider='local'",
        [actor.userId, password],
      );
      await client.query(
        "UPDATE auth_sessions s SET revoked_at=now() FROM memberships m WHERE s.tenant_id=m.tenant_id AND s.membership_id=m.id AND m.user_id=$1",
        [actor.userId],
      );
      await client.query("DELETE FROM login_attempts WHERE key_hash=$1", [
        previous.key,
      ]);
      await authEvent(
        client,
        this.tenantId,
        actor.memberId,
        "password.change",
        actor.memberId,
      );
    });
  }
  async access(token: string) {
    return transaction(this.pool, this.schema, false, async (client) => {
      const principal = await this.principal(client, token);
      if (!principal.capabilities.includes("workspace.manage"))
        throw forbidden();
      const members = await client.query(
        "SELECT m.id,m.role_id AS role,m.status,m.revision,u.display_name AS name,u.email_normalized AS email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.created_at,m.id",
        [this.tenantId],
      );
      const grants = await client.query(
        'SELECT base_id AS "baseId",membership_id AS "memberId",permissions FROM knowledge_grants WHERE tenant_id=$1 ORDER BY base_id,membership_id',
        [this.tenantId],
      );
      return {
        members: members.rows.map((member) => ({
          ...member,
          revision: Number(member.revision),
        })),
        grants: grants.rows,
      };
    });
  }
  async createMember(
    token: string,
    input: { email: string; name: string; password: string; role: string },
  ) {
    if (!(await this.session(token)).capabilities.includes("workspace.manage"))
      throw forbidden();
    const password = await hashPassword(input.password);
    return transaction(this.pool, this.schema, true, async (client) => {
      await lockTenant(client, this.tenantId);
      const actor = await this.principal(client, token);
      if (!actor.capabilities.includes("workspace.manage")) throw forbidden();
      const member = await this.insertUser(client, input, password, input.role);
      await authEvent(
        client,
        this.tenantId,
        actor.memberId,
        "account.create",
        member,
      );
      return member;
    });
  }
  async updateMember(
    token: string,
    id: string,
    input: { revision: number; role: string; status: string },
  ) {
    return transaction(this.pool, this.schema, true, async (client) => {
      await lockTenant(client, this.tenantId);
      const actor = await this.principal(client, token);
      if (!actor.capabilities.includes("workspace.manage")) throw forbidden();
      const row = (
        await client.query(
          "SELECT role_id,status,revision FROM memberships WHERE tenant_id=$1 AND id=$2",
          [this.tenantId, id],
        )
      ).rows[0];
      if (!row) throw new AppError(404, "NOT_FOUND", "账户不存在");
      if (Number(row.revision) !== input.revision)
        throw new AppError(409, "VERSION_CONFLICT", "账户已变更，请刷新后重试");
      if (
        row.role_id === "admin" &&
        row.status === "active" &&
        (input.role !== "admin" || input.status !== "active")
      ) {
        const count = await client.query(
          "SELECT count(*) AS n FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.role_id='admin' AND m.status='active' AND u.status='active'",
          [this.tenantId],
        );
        if (Number(count.rows[0].n) <= 1)
          throw new AppError(409, "LAST_ADMIN", "不能停用最后一位管理员");
      }
      await client.query(
        "UPDATE memberships SET role_id=$3,status=$4,revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [this.tenantId, id, input.role, input.status],
      );
      await client.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE tenant_id=$1 AND membership_id=$2",
        [this.tenantId, id],
      );
      await authEvent(
        client,
        this.tenantId,
        actor.memberId,
        "account.update",
        id,
      );
    });
  }
  async grant(
    token: string,
    baseId: string,
    input: {
      revision: number;
      grants: { memberId: string; permissions: string[] }[];
    },
  ) {
    return transaction(this.pool, this.schema, true, async (client) => {
      await lockTenant(client, this.tenantId);
      const actor = await this.principal(client, token);
      if (
        !actor.capabilities.includes("workspace.manage") &&
        !(
          actor.capabilities.includes("manage") &&
          actor.grants[baseId]?.includes("manage")
        )
      )
        throw forbidden();
      const base = (
        await client.query(
          "SELECT revision FROM knowledge_bases WHERE tenant_id=$1 AND id=$2",
          [this.tenantId, baseId],
        )
      ).rows[0];
      if (!base) throw new AppError(404, "NOT_FOUND", "知识库不存在");
      if (Number(base.revision) !== input.revision)
        throw new AppError(
          409,
          "VERSION_CONFLICT",
          "知识库已变更，请刷新后重试",
        );
      if (
        new Set(input.grants.map((grant) => grant.memberId)).size !==
        input.grants.length
      )
        throw new AppError(400, "VALIDATION_ERROR", "成员授权重复");
      for (const grant of input.grants) {
        const member = (
          await client.query(
            "SELECT r.permissions FROM memberships m JOIN roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=$1 AND m.id=$2 AND m.status='active'",
            [this.tenantId, grant.memberId],
          )
        ).rows[0];
        if (
          !member ||
          grant.permissions.some(
            (permission) => !member.permissions.includes(permission),
          )
        )
          throw new AppError(400, "ROLE_CAP_EXCEEDED", "授权超过成员角色能力");
      }
      await client.query(
        "DELETE FROM knowledge_grants WHERE tenant_id=$1 AND base_id=$2",
        [this.tenantId, baseId],
      );
      for (const grant of input.grants)
        await client.query(
          "INSERT INTO knowledge_grants(tenant_id,base_id,membership_id,permissions) VALUES($1,$2,$3,$4)",
          [
            this.tenantId,
            baseId,
            grant.memberId,
            [...new Set(grant.permissions)],
          ],
        );
      await client.query(
        "UPDATE knowledge_bases SET revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [this.tenantId, baseId],
      );
      await authEvent(
        client,
        this.tenantId,
        actor.memberId,
        "grant.replace",
        baseId,
      );
    });
  }
}

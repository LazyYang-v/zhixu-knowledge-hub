import { z } from "zod";
export const roleCapabilities: Record<string, string[]> = {
  admin: [
    "read",
    "write",
    "publish",
    "manage",
    "workspace.manage",
    "audit.read",
    "upload",
    "base.create",
  ],
  editor: ["read", "write", "upload", "base.create"],
  viewer: ["read"],
};
export interface AuthUser {
  userId: string;
  memberId: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  revision: number;
  capabilities: string[];
  grants: Record<string, string[]>;
  visibleAccountCount: number;
}
export const authSessionResponse: z.ZodType<{
  user: AuthUser;
  csrfToken: string;
}> = z
  .object({
    user: z
      .object({
        userId: z.uuid(),
        memberId: z.uuid(),
        tenantId: z.string().min(1).max(100),
        email: z.email().max(254),
        name: z.string().min(1).max(160),
        role: z.enum(["admin", "editor", "viewer"]),
        revision: z.number().int().positive(),
        capabilities: z.array(z.string().max(64)).max(32),
        grants: z.record(
          z.string().max(100),
          z.array(z.enum(["read", "write", "publish", "manage"])).max(4),
        ),
        visibleAccountCount: z.number().int().nonnegative(),
      })
      .strict(),
    csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

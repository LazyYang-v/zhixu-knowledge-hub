import type { Context, MiddlewareHandler } from "hono";
import type { ZodType } from "zod";
import * as schemas from "../../shared/contracts.js";
import { AppError } from "./errors.js";
type Rule = [string, RegExp, ZodType];
const rules: Rule[] = [
  ["POST", /^\/api\/knowledge\/bases\/?$/, schemas.baseInput],
  ["PUT", /^\/api\/knowledge\/bases\/[^/]+$/, schemas.baseUpdate],
  ["POST", /^\/api\/knowledge\/documents\/import$/, schemas.importInput],
  ["PUT", /^\/api\/knowledge\/documents\/[^/]+$/, schemas.documentUpdate],
  [
    "PUT",
    /^\/api\/knowledge\/documents\/[^/]+\/chunks\/[^/]+$/,
    schemas.chunkUpdate,
  ],
  ["PUT", /^\/api\/knowledge\/documents\/[^/]+\/chunks$/, schemas.chunksUpdate],
  [
    "POST",
    /^\/api\/knowledge\/documents\/[^/]+\/rollback$/,
    schemas.versionOperation,
  ],
  [
    "POST",
    /^\/api\/knowledge\/documents\/[^/]+\/(publish|archive|retry|reindex|advance)$/,
    schemas.stateOperation,
  ],
  [
    "POST",
    /^\/api\/knowledge\/tasks\/[^/]+\/(retry|cancel)$/,
    schemas.stateOperation,
  ],
  ["POST", /^\/api\/conversations\/?$/, schemas.conversationInput],
  ["POST", /^\/api\/conversations\/[^/]+\/messages$/, schemas.messageInput],
  [
    "PATCH",
    /^\/api\/conversations\/[^/]+\/messages\/[^/]+\/feedback$/,
    schemas.feedbackInput,
  ],
  ["POST", /^\/api\/retrieval\/search$/, schemas.retrievalInput],
  ["POST", /^\/api\/evaluations$/, schemas.evaluationInput],
  ["POST", /^\/api\/permissions\/members$/, schemas.memberInput],
  ["PUT", /^\/api\/permissions\/members\/[^/]+$/, schemas.memberUpdate],
  ["PUT", /^\/api\/permissions\/rules$/, schemas.ruleInput],
  ["PUT", /^\/api\/settings$/, schemas.settingsInput],
  ["PUT", /^\/api\/knowledge\/bases\/[^/]+\/grants$/, schemas.grantsInput],
];
export const validateRequest: MiddlewareHandler = async (c, next) => {
  const rule = rules.find(
    ([method, path]) => method === c.req.method && path.test(c.req.path),
  );
  if (rule) {
    const text = await c.req.text();
    let input: unknown = {};
    if (text) {
      try {
        input = JSON.parse(text);
      } catch {
        throw new AppError(400, "INVALID_JSON", "请求内容不是有效 JSON");
      }
    }
    const result = rule[2].safeParse(input);
    if (!result.success)
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "请求参数无效",
        result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    if (
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    )
      throw new AppError(400, "VALIDATION_ERROR", "请求内容必须是对象");
    if ("baseIds" in result.data)
      throw new AppError(
        400,
        "BASE_ROUTING_UNAVAILABLE",
        "当前接口尚未实现 baseIds 多知识库路由；请使用现有 scope 筛选。scope 不代表访问授权。",
      );
    c.set("validatedBody", Object.fromEntries(Object.entries(result.data)));
  }
  for (const key of ["limit", "topK"]) {
    const value = c.req.query(key);
    if (
      value &&
      (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)
    )
      throw new AppError(400, "VALIDATION_ERROR", `${key} 超出允许范围`);
  }
  await next();
};
export function requestBody(c: Context): Record<string, unknown> {
  return c.get("validatedBody") ?? {};
}

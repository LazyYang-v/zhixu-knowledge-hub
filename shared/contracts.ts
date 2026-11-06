import { z } from "zod";
import {
  MAX_CHUNKS,
  MAX_CHUNK_CHARACTERS,
  MAX_TOTAL_CHUNK_CHARACTERS,
} from "./text-limits.js";
export const fileArtifact = z
  .object({
    uploaderMembershipId: z.uuid().optional(),
    id: z.string().regex(/^file_[a-f0-9]{64}$/),
    name: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[^/\\\u0000-\u001F\u007F]+$/),
    size: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
    mediaType: z.string().min(1).max(200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime(),
  })
  .strict();
const name = z.string().trim().min(1).max(160);
const short = z.string().max(500);
export const revision = z.number().int().positive();
export const access = z.enum([
  "全体员工",
  "研发部",
  "人力资源部",
  "产品部",
  "财务部",
  "项目成员",
]);
export const department = z.enum([
  "研发部",
  "人力资源部",
  "产品部",
  "财务部",
  "全体员工",
]);
export const role = z.enum(["知识库管理员", "内容编辑者", "普通成员"]);
export const baseInput = z
  .object({
    name,
    description: short.optional(),
    color: z.enum(["purple", "blue", "green", "orange"]).optional(),
    owner: short.optional(),
    access: access.optional(),
  })
  .strict();
export const baseUpdate = baseInput
  .partial()
  .extend({ revision: revision.optional() })
  .strict();
const common = {
  name,
  baseId: z.string().max(100).optional(),
  category: short.optional(),
  department: department.optional(),
  level: z.enum(["公开", "内部", "机密"]).optional(),
  owner: short.optional(),
  strategy: z.enum(["固定长度", "语义分块", "父子分块"]).optional(),
};
export const importInput = z.discriminatedUnion("mode", [
  z
    .object({
      ...common,
      mode: z.literal("text"),
      text: z.string().trim().min(1).max(2_000_000),
      size: short.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      mode: z.literal("file"),
      artifactId: z.string().regex(/^file_[a-f0-9]{64}$/),
      size: short.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      mode: z.literal("web"),
      source: z.url().max(2048),
      size: short.optional(),
    })
    .strict(),
]);
export const documentUpdate = z
  .object({
    name: name.optional(),
    baseId: z.string().max(100).optional(),
    category: short.optional(),
    department: department.optional(),
    level: z.enum(["公开", "内部", "机密"]).optional(),
    strategy: short.optional(),
    revision: revision.optional(),
  })
  .strict();
export const chunkUpdate = z
  .object({
    content: z
      .string()
      .min(1)
      .max(MAX_CHUNK_CHARACTERS)
      .refine((value) => value.trim().length > 0),
    revision: revision.optional(),
  })
  .strict();
export const chunksUpdate = z
  .object({
    chunks: z
      .array(chunkUpdate.shape.content)
      .min(1)
      .max(MAX_CHUNKS)
      .refine(
        (chunks) =>
          chunks.reduce((sum, chunk) => sum + chunk.length, 0) <=
          MAX_TOTAL_CHUNK_CHARACTERS,
      ),
    revision: revision.optional(),
  })
  .strict();
export const versionOperation = z
  .object({
    version: z.string().regex(/^v\d+\.\d+$/),
    revision: revision.optional(),
  })
  .strict();
export const stateOperation = z
  .object({ revision: revision.optional() })
  .strict();
export const conversationInput = z.object({ title: name.optional() }).strict();
export const messageInput = z
  .object({
    content: z.string().trim().min(1).max(20_000),
    scope: short.optional(),
    baseIds: z.array(z.string().max(100)).max(50).optional(),
    citations: z.boolean().optional(),
    multiTurn: z.boolean().optional(),
  })
  .strict();
export const feedbackInput = z
  .object({
    rating: z.enum(["up", "down"]).nullable(),
    comment: z.string().max(2000).optional(),
  })
  .strict();
export const retrievalInput = z
  .object({
    query: z.string().trim().min(1).max(4000),
    strategy: z.enum(["BM25", "向量检索", "混合检索"]).optional(),
    scope: short.optional(),
    baseIds: z.array(z.string().max(100)).max(50).optional(),
    threshold: z.number().finite().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(20).optional(),
  })
  .strict();
export const memberInput = z
  .object({
    name,
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    department: department.optional(),
    role: role.optional(),
  })
  .strict();
export const memberUpdate = memberInput
  .partial()
  .extend({ revision: revision.optional() })
  .strict();
export const ruleInput = z
  .object({
    key: z
      .string()
      .max(200)
      .regex(
        /^(研发部|人力资源部|产品部|财务部):(知识库管理员|内容编辑者|普通成员):[0-3]$/,
      ),
    values: z.array(z.boolean()).length(4),
    revision: revision.optional(),
  })
  .strict();
const integerString = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number(value) >= min && Number(value) <= max);
export const settingsInput = z
  .object({
    workspace: name.optional(),
    tenant: z.string().max(100).optional(),
    embedding: short.optional(),
    vector: short.optional(),
    chunkSize: integerString(64, 4096).optional(),
    overlap: integerString(0, 4095).optional(),
    strategy: short.optional(),
    topK: integerString(1, 20).optional(),
    rerank: z.boolean().optional(),
    citations: z.boolean().optional(),
    multiTurn: z.boolean().optional(),
    audit: z.boolean().optional(),
    revision: revision.optional(),
  })
  .strict();
export const evaluationInput = z
  .object({ name: name.optional(), dataset: short.optional() })
  .strict();
export const grantsInput = z
  .object({
    revision,
    grants: z
      .array(
        z
          .object({
            memberId: z.uuid(),
            permissions: z
              .array(z.enum(["read", "write", "publish", "manage"]))
              .min(1)
              .max(4),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type ImportInput = z.infer<typeof importInput>;

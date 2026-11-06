import type { JobDetails } from "./jobs/queue.js";
export type AnswerKind =
  | "leave"
  | "carry"
  | "probation"
  | "apply"
  | "expense"
  | "onboarding"
  | "archive"
  | "technical"
  | "unknown";

export type DocStatus = "已发布" | "草稿" | "已归档";
export type TaskState = "done" | "running" | "error";

export interface Citation {
  provenance?: "demo" | "legacy_unverified";
  verified?: boolean;
  id: string;
  title: string;
  type: string;
  version: string;
  page: number;
  pages: number;
  category: string;
  library: string;
}

export interface RetrievalHit {
  id: string;
  title: string;
  scope: string;
  section: string;
  content: string;
  page: string;
  bm25: number;
  dense: number;
  rerank: number;
  score: number;
}

export interface RetrievalStage {
  name: string;
  detail: string;
  ms: number;
}

export interface RetrievalTrace {
  implementation?: "rule_demo" | "legacy_unverified";
  timing?: "simulated" | "unverified";
  permissionFiltering?: "not_configured" | "enforced";
  query: string;
  mode: "bm25" | "dense" | "rerank";
  topK: number;
  threshold: number;
  scope: string;
  stages: RetrievalStage[];
  hits: RetrievalHit[];
}

export interface Message {
  evidenceDocumentIds?: string[];
  answerMode?: "rule_demo" | "legacy_unverified";
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  kind?: AnswerKind;
  citations?: boolean;
  sources?: Citation[];
  retrieval?: RetrievalTrace;
  permission?: {
    status?: "not_configured" | "enforced";
    checked: string[];
    result: string;
  };
  feedback?: {
    rating: "up" | "down";
    comment?: string;
  };
}

export interface Conversation {
  ownerMembershipId?: string;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface KnowledgeBase {
  revision?: number;
  tenantId?: string;
  id: string;
  name: string;
  description: string;
  color: string;
  owner: string;
  access: string;
}

export interface DocumentVersion {
  sourceArtifactId?: string;
  id?: string;
  chunkIds?: string[];
  version: string;
  date: string;
  note: string;
  chunks: string[];
}

export interface KnowledgeDocument {
  redacted?: boolean;
  publishedMetadata?: Record<string, string>;
  publishedVersionId?: string | null;
  sourceArtifactId?: string;
  revision?: number;
  baseId?: string;
  tenantId?: string;
  id: string;
  name: string;
  category: string;
  status: DocStatus;
  type: string;
  size: string;
  owner: string;
  date: string;
  chunks: string[];
  versions: DocumentVersion[];
  department: string;
  level: string;
  strategy: string;
  stage: number;
  task: TaskState;
  source?: string;
}

export interface ProcessingTask {
  supersededBy?: string;
  job?: JobDetails;
  id: string;
  docId: string;
  docName: string;
  status: TaskState;
  stage: number;
  updatedAt: string;
  error?: string;
}

export interface Member {
  revision?: number;
  tenantId?: string;
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

export interface AuditLog {
  schemaVersion?: 1;
  actorKind?: "user" | "anonymous" | "system" | "legacy_unverified";
  actorId?: string;
  authorization?: "not_configured" | "enforced";
  method?: string;
  route?: string;
  targetType?: string;
  targetId?: string;
  changedFields?: string[];
  outcome?: "committed" | "failed";
  httpStatus?: number;
  errorCode?: string;
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  id: string;
  time: string;
  user: string;
  department: string;
  action: string;
  content: string;
  source: string;
  status: string;
  docs: string[];
}

export interface EvalRecord {
  id: string;
  question: string;
  expected: string;
  kind: AnswerKind;
  hit: boolean;
  score: number;
  latency: number;
}

export interface EvalRun {
  id: string;
  name: string;
  dataset: string;
  status: "已完成" | "运行中" | "排队中";
  createdAt: string;
  finishedAt?: string;
  metrics: {
    hitRate: number;
    accuracy: number;
    latency: number;
    coverage: number;
  };
  records: EvalRecord[];
}

export interface Settings {
  revision?: number;
  workspace: string;
  tenant: string;
  embedding: string;
  vector: string;
  chunkSize: string;
  overlap: string;
  strategy: string;
  topK: string;
  rerank: boolean;
  citations: boolean;
  multiTurn: boolean;
  audit: boolean;
}

export interface Db {
  files?: Record<string, import("./services/files.js").FileArtifact>;
  idempotency?: Record<
    string,
    import("./services/mutations.js").IdempotencyRecord
  >;
  conversations: Conversation[];
  bases: KnowledgeBase[];
  documents: KnowledgeDocument[];
  tasks: ProcessingTask[];
  members: Member[];
  rules: Record<string, boolean[]>;
  rulesRevision?: number;
  auditLogs: AuditLog[];
  evaluations: EvalRun[];
  settings: Settings;
}

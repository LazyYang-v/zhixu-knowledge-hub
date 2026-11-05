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
  query: string;
  mode: "bm25" | "dense" | "rerank";
  topK: number;
  threshold: number;
  scope: string;
  stages: RetrievalStage[];
  hits: RetrievalHit[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  kind?: AnswerKind;
  citations?: boolean;
  sources?: Citation[];
  retrieval?: RetrievalTrace;
  permission?: {
    checked: string[];
    result: string;
  };
  feedback?: {
    rating: "up" | "down";
    comment?: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  color: string;
  owner: string;
  access: string;
}

export interface DocumentVersion {
  version: string;
  date: string;
  note: string;
  chunks: string[];
}

export interface KnowledgeDocument {
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
  id: string;
  docId: string;
  docName: string;
  status: TaskState;
  stage: number;
  updatedAt: string;
  error?: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

export interface AuditLog {
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
  conversations: Conversation[];
  bases: KnowledgeBase[];
  documents: KnowledgeDocument[];
  tasks: ProcessingTask[];
  members: Member[];
  rules: Record<string, boolean[]>;
  auditLogs: AuditLog[];
  evaluations: EvalRun[];
  settings: Settings;
}

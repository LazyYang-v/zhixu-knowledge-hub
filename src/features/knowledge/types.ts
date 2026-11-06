export type DocStatus = "已发布" | "草稿" | "已归档";
export interface KnowledgeVersion {
  sourceArtifactId?: string;
  version: string;
  date: string;
  note: string;
  chunks: string[];
}
export interface KnowledgeDocument {
  redacted?: boolean;
  sourceArtifactId?: string;
  revision?: number;
  baseId?: string;
  id: string;
  name: string;
  category: string;
  status: DocStatus;
  type: string;
  size: string;
  owner: string;
  date: string;
  chunks: string[];
  versions: KnowledgeVersion[];
  department: string;
  level: string;
  strategy: string;
  stage: number;
  task: "done" | "running" | "error";
  source?: string;
}
export interface KnowledgeBase {
  revision?: number;
  id: string;
  name: string;
  description: string;
  color: string;
  owner: string;
  access: string;
}

import type { KnowledgeDocument } from "./types";

export interface KnowledgeCategory {
  id: string;
  name: string;
  documents: KnowledgeDocument[];
}

export const STORAGE_KEYS = {
  documents: "documents-v1",
  bases: "knowledge-bases-v1",
  taskFailures: "demo-task-failures",
} as const;

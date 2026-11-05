export interface WorkspaceSettings {
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

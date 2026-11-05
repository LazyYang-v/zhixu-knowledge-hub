export interface EvaluationRun {
  id: string;
  name: string;
  dataset: string;
  status: string;
  createdAt: string;
  metrics: {
    hitRate: number;
    accuracy: number;
    latency: number;
    coverage: number;
  };
  records: Array<{
    id: string;
    question: string;
    expected: string;
    kind: string;
    hit: boolean;
    score: number;
    latency: number;
  }>;
}

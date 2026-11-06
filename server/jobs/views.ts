import type { ProcessingTask } from "../types.js";
export function taskDto(task: ProcessingTask) {
  const { job, ...record } = task;
  return {
    ...record,
    ...(job
      ? {
          job: {
            kind: job.kind,
            state: job.state,
            version: job.version,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
          },
        }
      : {}),
  };
}
export type TaskView = ReturnType<typeof taskDto>;

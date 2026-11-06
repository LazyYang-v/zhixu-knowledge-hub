import type { TaskView as ProcessingTask } from "../../../server/jobs/views";
import { useResource } from "../../hooks/useResource";
import { apiFetch } from "../../lib/api";
const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
export function useTasks() {
  const state = useResource<{ tasks: ProcessingTask[] }>(
    "/api/knowledge/tasks",
    { tasks: [] },
  );
  const tasks = state.data?.tasks ?? [];
  const retry = async (item: ProcessingTask) => {
    const data = await apiFetch<{ task: ProcessingTask }>(
      `/api/knowledge/tasks/${item.id}/retry`,
      { method: "POST" },
    );
    state.reload();
  };
  const cancel = async (item: ProcessingTask) => {
    await apiFetch(`/api/knowledge/tasks/${item.id}/cancel`, {
      method: "POST",
    });
    state.reload();
  };
  return { ...state, stages, tasks, retry, cancel };
}

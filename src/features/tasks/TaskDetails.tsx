import type { TaskView } from "../../../server/jobs/views";
import type { JobEvent } from "../../../server/jobs/queue";
import { RequestStatus } from "../../components/RequestStatus";
import { useResource } from "../../hooks/useResource";
import { Button } from "../../components/ui/Button";
export function TaskDetails({ task }: { task: TaskView }) {
  const events = useResource<{ events: JobEvent[]; state: string }>(
    `/api/knowledge/tasks/${task.id}/events`,
    { events: [], state: "demo" },
  );
  return (
    <>
      <h3>{task.docName}</h3>
      <code>{task.id}</code>
      <p>状态：{events.data?.state ?? task.status}</p>
      <p>{task.error}</p>
      <RequestStatus {...events} />
      <ol>
        {events.data?.events.map((event) => (
          <li key={event.sequence}>
            <time>{new Date(event.time).toLocaleString("zh-CN")}</time>
            <p>{event.message}</p>
          </li>
        ))}
      </ol>
      {events.data?.events.length === 0 && <p>该历史记录没有可用执行事件。</p>}
      <Button variant="secondary" onClick={events.reload}>
        刷新事件
      </Button>
      <p className="muted">
        文本准备任务不包含向量化或索引。文件解析将在后续接入。
      </p>
    </>
  );
}

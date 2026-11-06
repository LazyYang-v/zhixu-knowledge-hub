import { Archive, BookOpen, UploadCloud } from "lucide-react";
import { Badge, IconButton } from "../../../components/ui";
import { DataTable } from "../../../components/ui/DataTable";
import { DocIcon, statusTone } from "../presenters";
import type { KnowledgeDocument } from "../types";
import { useAuthorization } from "../../../hooks/useAuthorization";
export function DocumentList({
  documents,
  loading,
  pending,
  onOpen,
  onStatus,
}: {
  documents: KnowledgeDocument[];
  loading: boolean;
  pending: boolean;
  onOpen: (doc: KnowledgeDocument) => void;
  onStatus: (doc: KnowledgeDocument) => void;
}) {
  const { canBase } = useAuthorization();
  return (
    <DataTable
      ariaLabel="文档列表"
      rows={documents}
      loading={loading}
      rowKey={(doc) => doc.id}
      emptyTitle="没有符合条件的文档"
      emptyDescription="调整筛选条件，或添加文档记录。"
      columns={[
        {
          key: "name",
          header: "文档名称",
          sortable: true,
          sortValue: (doc) => doc.name,
          render: (doc) => (
            <button className="kp-document-name" onClick={() => onOpen(doc)}>
              <DocIcon type={doc.type} />
              <span>
                <strong>{doc.name}</strong>
                <small>
                  {doc.size} · {doc.department}
                </small>
              </span>
            </button>
          ),
        },
        { key: "base", header: "知识库", render: (doc) => doc.category },
        {
          key: "status",
          header: "状态",
          render: (doc) => (
            <>
              <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
              {doc.task === "running" && (
                <small className="kp-cell-sub">文本准备中</small>
              )}
              {doc.task === "error" && (
                <small className="kp-cell-sub">处理未完成 · 查看任务</small>
              )}
            </>
          ),
        },
        {
          key: "version",
          header: "分块 / 版本",
          render: (doc) => (
            <>
              {doc.chunks.length} 块
              <small className="kp-cell-sub">
                {doc.versions[0]?.version ?? "—"}
              </small>
            </>
          ),
        },
        { key: "owner", header: "创建人", render: (doc) => doc.owner },
        {
          key: "date",
          header: "更新日期",
          sortable: true,
          sortValue: (doc) => doc.date,
          render: (doc) => doc.date,
        },
        {
          key: "action",
          header: "操作",
          render: (doc) => (
            <div className="kp-actions">
              <IconButton label={`预览${doc.name}`} onClick={() => onOpen(doc)}>
                <BookOpen size={16} />
              </IconButton>
              <IconButton
                disabled={
                  pending ||
                  !canBase(doc.baseId, "publish") ||
                  (doc.status !== "已发布" &&
                    (doc.task !== "done" || doc.chunks.length === 0))
                }
                label={`${doc.status === "已发布" ? "归档" : "发布"}${doc.name}`}
                onClick={() => onStatus(doc)}
              >
                {doc.status === "已发布" ? (
                  <Archive size={16} />
                ) : (
                  <UploadCloud size={16} />
                )}
              </IconButton>
            </div>
          ),
        },
      ]}
    />
  );
}

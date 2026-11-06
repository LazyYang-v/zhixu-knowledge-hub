import {
  File,
  FileText,
  Globe,
  Link2,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { IconButton, Modal, useToast } from "../components/ui";
import type {
  KnowledgeDocument,
  KnowledgeVersion,
} from "../features/knowledge/types";
import { useAction } from "../hooks/useAction";
import { apiFetch } from "../lib/api";
import { getDataMode } from "../lib/data-mode";
import { uploadFile } from "../lib/upload";
import type { FileArtifact } from "../../server/services/files";
import "./knowledge.css";
type PageProps = { onNavigate?: (page: string) => void };
type Version = KnowledgeVersion;
const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
const today = () => new Date().toLocaleDateString("sv-SE");

export function UploadModal({
  categories,
  onClose,
  onAdd,
}: {
  categories: string[];
  onClose: () => void;
  onAdd: (docs: KnowledgeDocument[]) => void;
}) {
  const [mode, setMode] = useState("本地文件");
  const { run, pending } = useAction();
  const completed = useRef(new Map<string, KnowledgeDocument>());
  const uploaded = useRef(new Map<File, FileArtifact>());
  const controller = useRef<AbortController | null>(null);
  const [transfer, setTransfer] = useState({ name: "", loaded: 0, total: 0 });
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState(categories[0] || "企业制度");
  const [strategy, setStrategy] = useState("语义分块");
  const [department, setDepartment] = useState("全体员工");
  const [level, setLevel] = useState("内部");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const addFiles = (input: File[]) => {
    const supported = input.filter((file) =>
      /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|md|txt|png|jpe?g|webp)$/i.test(
        file.name,
      ),
    );
    if (supported.length !== input.length)
      toast("部分文件格式不支持，请选择列表中的文档或图片格式");
    const accepted = supported.filter(
      (file) =>
        file.size > 0 &&
        file.size <= 20 * 1024 * 1024 &&
        file.name.length <= 160,
    );
    if (accepted.length !== supported.length)
      toast("已跳过空文件、超过 20 MB 或名称超过 160 字符的文件");
    setFiles((current) => [
      ...current,
      ...accepted.filter((f) => !current.includes(f)),
    ]);
  };
  const submit = async () => {
    if (mode === "本地文件" && !files.length) return;
    if (mode === "网页链接" && !/^https?:\/\/[^\s]+$/i.test(url.trim())) {
      toast("请输入有效的 http 或 https 网页地址");
      return;
    }
    if (mode === "粘贴文本" && (!name.trim() || !content.trim())) return;
    const abort = new AbortController();
    controller.current = abort;
    const modeKey =
      mode === "本地文件" ? "file" : mode === "网页链接" ? "web" : "text";
    const payloads: Array<{
      mode: string;
      name: string;
      size?: string;
      source?: string;
      text?: string;
      file?: File;
    }> =
      mode === "本地文件"
        ? files.map((f) => ({
            name: f.name,
            size:
              f.size > 1024 * 1024
                ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
                : `${Math.max(1, Math.round(f.size / 1024))} KB`,
            mode: "file",
            file: f,
          }))
        : [
            {
              name:
                mode === "网页链接"
                  ? name.trim() || new URL(url).hostname
                  : `${name.trim()}.md`,
              size: mode === "网页链接" ? "网页链接" : `${content.length} 字符`,
              source: mode === "网页链接" ? url.trim() : undefined,
              text: mode === "粘贴文本" ? content : undefined,
              mode: modeKey,
            },
          ];
    const results: KnowledgeDocument[] = [];
    setProgress({ done: completed.current.size, total: payloads.length });
    for (const payload of payloads) {
      if (abort.signal.aborted) throw new Error("上传已取消");
      const { file, ...input } = payload;
      let artifact = file ? uploaded.current.get(file) : undefined;
      if (file && !artifact && getDataMode() === "server") {
        setTransfer({ name: file.name, loaded: 0, total: file.size });
        artifact =
          (await uploadFile(
            file,
            (loaded, total) => setTransfer({ name: file.name, loaded, total }),
            abort.signal,
          )) ?? undefined;
        if (artifact) uploaded.current.set(file, artifact);
      }
      const key = JSON.stringify({
        ...input,
        artifactId: artifact?.id,
        category,
        department,
        level,
      });
      const saved = completed.current.get(key);
      if (saved) {
        results.push(saved);
        continue;
      }
      const data = await apiFetch<{ document: KnowledgeDocument }>(
        "/api/knowledge/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            ...input,
            ...(artifact ? { artifactId: artifact.id } : {}),
            category,
            department,
            level,
            owner: "张三",
          }),
          signal: abort.signal,
        },
      );
      results.push(
        data?.document ?? {
          id: crypto.randomUUID(),
          name: payload.name,
          category,
          status: "草稿",
          type:
            mode === "网页链接"
              ? "WEB"
              : mode === "粘贴文本"
                ? "MD"
                : (payload.name.split(".").pop()?.toUpperCase() ?? "FILE"),
          size: payload.size ?? "—",
          owner: "张三",
          date: today(),
          chunks: [
            mode === "粘贴文本"
              ? content
              : "此文档仅保存文件元数据，演示环境未读取或解析本地文件内容。接入解析服务后，可在此查看真实知识分块。",
          ],
          versions: [
            {
              version: "v1.0",
              date: today(),
              note: "首次导入",
              chunks: mode === "粘贴文本" ? [content] : [],
            },
          ],
          department,
          level,
          strategy,
          stage: 0,
          task: "running",
          ...(mode === "网页链接" ? { source: url.trim() } : {}),
        },
      );
      completed.current.set(key, results[results.length - 1]);
      setProgress({ done: results.length, total: payloads.length });
    }
    onAdd(results);
  };
  return (
    <Modal
      wide
      title="添加文档记录"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {progress.total > 0 && (
        <p role="status">
          已登记 {progress.done} / {progress.total}{" "}
          份；失败重试会跳过本次已登记项。
        </p>
      )}
      {pending && transfer.name && (
        <div role="status" aria-live="polite">
          <p>
            正在传输 {transfer.name}
            {transfer.total > 0
              ? ` · ${Math.min(100, Math.round((transfer.loaded / transfer.total) * 100))}%`
              : ""}
            ；完成后由服务端校验并保存。
          </p>
          <progress
            aria-label="文件传输进度"
            value={transfer.loaded}
            max={transfer.total || 1}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => controller.current?.abort()}
          >
            停止上传
          </button>
        </div>
      )}
      <div className="kp-upload-tabs">
        {["本地文件", "网页链接", "粘贴文本"].map((m, i) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            disabled={pending}
            onClick={() => setMode(m)}
          >
            {i === 0 ? (
              <UploadCloud size={16} />
            ) : i === 1 ? (
              <Globe size={16} />
            ) : (
              <FileText size={16} />
            )}
            {m}
          </button>
        ))}
      </div>
      <fieldset disabled={pending} className="form-contents">
        <form
          className="kp-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(submit);
          }}
        >
          {mode === "本地文件" && (
            <>
              <div
                className={`kp-dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(Array.from(e.dataTransfer.files));
                }}
              >
                <span>
                  <UploadCloud size={30} />
                </span>
                <strong>
                  拖拽文件到这里，或
                  <button
                    type="button"
                    className="kp-text-button"
                    onClick={() => fileInput.current?.click()}
                  >
                    选择文件
                  </button>
                </strong>
                <p>PDF、Word、PPT、Excel、Markdown、TXT、图片</p>
                <small>
                  单个文件不超过 20 MB。原文件将保存到服务端；UTF-8 TXT/Markdown
                  可切分，其余格式等待解析器接入。
                </small>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.txt,.png,.jpg,.jpeg,.webp"
                  aria-label="选择本地文档"
                  onChange={(e) => addFiles(Array.from(e.target.files || []))}
                  hidden
                />
              </div>
              {files.length > 0 && (
                <div className="kp-selected-files">
                  {files.map((file, i) => (
                    <div key={`${file.name}-${i}`}>
                      <File size={16} />
                      <span>{file.name}</span>
                      <IconButton
                        label={`移除${file.name}`}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, n) => i !== n),
                          )
                        }
                      >
                        <X size={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {mode === "网页链接" && (
            <>
              <label className="field">
                网页地址
                <div className="kp-url-input">
                  <Link2 size={17} />
                  <input
                    required
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.example.com/guide"
                  />
                </div>
              </label>
              <label className="field">
                文档名称（可选）
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="默认使用网站域名"
                />
              </label>
            </>
          )}
          {mode === "粘贴文本" && (
            <>
              <label className="field">
                文档名称
                <input
                  className="input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="为知识内容起一个清晰的名字"
                />
              </label>
              <label className="field">
                知识内容
                <textarea
                  className="input"
                  required
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="粘贴知识内容，支持 Markdown 文本…"
                />
              </label>
            </>
          )}
          <div className="kp-form-grid">
            <label className="field">
              所属知识库
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              分块策略
              <select
                className="select"
                disabled={getDataMode() === "server"}
                value={
                  getDataMode() === "server" ? "固定长度（系统配置）" : strategy
                }
                onChange={(e) => setStrategy(e.target.value)}
              >
                {getDataMode() === "server" && (
                  <option>固定长度（系统配置）</option>
                )}
                <option>语义分块</option>
                <option>固定长度 · 500 字符</option>
                <option>父子分块</option>
              </select>
            </label>
            <label className="field">
              可见范围
              <select
                className="select"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option>全体员工</option>
                <option>研发部</option>
                <option>人力资源部</option>
                <option>财务部</option>
              </select>
            </label>
            <label className="field">
              文档密级
              <select
                className="select"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option>内部</option>
                <option>公开</option>
                <option>机密</option>
              </select>
            </label>
          </div>
          <div className="kp-inline-info">
            <ShieldCheck size={16} />
            当前仅保存权限元数据，不执行访问隔离；文档导入后保存为草稿。
          </div>
          <div className="kp-modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || (mode === "本地文件" && !files.length)}
            >
              <UploadCloud size={16} />
              导入
              {files.length && mode === "本地文件"
                ? ` ${files.length} 份文档`
                : "文档"}
            </button>
          </div>
        </form>
      </fieldset>
    </Modal>
  );
}

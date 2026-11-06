import {
  Check,
  ChevronRight,
  Fingerprint,
  Globe2,
  KeyRound,
  Layers3,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { CapabilityNote as DemoNote } from "../components/CapabilityNote";
import { RequestStatus } from "../components/RequestStatus";
import { Badge, Modal, PageHeader, useToast } from "../components/ui";
import { Toggle } from "../components/ui/Toggle";
import type { KnowledgeVersion } from "../features/knowledge/types";
import { useSettings } from "../features/settings/useSettings";
import { useAction } from "../hooks/useAction";
import { useAuthorization } from "../hooks/useAuthorization";
import "./governance.css";
type KnowledgeVersionAlias = KnowledgeVersion;

export function SettingsPage() {
  const notify = useToast();
  const {
    tab,
    setTab,
    integration,
    setIntegration,
    form,
    change,
    save: saveSettings,
    loading,
    error,
    reload,
    dirty,
  } = useSettings();
  const { run, pending } = useAction();
  const { can, secured } = useAuthorization();
  const save = () =>
    void run(async () => {
      const result = await saveSettings();
      notify(
        result === "server"
          ? "配置已保存；长度配置用于新文本任务，模型与语义分块尚未接入"
          : result === "server-preferences-unavailable"
            ? "服务端配置已保存；浏览器偏好无法保存"
            : "配置已保存到本地演示",
        "success",
      );
    });
  return (
    <div className="page-content gp-page">
      <RequestStatus loading={loading} error={error} reload={reload} />
      {dirty && <div className="capability-note">有未保存的修改</div>}
      <PageHeader
        title="为团队，配置合适的知识体验"
        description="管理工作空间、知识处理策略与问答偏好。"
        action={
          <button
            className="btn btn-primary"
            disabled={pending || loading || !!error || !can("workspace.manage")}
            onClick={save}
          >
            <Check size={16} />
            保存设置
          </button>
        }
      />
      <div className="panel gp-panel">
        <div className="tabs gp-tabbar">
          {["工作空间", "处理与检索", "问答偏好", "集成与安全"].map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="gp-settings-content">
          {tab === "工作空间" && (
            <>
              <div className="gp-settings-section-title">
                <Globe2 size={22} />
                <div>
                  <h3>工作空间信息</h3>
                  <p>你的团队共享同一个知识空间。</p>
                </div>
              </div>
              <div className="gp-settings-form">
                <label className="field">
                  工作空间名称
                  <input
                    className="input"
                    value={form.workspace}
                    onChange={(e) => change("workspace", e.target.value)}
                    maxLength={50}
                  />
                </label>
                <label className="field">
                  租户标识
                  <input className="input" value={form.tenant} readOnly />
                  <small>租户标识用于知识隔离，在演示中不可修改。</small>
                </label>
                <div className="gp-setting-info">
                  <span className="gp-avatar">
                    <Layers3 size={21} />
                  </span>
                  <div>
                    <strong>Enterprise 工作空间</strong>
                    <p>4 个知识库 · 2,846 份文档 · 5,000 份文档容量</p>
                  </div>
                  <Badge tone="purple">演示版</Badge>
                </div>
              </div>
            </>
          )}
          {tab === "处理与检索" && (
            <>
              <div className="gp-settings-section-title">
                <Settings2 size={22} />
                <div>
                  <h3>知识处理与检索</h3>
                  <p>设置知识的分块方式，以及查询时的召回策略。</p>
                </div>
              </div>
              <div className="gp-settings-form">
                <div className="gp-form-row">
                  <label className="field">
                    Embedding 模型
                    <select
                      className="select"
                      value={form.embedding}
                      onChange={(e) => change("embedding", e.target.value)}
                    >
                      <option>bge-m3</option>
                      <option>text-embedding-3-small</option>
                      <option>bge-large-zh-v1.5</option>
                    </select>
                  </label>
                  <label className="field">
                    向量存储
                    <select
                      className="select"
                      value={form.vector}
                      onChange={(e) => change("vector", e.target.value)}
                    >
                      <option>pgvector</option>
                      <option>Milvus</option>
                      <option>FAISS</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  分块策略
                  <select
                    className="select"
                    value={form.strategy}
                    onChange={(e) => change("strategy", e.target.value)}
                  >
                    <option>父子分块</option>
                    <option>语义分块</option>
                    <option>固定长度</option>
                  </select>
                </label>
                <div className="gp-form-row">
                  <label className="field">
                    分块长度
                    <input
                      className="input"
                      type="number"
                      min="64"
                      max="4096"
                      value={form.chunkSize}
                      onChange={(e) => change("chunkSize", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    分块重叠长度
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="4095"
                      value={form.overlap}
                      onChange={(e) => change("overlap", e.target.value)}
                    />
                  </label>
                </div>
                <label className="field">
                  默认召回数量
                  <select
                    className="select"
                    value={form.topK}
                    onChange={(e) => change("topK", e.target.value)}
                  >
                    {["3", "5", "10", "20"].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <div className="gp-toggle-row">
                  <div>
                    <strong>启用 Rerank 精排</strong>
                    <p>对混合召回结果再次进行相关性排序。</p>
                  </div>
                  <Toggle
                    checked={form.rerank}
                    label="启用 Rerank"
                    onChange={() => change("rerank", !form.rerank)}
                  />
                </div>
              </div>
            </>
          )}
          {tab === "问答偏好" && (
            <>
              <div className="gp-settings-section-title">
                <Sparkles size={22} />
                <div>
                  <h3>默认问答体验</h3>
                  <p>为工作空间成员配置一致的知识问答方式。</p>
                </div>
              </div>
              <div className="gp-settings-form">
                {(
                  [
                    {
                      key: "citations",
                      title: "默认展示引用来源",
                      description: "每个回答附上相关文档、版本与页码。",
                    },
                    {
                      key: "multiTurn",
                      title: "开启多轮会话",
                      description: "在后续提问中保留当前对话的上下文。",
                    },
                    {
                      key: "audit",
                      title: "记录检索请求摘要",
                      description:
                        "记录检索操作结果，不保存查询全文；业务写入及其失败记录始终留存。",
                    },
                  ] as const
                ).map((item) => (
                  <div className="gp-toggle-row" key={item.key}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    <Toggle
                      checked={form[item.key]}
                      label={item.title}
                      onChange={() => change(item.key, !form[item.key])}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "集成与安全" && (
            <>
              <div className="gp-settings-section-title">
                <ShieldCheck size={22} />
                <div>
                  <h3>集成与安全方案</h3>
                  <p>连接现有基础设施，为企业知识建立安全边界。</p>
                </div>
              </div>
              <div className="gp-integrations">
                {[
                  {
                    title: "OIDC 单点登录",
                    icon: <Fingerprint size={24} />,
                    detail: "统一身份认证与企业账号登录",
                  },
                  {
                    title: "凭据加密",
                    icon: <KeyRound size={24} />,
                    detail: "AES-256-GCM 加密方案",
                  },
                  {
                    title: "网页抓取防护",
                    icon: <ShieldCheck size={24} />,
                    detail: "SSRF 防护与目标地址校验",
                  },
                ].map((item) => (
                  <button
                    className="gp-integration-card"
                    key={item.title}
                    onClick={() => setIntegration(item.title)}
                  >
                    {item.icon}
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                    <span>
                      查看方案
                      <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <DemoNote>
            配置可保存到当前数据源；模型、向量库与真实语义分块策略尚未连接。
            {secured
              ? "当前已启用本地登录和知识库授权。"
              : "当前未接入真实身份授权。"}
          </DemoNote>
        </div>
      </div>
      {integration && (
        <Modal title={integration} onClose={() => setIntegration(null)}>
          <p className="gp-readable">
            {integration === "OIDC 单点登录"
              ? "生产环境应接入企业身份提供方，配置 Issuer、Client ID 与回调地址，并由服务端验证令牌签名、签发者、受众及有效期。当前前端不收集或保存真实登录凭据。"
              : integration === "凭据加密"
                ? "生产环境可使用 AES-256-GCM 对服务凭据进行加密，将密钥托管于密钥管理服务，支持密钥轮换与访问审计。当前演示不处理真实凭据。"
                : "生产环境网页导入应由服务端限制请求协议，拒绝访问内网、环回和云元数据地址，验证重定向后的目标，并设置超时和响应大小限制。当前前端不发起网页抓取。"}
          </p>
          <Badge tone="warning">待接入后端服务</Badge>
        </Modal>
      )}
    </div>
  );
}

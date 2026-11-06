import { useState } from "react";
import { getDataMode, setDataMode } from "../lib/data-mode";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { useAuth } from "../providers/AuthProvider";
export function ConnectionStatus() {
  const [modeError, setModeError] = useState("");
  const { health } = useWorkspace();
  const auth = useAuth();
  const demo = getDataMode() === "demo";
  return (
    <div
      className={`connection-strip ${health.error ? "has-error" : ""}`}
      role="status"
    >
      <span className="connection-label">
        {demo
          ? "本地演示"
          : health.loading
            ? "正在连接"
            : health.error
              ? "服务端不可用"
              : "服务端数据"}
      </span>
      <span>
        {demo
          ? "数据仅保存在此浏览器，不会请求服务端。"
          : auth.user
            ? "本地登录与资源授权已启用；问答仍为规则演示，模型与索引待接入。"
            : "当前后端为规则演示；真实模型、索引与权限待接入。"}
      </span>
      {health.error && <button onClick={health.reload}>重试连接</button>}
      {modeError && <span role="alert">{modeError}</span>}
      <label>
        数据源
        <select
          aria-label="数据源"
          value={demo ? "demo" : "server"}
          onChange={(event) => {
            try {
              setDataMode(event.target.value === "demo" ? "demo" : "server");
            } catch {
              setModeError("浏览器存储不可用，无法保存数据源选择");
            }
          }}
        >
          <option value="server">服务端</option>
          <option value="demo">本地演示</option>
        </select>
      </label>
    </div>
  );
}

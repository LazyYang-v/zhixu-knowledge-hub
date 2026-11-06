import { useState } from "react";
import { Field } from "./ui/Field";
import { Modal } from "./ui";
import { apiFetch } from "../lib/api";
import { useAction } from "../hooks/useAction";
import { useAuth } from "../providers/AuthProvider";
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNext] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const { run, pending } = useAction();
  const auth = useAuth();
  return (
    <Modal
      title="修改密码"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form
        className="access-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            if (newPassword !== confirmation)
              throw new Error("两次输入的新密码不一致");
            await apiFetch("/api/auth/password", {
              method: "POST",
              body: JSON.stringify({ currentPassword, newPassword }),
            });
            auth.passwordChanged();
          });
        }}
      >
        <p>
          更新后，所有原有会话会退出。若连接中断，请尝试使用新密码重新登录。
        </p>
        <Field label="当前密码" required>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={currentPassword}
            disabled={pending}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field
          label="新密码"
          required
          hint="12–128 个字符，且不能与当前密码相同。"
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={newPassword}
            disabled={pending}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field label="确认新密码" required>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={confirmation}
            disabled={pending}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        <div className="access-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={onClose}
          >
            取消
          </button>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "正在更新…" : "更新密码并退出"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

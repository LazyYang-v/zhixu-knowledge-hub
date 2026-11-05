import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorState({
  title = "加载失败",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-error" role="alert">
      <span className="ui-error-icon">
        <AlertTriangle size={20} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="ui-error-action">{action}</div>}
    </div>
  );
}

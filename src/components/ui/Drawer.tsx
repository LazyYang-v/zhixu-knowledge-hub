import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { IconButton } from "../ui";

export function Drawer({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useDialogFocus(open, onClose);
  if (!open) return null;
  return (
    <>
      <div
        className="ui-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={ref}
        tabIndex={-1}
        className={`ui-drawer ${wide ? "ui-drawer-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="ui-drawer-header">
          <h2>{title}</h2>
          <IconButton label="关闭面板" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        <div className="ui-drawer-body">{children}</div>
      </aside>
    </>
  );
}

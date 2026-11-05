import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
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
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("input, button, select, textarea")
      ?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    addEventListener("keydown", key);
    return () => {
      removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="ui-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
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

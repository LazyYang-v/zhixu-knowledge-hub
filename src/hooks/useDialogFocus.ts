import { useEffect, useRef } from "react";
const stack: symbol[] = [];
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol();
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const elements = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? [],
      ).filter((el) => !el.hidden && el.getAttribute("aria-hidden") !== "true");
    (elements()[0] ?? ref.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (stack.at(-1) !== id) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const targets = elements();
        const first = targets[0];
        const last = targets.at(-1);
        if (!targets.length) {
          e.preventDefault();
          ref.current?.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first ||
            !ref.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !ref.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}

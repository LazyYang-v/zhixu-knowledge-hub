import { useEffect } from "react";

/** Shares the workspace navigation guard and the browser's unload confirmation. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const beforeNavigate = (event: Event) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("knowledge-hub:before-navigate", beforeNavigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(
        "knowledge-hub:before-navigate",
        beforeNavigate,
      );
    };
  }, [dirty]);
}

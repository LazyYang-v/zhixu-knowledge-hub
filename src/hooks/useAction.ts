import { useCallback, useRef, useState } from "react";
import { useToast } from "../components/ui";
import { errorMessage } from "../lib/api";

export function useAction() {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const toast = useToast();
  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      if (lock.current) return;
      lock.current = true;
      setPending(true);
      try {
        return await action();
      } catch (error) {
        toast(errorMessage(error), "error");
      } finally {
        lock.current = false;
        setPending(false);
      }
    },
    [toast],
  );
  return { run, pending };
}

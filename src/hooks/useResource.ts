import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, errorMessage } from "../lib/api";
import { getDataMode } from "../lib/data-mode";

export function useResource<T>(path: string, demo: T) {
  const [data, setData] = useState<T | null>(() =>
    getDataMode() === "demo" ? demo : null,
  );
  const [loading, setLoading] = useState(getDataMode() === "server");
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const request = useRef(0);
  const reload = useCallback(() => {
    request.current++;
    setGeneration((n) => n + 1);
  }, []);
  useEffect(() => {
    const changed = () => reload();
    window.addEventListener("knowledge-hub:changed", changed);
    return () => window.removeEventListener("knowledge-hub:changed", changed);
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    const id = ++request.current;
    if (getDataMode() === "demo") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<T>(path, { signal: controller.signal })
      .then((value) => {
        if (id === request.current && !controller.signal.aborted)
          setData(value);
      })
      .catch((err) => {
        if (
          !controller.signal.aborted &&
          !(err instanceof ApiError && err.code === "ABORTED")
        ) {
          setError(errorMessage(err));
          if (err instanceof ApiError && [401, 403, 404].includes(err.status))
            setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && id === request.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [path, generation]);
  return { data, setData, loading, error, reload, source: getDataMode() };
}

import { useEffect, useState } from "react";
import { getDataMode } from "./data-mode";
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`knowledge-hub:${key}`);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`knowledge-hub:${key}`, JSON.stringify(value));
    } catch {
      /* The demo remains usable when storage is unavailable. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Business records use legacy keys only in explicit demo mode. */
export function useDataState<T>(key: string, demoValue: T, serverValue: T) {
  const demo = getDataMode() === "demo";
  const [value, setValue] = useState<T>(() => {
    if (!demo) return serverValue;
    try {
      const raw = localStorage.getItem(`knowledge-hub:${key}`);
      return raw ? (JSON.parse(raw) as T) : demoValue;
    } catch {
      return demoValue;
    }
  });
  useEffect(() => {
    if (demo) {
      try {
        localStorage.setItem(`knowledge-hub:${key}`, JSON.stringify(value));
      } catch {
        /* Volatile demo data remains usable. */
      }
    }
  }, [demo, key, value]);
  return [value, setValue] as const;
}

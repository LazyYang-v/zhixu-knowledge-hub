import { useEffect, useState } from "react";
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

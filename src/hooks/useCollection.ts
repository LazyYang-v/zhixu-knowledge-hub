import type { SetStateAction } from "react";
import { useCallback } from "react";
import { getDataMode } from "../lib/data-mode";
import { useDataState } from "../lib/storage";
import { useResource } from "./useResource";
export function useCollection<T, K extends string>(
  path: string,
  field: K,
  key: string,
  seed: T[],
) {
  const [local, setLocal] = useDataState<T[]>(key, seed, []);
  const resource = useResource<Record<K, T[]>>(path, {
    [field]: local,
  } as Record<K, T[]>);
  const demo = getDataMode() === "demo";
  const records = demo ? local : (resource.data?.[field] ?? []);
  const setRecords = useCallback(
    (updater: SetStateAction<T[]>) => {
      if (demo) setLocal(updater);
      else
        resource.setData(
          (current) =>
            ({
              ...current,
              [field]:
                typeof updater === "function"
                  ? (updater as (old: T[]) => T[])(current?.[field] ?? [])
                  : updater,
            }) as Record<K, T[]>,
        );
    },
    [demo, field, setLocal, resource.setData],
  );
  return { ...resource, records, setRecords };
}

import { useEffect, useRef, useState } from "react";
import { seedBases } from "./seed";
import type { KnowledgeBase } from "./types";
import { STORAGE_KEYS } from "./data";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";

const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useKnowledgeBases() {
  const [bases, setBases] = useLocalStorage<KnowledgeBase[]>(
    STORAGE_KEYS.bases,
    seedBases,
  );
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    apiFetch<{ bases: KnowledgeBase[] }>("/api/knowledge/bases").then(
      (data) => {
        if (data?.bases.length) setBases(data.bases);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async (input: {
    id?: string;
    name: string;
    description: string;
    access: string;
  }) => {
    if (input.id) {
      apiFetch(`/api/knowledge/bases/${input.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          access: input.access,
        }),
      });
      setBases((current) =>
        current.map((b) =>
          b.id === input.id
            ? {
                ...b,
                name: input.name,
                description: input.description,
                access: input.access,
              }
            : b,
        ),
      );
      return "updated" as const;
    }
    const data = await apiFetch<{ base: KnowledgeBase }>(
      "/api/knowledge/bases",
      {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          access: input.access,
        }),
      },
    );
    setBases((current) => [
      ...current,
      data?.base ?? {
        id: uid(),
        color: "purple",
        owner: "研发部",
        ...{
          name: input.name,
          description: input.description,
          access: input.access,
        },
      },
    ]);
    return "created" as const;
  };
  return { bases, setBases, save };
}

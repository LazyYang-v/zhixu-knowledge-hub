import { useCollection } from "../../hooks/useCollection";
import { apiFetch } from "../../lib/api";
import { seedBases } from "./seed";
import type { KnowledgeBase } from "./types";
export function useKnowledgeBases() {
  const state = useCollection<KnowledgeBase, "bases">(
    "/api/knowledge/bases",
    "bases",
    "knowledge-bases-v1",
    seedBases,
  );
  const save = async (input: {
    id?: string;
    name: string;
    description: string;
    access: string;
  }) => {
    const data = await apiFetch<{ base: KnowledgeBase }>(
      `/api/knowledge/bases${input.id ? `/${input.id}` : ""}`,
      {
        method: input.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          access: input.access,
          ...(input.id
            ? {
                revision:
                  state.records.find((base) => base.id === input.id)
                    ?.revision ?? 1,
              }
            : {}),
        }),
      },
    );
    const base = data?.base ?? {
      id: input.id ?? crypto.randomUUID(),
      color: "purple",
      owner: "演示成员",
      ...input,
    };
    state.setRecords((current) =>
      input.id
        ? current.map((item) => (item.id === input.id ? base : item))
        : [...current, base],
    );
    return input.id ? "updated" : "created";
  };
  return { ...state, bases: state.records, setBases: state.setRecords, save };
}

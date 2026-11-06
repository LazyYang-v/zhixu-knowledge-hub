import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useResource } from "../hooks/useResource";
export interface OverviewData {
  stats: {
    documents: number;
    published: number;
    bases: number;
    conversations: number;
    members: number;
    tasks: { running: number; error: number; done: number };
    queriesToday: number;
  };
  latestEvaluation: unknown;
}
function useWorkspaceData() {
  const overview = useResource<OverviewData>("/api/overview", {
    stats: {
      documents: 0,
      published: 0,
      bases: 0,
      conversations: 0,
      members: 0,
      tasks: { running: 0, error: 0, done: 0 },
      queriesToday: 0,
    },
    latestEvaluation: null,
  });
  const health = useResource<{ status: string; time: string }>("/api/health", {
    status: "demo",
    time: "",
  });
  return { overview, health };
}
const WorkspaceContext = createContext<ReturnType<
  typeof useWorkspaceData
> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceData();
  return (
    <WorkspaceContext.Provider value={state}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("缺少工作空间上下文");
  return context;
}

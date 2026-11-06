export type DataMode = "server" | "demo";
export function getDataMode(): DataMode {
  try {
    return localStorage.getItem("knowledge-hub:data-mode") === "demo"
      ? "demo"
      : "server";
  } catch {
    return "server";
  }
}
export function setDataMode(mode: DataMode) {
  localStorage.setItem("knowledge-hub:data-mode", mode);
  window.location.reload();
}

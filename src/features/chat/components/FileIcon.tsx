import { FileText } from "lucide-react";
type EvidenceTab = "source" | "retrieval" | "permission";
export function FileIcon({ type = "pdf" }: { type?: string }) {
  return (
    <span className={`file-icon file-icon-${type}`}>
      <FileText size={19} />
      <small>{type === "docx" ? "W" : type === "md" ? "MD" : "PDF"}</small>
    </span>
  );
}

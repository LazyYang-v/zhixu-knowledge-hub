import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
export function CapabilityNote({ children }: { children: ReactNode }) {
  return (
    <div className="gp-demo-note">
      <FlaskConical size={14} />
      {children}
    </div>
  );
}

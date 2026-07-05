import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

// Fælles advarsels-banner (Sheets nede, fetch fejlede, …). Ingen hooks, så den
// kan bruges fra både server- og client-komponenter.
export default function WarnBanner({
  children,
  action,
  role = "status",
}: {
  children: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      className="cc-card cc-card-pad"
      role={role}
      style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}
    >
      <AlertTriangle size={16} style={{ color: "var(--amber)", flexShrink: 0 }} aria-hidden />
      <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: "var(--text-muted)" }}>{children}</div>
      {action}
    </div>
  );
}

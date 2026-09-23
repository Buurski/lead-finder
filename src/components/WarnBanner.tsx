import { Activity } from "lucide-react";
import type { ReactNode } from "react";

// Fælles rolig besked-linje (fetch fejlede, kilde nede, …) — hvidt kort, ingen
// amber-kant, ingen advarselstrekant (Lucas: det gamle system havde bannere,
// det nye har én rolig linje, samme stil som /seo's statuslinjer). Ingen
// hooks, så den kan bruges fra både server- og client-komponenter.
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
    <div className="cc-card cc-card-pad" role={role} style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Activity size={16} style={{ color: "var(--amber)", flexShrink: 0 }} aria-hidden />
      <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: "var(--text-muted)" }}>{children}</div>
      {action}
    </div>
  );
}

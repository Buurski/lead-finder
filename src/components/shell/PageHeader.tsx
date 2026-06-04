import type { ReactNode } from "react";
import Icon from "./Icon";

// Shared page header. Keeps every SELF/AGENTS surface visually consistent with
// Mission Control without repeating markup.
export default function PageHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
      <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: "var(--bg-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name={icon} style={{ width: 20, height: 20, color: "var(--accent-ink)" }} />
        </span>
        <div>
          <h1 className="cc-h1" style={{ fontSize: 24 }}>{title}</h1>
          {subtitle && <p className="cc-sub" style={{ marginTop: 3 }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

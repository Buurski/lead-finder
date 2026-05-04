"use client";
import type { Lead } from "@/lib/sheets";

export type EmailFilter =
  | "all"
  | "with-email"
  | "sent"
  | "replied"
  | "followup";

interface Props {
  leads: Lead[];
  activeFilter: EmailFilter;
  onFilter: (f: EmailFilter) => void;
}

export default function EmailStatsPanel({ leads, activeFilter, onFilter }: Props) {
  const withEmail = leads.filter((l) => l.email);
  const sent = withEmail.filter((l) => ["sent", "opened", "clicked", "replied"].includes(l.emailStatus));
  const replied = withEmail.filter((l) => l.emailStatus === "replied");
  const followedUp = leads.filter((l) => l.followupSentAt);

  const stats: { label: string; value: string | number; color: string; filter: EmailFilter }[] = [
    { label: "Leads m. email", value: withEmail.length, color: "var(--text)",  filter: "with-email" },
    { label: "Sendt",          value: sent.length,      color: "#b45309",      filter: "sent" },
    { label: "Svarede",        value: replied.length,   color: "#15803d",      filter: "replied" },
    { label: "Follow-ups",     value: followedUp.length,color: "#7c3aed",      filter: "followup" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {stats.map(({ label, value, color, filter }) => {
        const isActive = activeFilter === filter;
        return (
          <button
            key={label}
            onClick={() => onFilter(isActive ? "all" : filter)}
            style={{
              background: isActive ? color : "var(--surface)",
              border: `1px solid ${isActive ? color : "var(--border)"}`,
              borderRadius: 10,
              padding: "10px 16px",
              minWidth: 90,
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
              outline: "none",
            }}
          >
            <div style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: 22,
              fontWeight: 700,
              color: isActive ? "#fff" : color,
            }}>
              {value}
            </div>
            <div style={{
              fontSize: 11,
              color: isActive ? "rgba(255,255,255,0.8)" : "var(--text-dim)",
              marginTop: 2,
              whiteSpace: "nowrap",
            }}>
              {label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

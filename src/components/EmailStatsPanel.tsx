import type { Lead } from "@/lib/sheets";

export default function EmailStatsPanel({ leads }: { leads: Lead[] }) {
  const withEmail = leads.filter((l) => l.email);
  const sent = withEmail.filter((l) => ["sent", "opened", "clicked"].includes(l.emailStatus));
  const opened = withEmail.filter((l) => ["opened", "clicked"].includes(l.emailStatus));
  const clicked = withEmail.filter((l) => l.emailStatus === "clicked");
  const followedUp = leads.filter((l) => l.followupSentAt);
  const openRate = sent.length > 0 ? Math.round((opened.length / sent.length) * 100) : 0;
  const clickRate = sent.length > 0 ? Math.round((clicked.length / sent.length) * 100) : 0;

  const stats = [
    { label: "Leads m. email", value: withEmail.length, color: "var(--text)" },
    { label: "Sendt", value: sent.length, color: "#b45309" },
    { label: "Åbnet", value: opened.length, color: "#15803d" },
    { label: "Klikket", value: clicked.length, color: "#14532d" },
    { label: "Follow-ups", value: followedUp.length, color: "#7c3aed" },
    { label: "Åbningsrate", value: `${openRate}%`, color: "#b45309" },
    { label: "Klikrate", value: `${clickRate}%`, color: "#14532d" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", minWidth: 90, textAlign: "center" }}
        >
          <div style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 22, fontWeight: 700, color }}>
            {value}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, whiteSpace: "nowrap" }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

import { Pill, StatTile } from "@/components/finance/FinanceUI";
import type { latestNewsletterFor } from "@/lib/hq/newsletter-sync";
import { MAX_PER_YEAR, MIN_DAYS_BETWEEN, newsletterInsights, type CampaignStat, type CampaignType } from "@/lib/hq/newsletter";

// Kundens nyhedsbrev (Brevo) set fra HQ: kun aggregater fra kundens eget site — ingen kontakter, ingen mails.
// Afsendelse sker aldrig herfra; HQ viser status, kadence og advarsler.

type Snap = Awaited<ReturnType<typeof latestNewsletterFor>>[number];

const TYPE_LABEL: Record<CampaignType, string> = { seo: "SEO", nyhedsbrev: "Nyhedsbrev", service: "Service", andet: "Andet" };
const dato = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Copenhagen" }) : "–");
const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
const num = (n: number) => n.toLocaleString("da-DK");

export default function NewsletterPanel({ snaps }: { snaps: Snap[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {snaps.map((s) => {
        const i = newsletterInsights(s);
        return (
          <section key={s.account} className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="virk-section-title" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span>Nyhedsbrev · Brevo</span>
              <span className="cc-dim" style={{ fontSize: 12, fontWeight: 400 }}>Opdateret {s.takenAt.toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Copenhagen" })}</span>
            </div>

            {i.flags.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {i.flags.map((f) => (
                  <li key={f.text} role={f.level === "haster" ? "alert" : undefined} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}>
                    <Pill tone={f.level === "haster" ? "red" : "amber"}>{f.level === "haster" ? "Haster" : "Obs"}</Pill>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <StatTile label="Modtagere" value={num(i.subscribers)} sub="på kundens lister" />
              <StatTile label="Sendt seneste år" value={`${i.sentLastYear} / ${MAX_PER_YEAR}`} sub={`maks ${MAX_PER_YEAR} om året`} />
              <StatTile label="Sidst sendt" value={dato(i.lastSentAt)} sub={i.daysSinceLast === null ? "intet sendt endnu" : `${i.daysSinceLast} dage siden`} />
              <StatTile label="Næste tidligst" value={i.nextAllowedAt ? dato(i.nextAllowedAt) : "Nu"} sub={`mindst ${MIN_DAYS_BETWEEN} dage imellem`} />
            </div>

            {s.domain && (
              <p style={{ margin: 0, fontSize: 12.5 }} className="cc-dim">
                Afsenderdomæne {s.domain.name}:{" "}
                <Pill tone={s.domain.authenticated ? "green" : "red"}>{s.domain.authenticated ? "godkendt" : "ikke godkendt"}</Pill>{" "}
                DKIM {s.domain.dkim ? "ok" : "mangler"} · DMARC {s.domain.dmarc ? "ok" : "mangler"}
              </p>
            )}

            <CampaignTable title="Kladder og planlagte" empty="Ingen kladder eller planlagte udsendelser." rows={[...i.scheduled, ...i.drafts]} />
            <SentTable rows={i.sent} />
          </section>
        );
      })}
    </div>
  );
}

function CampaignTable({ title, empty, rows }: { title: string; empty: string; rows: CampaignStat[] }) {
  return (
    <div>
      <h3 className="cc-kicker" style={{ margin: "0 0 6px" }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 12.5, margin: 0 }}>{empty}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="nl-table">
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th scope="col">Navn</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ textAlign: "right" }}>Modtagere</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{TYPE_LABEL[c.type]}</td>
                  <td>{c.status === "scheduled" ? `Planlagt ${dato(c.scheduledAt)}` : "Kladde"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(c.recipients)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SentTable({ rows }: { rows: ReturnType<typeof newsletterInsights>["sent"] }) {
  return (
    <div>
      <h3 className="cc-kicker" style={{ margin: "0 0 6px" }}>Sendt</h3>
      {rows.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 12.5, margin: 0 }}>Intet sendt endnu.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="nl-table">
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th scope="col">Navn</th>
                <th scope="col">Sendt</th>
                <th scope="col" style={{ textAlign: "right" }}>Modtagere</th>
                <th scope="col" style={{ textAlign: "right" }}>Åbnet</th>
                <th scope="col" style={{ textAlign: "right" }}>Klik</th>
                <th scope="col" style={{ textAlign: "right" }}>Afmeldt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{dato(c.sentAt)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(c.recipients)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(c.openRate)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(c.clickRate)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(c.unsubRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

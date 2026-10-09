import { getDb } from "@/lib/db/client";
import { listRepliedLeads } from "@/lib/hq/replied-leads";
import { currentUser } from "@/lib/current-user";
import PageHeader from "@/components/shell/PageHeader";
import HarSvaretList, { type HarSvaretRow } from "./HarSvaretList";
import "./har-svaret.css";

export const metadata = { title: "Har svaret · Command Center" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Copenhagen" });

// Kalenderdage i København (ikke 24-timersperioder): i går kl. 23 er "i går", også kl. 09.
const dkDay = (t: number) => Date.parse(new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }));
function ageLabel(iso: string): string {
  const d = Math.round((dkDay(Date.now()) - dkDay(Date.parse(iso))) / 86_400_000);
  return d <= 0 ? "i dag" : d === 1 ? "i går" : `${d} d siden`;
}

// Egen side (ikke en sektion på forsiden): ~75 rækker med handlinger fylder for meget ovenpå
// forsidens kort. Forsiden viser tallet og linker hertil.
export default async function HarSvaretPage() {
  const user = await currentUser();
  const me = user === "charlie" ? "charlie" : "lucas";
  const leads = await listRepliedLeads(getDb());
  const rows: HarSvaretRow[] = leads.map((l) => ({
    id: l.id,
    rowNo: l.rowNo,
    name: l.name,
    place: [l.city, l.branch].filter(Boolean).join(" · "),
    phone: l.phone,
    email: l.email,
    jev: l.jevGrade ?? "",
    owner: l.owner ?? "",
    lifecycle: l.lifecycle,
    lastContact: l.lastContactAt ? dateFmt.format(new Date(l.lastContactAt)) : "",
    age: l.lastContactAt ? ageLabel(l.lastContactAt) : "",
  }));

  return (
    <div className="cc-fade">
      <PageHeader icon="Phone" title="Har svaret" subtitle={`${rows.length} leads har svaret på en mail og er stadig åbne. Ældste kontakt står øverst.`} />
      <p className="hs-note" role="note">Tjek reklamebeskyttelse før opkald. Se §10-notat.</p>
      {rows.length === 0 ? (
        <div className="cc-card hs-empty">Ingen åbne leads har svaret lige nu.</div>
      ) : (
        <HarSvaretList rows={rows} me={me} />
      )}
    </div>
  );
}

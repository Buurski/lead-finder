import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, company } from "@/lib/db/schema";
import { getDossier } from "@/lib/hq/dossier";
import { loadCustomerNotes } from "@/lib/hq/notes";
import KnowledgeUpdate from "@/components/virksomheder/KnowledgeUpdate";
import { normalizeStage } from "@/lib/hq/deals";
import { getFollowUpOverview } from "@/lib/hq/followup-overview";
import { unbilledWork } from "@/lib/hq/billing";
import { loadOverview } from "@/lib/hq/overview-load";
import { listRelations } from "@/lib/hq/relations";
import { SERVICES } from "@/lib/hq/overview";
import { cmsUsageFor } from "@/lib/hq/cms-usage";
import { getOnboardingChecklist } from "@/lib/hq/onboarding";
import { copenhagenNow } from "@/lib/settings";
import { currentUser } from "@/lib/current-user";
import { invoiceTotal, isOverdue, type InvoiceStatus } from "@/lib/invoices";
import PageHeader from "@/components/shell/PageHeader";
import { lifecycleChipStyle, lifecycleLabel } from "@/components/virksomheder/lifecycle";
import DealsSection from "@/components/virksomheder/DealsSection";
import Timeline from "@/components/virksomheder/Timeline";
import MergePanel from "@/components/virksomheder/MergePanel";
import MakeCustomerButton from "@/components/virksomheder/MakeCustomerButton";
import NoteCard from "@/components/virksomheder/NoteCard";
import HermesAskButton from "@/components/virksomheder/HermesAskButton";
import UnbilledWork from "@/components/virksomheder/UnbilledWork";
import Overblik from "@/components/virksomheder/Overblik";
import ProfileTabs from "@/components/virksomheder/ProfileTabs";
import ProfileQuickActions from "@/components/virksomheder/ProfileQuickActions";
import TrackRecentCompany from "@/components/virksomheder/TrackRecentCompany";
import CompanyTasks from "@/components/virksomheder/CompanyTasks";
import "@/components/virksomheder/virksomheder.css";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVOICE_STATUS_STYLE: Record<InvoiceStatus, { background: string; color: string }> = {
  kladde: { background: "var(--bg-3)", color: "var(--text-muted)" },
  sendt: { background: "var(--blue-dim)", color: "var(--blue)" },
  betalt: { background: "var(--green-dim)", color: "var(--green)" },
  forfalden: { background: "var(--red-dim)", color: "var(--red)" },
  rykket: { background: "var(--red-dim)", color: "var(--red)" },
};

// Gamle Sheets-felter indeholder pladsholdere som "none" — de er ikke data.
function real(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return /^(none|null|undefined|-|n\/a)$/i.test(t) ? "" : t;
}

function websiteHref(w: string): string {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

// Fletningens spor: aktiviteten der optog denne (dropped) virksomhed peger på
// hvilken virksomhed der blev beholdt. Se src/lib/pg/merge.ts.
async function findMergeTarget(companyId: string): Promise<{ id: string; name: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ companyId: activity.companyId, at: activity.at })
    .from(activity)
    .where(sql`${activity.payload} ->> 'mergedFrom' = ${companyId}`)
    .orderBy(desc(activity.at))
    .limit(1);
  if (!row?.companyId) return null;
  const target = await getDossier(db, row.companyId, { today: copenhagenNow().date });
  return target ? { id: row.companyId, name: target.company.name } : null;
}

export default async function VirksomhedProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  // Kladder/leads kender kun rækkenummeret (leadId) — slå virksomheden op og viderestil.
  if (/^\d{1,7}$/.test(id)) {
    const [hit] = await db.select({ id: company.id }).from(company).where(eq(company.rowNo, Number(id)));
    if (hit) redirect(`/virksomheder/${hit.id}`);
    notFound();
  }
  if (!UUID.test(id)) notFound();

  const dossier = await getDossier(db, id, { today: copenhagenNow().date, loadNotes: loadCustomerNotes });
  if (!dossier) notFound();
  const c = dossier.company;
  // Charlie 23/9: "Hvem"-valget i Ny opgave skal følge den indloggede person.
  const user = await currentUser();
  const defaultOwner = user === "charlie" ? "charlie" : "lucas";

  if (c.archived && c.lifecycle === "flettet") {
    const target = await findMergeTarget(id);
    return (
      <div className="cc-fade kinly-page">
        <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="virk-section-title"><span>{c.name} er flettet</span></div>
          {target ? (
            <p style={{ fontSize: 13.5 }}>
              Denne virksomhed er flettet ind i{" "}
              <Link className="cc-link" href={`/virksomheder/${target.id}`}>{target.name}</Link>. Se aftaler, tidslinje og
              fakturaer der.
            </p>
          ) : (
            <p className="cc-dim" style={{ fontSize: 13.5 }}>Denne virksomhed er flettet ind i en anden, men målet kunne ikke findes.</p>
          )}
          <Link className="cc-link" href="/virksomheder">← Tilbage til virksomheder</Link>
        </div>
      </div>
    );
  }

  // Kun aftaler der er landet — tilbud og tabte tæller ikke som månedlig indtægt.
  const LIVE = new Set(["aftalt", "i_gang", "leveret", "betalt"]);
  const mrrSum = dossier.deals.filter((d) => LIVE.has(normalizeStage(d.stage))).reduce((sum, d) => sum + (d.mrrDkk ?? 0), 0);
  // "Gør til kunde": en vundet aftale uden kundenummer endnu (bølge 3).
  const canMakeCustomer = c.clientNo === null && dossier.deals.some((d) => LIVE.has(normalizeStage(d.stage)));
  const timelineActivities = dossier.activities.map((a) => ({
    id: a.id,
    type: a.type,
    summary: a.summary,
    actor: a.actor,
    billableDkk: a.billableDkk,
    at: a.at.toISOString(),
  }));
  const dealRows = dossier.deals.map((d) => ({
    id: d.id,
    title: d.title,
    stage: normalizeStage(d.stage, dossier.site?.status),
    valueDkk: d.valueDkk,
    mrrDkk: d.mrrDkk,
    nextStep: d.nextStep,
    nextStepDue: d.nextStepDue,
  }));

  const today = copenhagenNow().date;
  const openInvoices = dossier.invoices.filter((i) => i.status !== "betalt" && i.status !== "kladde");
  const followUps = await getFollowUpOverview(c.rowNo, c.maxTouches);
  const unbilled = await unbilledWork(db, id);
  // Sekventielt (ikke Promise.all) — lokal pglite tåler kun 1 samtidig forbindelse (fælles-regel #23).
  const overview = await loadOverview(db, dossier);
  const relations = await listRelations(db, id);
  const cms = await cmsUsageFor(c, dossier.site?.cmsUrl);
  const onboarding = c.clientNo !== null ? await getOnboardingChecklist(db, c.id) : [];

  const tabs = [
    { key: "overblik", label: "Overblik", content: <Overblik companyId={c.id} overview={overview} cms={cms} servicesCatalog={SERVICES} onboarding={onboarding} relations={relations} /> },
    { key: "tidslinje", label: "Tidslinje", content: <Timeline companyId={c.id} activities={timelineActivities} /> },
    {
      key: "aftaler",
      label: "Aftaler",
      content: (
        <>
          <DealsSection companyId={c.id} deals={dealRows} />

          <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="virk-section-title"><span>Opfølgning</span></div>
            {followUps.sent === 0 ? (
              <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen opfølgningsmails sendt endnu.</p>
            ) : (
              <p style={{ fontSize: 13 }}>
                Kontaktet {followUps.sent}/{followUps.maxTouches}
                {followUps.angleLabel && ` · seneste: ${followUps.angleLabel}`}
                {followUps.lastSentAt && ` · sidst ${new Date(followUps.lastSentAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}`}
                {followUps.stoppedReason && <span style={{ color: "var(--red)" }}> · stoppet ({followUps.stoppedReason})</span>}
              </p>
            )}
          </div>

          <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="virk-section-title"><span>Kontakter</span></div>
            {dossier.contacts.length === 0 ? (
              <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen kontakter tilføjet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dossier.contacts.map((ct) => (
                  <div key={ct.id} style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{ct.name || ct.clientName || "(uden navn)"}{ct.role ? ` · ${ct.role}` : ""}</div>
                    <div className="cc-dim" style={{ fontSize: 12 }}>{[real(ct.email), real(ct.phone)].filter(Boolean).join(" · ") || "–"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CompanyTasks
            companyId={c.id}
            company={c.name}
            today={today}
            defaultOwner={defaultOwner}
            initialTasks={dossier.openTasks.map((t) => ({ id: t.id, title: t.title, due: t.due, owner: t.owner, note: t.note, important: t.important }))}
          />
        </>
      ),
    },
    {
      key: "fakturaer",
      label: "Fakturaer",
      content: (
        <>
          <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="virk-section-title">
              <span>Økonomi</span>
              <Link className="cc-link" href="/fakturaer" style={{ fontSize: 12.5 }}>Alle fakturaer</Link>
            </div>
            <dl className="virk-kv">
              <div className="virk-kv-row"><dt>Ubetalt</dt><dd className="cc-mono">{dossier.balance.unpaid.toLocaleString("da-DK")} kr</dd></div>
              <div className="virk-kv-row"><dt>Forfaldent</dt><dd className="cc-mono" style={dossier.balance.overdue > 0 ? { color: "var(--red)" } : undefined}>{dossier.balance.overdue.toLocaleString("da-DK")} kr</dd></div>
            </dl>
            {openInvoices.length === 0 ? (
              <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen åbne fakturaer.</p>
            ) : (
              <div>
                {openInvoices.map((inv) => {
                  const overdue = isOverdue(inv, today);
                  const status = overdue && inv.status === "sendt" ? "forfalden" : inv.status;
                  return (
                    <div key={inv.number} className="virk-invoice-row">
                      <span>Faktura {inv.number}</span>
                      <span className="cc-mono">{invoiceTotal(inv).total.toLocaleString("da-DK")} kr</span>
                      <span className="virk-status-chip" style={INVOICE_STATUS_STYLE[status] ?? INVOICE_STATUS_STYLE.kladde}>{status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <UnbilledWork companyId={c.id} items={unbilled} />
        </>
      ),
    },
    {
      key: "viden",
      label: "Viden",
      content: (
        <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="virk-section-title">
            <span>Kundeviden</span>
          </div>
          <KnowledgeUpdate companyId={dossier.company.id} />
          {dossier.notes.length === 0 ? (
            <p className="cc-dim" style={{ fontSize: 12.5 }}>
              Ingen kundenote i vaulten endnu — knappen ovenfor laver en ny.
            </p>
          ) : (
            dossier.notes.map((n) => <NoteCard key={n.path} title={n.title} body={n.body} />)
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <TrackRecentCompany id={c.id} name={c.name || "(uden navn)"} />
      <PageHeader
        icon="Building2"
        title={c.name || "(uden navn)"}
        subtitle={
          // Spans, ikke divs — PageHeader sætter subtitlen i en <p>, og en <div>
          // ville brække HTML-nestingen (block-i-p) og give en hydration-fejl.
          <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="cc-chip" style={lifecycleChipStyle(c.lifecycle)}>{lifecycleLabel(c.lifecycle)}</span>
              {c.jevGrade && <span className="cc-chip" style={{ background: "var(--bg-3)", color: "var(--text-muted)" }}>Jev {c.jevGrade}</span>}
              <span>{[c.city, c.branch].filter(Boolean).join(" · ") || "–"}</span>
              {c.clientNo !== null && <span>· Kunde #{c.clientNo}</span>}
              {mrrSum > 0 && <span>· MRR {mrrSum.toLocaleString("da-DK")} kr</span>}
            </span>
            <span className="virk-header-links">
              {c.website && <a href={websiteHref(c.website)} target="_blank" rel="noreferrer">{c.website}</a>}
              {real(c.email) && <a href={`mailto:${real(c.email)}`}>{real(c.email)}</a>}
              {real(c.phone) && <a href={`tel:${real(c.phone)}`}>{real(c.phone)}</a>}
              {!c.website && !real(c.email) && !real(c.phone) && <span className="cc-dim">Ingen kontaktoplysninger endnu.</span>}
            </span>
          </span>
        }
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            {canMakeCustomer && <MakeCustomerButton companyId={c.id} companyName={c.name} />}
            <ProfileQuickActions companyId={c.id} companyName={c.name || "(uden navn)"} defaultOwner={defaultOwner} canDraft={c.clientNo == null} />
            <HermesAskButton companyId={c.id} name={c.name || "kunden"} />
            <MergePanel self={{ id: c.id, name: c.name, city: c.city, lifecycle: c.lifecycle, clientNo: c.clientNo, rowNo: c.rowNo }} />
          </div>
        }
      />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}

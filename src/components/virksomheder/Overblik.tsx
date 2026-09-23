"use client";
// Kundeoverblikket (Lucas 23/9): det væsentlige om en kunde på ét sted — hvad
// haster, seneste kontakt, penge og aftale, hvad vi leverer, site/CMS-brug og
// seneste arbejde. Ren visning oven på CustomerOverview (src/lib/hq/overview.ts)
// + CmsUsage (src/lib/hq/cms-usage.ts) — al beregning ligger i backend'en.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import Link from "next/link";
import SeoChart from "@/components/seo/SeoChart";
import { safeHref } from "@/lib/safe-href";
// Kun type-imports fra overview.ts/invoices.ts/cms-usage.ts: de trækker (via
// deals.ts/db/client.ts) "server-only"-moduler ind, som ikke må rørt fra en
// client bundle. Runtime-værdien SERVICES sendes derfor ind som prop fra
// page.tsx (server component) i stedet for at importeres her.
import type { CustomerOverview } from "@/lib/hq/overview";
import type { CmsUsage } from "@/lib/hq/cms-usage";
import type { OnboardingTaskRow } from "@/lib/hq/onboarding";
import type { InvoiceLine } from "@/lib/invoices";
import "./make-customer.css";

type Plan = CustomerOverview["money"]["plan"];
type Site = CustomerOverview["site"];

const SITE_STATUS_LABEL: Record<string, string> = { demo: "Demo", "in progress": "I gang", live: "Live", pause: "Pause" };
const SITE_STATUS_OPTIONS = Object.keys(SITE_STATUS_LABEL);
const MISSING_LABEL: Record<string, string> = {
  "aftale/pris": "Aftale/pris mangler",
  "kontakt-mail": "Kontakt-mail mangler",
  domæne: "Domæne mangler",
  "hvad vi leverer": "Hvad vi leverer mangler",
  "aftale i pipeline": "Ingen aftale i pipeline",
};
const OPENABLE = new Set(["aftale/pris", "domæne"]);
const WORK_ICON: Record<string, string> = {
  note: "FileText", opkald: "Phone", moede: "Calendar", arbejde: "Briefcase",
  fase: "Workflow", deploy: "Server", faktura: "Receipt", kundeopdatering: "Mail", udkast_sendt: "Send",
};

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;
const websiteHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

function relDays(iso: string | null): string {
  if (!iso) return "aldrig udgivet";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "sidst udgivet i dag";
  if (days === 1) return "sidst udgivet i går";
  return `sidst udgivet for ${days} dage siden`;
}

async function patchProfil(companyId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/virksomheder/${companyId}/profil`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

async function patchOpstart(companyId: string, taskId: string, done: boolean) {
  const res = await fetch(`/api/virksomheder/${companyId}/opstart/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

function AttentionStrip({ items }: { items: CustomerOverview["attention"] }) {
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Lige nu</span></div>
      {items.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 13 }}>Intet der haster.</p>
      ) : (
        <ul className="ov-attention-list">
          {items.map((a, i) => (
            <li key={i} className="ov-attention-item" data-level={a.level}>
              <span className="ov-dot" aria-hidden="true" />
              {a.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactCard({ mails }: { mails: CustomerOverview["lastMails"] }) {
  const last = mails[0];
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Kontakt</span></div>
      {last && (
        <span className="ov-waiting" data-side={last.dir === "ind" ? "us" : "customer"}>
          {last.dir === "ind" ? "Venter på os" : `Venter på kunden siden ${fmtDate(last.at)}`}
        </span>
      )}
      {mails.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen mails registreret endnu.</p>
      ) : (
        <ul className="ov-mail-list">
          {mails.map((m, i) => (
            <li key={i} className="ov-mail-item">
              <Icon
                name={m.dir === "ud" ? "ArrowUpRight" : "ArrowDownLeft"}
                className="ov-mail-dir"
                data-dir={m.dir}
                style={{ width: 14, height: 14 }}
                aria-hidden="true"
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ov-mail-summary">{m.summary}</div>
                <div className="cc-mono ov-mail-date">{fmtDate(m.at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AftaleEditor({
  companyId, initial, onDone, onCancel,
}: {
  companyId: string;
  initial: Plan;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<InvoiceLine[]>(initial?.lines.length ? initial.lines : [{ description: "", amount: 0 }]);
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth ?? 1);
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function setLine(i: number, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { description: "", amount: 0 }]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    const clean = lines.map((l) => ({ description: l.description.trim(), amount: Number(l.amount) || 0 }));
    if (clean.some((l) => !l.description || l.amount <= 0)) { setErr("Hver linje skal have tekst og et beløb over 0."); return; }
    setBusy(true); setErr("");
    try {
      await patchProfil(companyId, { aftale: { lines: clean, dayOfMonth, active } });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setErr("");
    try {
      await patchProfil(companyId, { aftale: null });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke fjerne aftalen");
    } finally { setBusy(false); }
  }

  return (
    <div className="ov-editor">
      {lines.map((l, i) => (
        <div key={i} className="virk-deal-row">
          <input
            className="virk-inline-input"
            style={{ flex: 1 }}
            value={l.description}
            placeholder="Fx hosting + CMS"
            onChange={(e) => setLine(i, { description: e.target.value })}
            aria-label="Linjetekst"
          />
          <input
            className="virk-inline-input"
            style={{ width: 100 }}
            value={l.amount || ""}
            placeholder="Kr"
            inputMode="numeric"
            onChange={(e) => setLine(i, { amount: Number(e.target.value.replace(/\D/g, "")) || 0 })}
            aria-label="Beløb i kr"
          />
          {lines.length > 1 && (
            <button className="cc-btn virk-btn-press" onClick={() => removeLine(i)} aria-label="Fjern linje">×</button>
          )}
        </div>
      ))}
      <button
        className="cc-link virk-btn-press"
        style={{ width: "fit-content", background: "none", border: "none", padding: 0, fontSize: 12.5 }}
        onClick={addLine}
      >
        + linje
      </button>

      <div className="virk-deal-row">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" }}>
          Faktureres d.
          <input
            className="virk-inline-input"
            style={{ width: 56 }}
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
            aria-label="Dag i måneden"
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Aktiv
        </label>
      </div>

      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="cc-btn cc-btn-accent virk-btn-press" onClick={save} disabled={busy}>{busy ? "Gemmer…" : "Gem aftale"}</button>
        <button className="cc-btn virk-btn-press" onClick={onCancel} disabled={busy}>Annullér</button>
        {initial && (
          <button className="cc-btn virk-btn-press" onClick={remove} disabled={busy} style={{ marginLeft: "auto", color: "var(--red)" }}>
            Fjern aftale
          </button>
        )}
      </div>
    </div>
  );
}

function MoneyCard({
  companyId, money, editing, onEdit, onSaved,
}: {
  companyId: string;
  money: CustomerOverview["money"];
  editing: boolean;
  onEdit: (v: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="virk-section-title">
        <span>Penge</span>
        {money.plan && !editing && <button className="cc-btn virk-btn-press" onClick={() => onEdit(true)}>Ret aftale</button>}
      </div>

      {editing ? (
        <AftaleEditor companyId={companyId} initial={money.plan} onDone={() => { onEdit(false); onSaved(); }} onCancel={() => onEdit(false)} />
      ) : money.plan ? (
        <div className="ov-plan">
          {money.plan.lines.map((l, i) => (
            <div key={i} className="ov-plan-line">
              <span>{l.description}</span>
              <span className="cc-mono">{kr(l.amount)}</span>
            </div>
          ))}
          <div className="ov-plan-total cc-mono">
            = {kr(money.plan.perMonth)}/md, faktureres d. {money.plan.dayOfMonth}.
            {!money.plan.active && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> (sat på pause)</span>}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <p className="cc-dim" style={{ fontSize: 12.5, margin: 0 }}>Ingen aftale registreret.</p>
          <button className="cc-btn cc-btn-accent virk-btn-press" onClick={() => onEdit(true)}>Tilføj aftale</button>
        </div>
      )}

      <dl className="virk-kv">
        <div className="virk-kv-row"><dt>Skylder</dt><dd className="cc-mono">{kr(money.unpaid)}</dd></div>
        {money.overdue > 0 && (
          <div className="virk-kv-row"><dt>Forfaldent</dt><dd className="cc-mono" style={{ color: "var(--red)" }}>{kr(money.overdue)}</dd></div>
        )}
        <div className="virk-kv-row"><dt>Faktureret i alt</dt><dd className="cc-mono">{kr(money.invoicedTotal)}</dd></div>
        {money.unbilled > 0 && (
          <div className="virk-kv-row"><dt>Ufaktureret arbejde</dt><dd className="cc-mono">{kr(money.unbilled)}</dd></div>
        )}
        {money.openDraftInvoices.length > 0 && (
          <div className="virk-kv-row"><dt>Kladder</dt><dd>{money.openDraftInvoices.join(", ")}</dd></div>
        )}
      </dl>
    </div>
  );
}

function ServicesCard({
  companyId, services, catalog, onSaved,
}: {
  companyId: string;
  services: string[];
  catalog: Record<string, string>;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(services);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function toggle(key: string) {
    const prev = selected;
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    setSelected(next);
    setBusy(key);
    setErr("");
    try {
      await patchProfil(companyId, { services: next });
      onSaved();
    } catch (e) {
      setSelected(prev);
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally { setBusy(null); }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Vi leverer</span></div>
      <div className="ov-chips">
        {Object.entries(catalog).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="virk-chip ov-service-chip"
            aria-pressed={selected.includes(key)}
            disabled={busy === key}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
    </div>
  );
}

function SiteEditor({ companyId, initial, onDone, onCancel }: { companyId: string; initial: Site; onDone: () => void; onCancel: () => void }) {
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [cmsUrl, setCmsUrl] = useState(initial?.cmsUrl ?? "");
  const [status, setStatus] = useState(initial?.status ?? "demo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    try {
      await patchProfil(companyId, { site: { domain: domain.trim(), cmsUrl: cmsUrl.trim(), status } });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally { setBusy(false); }
  }

  return (
    <div className="ov-editor">
      <input className="virk-inline-input" style={{ height: 34 }} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Domæne, fx kunde.dk" aria-label="Domæne" />
      <input className="virk-inline-input" style={{ height: 34 }} value={cmsUrl} onChange={(e) => setCmsUrl(e.target.value)} placeholder="CMS-link (https://…)" aria-label="CMS-link" />
      <select className="virk-stage-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Site-status">
        {SITE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{SITE_STATUS_LABEL[s]}</option>)}
      </select>
      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="cc-btn cc-btn-accent virk-btn-press" onClick={save} disabled={busy}>{busy ? "Gemmer…" : "Gem"}</button>
        <button className="cc-btn virk-btn-press" onClick={onCancel} disabled={busy}>Annullér</button>
      </div>
    </div>
  );
}

function SiteCard({
  companyId, site, cms, editing, onEdit, onSaved,
}: {
  companyId: string;
  site: Site;
  cms: CmsUsage | null;
  editing: boolean;
  onEdit: (v: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title">
        <span>Site</span>
        {!editing && <button className="cc-btn virk-btn-press" onClick={() => onEdit(true)}>Redigér</button>}
      </div>

      {editing ? (
        <SiteEditor companyId={companyId} initial={site} onDone={() => { onEdit(false); onSaved(); }} onCancel={() => onEdit(false)} />
      ) : site ? (
        <dl className="virk-kv">
          <div className="virk-kv-row"><dt>Status</dt><dd>{SITE_STATUS_LABEL[site.status] ?? site.status}</dd></div>
          <div className="virk-kv-row">
            <dt>Domæne</dt>
            <dd>{site.domain ? <a className="cc-link" href={websiteHref(site.domain)} target="_blank" rel="noreferrer">{site.domain}</a> : "–"}</dd>
          </div>
          {site.cmsUrl && (
            <div className="virk-kv-row"><dt>CMS</dt><dd><a className="cc-link" href={safeHref(site.cmsUrl)} target="_blank" rel="noreferrer">Åbn CMS</a></dd></div>
          )}
        </dl>
      ) : (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>Intet site oprettet endnu.</p>
      )}

      {!editing && (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>
          {cms
            ? [
                relDays(cms.lastPublishAt),
                cms.pendingEdits > 0 ? `${cms.pendingEdits} rettelse${cms.pendingEdits === 1 ? "" : "r"} ikke udgivet` : null,
                cms.aiSpendMonthKr > 0 ? `AI-chat ${kr(cms.aiSpendMonthKr)} denne md` : null,
              ].filter(Boolean).join(" · ")
            : "CMS ikke koblet."}
        </p>
      )}
    </div>
  );
}

function WorkCard({ items }: { items: CustomerOverview["lastWork"] }) {
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Seneste arbejde</span></div>
      {items.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>Intet arbejde logget endnu.</p>
      ) : (
        <ul className="ov-work-list">
          {items.map((w, i) => (
            <li key={i} className="ov-work-item">
              <span className="virk-timeline-icon" aria-hidden="true">
                <Icon name={WORK_ICON[w.type] ?? "Activity"} style={{ width: 14, height: 14 }} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ov-mail-summary">{w.summary}</div>
                <div className="cc-mono ov-mail-date">{w.actor} · {fmtDate(w.at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpstartCard({ companyId, items, onSaved }: { companyId: string; items: OnboardingTaskRow[]; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const done = items.filter((t) => t.done).length;

  async function toggle(t: OnboardingTaskRow) {
    setBusy(t.id);
    try {
      await patchOpstart(companyId, t.id, !t.done);
      onSaved();
    } catch {
      // stille fejl — checkboksen forbliver klikbar, prøv igen
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title">
        <span>Opstart</span>
        <span className="cc-dim cc-mono" style={{ fontSize: 12 }}>{done}/{items.length}</span>
      </div>
      <ul className="mkk-checklist">
        {items.map((t) => (
          <li key={t.id}>
            <label className="mkk-check">
              <input type="checkbox" checked={t.done} disabled={busy === t.id} onChange={() => toggle(t)} />
              <span data-done={t.done}>{t.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissingPills({ missing, onOpen }: { missing: string[]; onOpen: (key: string) => void }) {
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Mangler</span></div>
      <div className="ov-chips">
        {missing.map((m) => (
          OPENABLE.has(m) ? (
            <button key={m} type="button" className="virk-chip ov-missing-chip" onClick={() => onOpen(m)}>{MISSING_LABEL[m] ?? m}</button>
          ) : (
            <span key={m} className="virk-chip ov-missing-chip" style={{ cursor: "default" }}>{MISSING_LABEL[m] ?? m}</span>
          )
        ))}
      </div>
    </div>
  );
}

export default function Overblik({
  companyId, overview, cms, servicesCatalog, onboarding, seoPoints,
}: {
  companyId: string;
  overview: CustomerOverview;
  cms: CmsUsage | null;
  servicesCatalog: Record<string, string>;
  onboarding: OnboardingTaskRow[];
  seoPoints: Array<{ takenAt: string; performance: number | null; seo: number | null; accessibility: number | null; onpage: number | null }>;
}) {
  const router = useRouter();
  const [editingAftale, setEditingAftale] = useState(false);
  const [editingSite, setEditingSite] = useState(false);

  function openFor(key: string) {
    if (key === "aftale/pris") setEditingAftale(true);
    if (key === "domæne") setEditingSite(true);
  }

  const showOpstart = onboarding.length > 0 && onboarding.some((t) => !t.done);

  return (
    <div className="ov-grid">
      <AttentionStrip items={overview.attention} />

      {showOpstart && <OpstartCard companyId={companyId} items={onboarding} onSaved={() => router.refresh()} />}

      <div className="ov-row">
        <ContactCard mails={overview.lastMails} />
        <MoneyCard companyId={companyId} money={overview.money} editing={editingAftale} onEdit={setEditingAftale} onSaved={() => router.refresh()} />
      </div>

      <div className="ov-row">
        <ServicesCard companyId={companyId} services={overview.services} catalog={servicesCatalog} onSaved={() => router.refresh()} />
        <SiteCard companyId={companyId} site={overview.site} cms={cms} editing={editingSite} onEdit={setEditingSite} onSaved={() => router.refresh()} />
      </div>

      <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 8 }}>
        <div className="virk-section-title"><span>SEO</span><Link className="cc-link" href="/seo" style={{ fontSize: 12 }}>Se historik →</Link></div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><strong style={{ fontSize: 24 }}>{seoPoints[0]?.seo == null ? "—" : `${seoPoints[0].seo}/100`}</strong><span className="cc-dim" style={{ fontSize: 12 }}>PageSpeed SEO på mobil</span></div>
        <SeoChart compact points={seoPoints} />
      </section>

      <WorkCard items={overview.lastWork} />

      {overview.missing.length > 0 && <MissingPills missing={overview.missing} onOpen={openFor} />}
    </div>
  );
}

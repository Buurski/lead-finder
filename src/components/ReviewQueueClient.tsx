"use client";

import { useState, useMemo } from "react";
import type { SkipReason } from "@/lib/sheets";
import type { Concern, QueueKind, QueueSummary } from "@/lib/queue";

// ---------- types ----------

export interface ReviewEntry {
  id: string;
  name: string;
  branch: string;
  city: string;
  score: number;
  website: string;
  email: string;
  websiteQualityTier: string;
  kind: QueueKind;
  concern: Concern;
  willClaimBroken: boolean;
  treatedAsAlive: boolean;
  daysSinceSent: number;
  skipReason: SkipReason;
}

interface Props {
  entries: ReviewEntry[];
  summary: QueueSummary;
  overflow: { cold: number; followups: number };
  paused: boolean;
  pausedUntil: string | null;
}

// ---------- skip reason options ----------

const REASON_OPTIONS: Array<{ value: SkipReason; label: string; autoTreatAsAlive?: boolean }> = [
  { value: "cloudflare_false_positive", label: "Cloudflare/WAF false positive (site er fin)", autoTreatAsAlive: true },
  { value: "chain", label: "Kæde — bør ikke kontaktes" },
  { value: "bad_fit", label: "Bad fit (forkert branche / for stor)" },
  { value: "wrong_template", label: "Forkert mail-template ville blive valgt" },
  { value: "already_contacted_elsewhere", label: "Allerede kontaktet via anden kanal" },
  { value: "other", label: "Andet (skriv hvorfor)" },
];

// ---------- helpers ----------

function rootDomain(url: string): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
}

function screenshotUrl(url: string): string {
  // microlink.io gives a free preview screenshot we can embed inline.
  // ?embed=screenshot.url returns the raw PNG directly.
  const full = url.startsWith("http") ? url : `https://${url}`;
  return `https://api.microlink.io/?url=${encodeURIComponent(full)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800`;
}

function fullUrl(url: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `https://${url}`;
}

// ---------- component ----------

export default function ReviewQueueClient({
  entries,
  summary,
  overflow,
  paused,
  pausedUntil,
}: Props) {
  const [skippedIds, setSkippedIds] = useState<Set<string>>(
    () => new Set(entries.filter((e) => e.skipReason).map((e) => e.id))
  );
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [haltBusy, setHaltBusy] = useState(false);
  const [haltedAt, setHaltedAt] = useState<string | null>(pausedUntil);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [otherReasonOpen, setOtherReasonOpen] = useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const sections = useMemo(() => {
    const chains = entries.filter((e) => e.concern === "chain");
    const broken = entries.filter((e) => e.concern === "broken-website");
    const standard = entries.filter((e) => e.concern === "standard");
    return { chains, broken, standard };
  }, [entries]);

  async function handleSkip(entry: ReviewEntry, reason: SkipReason) {
    if (!reason) return;
    if (reason === "other" && !otherReasonOpen[entry.id]) {
      // Open the notes field; don't submit yet.
      setOtherReasonOpen((s) => ({ ...s, [entry.id]: true }));
      return;
    }

    setBusyIds((s) => new Set(s).add(entry.id));
    setErrorById((s) => ({ ...s, [entry.id]: "" }));

    try {
      const notes = reason === "other" ? (notesById[entry.id] ?? "") : "";
      const skipRes = await fetch("/api/review/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: entry.id, reason, notes }),
      });
      if (!skipRes.ok) throw new Error(`skip failed: ${skipRes.status}`);

      // If Lucas said the site is fine, also teach the TreatAsAlive list so
      // future cron runs don't re-flag the same domain.
      const opt = REASON_OPTIONS.find((o) => o.value === reason);
      if (opt?.autoTreatAsAlive && entry.website) {
        await fetch("/api/review/treat-as-alive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: entry.website,
            reason: `auto-added from review skip: ${reason}`,
          }),
        }).catch(() => {
          // Non-fatal. The skip itself already succeeded — the lead won't
          // get this mail today even if the TreatAsAlive add fails.
        });
      }

      setSkippedIds((s) => new Set(s).add(entry.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorById((s) => ({ ...s, [entry.id]: msg }));
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(entry.id);
        return next;
      });
    }
  }

  async function handleHaltAll() {
    if (!confirm("Stop ALLE udsendelser i de næste 24 timer?")) return;
    setHaltBusy(true);
    try {
      const res = await fetch("/api/review/halt-all", { method: "POST" });
      if (!res.ok) throw new Error("halt failed");
      const data = await res.json();
      setHaltedAt(data.until ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    } catch (err) {
      alert("Halt fejlede — prøv igen. " + (err instanceof Error ? err.message : ""));
    } finally {
      setHaltBusy(false);
    }
  }

  const remainingCount = entries.length - skippedIds.size;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* ----- top bar ----- */}
      <header className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">🌅 Morning review</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              {remainingCount} / {summary.cap} planlagt i dag · {summary.cold} cold · {summary.followups} follow-up
            </p>
          </div>
          <button
            onClick={handleHaltAll}
            disabled={haltBusy || !!haltedAt}
            className="rounded-md bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:opacity-60 text-white text-sm font-semibold px-3 py-2"
          >
            {haltedAt ? "🛑 Pauset" : haltBusy ? "Stopper…" : "🛑 Stop alt i dag"}
          </button>
        </div>
        {haltedAt && (
          <p className="mt-2 text-xs text-red-200">
            Alle udsendelser pauset indtil {new Date(haltedAt).toLocaleString("da-DK")}.
          </p>
        )}
        {paused && !haltedAt && (
          <p className="mt-2 text-xs text-amber-200">
            Systemet er allerede pauset (indtil {pausedUntil ? new Date(pausedUntil).toLocaleString("da-DK") : "?"}).
          </p>
        )}
        {(overflow.cold > 0 || overflow.followups > 0) && (
          <p className="mt-2 text-xs text-slate-400">
            Ikke i dag pga. cap: {overflow.cold} cold + {overflow.followups} follow-ups (ryger med i morgen).
          </p>
        )}
      </header>

      {/* ----- summary chips ----- */}
      <div className="px-4 py-3 flex flex-wrap gap-2 text-xs">
        <Chip count={summary.chains} label="kæder" color="bg-red-100 text-red-800" />
        <Chip count={summary.brokenClaim} label="broken-claim" color="bg-amber-100 text-amber-900" />
        <Chip count={summary.standard} label="standard" color="bg-emerald-100 text-emerald-900" />
      </div>

      {/* ----- sections ----- */}
      {entries.length === 0 && (
        <p className="px-4 py-10 text-center text-slate-500">
          Ingen leads klar til afsendelse i dag.
        </p>
      )}

      <Section
        title="🚨 Mulige kæder"
        emptyText="Ingen kæder i dagens kø."
        entries={sections.chains}
        accent="border-red-500 bg-red-50"
      >
        {(entry) => (
          <Row
            key={entry.id}
            entry={entry}
            skipped={skippedIds.has(entry.id)}
            busy={busyIds.has(entry.id)}
            error={errorById[entry.id]}
            note={notesById[entry.id] ?? ""}
            otherOpen={!!otherReasonOpen[entry.id]}
            onNoteChange={(v) => setNotesById((s) => ({ ...s, [entry.id]: v }))}
            onSkip={(reason) => handleSkip(entry, reason)}
          />
        )}
      </Section>

      <Section
        title="⚠️ Broken-website claims"
        emptyText="Ingen broken-website claims i dag."
        entries={sections.broken}
        accent="border-amber-500 bg-amber-50"
      >
        {(entry) => (
          <Row
            key={entry.id}
            entry={entry}
            skipped={skippedIds.has(entry.id)}
            busy={busyIds.has(entry.id)}
            error={errorById[entry.id]}
            note={notesById[entry.id] ?? ""}
            otherOpen={!!otherReasonOpen[entry.id]}
            onNoteChange={(v) => setNotesById((s) => ({ ...s, [entry.id]: v }))}
            onSkip={(reason) => handleSkip(entry, reason)}
          />
        )}
      </Section>

      <Section
        title="✅ Standard"
        emptyText="Ingen standard-leads."
        entries={sections.standard}
        accent="border-emerald-500 bg-white"
      >
        {(entry) => (
          <Row
            key={entry.id}
            entry={entry}
            skipped={skippedIds.has(entry.id)}
            busy={busyIds.has(entry.id)}
            error={errorById[entry.id]}
            note={notesById[entry.id] ?? ""}
            otherOpen={!!otherReasonOpen[entry.id]}
            onNoteChange={(v) => setNotesById((s) => ({ ...s, [entry.id]: v }))}
            onSkip={(reason) => handleSkip(entry, reason)}
          />
        )}
      </Section>

      <footer className="px-4 py-6 text-center text-xs text-slate-400">
        Sender automatisk kl. 10:00 UTC (≈12:00 CEST).
      </footer>
    </main>
  );
}

// ---------- sub-components ----------

function Chip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${color}`}>
      <strong className="tabular-nums">{count}</strong> {label}
    </span>
  );
}

function Section({
  title,
  emptyText,
  entries,
  accent,
  children,
}: {
  title: string;
  emptyText: string;
  entries: ReviewEntry[];
  accent: string;
  children: (e: ReviewEntry) => React.ReactNode;
}) {
  return (
    <section className="px-3 py-2">
      <h2 className="px-1 py-2 text-sm font-semibold text-slate-700">{title} · {entries.length}</h2>
      {entries.length === 0 ? (
        <p className="px-1 pb-2 text-xs text-slate-400">{emptyText}</p>
      ) : (
        <div className={`space-y-2 rounded-lg border-l-4 ${accent} p-1`}>
          {entries.map((e) => children(e))}
        </div>
      )}
    </section>
  );
}

function Row({
  entry,
  skipped,
  busy,
  error,
  note,
  otherOpen,
  onNoteChange,
  onSkip,
}: {
  entry: ReviewEntry;
  skipped: boolean;
  busy: boolean;
  error?: string;
  note: string;
  otherOpen: boolean;
  onNoteChange: (v: string) => void;
  onSkip: (reason: SkipReason) => void;
}) {
  const [selected, setSelected] = useState<SkipReason>("");
  const link = fullUrl(entry.website);
  const display = rootDomain(entry.website) || "(intet website)";

  return (
    <article
      className={`rounded-md bg-white shadow-sm p-3 transition-opacity duration-300 ${
        skipped ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 truncate">
            {entry.name}{" "}
            <span className="text-xs font-normal text-slate-500">
              · score {entry.score}
              {entry.kind === "followup" && ` · follow-up dag ${entry.daysSinceSent}`}
            </span>
          </p>
          <p className="text-xs text-slate-500 truncate">
            {entry.branch} · {entry.city}
          </p>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            📧 {entry.email}
          </p>
          {entry.website && (
            <p className="text-xs mt-0.5 truncate">
              🌐 <a href={link} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {display}
              </a>
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {entry.willClaimBroken && (
              <span className="inline-block rounded-full bg-amber-100 text-amber-900 text-[10px] px-2 py-0.5 font-medium">
                claim: broken website
              </span>
            )}
            {entry.treatedAsAlive && (
              <span className="inline-block rounded-full bg-blue-100 text-blue-900 text-[10px] px-2 py-0.5 font-medium">
                på treat-as-alive
              </span>
            )}
            <span className="inline-block rounded-full bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5">
              {entry.kind}
            </span>
            {entry.websiteQualityTier && (
              <span className="inline-block rounded-full bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5">
                tier: {entry.websiteQualityTier}
              </span>
            )}
          </div>
        </div>
        {entry.website && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 block w-20 h-14 rounded bg-slate-100 border border-slate-200 overflow-hidden"
            title="Åbn site / klik for screenshot"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl(entry.website)}
              alt={`Screenshot af ${display}`}
              className="w-full h-full object-cover object-top"
              loading="lazy"
            />
          </a>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            const v = e.target.value as SkipReason;
            setSelected(v);
            if (v && v !== "other") onSkip(v);
            else if (v === "other") onSkip("other"); // opens notes field
          }}
          disabled={busy || skipped}
          className="flex-1 rounded-md border border-slate-300 bg-white text-sm py-1.5 px-2"
        >
          <option value="">Skip…</option>
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {busy && <span className="text-xs text-slate-400">…</span>}
      </div>

      {otherOpen && !skipped && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Hvorfor skipper du?"
            className="flex-1 rounded-md border border-slate-300 text-sm py-1.5 px-2"
          />
          <button
            type="button"
            onClick={() => onSkip("other")}
            disabled={busy || !note.trim()}
            className="rounded-md bg-slate-900 disabled:bg-slate-400 text-white text-sm font-medium px-3"
          >
            Skip
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </article>
  );
}

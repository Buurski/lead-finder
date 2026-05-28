"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { SkipReason, PauseSnapshot } from "@/lib/sheets";
import type { Concern, QueueKind, QueueSummary } from "@/lib/queue";

const REFRESH_MS = 30_000;

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
  skipReason?: SkipReason;
}

interface Props {
  entries: ReviewEntry[];
  summary: QueueSummary;
  overflow: { cold: number; followups: number };
  paused: boolean;
  pausedUntil: string | null;
  pauseSnapshot: PauseSnapshot;
}

type Scope = "cold" | "followup" | "manual";

// ---------- skip reason options ----------

const REASON_OPTIONS: Array<{ value: SkipReason; label: string; autoTreatAsAlive?: boolean }> = [
  { value: "cloudflare_false_positive", label: "Cloudflare/WAF false positive — site er fin", autoTreatAsAlive: true },
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
  const full = url.startsWith("http") ? url : `https://${url}`;
  return `https://api.microlink.io/?url=${encodeURIComponent(full)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800`;
}

function fullUrl(url: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `https://${url}`;
}

function scopeLabel(scope: Scope): string {
  return scope === "cold" ? "Cold-mails" : scope === "followup" ? "Follow-ups" : "Manuel";
}

// ---------- component ----------

export default function ReviewQueueClient({
  entries,
  summary,
  overflow,
  paused,
  pausedUntil,
  pauseSnapshot,
}: Props) {
  const [skippedIds, setSkippedIds] = useState<Set<string>>(
    () => new Set(entries.filter((e) => e.skipReason).map((e) => e.id))
  );
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [haltBusy, setHaltBusy] = useState(false);
  const [haltedAt, setHaltedAt] = useState<string | null>(pausedUntil);
  const [currentlyPaused, setCurrentlyPaused] = useState(paused);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeAcknowledged, setResumeAcknowledged] = useState(false);
  const [resumeError, setResumeError] = useState<string>("");
  const [snapshot, setSnapshot] = useState<PauseSnapshot>(pauseSnapshot);
  const [scopeBusy, setScopeBusy] = useState<Record<Scope, boolean>>({ cold: false, followup: false, manual: false });
  const [scopeError, setScopeError] = useState<Record<Scope, string>>({ cold: "", followup: "", manual: "" });
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [approveBusy, setApproveBusy] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [subjectById, setSubjectById] = useState<Record<string, string>>({});
  const [bodyById, setBodyById] = useState<Record<string, string>>({});
  const [approveErrorById, setApproveErrorById] = useState<Record<string, string>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [otherReasonOpen, setOtherReasonOpen] = useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [liveEntries, setLiveEntries] = useState<ReviewEntry[]>(entries);
  const [liveSummary, setLiveSummary] = useState<QueueSummary>(summary);
  const [liveOverflow, setLiveOverflow] = useState<{ cold: number; followups: number }>(overflow);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string>(new Date().toISOString());
  const refreshTick = useRef(0);

  async function refreshFromServer() {
    const tick = ++refreshTick.current;
    setRefreshing(true);
    try {
      const res = await fetch("/api/review/queue", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (tick !== refreshTick.current) return;
      if (Array.isArray(data.entries)) setLiveEntries(data.entries);
      if (data.summary) setLiveSummary(data.summary);
      if (data.overflow) setLiveOverflow(data.overflow);
      if (data.pauseSnapshot) {
        setSnapshot(data.pauseSnapshot);
        setCurrentlyPaused(!!data.pauseSnapshot.master?.paused);
      }
      if (data.fetchedAt) setLastFetchedAt(data.fetchedAt);
    } catch {} finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const id = setInterval(refreshFromServer, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") refreshFromServer(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatAgo(iso: string): string {
    const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 10) return "lige nu";
    if (sec < 60) return `${sec}s siden`;
    const min = Math.round(sec / 60);
    return `${min} min siden`;
  }

  async function handleSkip(entry: ReviewEntry, reason: SkipReason) {
    if (!reason) return;
    if (reason === "other" && !otherReasonOpen[entry.id]) {
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
      const opt = REASON_OPTIONS.find((o) => o.value === reason);
      if (opt?.autoTreatAsAlive && entry.website) {
        await fetch("/api/review/treat-as-alive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: entry.website,
            reason: `auto-added from review skip: ${reason}`,
          }),
        }).catch(() => {});
      }
      setSkippedIds((s) => new Set(s).add(entry.id));
    } catch (err) {
      setErrorById((s) => ({ ...s, [entry.id]: err instanceof Error ? err.message : String(err) }));
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
      setCurrentlyPaused(true);
    } catch (err) {
      alert("Halt fejlede — prøv igen. " + (err instanceof Error ? err.message : ""));
    } finally {
      setHaltBusy(false);
    }
  }

  async function handleApprove(entry: ReviewEntry) {
    setApproveBusy((s) => new Set(s).add(entry.id));
    setApproveErrorById((s) => ({ ...s, [entry.id]: "" }));
    try {
      const subjectOverride = subjectById[entry.id];
      const bodyOverride = bodyById[entry.id];
      const res = await fetch("/api/review/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: entry.id,
          kind: entry.kind,
          ...(subjectOverride ? { subjectOverride } : {}),
          ...(bodyOverride ? { bodyOverride } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `approve failed: ${res.status}`);
      setApprovedIds((s) => new Set(s).add(entry.id));
      setEditingIds((s) => { const n = new Set(s); n.delete(entry.id); return n; });
    } catch (err) {
      setApproveErrorById((s) => ({ ...s, [entry.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setApproveBusy((s) => { const n = new Set(s); n.delete(entry.id); return n; });
    }
  }

  async function handleOpenEditor(entry: ReviewEntry) {
    setEditingIds((s) => new Set(s).add(entry.id));
    if (subjectById[entry.id] === undefined || bodyById[entry.id] === undefined) {
      try {
        const res = await fetch(`/api/leads/${entry.id}/email-preview?type=${entry.kind}`);
        if (res.ok) {
          const data = await res.json();
          setSubjectById((s) => ({ ...s, [entry.id]: s[entry.id] ?? data.subject ?? "" }));
          setBodyById((s) => ({ ...s, [entry.id]: s[entry.id] ?? data.text ?? "" }));
        } else if (res.status === 422) {
          setSubjectById((s) => ({ ...s, [entry.id]: s[entry.id] ?? "" }));
          setBodyById((s) => ({ ...s, [entry.id]: s[entry.id] ?? "" }));
          setApproveErrorById((s) => ({ ...s, [entry.id]: "Ingen matchende template — skriv subject + body manuelt" }));
        }
      } catch {}
    }
  }

  function handleCloseEditor(entryId: string) {
    setEditingIds((s) => { const n = new Set(s); n.delete(entryId); return n; });
  }

  async function handleScopeToggle(scope: Scope) {
    const isPaused = snapshot[scope].paused;
    setScopeBusy((s) => ({ ...s, [scope]: true }));
    setScopeError((s) => ({ ...s, [scope]: "" }));
    try {
      if (isPaused) {
        if (!confirm(`Genoptag ${scopeLabel(scope).toLowerCase()}?`)) { setScopeBusy((s) => ({ ...s, [scope]: false })); return; }
        const res = await fetch("/api/review/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "JEG_VED_HVAD_JEG_GOER", scope }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `resume failed: ${res.status}`);
        if (data.snapshot) setSnapshot(data.snapshot);
      } else {
        const res = await fetch("/api/review/pause", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, hours: 24 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `pause failed: ${res.status}`);
        if (data.snapshot) setSnapshot(data.snapshot);
      }
    } catch (err) {
      setScopeError((s) => ({ ...s, [scope]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setScopeBusy((s) => ({ ...s, [scope]: false }));
    }
  }

  async function handleResume() {
    if (!resumeAcknowledged) return;
    if (!confirm("Sikker? Dette genoptager cold-mails, follow-ups og 10:00-cron med det samme.")) return;
    setResumeBusy(true);
    setResumeError("");
    try {
      const res = await fetch("/api/review/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "JEG_VED_HVAD_JEG_GOER", scope: "all" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `resume failed: ${res.status}`);
      setHaltedAt(null);
      setCurrentlyPaused(false);
      setResumeAcknowledged(false);
      if (data.snapshot) setSnapshot(data.snapshot);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : String(err));
    } finally {
      setResumeBusy(false);
    }
  }

  const visibleEntries = useMemo(
    () => liveEntries.filter((e) => !skippedIds.has(e.id) && !approvedIds.has(e.id)),
    [liveEntries, skippedIds, approvedIds]
  );

  return (
    <main className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Sticky top bar — single thin line. */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h1 className="text-lg font-medium tracking-tight">Review</h1>
              <p className="text-xs text-gray-500 mt-1">
                {visibleEntries.length} / {liveSummary.cap} planlagt · {liveSummary.cold} cold · {liveSummary.followups} follow-up
                <span className="ml-2 text-gray-400">{refreshing ? "opdaterer…" : `opdateret ${formatAgo(lastFetchedAt)}`}</span>
              </p>
            </div>
            <button
              onClick={handleHaltAll}
              disabled={haltBusy || !!haltedAt}
              className="rounded-md border border-red-600 text-red-600 text-sm font-medium px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {haltedAt ? "Pauset" : haltBusy ? "Stopper…" : "Pause alt"}
            </button>
          </div>

          {/* Granular toggles */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(["cold", "followup", "manual"] as Scope[]).map((scope) => {
              const scopePaused = snapshot[scope].paused;
              const masterPaused = snapshot.master.paused;
              const effectivelyPaused = scopePaused || masterPaused;
              const busy = scopeBusy[scope];
              const err = scopeError[scope];
              return (
                <button
                  key={scope}
                  onClick={() => handleScopeToggle(scope)}
                  disabled={busy}
                  title={err || (masterPaused && !scopePaused ? "holdt af master halt" : "")}
                  className={`group flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                    effectivelyPaused
                      ? "border-gray-300 bg-white text-gray-500"
                      : "border-gray-300 bg-white text-gray-900 hover:border-gray-400"
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${effectivelyPaused ? "bg-red-500" : "bg-emerald-500"}`} />
                  <span>{scopeLabel(scope)}</span>
                  {busy && <span className="text-gray-400">…</span>}
                  {masterPaused && !scopePaused && <span className="text-gray-400 text-[10px]">master</span>}
                </button>
              );
            })}
          </div>

          {/* Resume panel — only when master is paused. */}
          {currentlyPaused && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-900 mb-2">
                Master kill aktivt{pausedUntil ? ` indtil ${new Date(pausedUntil).toLocaleString("da-DK")}` : ""}.
              </p>
              <label className="flex items-start gap-2 text-xs text-red-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resumeAcknowledged}
                  onChange={(e) => setResumeAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Jeg forstår at dette starter cold-mails, follow-ups og cron-jobs igen.</span>
              </label>
              <button
                onClick={handleResume}
                disabled={!resumeAcknowledged || resumeBusy}
                className="mt-2 w-full rounded-md bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium px-3 py-1.5"
              >
                {resumeBusy ? "Genoptager…" : "Genoptag alle automatiserede mails"}
              </button>
              {resumeError && <p className="mt-2 text-xs text-red-700">Fejl: {resumeError}</p>}
            </div>
          )}

          {(liveOverflow.cold > 0 || liveOverflow.followups > 0) && (
            <p className="mt-2 text-xs text-gray-500">
              Ikke i dag pga. cap: {liveOverflow.cold} cold + {liveOverflow.followups} follow-ups — ryger med i morgen.
            </p>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {visibleEntries.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-16">Ingen leads tilbage i dagens kø.</p>
        ) : (
          <ul className="space-y-6">
            {visibleEntries.map((entry) => (
              <Card
                key={entry.id}
                entry={entry}
                skipped={skippedIds.has(entry.id)}
                approved={approvedIds.has(entry.id)}
                busy={busyIds.has(entry.id)}
                approveBusy={approveBusy.has(entry.id)}
                editing={editingIds.has(entry.id)}
                subject={subjectById[entry.id]}
                bodyText={bodyById[entry.id]}
                error={errorById[entry.id]}
                approveError={approveErrorById[entry.id]}
                note={notesById[entry.id] ?? ""}
                otherOpen={!!otherReasonOpen[entry.id]}
                onNoteChange={(v) => setNotesById((s) => ({ ...s, [entry.id]: v }))}
                onSubjectChange={(v) => setSubjectById((s) => ({ ...s, [entry.id]: v }))}
                onBodyChange={(v) => setBodyById((s) => ({ ...s, [entry.id]: v }))}
                onSkip={(reason) => handleSkip(entry, reason)}
                onApprove={() => handleApprove(entry)}
                onEdit={() => handleOpenEditor(entry)}
                onCloseEditor={() => handleCloseEditor(entry.id)}
              />
            ))}
          </ul>
        )}

        <footer className="mt-12 text-center text-xs text-gray-400">
          Sender automatisk kl. 10:00 UTC · spacing 4-14 min · sole Gmail caller: send.mjs
        </footer>
      </div>
    </main>
  );
}

// ---------- card ----------

function Card({
  entry,
  skipped,
  approved,
  busy,
  approveBusy,
  editing,
  subject,
  bodyText,
  error,
  approveError,
  note,
  otherOpen,
  onNoteChange,
  onSubjectChange,
  onBodyChange,
  onSkip,
  onApprove,
  onEdit,
  onCloseEditor,
}: {
  entry: ReviewEntry;
  skipped: boolean;
  approved: boolean;
  busy: boolean;
  approveBusy: boolean;
  editing: boolean;
  subject?: string;
  bodyText?: string;
  error?: string;
  approveError?: string;
  note: string;
  otherOpen: boolean;
  onNoteChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSkip: (reason: SkipReason) => void;
  onApprove: () => void;
  onEdit: () => void;
  onCloseEditor: () => void;
}) {
  const [selected, setSelected] = useState<SkipReason>("");
  const link = fullUrl(entry.website);
  const display = rootDomain(entry.website) || "(intet website)";
  const inactive = skipped || approved;
  const concernDot = entry.concern === "chain" ? "bg-red-500" : entry.concern === "broken-website" ? "bg-amber-500" : "bg-emerald-500";
  const concernLabel = entry.concern === "chain" ? "mulig kæde" : entry.concern === "broken-website" ? "broken-claim" : "standard";

  return (
    <li
      className={`rounded-lg border border-gray-200 bg-white p-6 transition-opacity duration-300 ${
        inactive ? "opacity-30" : ""
      }`}
    >
      {/* Header line */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium leading-snug truncate">{entry.name}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {entry.branch} · {entry.city} · score {entry.score}
            {entry.kind === "followup" && ` · follow-up dag ${entry.daysSinceSent}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${concernDot}`} />
          <span>{concernLabel}</span>
        </div>
      </div>

      {/* Microlink screenshot */}
      {entry.website && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block aspect-[16/9] w-full overflow-hidden rounded-md border border-gray-200 bg-gray-50"
          title={`Åbn ${display}`}
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

      <p className="mt-3 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Til:</span> {entry.email}
        {entry.website && (
          <>
            {" · "}
            <a href={link} target="_blank" rel="noreferrer" className="text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500">
              {display}
            </a>
          </>
        )}
      </p>

      {/* Editor */}
      {editing && (
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-gray-700">Subject</label>
          <input
            type="text"
            value={subject ?? ""}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 text-sm py-1.5 px-2 font-mono focus:border-gray-500 focus:outline-none"
          />
          <label className="block text-xs font-medium text-gray-700 mt-2">Body</label>
          <textarea
            value={bodyText ?? ""}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-gray-300 text-sm py-2 px-2 font-serif leading-relaxed focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onCloseEditor}
            className="text-xs text-gray-500 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500"
          >
            Luk editor (overrides bevares)
          </button>
        </div>
      )}

      {/* Actions row */}
      <div className="mt-5 flex items-center justify-end gap-2">
        <select
          value={selected}
          onChange={(e) => {
            const v = e.target.value as SkipReason;
            setSelected(v);
            if (v && v !== "other") onSkip(v);
            else if (v === "other") onSkip("other");
          }}
          disabled={busy || skipped || approved}
          className="rounded-md border border-gray-300 bg-white text-xs py-1.5 px-2 text-gray-700 focus:border-gray-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">Skip…</option>
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onEdit}
          disabled={skipped || approved}
          className="rounded-md border border-gray-300 bg-white text-xs font-medium py-1.5 px-3 text-gray-700 hover:border-gray-400 disabled:opacity-50"
        >
          {editing ? "Editor åben" : "Edit"}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={approveBusy || skipped || approved}
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:hover:bg-gray-300 text-white text-sm font-medium py-1.5 px-4"
        >
          {approved ? "Sendt" : approveBusy ? "Sender…" : "Send nu"}
        </button>
        {busy && <span className="text-xs text-gray-400">…</span>}
      </div>

      {otherOpen && !skipped && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Hvorfor skipper du?"
            className="flex-1 rounded-md border border-gray-300 text-sm py-1.5 px-2 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onSkip("other")}
            disabled={busy || !note.trim()}
            className="rounded-md bg-gray-900 disabled:bg-gray-300 text-white text-sm px-3"
          >
            Skip
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {approveError && <p className="mt-2 text-xs text-red-600">{approveError}</p>}
    </li>
  );
}

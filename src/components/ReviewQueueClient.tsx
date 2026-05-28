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
  // Granular pause state — initial from server, mutated by toggle clicks.
  const [snapshot, setSnapshot] = useState<PauseSnapshot>(pauseSnapshot);
  const [scopeBusy, setScopeBusy] = useState<Record<Scope, boolean>>({ cold: false, followup: false, manual: false });
  const [scopeError, setScopeError] = useState<Record<Scope, string>>({ cold: "", followup: "", manual: "" });
  // Approve / edit state
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [approveBusy, setApproveBusy] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [subjectById, setSubjectById] = useState<Record<string, string>>({});
  const [bodyById, setBodyById] = useState<Record<string, string>>({});
  const [approveErrorById, setApproveErrorById] = useState<Record<string, string>>({});
  // Live-refresh state — server initial state, mutated by polling.
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
      // Out-of-order guard — if a newer fetch started while we were waiting,
      // drop this one's result.
      if (tick !== refreshTick.current) return;
      if (Array.isArray(data.entries)) setLiveEntries(data.entries);
      if (data.summary) setLiveSummary(data.summary);
      if (data.overflow) setLiveOverflow(data.overflow);
      if (data.pauseSnapshot) {
        setSnapshot(data.pauseSnapshot);
        setCurrentlyPaused(!!data.pauseSnapshot.master?.paused);
      }
      if (data.fetchedAt) setLastFetchedAt(data.fetchedAt);
    } catch {
      // Silent — next tick will retry.
    } finally {
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
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [otherReasonOpen, setOtherReasonOpen] = useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const sections = useMemo(() => {
    const chains = liveEntries.filter((e) => e.concern === "chain");
    const broken = liveEntries.filter((e) => e.concern === "broken-website");
    const standard = liveEntries.filter((e) => e.concern === "standard");
    return { chains, broken, standard };
  }, [liveEntries]);

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
      const msg = err instanceof Error ? err.message : String(err);
      setApproveErrorById((s) => ({ ...s, [entry.id]: msg }));
    } finally {
      setApproveBusy((s) => { const n = new Set(s); n.delete(entry.id); return n; });
    }
  }

  async function handleOpenEditor(entry: ReviewEntry) {
    setEditingIds((s) => new Set(s).add(entry.id));
    // Seed the subject + body from the lead's preview if not already edited.
    if (subjectById[entry.id] === undefined || bodyById[entry.id] === undefined) {
      try {
        const res = await fetch(`/api/leads/${entry.id}/email-preview?type=${entry.kind}`);
        if (res.ok) {
          const data = await res.json();
          setSubjectById((s) => ({ ...s, [entry.id]: s[entry.id] ?? data.subject ?? "" }));
          setBodyById((s) => ({ ...s, [entry.id]: s[entry.id] ?? data.text ?? "" }));
        } else if (res.status === 422) {
          // No matching template — Lucas can still write a custom body, no seed.
          setSubjectById((s) => ({ ...s, [entry.id]: s[entry.id] ?? "" }));
          setBodyById((s) => ({ ...s, [entry.id]: s[entry.id] ?? "" }));
          setApproveErrorById((s) => ({ ...s, [entry.id]: "no matching template — skriv subject+body manuelt" }));
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
        // Resume only this scope. Requires the same confirm token as master
        // resume — a missed click on a small toggle is not allowed to silently
        // re-enable sending.
        if (!confirm(`Genoptag ${scope}-mails?`)) { setScopeBusy((s) => ({ ...s, [scope]: false })); return; }
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

  const remainingCount = liveEntries.length - skippedIds.size - approvedIds.size;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* ----- top bar ----- */}
      <header className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">🌅 Morning review</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              {remainingCount} / {liveSummary.cap} planlagt i dag · {liveSummary.cold} cold · {liveSummary.followups} follow-up
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {refreshing ? "opdaterer…" : `opdateret ${formatAgo(lastFetchedAt)}`}
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
        {currentlyPaused && !haltedAt && (
          <p className="mt-2 text-xs text-amber-200">
            Systemet er allerede pauset (indtil {pausedUntil ? new Date(pausedUntil).toLocaleString("da-DK") : "?"}).
          </p>
        )}
        {currentlyPaused && (
          <div className="mt-3 rounded-md border border-red-500/50 bg-red-950/40 p-3">
            <label className="flex items-start gap-2 text-xs text-red-100 cursor-pointer">
              <input
                type="checkbox"
                checked={resumeAcknowledged}
                onChange={(e) => setResumeAcknowledged(e.target.checked)}
                className="mt-0.5 accent-red-500"
              />
              <span>
                Jeg forstår at dette starter cold-mail + follow-ups + cron-jobs igen.
              </span>
            </label>
            <button
              onClick={handleResume}
              disabled={!resumeAcknowledged || resumeBusy}
              className="mt-2 w-full rounded-md bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:opacity-60 text-white text-sm font-semibold px-3 py-2"
            >
              {resumeBusy ? "Genoptager…" : "Genoptag alle automatiserede mails"}
            </button>
            {resumeError && (
              <p className="mt-2 text-xs text-red-300">Fejl: {resumeError}</p>
            )}
          </div>
        )}
        {(liveOverflow.cold > 0 || liveOverflow.followups > 0) && (
          <p className="mt-2 text-xs text-slate-400">
            Ikke i dag pga. cap: {liveOverflow.cold} cold + {liveOverflow.followups} follow-ups (ryger med i morgen).
          </p>
        )}
        {/* Granular toggles — small chips below the master halt button.
            Each chip toggles its scope's pause cell. Master halt overrides
            everything; the chip displays an "(master)" hint in that case. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["cold", "followup", "manual"] as Scope[]).map((scope) => {
            const scopePaused = snapshot[scope].paused;
            const masterPaused = snapshot.master.paused;
            const effectivelyPaused = scopePaused || masterPaused;
            const busy = scopeBusy[scope];
            const err = scopeError[scope];
            const label = scope === "cold" ? "Cold-mails" : scope === "followup" ? "Follow-ups" : "Manuel / test";
            return (
              <button
                key={scope}
                onClick={() => handleScopeToggle(scope)}
                disabled={busy}
                title={err || (masterPaused && !scopePaused ? "(holdt af master halt)" : "")}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  effectivelyPaused
                    ? "border-red-500/60 bg-red-950/40 text-red-100"
                    : "border-emerald-500/60 bg-emerald-950/30 text-emerald-100"
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    effectivelyPaused ? "bg-red-400" : "bg-emerald-400"
                  }`}
                />
                {label} · {effectivelyPaused ? "pauset" : "aktiv"}
                {masterPaused && !scopePaused && <span className="text-[10px] text-amber-300">(master)</span>}
                {busy && <span className="text-[10px] opacity-70">…</span>}
              </button>
            );
          })}
        </div>
      </header>

      {/* ----- summary chips ----- */}
      <div className="px-4 py-3 flex flex-wrap gap-2 text-xs">
        <Chip count={liveSummary.chains} label="kæder" color="bg-red-100 text-red-800" />
        <Chip count={liveSummary.brokenClaim} label="broken-claim" color="bg-amber-100 text-amber-900" />
        <Chip count={liveSummary.standard} label="standard" color="bg-emerald-100 text-emerald-900" />
      </div>

      {/* ----- sections ----- */}
      {liveEntries.length === 0 && (
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

  return (
    <article
      className={`rounded-md bg-white shadow-sm p-3 transition-opacity duration-300 ${
        inactive ? "opacity-40 pointer-events-none" : ""
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

      {editing && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <label className="block text-xs font-medium text-slate-700">Subject</label>
          <input
            type="text"
            value={subject ?? ""}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full rounded-md border border-slate-300 text-sm py-1.5 px-2 font-mono"
          />
          <label className="block text-xs font-medium text-slate-700">Body</label>
          <textarea
            value={bodyText ?? ""}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-slate-300 text-sm py-2 px-2 font-mono"
          />
          <button
            type="button"
            onClick={onCloseEditor}
            className="text-xs text-slate-500 underline"
          >
            Luk editor (overrides bevares)
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            const v = e.target.value as SkipReason;
            setSelected(v);
            if (v && v !== "other") onSkip(v);
            else if (v === "other") onSkip("other"); // opens notes field
          }}
          disabled={busy || skipped || approved}
          className="rounded-md border border-slate-300 bg-white text-sm py-1.5 px-2 flex-1 min-w-0"
        >
          <option value="">Skip…</option>
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onEdit}
          disabled={skipped || approved}
          className="rounded-md border border-slate-300 bg-white text-xs font-medium py-1.5 px-3 text-slate-700 disabled:opacity-50"
        >
          {editing ? "Editor åben" : "Edit"}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={approveBusy || skipped || approved}
          className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white text-sm font-semibold py-1.5 px-3"
        >
          {approved ? "✓ Sendt" : approveBusy ? "Sender…" : "Send nu"}
        </button>
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
      {approveError && <p className="mt-1 text-xs text-red-600">{approveError}</p>}
    </article>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_CATALOG } from "@/lib/demos";
import { previewSignature } from "@/lib/leads/signature-preview";
import WarnBanner from "@/components/WarnBanner";

// Sender-telefoner brugt i /approve-preview. Embedded client-side så bundle
// ikke trækker server-only env-vars; serveren (senders.ts) er source of
// truth ved faktisk afsendelse. Hold disse i sync med LUCAS_SENDER_PHONE /
// CHARLIE_SENDER_PHONE i Vercel-env.
const PREVIEW_LUCAS_PHONE = "+45 23 24 24 82";
const PREVIEW_CHARLIE_PHONE = "+45 42 25 32 62";

// Mirror of QueueDraft (src/lib/queue.ts) — kept local so this client component
// has no server-only imports.
interface Demo {
  label: string;
  url: string;
}
type DraftStatus = "pending" | "approved" | "edited" | "rejected" | "sent";
interface QueueDraft {
  id: string;
  leadId: string;
  name: string;
  branch: string;
  city: string;
  hooks: string[];
  demoPair: Demo[];
  professionalism: string;
  subject: string;
  body: string;
  status: DraftStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  sender?: "lucas" | "charlie";
  sentBy?: "lucas" | "charlie";
}

type Filter = "pending" | "approved" | "decided" | "all";

// Demo catalog grouped by branch family, for the per-draft demo picker.
const CATALOG_GROUPS: [string, { label: string; url: string }[]][] = (() => {
  const m = new Map<string, { label: string; url: string }[]>();
  for (const d of DEMO_CATALOG) {
    if (!m.has(d.branch)) m.set(d.branch, []);
    m.get(d.branch)!.push({ label: d.label, url: d.url });
  }
  return [...m.entries()];
})();

const STATUS_META: Record<DraftStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: "afventer", fg: "var(--amber)", bg: "var(--amber-dim)" },
  approved: { label: "godkendt · klar", fg: "var(--green)", bg: "var(--green-dim)" },
  edited: { label: "redigeret · godkendt", fg: "var(--blue)", bg: "var(--blue-dim)" },
  rejected: { label: "afvist", fg: "var(--red)", bg: "#dc26261a" },
  sent: { label: "sendt (test)", fg: "var(--blue)", bg: "var(--blue-dim)" },
};

export default function ApprovePage() {
  const [drafts, setDrafts] = useState<QueueDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchQueue = useCallback(async (): Promise<QueueDraft[]> => {
    const res = await fetch("/api/approve/queue", { cache: "no-store" });
    if (!res.ok) throw new Error(`køen svarede ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.drafts) ? (data.drafts as QueueDraft[]) : [];
  }, []);

  // Manual refresh (button handler — setState here is fine, not an effect body).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDrafts(await fetchQueue());
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? `Kunne ikke hente køen (${e.message}).` : "Kunne ikke hente køen.");
    } finally {
      setLoading(false);
    }
  }, [fetchQueue]);

  // Initial load — all setState happens after await, so it is not a synchronous
  // setState inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const drafts = await fetchQueue();
        if (!cancelled) {
          setDrafts(drafts);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error && e.message ? `Kunne ikke hente køen (${e.message}).` : "Kunne ikke hente køen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchQueue]);

  const patchLocal = useCallback((d: QueueDraft) => {
    setDrafts((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  }, []);

  const counts = useMemo(() => {
    const pending = drafts.filter((d) => d.status === "pending").length;
    const approvedList = drafts.filter((d) => d.status === "approved");
    const approved = approvedList.length;
    const approvedCharlie = approvedList.filter((d) => (d.sender ?? "lucas") === "charlie").length;
    const approvedLucas = approved - approvedCharlie;
    const decided = drafts.length - pending;
    return { pending, approved, approvedLucas, approvedCharlie, decided, all: drafts.length };
  }, [drafts]);

  // Send the approved drafts. The route streams SSE progress, so the UI shows a
  // live "i/N · sender…" line while it works (a run takes minutes — paced sends).
  const [sendMsg, setSendMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendProg, setSendProg] = useState<{ processed: number; total: number; sent: number; failed: number; line: string } | null>(null);
  const sendApproved = useCallback(async () => {
    if (sendBusy) return;               // hard guard: ignore extra clicks while a run is in flight
    if (counts.approved === 0) return;

    // Preflight (GET på send-ruten): kører alle guards uden at sende, så
    // bekræftelsen viser de RIGTIGE tal (sendes nu / venter / springes over)
    // og blokkere fanges FØR dialogen. Best-effort: fejler preflight, falder
    // vi tilbage til den gamle dialog.
    let confirmText = `Send ${counts.approved} godkendte udkast?`;
    try {
      const pf = await fetch("/api/approve/send").then((r) => r.json());
      if (pf && pf.ok) {
        if (pf.paused) { setSendMsg(`Afsendelse er på pause${pf.until ? ` til ${pf.until}` : ""}.`); return; }
        if (pf.busy) { setSendMsg("Afsendelse kører allerede — vent til den er færdig."); return; }
        if (!pf.senders?.lucas && !pf.senders?.charlie) { setSendMsg("Ingen mail-creds sat — der kan ikke sendes."); return; }
        if (pf.wouldSend === 0) {
          const why = (pf.skipped ?? []).slice(0, 5).map((s: { name: string; reason: string }) => `· ${s.name}: ${s.reason}`).join("\n");
          setSendMsg(`Ingen af de ${pf.approved} godkendte kan sendes.${why ? `\n${why}` : ""}`);
          return;
        }
        const reasonCounts = new Map<string, number>();
        for (const s of (pf.skipped ?? []) as { reason: string }[]) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const skipLine = [...reasonCounts.entries()].map(([r, n]) => `${n}× ${r}`).join(", ");
        confirmText = [
          `Klar til at sende:`,
          `· ${pf.wouldSend} sendes nu`,
          pf.capped > 0 ? `· ${pf.capped} venter til næste klik (max ${pf.cap} pr. klik)` : "",
          (pf.skipped?.length ?? 0) > 0 ? `· ${pf.skipped.length} springes over (${skipLine})` : "",
          !pf.sheetsOk ? `· OBS: Sheets kunne ikke nås — dedup kører kun på kø-historikken` : "",
        ].filter(Boolean).join("\n");
      }
    } catch { /* preflight er best-effort */ }

    if (!window.confirm(`${confirmText}\n\nDette sender RIGTIGE mails til virksomhederne. Det tager et par minutter (mailene sendes med pause imellem, så de ser naturlige ud) — luk ikke siden imens.\n\nTryk kun én gang: systemet sender hver mail præcis én gang, uanset hvor mange gange du trykker.`)) return;
    setSendBusy(true);
    setSendProg(null);
    setSendMsg("Sender… det kan tage et par minutter. Luk ikke siden.");
    try {
      const res = await fetch("/api/approve/send", { method: "POST" });
      const ct = res.headers.get("content-type") || "";

      // Pre-flight guards (pause / busy / no-creds / nothing-to-send) return JSON.
      if (ct.includes("application/json") || !res.body) {
        const d = await res.json().catch(() => ({}));
        const msg = d.paused
          ? (d.error ?? "Afsendelse er på pause.")
          : d.busy
            ? (d.error ?? "Afsendelse kører allerede — vent til den er færdig.")
            : res.ok
              ? `${d.sent ?? 0} sendt${d.note ? ` — ${d.note}` : ""}.`
              : (d.error ?? "Kunne ikke sende.");
        setSendMsg(msg);
        await load();
        return;
      }

      // SSE stream — parse "data: {...}" frames and update the progress line live.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sent = 0, failed = 0, processed = 0, total = 0;
      const skippedNames: { name: string; reason: string }[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          const t = ev.type as string;
          if (t === "start") {
            total = Number(ev.total) || 0;
            setSendProg({ processed: 0, total, sent: 0, failed: 0, line: `0/${total} · starter…` });
          } else if (t === "sending") {
            processed = Number(ev.index) || processed;
            setSendProg({ processed, total, sent, failed, line: `${processed}/${total} · sender til ${ev.name}…` });
          } else if (t === "sent") {
            processed = Number(ev.index) || processed; sent = Number(ev.n) || sent + 1;
            setSendProg({ processed, total, sent, failed, line: `${processed}/${total} · ${ev.name} sendt ✓` });
          } else if (t === "failed") {
            processed = Number(ev.index) || processed; failed++;
            setSendProg({ processed, total, sent, failed, line: `${processed}/${total} · ${ev.name} fejlede ✗` });
          } else if (t === "skipped" || t === "capped") {
            processed = Number(ev.index) || processed;
            if (t === "skipped") skippedNames.push({ name: String(ev.name), reason: String(ev.reason ?? "") });
            const tail = t === "capped" ? "venter (næste hold)" : `sprunget over (${ev.reason})`;
            setSendProg({ processed, total, sent, failed, line: `${processed}/${total} · ${ev.name} ${tail}` });
          } else if (t === "done") {
            const dSent = Number(ev.sent) || sent;
            const dFailed = Number(ev.failed) || failed;
            const dRemaining = Number(ev.remaining) || 0;
            const sk = Array.isArray(ev.skipped) ? (ev.skipped as { name: string; reason: string }[]) : skippedNames;
            const msg = `${dSent} sendt${dFailed ? ` · ${dFailed} fejlede` : ""}${dRemaining ? ` · ${dRemaining} venter — tryk Send igen for næste hold` : ""}${sk.length ? ` · ${sk.length} sprunget over (${sk.slice(0, 3).map((s) => `${s.name}: ${s.reason}`).join("; ")}${sk.length > 3 ? "…" : ""})` : ""}.`;
            setSendMsg(msg);
            setSendProg({ processed: total, total, sent: dSent, failed: dFailed, line: `${total}/${total} · færdig` });
          }
        }
      }
      await load();
    } catch {
      setSendMsg("Netværksfejl ved afsendelse.");
    } finally {
      setSendBusy(false);
    }
  }, [sendBusy, counts.approved, load]);

  const visible = useMemo(() => {
    if (filter === "pending") return drafts.filter((d) => d.status === "pending");
    if (filter === "approved") return drafts.filter((d) => d.status === "approved" || d.status === "edited");
    if (filter === "decided") return drafts.filter((d) => d.status !== "pending");
    return drafts;
  }, [drafts, filter]);

  // ---- shared action (used by buttons AND keyboard triage) ----------------
  const actOn = useCallback(
    async (id: string, action: "approve" | "edit" | "reject" | "unapprove" | "set-demos" | "set-sender", payload?: { subject?: string; body?: string; demoPair?: Demo[]; sender?: "lucas" | "charlie" }): Promise<{ ok: boolean; violations?: string[] }> => {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify((action === "edit" || action === "set-demos" || action === "set-sender") && payload ? { id, action, ...payload } : { id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, violations: Array.isArray(data.violations) ? data.violations : [data.error ?? "Ukendt fejl"] };
      }
      patchLocal(data.draft as QueueDraft);
      return { ok: true };
    },
    [patchLocal]
  );

  // ---- keyboard triage: j/k move, a approve, r skip, e edit ---------------
  const [focusIdx, setFocusIdx] = useState(0);
  // (No clamp effect: the keyboard handler clamps on the next move, and an
  // out-of-range index simply highlights nothing until then.)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (document.querySelector(".cc-palette")) return;
      const cur = visible[focusIdx];
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, visible.length - 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
      else if (cur && cur.status === "pending" && k === "a") { e.preventDefault(); actOn(cur.id, "approve"); }
      else if (cur && cur.status === "pending" && k === "r") { e.preventDefault(); actOn(cur.id, "reject"); }
      else if (cur && cur.status === "pending" && k === "e") {
        e.preventDefault();
        document.getElementById(`draft-body-${cur.id}`)?.focus();
      }
      else if (cur && cur.status === "pending" && (e.key === " " || k === "x")) {
        // space/x: vaelg/fravaelg fokuseret udkast til batch-godkend
        e.preventDefault();
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(cur.id)) next.delete(cur.id);
          else next.add(cur.id);
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, focusIdx, actOn]);

  // ---- bulk-approve all currently-pending "safe" drafts -------------------
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkApprove = useCallback(async () => {
    const pendings = drafts.filter((d) => d.status === "pending");
    if (pendings.length === 0) return;
    if (!window.confirm(`Godkend ${pendings.length} afventende udkast? De markeres til afsendelse — intet sendes.`)) return;
    setBulkBusy(true);
    let failed = 0;
    for (const d of pendings) {
      // sequential keeps the queue file writes ordered + avoids a write race
      const r = await actOn(d.id, "approve");
      if (!r.ok) failed++;
    }
    setBulkBusy(false);
    if (failed > 0) window.alert(`${failed} af ${pendings.length} udkast kunne ikke godkendes — de står stadig som afventende.`);
  }, [drafts, actOn]);

  // ---- approve a hand-picked subset (checkboxes on pending cards) ----------
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Only ids that are still pending count — a draft decided via its own
  // buttons (or keyboard) simply falls out of the selection.
  const selectedPending = useMemo(
    () => drafts.filter((d) => d.status === "pending" && selected.has(d.id)),
    [drafts, selected]
  );

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(visible.filter((d) => d.status === "pending").map((d) => d.id)));
  }, [visible]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const [selBusy, setSelBusy] = useState(false);
  const approveSelected = useCallback(async () => {
    const targets = selectedPending;
    if (targets.length === 0) return;
    if (!window.confirm(`Godkend ${targets.length} valgte udkast? De markeres til afsendelse. Intet sendes.`)) return;
    setSelBusy(true);
    let failed = 0;
    for (const d of targets) {
      // sequential keeps the queue file writes ordered + avoids a write race
      const r = await actOn(d.id, "approve");
      if (!r.ok) failed++;
    }
    setSelBusy(false);
    setSelected(new Set());
    if (failed > 0) window.alert(`${failed} af ${targets.length} valgte udkast kunne ikke godkendes. De står stadig som afventende.`);
  }, [selectedPending, actOn]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <Header
        counts={counts}
        filter={filter}
        setFilter={setFilter}
        onRefresh={load}
        loading={loading}
        onBulkApprove={bulkApprove}
        bulkBusy={bulkBusy}
        selectedCount={selectedPending.length}
        selBusy={selBusy}
        onApproveSelected={approveSelected}
        onSelectAll={selectAllVisible}
        onClearSelection={clearSelection}
      />

      {/* Send step — the missing piece. Approved = ready; this actually sends. */}
      {counts.approved > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 18px", borderRadius: 12, background: "var(--green-dim)", border: "1px solid var(--green)" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{counts.approved} godkendt og klar til afsendelse{counts.approvedCharlie > 0 ? ` · Lucas ${counts.approvedLucas} · Charlie ${counts.approvedCharlie}` : ""}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
              Godkendt = markeret. Tryk Send for at sende <strong>rigtige mails</strong> til virksomhederne. Pause/halt-flag + kontaktet-tjek blokerer automatisk.
              {sendMsg && !sendProg && <> · <span style={{ color: "var(--text)" }}>{sendMsg}</span></>}
            </div>
            {sendProg && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 7, borderRadius: 99, background: "var(--bg-2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${sendProg.total ? Math.round((sendProg.processed / sendProg.total) * 100) : 0}%`, background: "var(--green)", transition: "width .3s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>{sendProg.line}</span>
                  <span>· {sendProg.sent} sendt{sendProg.failed ? ` · ${sendProg.failed} fejlede` : ""}</span>
                </div>
              </div>
            )}
          </div>
          <button onClick={sendApproved} disabled={sendBusy} style={{ ...btnBase, background: sendBusy ? "var(--green-dim)" : "var(--green)", color: sendBusy ? "var(--green)" : "white" }}>
            {sendBusy ? "Sender…" : `Send godkendte (${counts.approved})`}
          </button>
        </div>
      )}

      {/* Lingering send confirmation (the approved banner disappears once count hits 0). */}
      {sendMsg && counts.approved === 0 && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)" }}>
          ✓ {sendMsg}
        </div>
      )}

      {loading && drafts.length === 0 ? (
        // Skeleton only on the first load — a manual refresh keeps the list
        // visible instead of flashing back to shimmer.
        <div style={{ display: "grid", gap: 18 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="cc-skel" style={{ height: 180, borderRadius: 14 }} />
          ))}
        </div>
      ) : error ? (
        // A failed fetch must not masquerade as an empty queue — show the error
        // with a retry instead of "Køen er tom".
        <WarnBanner
          role="alert"
          action={
            <button onClick={load} disabled={loading} style={{ ...btnBase, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", opacity: loading ? 0.6 : 1 }}>
              {loading ? "Henter…" : "Prøv igen"}
            </button>
          }
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{error}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>
            Køen er der stadig — der er bare ikke hul igennem lige nu. Intet blev ændret.
          </div>
        </WarnBanner>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} total={drafts.length} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {visible.map((d, i) => (
            <DraftLetter
              key={d.id}
              draft={d}
              onAct={actOn}
              focused={i === focusIdx}
              onFocusRequest={() => setFocusIdx(i)}
              selected={selected.has(d.id)}
              onToggleSelect={() => toggleSelect(d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({
  counts,
  filter,
  setFilter,
  onRefresh,
  loading,
  onBulkApprove,
  bulkBusy,
  selectedCount,
  selBusy,
  onApproveSelected,
  onSelectAll,
  onClearSelection,
}: {
  counts: { pending: number; approved: number; decided: number; all: number };
  filter: Filter;
  setFilter: (f: Filter) => void;
  onRefresh: () => void;
  loading: boolean;
  onBulkApprove: () => void;
  bulkBusy: boolean;
  selectedCount: number;
  selBusy: boolean;
  onApproveSelected: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "pending", label: "Afventer", n: counts.pending },
    { key: "approved", label: "Godkendt", n: counts.approved },
    { key: "decided", label: "Besluttet", n: counts.decided },
    { key: "all", label: "Alle", n: counts.all },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: 27,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            margin: 0,
          }}
        >
          Til godkendelse
        </h1>
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", maxWidth: "62ch" }}>
          Personlige udkast fra motoren. Læs hver som et brev, ret hvis nødvendigt, godkend de gode.
          Intet sendes herfra: godkend markerer kun til afsendelse.
        </p>
        <p style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          Tastatur:
          <span><span className="cc-kbd">j</span>/<span className="cc-kbd">k</span> flyt</span>
          <span><span className="cc-kbd">a</span> godkend</span>
          <span><span className="cc-kbd">r</span> skip</span>
          <span><span className="cc-kbd">e</span> redigér</span>
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", maxWidth: "100%" }}>
        {counts.pending > 0 && (
          <button
            onClick={onSelectAll}
            title="Sæt kryds ved alle afventende udkast i listen"
            style={{ ...btnGhost, padding: "7px 9px", fontSize: 12 }}
          >
            Vælg alle
          </button>
        )}
        {selectedCount > 0 && (
          <button
            onClick={onClearSelection}
            title="Fjern alle kryds"
            style={{ ...btnGhost, padding: "7px 9px", fontSize: 12 }}
          >
            Ryd valg
          </button>
        )}
        {selectedCount > 0 && (
          <button
            onClick={onApproveSelected}
            disabled={selBusy}
            title="Godkend kun de udkast du har sat kryds ved"
            style={{ ...btnBase, background: selBusy ? "var(--green-dim)" : "var(--green)", color: selBusy ? "var(--green)" : "white", padding: "7px 13px", fontSize: 12.5 }}
          >
            {selBusy ? "Godkender…" : `Godkend valgte (${selectedCount})`}
          </button>
        )}
        {counts.pending > 0 && (
          <button
            onClick={onBulkApprove}
            disabled={bulkBusy}
            title="Godkend alle afventende udkast"
            style={{ ...btnBase, background: bulkBusy ? "var(--green-dim)" : "var(--green)", color: bulkBusy ? "var(--green)" : "white", padding: "7px 13px", fontSize: 12.5 }}
          >
            {bulkBusy ? "Godkender…" : `Godkend alle (${counts.pending})`}
          </button>
        )}
        <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 9, padding: 3, maxWidth: "100%", overflowX: "auto" }}>
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  color: active ? "var(--text)" : "var(--text-muted)",
                  background: active ? "var(--surface)" : "transparent",
                  boxShadow: active ? "0 1px 2px oklch(0% 0 0 / 0.08)" : "none",
                  transition: "color 120ms ease",
                }}
              >
                {t.label}
                <span style={{ marginLeft: 6, color: "var(--text-dim)", fontWeight: 500 }}>{t.n}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Genindlæs køen"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-muted)",
            cursor: loading ? "default" : "pointer",
            padding: "7px 11px",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: "inherit",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "…" : "Opdatér"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ filter, total }: { filter: Filter; total: number }) {
  const emptyBecauseFilter = total > 0;
  return (
    <div
      style={{
        border: "1px dashed var(--border-light)",
        borderRadius: 14,
        padding: "44px 32px",
        textAlign: "center",
        background: "var(--bg-2)",
      }}
    >
      <p style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 18, color: "var(--text)", margin: 0 }}>
        {emptyBecauseFilter ? "Intet her endnu" : "Køen er tom"}
      </p>
      <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--text-muted)" }}>
        {emptyBecauseFilter
          ? filter === "pending"
            ? "Alle udkast er besluttet. Godt arbejde."
            : "Ingen besluttede udkast endnu."
          : "Kør motoren for at fylde den med dagens personlige udkast:"}
      </p>
      {!emptyBecauseFilter && (
        <code
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "7px 12px",
            borderRadius: 8,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          node .send_queue/daily_engine.mjs --limit=12
        </code>
      )}
    </div>
  );
}

function DraftLetter({
  draft,
  onAct,
  focused,
  onFocusRequest,
  selected,
  onToggleSelect,
}: {
  draft: QueueDraft;
  onAct: (id: string, action: "approve" | "edit" | "reject" | "unapprove" | "set-demos" | "set-sender", payload?: { subject?: string; body?: string; demoPair?: Demo[]; sender?: "lucas" | "charlie" }) => Promise<{ ok: boolean; violations?: string[] }>;
  focused: boolean;
  onFocusRequest: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [demos, setDemos] = useState<Demo[]>(draft.demoPair);
  const [sender, setSender] = useState<"lucas" | "charlie">(draft.sender ?? "lucas");

  // Per-lead afsender-valg. Persists immediately; the send route routes the mail
  // to the matching Gmail account + re-signs the body at send time.
  //
  // 2026-06-26: re-sign body CLIENT-SIDE too, så det body-felt brugeren ser i
  // /godkendelse matcher den nye afsender. Før denne fix blev signaturen i
  // bunden ikke opdateret når man skiftede afsender (kun top-preview'et
  // "SLUTNING AF MAILEN" opdaterede sig), hvilket var forvirrende. Body
  // gemmes først i databasen ved Godkend/Redigér — her opdaterer vi kun den
  // lokale state så det visuelle er konsistent.
  async function chooseSender(next: "lucas" | "charlie") {
    if (next === sender) return;
    const resignBody = previewSignature(body, next, PREVIEW_LUCAS_PHONE, PREVIEW_CHARLIE_PHONE);
    setBody(resignBody);
    setSender(next);
    await onAct(draft.id, "set-sender", { sender: next });
  }
  const [busy, setBusy] = useState<null | "approve" | "edit" | "reject" | "unapprove" | "set-demos">(null);
  const [violations, setViolations] = useState<string[]>([]);

  // Lucas can remove a draft from the "godkendt" list (e.g. "No Scandinavia"
  // that he approved earlier and then regretted). This is the un-approve flow.
  // "Sent" drafts are NOT removable from here — we can't un-send a mail.
  const isRemovable =
    draft.status === "approved" || draft.status === "edited";

  async function unapprove() {
    if (
      !window.confirm(
        `Fjern "${draft.name}" fra godkendt-listen?\n\nDen flyttes til afviste, og lead'en bliver markeret 'skip' i Sheets så motoren ikke vælger den igen. Den blokeres også i 14 dage på queue-niveau som ekstra sikkerhed.`,
      )
    ) return;
    setBusy("unapprove");
    setViolations([]);
    try {
      const r = await onAct(draft.id, "unapprove");
      if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
    } catch {
      setViolations(["Netværksfejl. Prøv igen."]);
    } finally {
      setBusy(null);
    }
  }

  const dirty = subject !== draft.subject || body !== draft.body;
  const demosDirty = JSON.stringify(demos.map((d) => d.url)) !== JSON.stringify(draft.demoPair.map((d) => d.url));

  // Swap one demo slot: pick from the catalog, and rewrite that URL inside the body
  // so the letter stays in sync. Lucas saves with "Gem demoer".
  function changeDemo(i: number, url: string) {
    const entry = DEMO_CATALOG.find((d) => d.url === url);
    if (!entry) return;
    const old = demos[i];
    setDemos((prev) => prev.map((d, j) => (j === i ? { label: entry.label, url: entry.url } : d)));
    if (old?.url && old.url !== entry.url) setBody((b) => b.split(old.url).join(entry.url));
  }

  async function saveDemos() {
    setBusy("set-demos");
    setViolations([]);
    try {
      const r = await onAct(draft.id, "set-demos", { demoPair: demos, body });
      if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
    } catch {
      setViolations(["Netværksfejl. Prøv igen."]);
    } finally {
      setBusy(null);
    }
  }
  const decided = draft.status !== "pending";
  const meta = STATUS_META[draft.status];

  const act = useCallback(
    async (action: "approve" | "edit" | "reject") => {
      setBusy(action);
      setViolations([]);
      try {
        const r = await onAct(draft.id, action, action === "edit" ? { subject, body } : undefined);
        if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
      } catch {
        setViolations(["Netværksfejl. Prøv igen."]);
      } finally {
        setBusy(null);
      }
    },
    [draft.id, subject, body, onAct]
  );

  return (
    <article
      onMouseEnter={onFocusRequest}
      style={{
        background: "var(--surface)",
        border: focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: focused ? "0 0 0 3px var(--accent-soft)" : "none",
        borderRadius: 14,
        padding: "22px 24px",
        opacity: draft.status === "rejected" ? 0.55 : 1,
        transition: "opacity 200ms ease, box-shadow 140ms ease, border-color 140ms ease",
      }}
    >
      {/* identity row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        {draft.status === "pending" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Vælg ${draft.name}`}
            title="Vælg til 'Godkend valgte'"
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, cursor: "pointer", accentColor: "var(--green)" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: 19,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            {draft.name}
          </h2>
          <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-muted)" }}>
            {[draft.branch, draft.city].filter(Boolean).join(" · ")}
            {draft.professionalism ? (
              <span style={{ color: "var(--text-dim)" }}> — {draft.professionalism}</span>
            ) : null}
          </p>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            fontWeight: 600,
            color: meta.fg,
            background: meta.bg,
            padding: "4px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* afsender — hvem mailen sendes fra (Lucas/Charlie). Read-only når sendt. */}
      {draft.status === "sent" ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
          Sendt som <strong style={{ color: "var(--text)" }}>{(draft.sentBy ?? draft.sender ?? "lucas") === "charlie" ? "Charlie" : "Lucas"}</strong>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Afsender</span>
          <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 8, padding: 3 }}>
            {(["lucas", "charlie"] as const).map((s) => {
              const active = sender === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseSender(s)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "5px 13px",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    background: active ? "var(--surface)" : "transparent",
                    boxShadow: active ? "0 1px 2px oklch(0% 0 0 / 0.08)" : "none",
                  }}
                >
                  {s === "lucas" ? "Lucas" : "Charlie"}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            Konto + underskrift sættes automatisk ved afsendelse.
          </span>
        </div>
      )}

      {/* sign-off preview — what the email's last lines will look like with the
          chosen sender. Updates live when Lucas/Charlie is toggled, so the
          preview always matches what the send route will emit. (2026-06-22) */}
      <div
        style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: "var(--text-dim)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 4,
          }}
        >
          Slutning af mailen — sendes som {sender === "lucas" ? "Lucas" : "Charlie"}
        </div>
        <pre
          style={{
            margin: 0,
            fontFamily: "inherit",
            whiteSpace: "pre-wrap",
            color: "var(--text)",
            lineHeight: 1.5,
          }}
        >
          {previewSignature(body, sender, PREVIEW_LUCAS_PHONE, PREVIEW_CHARLIE_PHONE)
            .split("\n")
            .slice(-3)
            .join("\n")}
        </pre>
      </div>

      {/* hooks */}
      {draft.hooks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          {draft.hooks.map((h, i) => (
            <span
              key={i}
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                padding: "3px 9px",
                borderRadius: 7,
                maxWidth: "46ch",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={h}
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* the letter */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Emne">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={decided}
            style={inputStyle(decided)}
          />
        </Field>
        <Field label="Besked">
          <textarea
            id={`draft-body-${draft.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={decided}
            rows={Math.min(16, Math.max(7, body.split("\n").length + 1))}
            style={{
              ...inputStyle(decided),
              resize: "vertical",
              lineHeight: 1.6,
              fontSize: 13.5,
              maxWidth: "70ch",
            }}
          />
        </Field>
      </div>

      {/* demos — read-only once decided, editable picker while pending */}
      {decided ? (
        draft.demoPair.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            {draft.demoPair.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12.5, color: "var(--text)", background: "var(--bg-2)", border: "1px solid var(--border)", padding: "7px 12px", borderRadius: 9, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{d.label}</span>
                <span style={{ color: "var(--green)", fontWeight: 600 }}>{prettyUrl(d.url)} ↗</span>
              </a>
            ))}
          </div>
        )
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Demoer i mailen — vælg de to du vil sende
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {demos.map((d, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 190 }}>
                <select value={d.url} onChange={(e) => changeDemo(i, e.target.value)} style={{ ...inputStyle(false), padding: "8px 9px", cursor: "pointer" }}>
                  {CATALOG_GROUPS.map(([branch, items]) => (
                    <optgroup key={branch} label={branch}>
                      {items.map((it) => <option key={it.url} value={it.url}>{it.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 600, textDecoration: "none" }}>{prettyUrl(d.url)} ↗</a>
              </div>
            ))}
          </div>
          {demosDirty && (
            <button onClick={saveDemos} disabled={busy !== null} style={{ ...btnSecondary, marginTop: 12, padding: "8px 14px", fontSize: 12.5 }}>
              {busy === "set-demos" ? "Gemmer…" : "Gem demoer"}
            </button>
          )}
        </div>
      )}

      {/* violations */}
      {violations.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 9,
            background: "var(--amber-dim)",
            border: "1px solid var(--amber)",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          <strong style={{ color: "var(--amber)" }}>Bryder stemme-guiden:</strong>{" "}
          {violations.join(" · ")}
        </div>
      )}

      {/* actions */}
      {!decided && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button onClick={() => act("approve")} disabled={busy !== null || dirty} style={btnPrimary(busy === "approve" || dirty)}>
            {busy === "approve" ? "Godkender…" : "Godkend"}
          </button>
          {dirty && (
            <button onClick={() => act("edit")} disabled={busy !== null} style={btnSecondary}>
              {busy === "edit" ? "Gemmer…" : "Gem rettelse + godkend"}
            </button>
          )}
          <button onClick={() => act("reject")} disabled={busy !== null} style={btnGhost}>
            {busy === "reject" ? "Afviser…" : "Afvis"}
          </button>
          {dirty && (
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              {demosDirty ? "Demo skiftet — tryk “Gem demoer”" : "Rettet — gem for at godkende"}
            </span>
          )}
        </div>
      )}

      {/* unapprove — only for already-approved/edited drafts (not pending, not sent, not rejected) */}
      {isRemovable && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <button onClick={unapprove} disabled={busy !== null} style={btnGhost} title="Fjern fra godkendt-listen — lead'en blokeres i 14 dage">
            {busy === "unapprove" ? "Fjerner…" : "Fjern fra godkendt"}
          </button>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            Markeres som afvist + lead&apos;en blokeres i 14 dage så motoren ikke re-vælger.
          </span>
        </div>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: "9px 11px",
    fontFamily: "inherit",
    fontSize: 13.5,
    color: "var(--text)",
    background: disabled ? "var(--bg-2)" : "var(--bg-2)",
    outline: "none",
    opacity: disabled ? 0.85 : 1,
  };
}

const btnBase: React.CSSProperties = {
  border: "none",
  borderRadius: 9,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: disabled ? "var(--green-dim)" : "var(--green)",
    color: disabled ? "var(--green)" : "white",
    cursor: disabled ? "default" : "pointer",
  };
}

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "var(--blue)",
  color: "white",
};

const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  color: "var(--text-muted)",
  padding: "9px 12px",
};

function prettyUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

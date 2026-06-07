"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_CATALOG } from "@/lib/demos";

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

  const fetchQueue = useCallback(async (): Promise<QueueDraft[]> => {
    const res = await fetch("/api/approve/queue", { cache: "no-store" });
    const data = await res.json();
    return Array.isArray(data.drafts) ? (data.drafts as QueueDraft[]) : [];
  }, []);

  // Manual refresh (button handler — setState here is fine, not an effect body).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDrafts(await fetchQueue());
      setError(null);
    } catch {
      setError("Kunne ikke hente køen.");
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
      } catch {
        if (!cancelled) setError("Kunne ikke hente køen.");
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
    const approved = drafts.filter((d) => d.status === "approved").length;
    const decided = drafts.length - pending;
    return { pending, approved, decided, all: drafts.length };
  }, [drafts]);

  // Send the approved drafts (TEST-mode → buur.aigro; nothing reaches a lead).
  const [sendMsg, setSendMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const sendApproved = useCallback(async () => {
    if (counts.approved === 0) return;
    if (!window.confirm(`Send ${counts.approved} godkendte udkast?\n\nDette sender RIGTIGE mails til virksomhederne. (Blokeres automatisk hvis pause/halt-flag er aktiv.)`)) return;
    setSendBusy(true);
    setSendMsg("");
    try {
      const res = await fetch("/api/approve/send", { method: "POST" });
      const d = await res.json();
      const msg = d.paused
        ? (d.error ?? "Afsendelse er på pause.")
        : res.ok
          ? `${d.sent ?? 0} sendt${d.failed ? ` · ${d.failed} fejlede` : ""}${Array.isArray(d.skipped) && d.skipped.length ? ` · ${d.skipped.length} sprunget over (${d.skipped.slice(0, 3).map((s: { name: string; reason: string }) => `${s.name}: ${s.reason}`).join("; ")}${d.skipped.length > 3 ? "…" : ""})` : ""}.`
          : (d.error ?? "Kunne ikke sende.");
      setSendMsg(msg);
      await load();
    } catch {
      setSendMsg("Netværksfejl ved afsendelse.");
    } finally {
      setSendBusy(false);
    }
  }, [counts.approved, load]);

  const visible = useMemo(() => {
    if (filter === "pending") return drafts.filter((d) => d.status === "pending");
    if (filter === "approved") return drafts.filter((d) => d.status === "approved");
    if (filter === "decided") return drafts.filter((d) => d.status !== "pending");
    return drafts;
  }, [drafts, filter]);

  // ---- shared action (used by buttons AND keyboard triage) ----------------
  const actOn = useCallback(
    async (id: string, action: "approve" | "edit" | "reject" | "set-demos", payload?: { subject?: string; body?: string; demoPair?: Demo[] }): Promise<{ ok: boolean; violations?: string[] }> => {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify((action === "edit" || action === "set-demos") && payload ? { id, action, ...payload } : { id, action }),
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
    for (const d of pendings) {
      // sequential keeps the queue file writes ordered + avoids a write race
      await actOn(d.id, "approve");
    }
    setBulkBusy(false);
  }, [drafts, actOn]);

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
      />

      {/* Send step — the missing piece. Approved = ready; this actually sends. */}
      {counts.approved > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 18px", borderRadius: 12, background: "var(--green-dim)", border: "1px solid var(--green)" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{counts.approved} godkendt og klar til afsendelse</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
              Godkendt = markeret. Tryk Send for at sende <strong>rigtige mails</strong> til virksomhederne. Pause/halt-flag + kontaktet-tjek blokerer automatisk.
              {sendMsg && <> · <span style={{ color: "var(--text)" }}>{sendMsg}</span></>}
            </div>
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

      {error && (
        <p style={{ color: "var(--red)", fontSize: 14 }}>{error}</p>
      )}

      {!loading && visible.length === 0 ? (
        <EmptyState filter={filter} total={drafts.length} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {visible.map((d, i) => (
            <DraftLetter key={d.id} draft={d} onAct={actOn} focused={i === focusIdx} onFocusRequest={() => setFocusIdx(i)} />
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
}: {
  counts: { pending: number; approved: number; decided: number; all: number };
  filter: Filter;
  setFilter: (f: Filter) => void;
  onRefresh: () => void;
  loading: boolean;
  onBulkApprove: () => void;
  bulkBusy: boolean;
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

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
        <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 9, padding: 3 }}>
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
}: {
  draft: QueueDraft;
  onAct: (id: string, action: "approve" | "edit" | "reject" | "set-demos", payload?: { subject?: string; body?: string; demoPair?: Demo[] }) => Promise<{ ok: boolean; violations?: string[] }>;
  focused: boolean;
  onFocusRequest: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [demos, setDemos] = useState<Demo[]>(draft.demoPair);
  const [busy, setBusy] = useState<null | "approve" | "edit" | "reject" | "set-demos">(null);
  const [violations, setViolations] = useState<string[]>([]);

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
        <div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <button onClick={() => act("approve")} disabled={busy !== null || dirty} style={btnPrimary(busy === "approve" || dirty)}>
            {busy === "approve" ? "Godkender…" : "Godkend"}
          </button>
          {dirty && !demosDirty && (
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

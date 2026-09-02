"use client";

// /send — mobil sendeflade. Ét kort ad gangen, tre synlige. Godkender og
// sender via de eksisterende ruter (/api/approve/queue + /api/approve/send?ids=).
// Ingen egen mail-logik. Rodlayoutets AppShell wrapper siden.

import { useCallback, useEffect, useState } from "react";

// Mirror af QueueDraft (src/lib/queue.ts) — kun felterne fladen bruger, så
// client-bundlen ikke trækker server-only imports med.
type DraftStatus = "pending" | "approved" | "edited" | "rejected" | "sent";
interface Draft {
  id: string;
  name: string;
  branch: string;
  city: string;
  subject: string;
  body: string;
  recipientEmail?: string;
  status: DraftStatus;
  createdAt: string;
}

const VISIBLE = 3;

// Godkendte først (de er klar), så afventende. Ældste createdAt først i hver gruppe.
const rank = (s: DraftStatus) => (s === "pending" ? 1 : 0);
function sortQueue(list: Draft[]): Draft[] {
  return [...list].sort(
    (a, b) => rank(a.status) - rank(b.status) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

// Fejltekst fra API'et vises ordret. Kun når svaret intet siger, falder vi
// tilbage på en kort dansk linje.
async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: d.error || `Svarede ${res.status}.` };
  return { ok: true };
}

export default function SendPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/approve/queue", { cache: "no-store" });
        if (!res.ok) throw new Error(`køen svarede ${res.status}`);
        const data = (await res.json()) as { drafts?: Draft[] };
        const open = (data.drafts ?? []).filter(
          (d) => d.status === "pending" || d.status === "approved" || d.status === "edited",
        );
        if (!cancelled) {
          setDrafts(sortQueue(open));
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error && e.message ? e.message : "Kunne ikke hente køen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const note = useCallback((id: string, msg: string) => setNotes((p) => ({ ...p, [id]: msg })), []);
  const drop = useCallback((id: string) => setDrafts((p) => p.filter((d) => d.id !== id)), []);

  // Godkend + send præcis dette kort. ids= begrænser afsendelsen til draften.
  const send = useCallback(
    async (d: Draft) => {
      if (busyId) return;
      setBusyId(d.id);
      setFlash(null);
      setNotes((p) => ({ ...p, [d.id]: "" }));
      try {
        const approved = await postJson("/api/approve/queue", { id: d.id, action: "approve" });
        if (!approved.ok) {
          note(d.id, approved.error ?? "Kunne ikke godkende.");
          return;
        }

        const res = await fetch(`/api/approve/send?ids=${encodeURIComponent(d.id)}`, { method: "POST" });
        const ct = res.headers.get("content-type") || "";

        // Preflight-guards (pause / lås / ingen creds / intet at sende) svarer JSON.
        if (ct.includes("application/json") || !res.body) {
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            sent?: number;
            note?: string;
          };
          if (j.ok === false || !res.ok) {
            note(d.id, j.error ?? "Kunne ikke sende.");
          } else if ((j.sent ?? 0) > 0) {
            drop(d.id);
            setFlash(`Sendt til ${d.recipientEmail}`);
          } else {
            note(d.id, j.note ?? j.error ?? "Intet sendt.");
          }
          return;
        }

        // SSE — læs til streamen slutter; slut-eventet afgør udfaldet.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let sent = 0;
        let failed = 0;
        let skipReason = "";
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
            try {
              ev = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            const t = ev.type as string;
            if (t === "sent") sent++;
            else if (t === "failed") failed++;
            else if (t === "skipped") skipReason = String(ev.reason ?? "");
            else if (t === "done") {
              sent = Number(ev.sent) || sent;
              failed = Number(ev.failed) || failed;
              const sk = Array.isArray(ev.skipped) ? (ev.skipped as { reason?: string }[]) : [];
              if (sk[0]?.reason) skipReason = String(sk[0].reason);
            }
          }
        }

        if (sent > 0) {
          drop(d.id);
          setFlash(`Sendt til ${d.recipientEmail}`);
        } else if (skipReason) {
          note(d.id, `Sprunget over: ${skipReason}`);
        } else if (failed > 0) {
          note(d.id, "Afsendelsen fejlede.");
        } else {
          note(d.id, "Intet sendt.");
        }
      } catch (e) {
        note(d.id, e instanceof Error && e.message ? e.message : "Netværksfejl.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, note, drop],
  );

  // Udskyd: bagerst i den lokale liste. Ingen API-kald, intet persisteres.
  const postpone = useCallback((id: string) => {
    setDrafts((p) => {
      const d = p.find((x) => x.id === id);
      return d ? [...p.filter((x) => x.id !== id), d] : p;
    });
  }, []);

  const reject = useCallback(
    async (d: Draft) => {
      if (busyId) return;
      setBusyId(d.id);
      setNotes((p) => ({ ...p, [d.id]: "" }));
      try {
        const r = await postJson("/api/approve/queue", { id: d.id, action: "reject" });
        if (r.ok) drop(d.id);
        else note(d.id, r.error ?? "Kunne ikke droppe.");
      } catch (e) {
        note(d.id, e instanceof Error && e.message ? e.message : "Netværksfejl.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, note, drop],
  );

  const visible = drafts.slice(0, VISIBLE);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 48px" }}>
      <style>{`
        .snd-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--surface); color: var(--text);
          font-family: inherit; font-size: 15px; font-weight: 500;
          cursor: pointer;
          transition: background 140ms ease, border-color 140ms ease, transform 100ms cubic-bezier(0.23,1,0.32,1);
        }
        .snd-btn:active:not(:disabled) { transform: scale(0.98); }
        .snd-btn:disabled { opacity: 0.4; cursor: default; }
        .snd-send { min-height: 50px; font-size: 16px; font-weight: 600; background: var(--text); border-color: var(--text); color: #fff; }
        .snd-sec { min-height: 44px; font-size: 14px; color: var(--text-muted); }
        @media (hover: hover) and (pointer: fine) {
          .snd-sec:hover:not(:disabled) { background: var(--surface-2); border-color: var(--border-light); color: var(--text); }
          .snd-send:hover:not(:disabled) { background: var(--accent-ink); }
        }
        @media (prefers-reduced-motion: reduce) { .snd-btn { transition: none; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {visible.length} af {drafts.length}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>udkast i kø</span>
      </div>

      {flash && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            background: "var(--green-dim)",
            color: "var(--green)",
            fontSize: 14,
          }}
        >
          {flash}
        </div>
      )}

      {loading && <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Henter…</p>}

      {loadError && (
        <p style={{ fontSize: 14, color: "var(--red)", whiteSpace: "pre-wrap" }}>{loadError}</p>
      )}

      {!loading && !loadError && drafts.length === 0 && (
        <p style={{ fontSize: 15, color: "var(--text-muted)" }}>Køen er tom.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {visible.map((d) => {
          const mail = (d.recipientEmail || "").trim();
          const sending = busyId === d.id;
          const locked = busyId !== null;
          return (
            <article
              key={d.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "18px 18px 16px",
              }}
            >
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>{d.name}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {[d.city, d.branch].filter(Boolean).join(" · ")}
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 13,
                  wordBreak: "break-all",
                  color: mail ? "var(--text-muted)" : "var(--red)",
                }}
              >
                {mail || "ingen mail"}
              </p>

              <div style={{ height: 1, background: "var(--border)", margin: "14px 0" }} />

              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{d.subject}</p>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {d.body}
              </p>

              {notes[d.id] && (
                <p
                  style={{
                    margin: "14px 0 0",
                    fontSize: 13,
                    color: "var(--red)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {notes[d.id]}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                <button
                  type="button"
                  className="snd-btn snd-send"
                  disabled={locked || !mail}
                  onClick={() => send(d)}
                >
                  {sending ? "Sender…" : "Send"}
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="snd-btn snd-sec"
                    disabled={locked}
                    onClick={() => postpone(d.id)}
                  >
                    Udskyd
                  </button>
                  <button
                    type="button"
                    className="snd-btn snd-sec"
                    disabled={locked}
                    onClick={() => reject(d)}
                  >
                    Drop
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

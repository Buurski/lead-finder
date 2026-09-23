"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import UpdateEditor, { type CustomerUpdateDTO } from "@/components/kundeopdateringer/UpdateEditor";

export interface TimelineActivity {
  id: string;
  type: string;
  summary: string;
  actor: string;
  billableDkk: number | null;
  at: string; // ISO
}

const TYPE_ICON: Record<string, string> = {
  note: "FileText",
  opkald: "Phone",
  moede: "Calendar",
  arbejde: "Briefcase",
  fase: "Workflow",
  deploy: "Server",
  checkin: "CircleDot",
  faktura: "Receipt",
  kundeopdatering: "Mail",
};

const LOG_TYPES: { key: "note" | "opkald" | "moede" | "arbejde"; label: string }[] = [
  { key: "note", label: "Note" },
  { key: "opkald", label: "Opkald" },
  { key: "moede", label: "Møde" },
  { key: "arbejde", label: "Arbejde" },
];

const PERSON = new Set(["lucas", "charlie"]);

function initials(actor: string): string {
  return PERSON.has(actor) ? actor[0].toUpperCase() : "";
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const t = Math.round(min / 60);
  if (t < 24) return `${t} t siden`;
  const d = Math.round(t / 24);
  if (d < 30) return `${d} d siden`;
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function Row({ a }: { a: TimelineActivity }) {
  return (
    <div className="virk-timeline-item virk-fade-in">
      {PERSON.has(a.actor) ? (
        <span className="virk-avatar" aria-hidden="true">{initials(a.actor)}</span>
      ) : (
        <span className="virk-timeline-icon" aria-hidden="true">
          <Icon name={TYPE_ICON[a.type] ?? "Activity"} style={{ width: 14, height: 14 }} />
        </span>
      )}
      <div className="virk-timeline-body">
        <div className="virk-timeline-text">
          {a.summary}
          {a.billableDkk ? ` (${a.billableDkk.toLocaleString("da-DK")} kr)` : ""}
        </div>
        <div className="virk-timeline-meta cc-mono">{a.actor} · {relTime(a.at)}</div>
      </div>
    </div>
  );
}

export default function Timeline({ companyId, activities }: { companyId: string; activities: TimelineActivity[] }) {
  const router = useRouter();
  // Serverens `activities` er facit; optimistiske poster lægges foran og
  // fjernes igen efter et vellykket kald (så router.refresh() ikke giver en
  // dublet). Ingen prop→state-effekt — det undgår en ekstra render-runde.
  const [optimistic, setOptimistic] = useState<TimelineActivity[]>([]);
  const list = [...optimistic, ...activities];
  const [type, setType] = useState<(typeof LOG_TYPES)[number]["key"]>("note");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [kundeSynlig, setKundeSynlig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // "Lav kundeopdatering" — samler kunde-synligt arbejde til én kladde og
  // viser den inline (samme editor som /kundeopdateringer bruger).
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateErr, setUpdateErr] = useState("");
  const [createdUpdate, setCreatedUpdate] = useState<CustomerUpdateDTO | null>(null);

  async function log() {
    const summary = text.trim();
    if (!summary) { setErr("Skriv noget først."); return; }
    setErr("");
    setBusy(true);
    const tempId = `tmp-${Date.now()}`;
    const entry: TimelineActivity = {
      id: tempId,
      type,
      summary,
      actor: "du",
      billableDkk: type === "arbejde" && amount ? Number(amount) : null,
      at: new Date().toISOString(),
    };
    setOptimistic((prev) => [entry, ...prev]);
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          summary,
          billableDkk: type === "arbejde" && amount ? Number(amount) : undefined,
          kundeSynlig: type === "arbejde" ? kundeSynlig : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke logges");
      setText(""); setAmount(""); setKundeSynlig(false);
      setOptimistic((prev) => prev.filter((x) => x.id !== tempId));
      router.refresh();
    } catch (e) {
      setOptimistic((prev) => prev.filter((x) => x.id !== tempId));
      setErr(e instanceof Error ? e.message : "kunne ikke logges");
    } finally {
      setBusy(false);
    }
  }

  async function makeUpdate() {
    setUpdateBusy(true);
    setUpdateErr("");
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/kundeopdatering`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke lave kladden");
      setCreatedUpdate(data.update as CustomerUpdateDTO);
      router.refresh();
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : "kunne ikke lave kladden");
    } finally {
      setUpdateBusy(false);
    }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="virk-section-title"><span>Tidslinje</span></div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="virk-log-type" role="radiogroup" aria-label="Hændelsestype">
          {LOG_TYPES.map((t) => (
            <button key={t.key} role="radio" aria-checked={type === t.key} onClick={() => setType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hvad skete der?"
          aria-label="Tekst"
          rows={2}
          style={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "8px 10px", fontSize: 13.5, color: "var(--text)", resize: "vertical" }}
        />
        {type === "arbejde" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" }}>
            <input type="checkbox" checked={kundeSynlig} onChange={(e) => setKundeSynlig(e.target.checked)} />
            Kunden må se det (kommer med i næste kundeopdatering)
          </label>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {type === "arbejde" && (
            <input
              className="virk-inline-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Beløb (kr, valgfrit)"
              inputMode="numeric"
              aria-label="Beløb i kr"
              style={{ width: 160 }}
            />
          )}
          <button className="cc-btn cc-btn-accent virk-btn-press" onClick={log} disabled={busy} style={{ marginLeft: type === "arbejde" ? 0 : "auto" }}>
            {busy ? "Logger…" : "Log"}
          </button>
          {!createdUpdate && (
            <button className="cc-btn virk-btn-press" onClick={makeUpdate} disabled={updateBusy}>
              {updateBusy ? "Laver…" : "Lav kundeopdatering"}
            </button>
          )}
        </div>
        {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
        {updateErr && <span style={{ fontSize: 12, color: "var(--red)" }}>{updateErr}</span>}
        {createdUpdate && (
          <div className="virk-deal" style={{ gap: 8 }}>
            <UpdateEditor update={createdUpdate} onChange={setCreatedUpdate} />
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 13 }}>Ingen hændelser endnu.</p>
      ) : (
        <div className="virk-timeline">
          {list.map((a) => <Row key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

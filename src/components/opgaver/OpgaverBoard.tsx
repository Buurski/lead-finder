"use client";
// /opgaver — Min dag/Alle/Klaret over opgaver + aftalers næste skridt.
// Fanerne og ejer-filteret er rent klient-side (ingen URL-state nødvendig,
// siden er intern); Klaret hentes først når fanen åbnes.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeTaskFocus } from "@/lib/hq/focus-task";
import TaskRow, { type TaskRowItem } from "./TaskRow";
import QuickAdd from "./QuickAdd";
import type { EditableTask } from "./TaskEditDialog";
import "./opgaver.css";

interface Item extends TaskRowItem {
  bucket: "forfalden" | "i_dag" | "kommende" | "uden_dato";
}
interface DoneRow { id: string; title: string; companyId: string | null; company: string; owner: string; doneAt: string }

const BUCKET_ORDER = ["forfalden", "i_dag", "kommende", "uden_dato"] as const;
const BUCKET_LABEL: Record<string, string> = { forfalden: "Forfalden", i_dag: "I dag", kommende: "Kommende", uden_dato: "Uden dato" };
const TABS: { key: "dag" | "alle" | "klaret"; label: string }[] = [
  { key: "dag", label: "Min dag" },
  { key: "alle", label: "Alle" },
  { key: "klaret", label: "Klaret" },
];

async function patchItem(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/opgaver/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

// En opgave med beslutningsmarkør i notens første linje (se src/lib/hq/approval.ts).
// Gælder både afventende og afgjorte — begge skal kunne findes uden en dato.
function isApproval(i: TaskRowItem): boolean {
  return i.approval != null;
}

export default function OpgaverBoard({
  initialItems, today, defaultOwner, currentUser = "",
}: {
  initialItems: Item[];
  today: string;
  defaultOwner: "lucas" | "charlie" | "";
  currentUser?: "lucas" | "charlie" | "";
}) {
  const taskId = useSearchParams().get("task");
  const [tab, setTab] = useState<"dag" | "alle" | "klaret">("dag");
  const [owner, setOwner] = useState<"lucas" | "charlie" | "">(defaultOwner);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [done, setDone] = useState<DoneRow[] | null>(null);
  const [loadingDone, setLoadingDone] = useState(false);
  const [toast, setToast] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function notify(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3800);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Ny query og klik på samme deep-link viser begge den præcise opgave.
  const showTask = useCallback((id: string) => {
    focusTimers.current.forEach(clearTimeout);
    // Bevidst asynkront: et synkront setState i en effect giver kaskade-renders
    // (react-hooks/set-state-in-effect). Her skal vi blot nå at vise rækken.
    const showTimer = setTimeout(() => {
      setTab("alle");
      setOwner("");
      setHighlight(id);
    }, 0);
    const scrollTimer = setTimeout(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    const clearTimer = setTimeout(() => setHighlight(null), 4500);
    focusTimers.current = [showTimer, scrollTimer, clearTimer];
  }, []);

  useEffect(() => {
    if (taskId) showTask(taskId);
    const unsubscribe = subscribeTaskFocus(showTask);
    return () => {
      unsubscribe();
      focusTimers.current.forEach(clearTimeout);
    };
  }, [taskId, showTask]);

  // Altid hele (kryds-ejer) listen — ejer-filteret regnes lokalt i `visible`,
  // så et skift af ejer-fane ikke kræver et nyt kald.
  // Returnerer false hvis kaldet fejlede, så kalderen kan sige det højt i stedet
  // for at vise en forældet række som om intet var sket.
  async function reload(): Promise<boolean> {
    const res = await fetch("/api/opgaver?scope=alle");
    if (!res.ok) return false;
    setItems((await res.json()).items);
    return true;
  }

  async function loadDone(forOwner: typeof owner) {
    setLoadingDone(true);
    try {
      const res = await fetch(`/api/opgaver?scope=klaret${forOwner ? `&owner=${forOwner}` : ""}`);
      setDone(res.ok ? (await res.json()).items : []);
    } finally {
      setLoadingDone(false);
    }
  }

  // Hentes fra klik-handlere, ikke en effekt — Klaret-data er svar på en
  // brugerhandling (skift fane/ejer), ikke noget der skal synkroniseres på mount.
  function selectTab(next: typeof tab) {
    setTab(next);
    if (next === "klaret") void loadDone(owner);
  }
  function selectOwner(next: typeof owner) {
    setOwner(next);
    if (tab === "klaret") void loadDone(next);
  }

  function complete(id: string) {
    const prev = items;
    setItems(items.filter((i) => i.id !== id));
    patchItem(id, { done: true }).catch((e) => {
      setItems(prev);
      notify(e instanceof Error ? e.message : "kunne ikke afslutte opgaven");
    });
  }

  function reschedule(id: string, due: string) {
    patchItem(id, { due }).then(reload).catch((e) => notify(e instanceof Error ? e.message : "kunne ikke flytte opgaven"));
  }

  function changed(id: string, change: Omit<EditableTask, "id" | "companyId"> | null) {
    setItems((prev) => change ? prev.map((i) => i.id === id ? { ...i, ...change } : i) : prev.filter((i) => i.id !== id));
    void reload();
  }

  const owners: { value: typeof owner; label: string }[] = [
    { value: "", label: "Begge" },
    { value: "lucas", label: "Lucas" },
    { value: "charlie", label: "Charlie" },
  ];

  const visible = items
    .filter((i) => !owner || i.owner === owner)
    // Godkendelsesopgaver har som regel ingen dato, så de ville falde uden for
    // "Min dag". De skal kunne ses og afgøres med det samme — også den
    // allerede godkendte plan, som Lucas ellers ikke kan finde status på.
    .filter((i) => tab === "alle" || i.bucket === "forfalden" || i.bucket === "i_dag" || isApproval(i));

  return (
    <div className="op-board">
      <QuickAdd defaultOwner={owner || "lucas"} today={today} onCreated={(msg) => { void reload(); notify(msg); }} />

      <div className="op-controls">
        <nav className="cc-section-tabs" aria-label="Opgavevisning">
          {TABS.map((t) => (
            <button key={t.key} type="button" className="cc-section-tab" data-active={tab === t.key || undefined} onClick={() => selectTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="op-owner-filter" role="group" aria-label="Filtrér på ejer">
          {owners.map((o) => (
            <button key={o.value || "begge"} type="button" className="op-chip" data-on={owner === o.value} onClick={() => selectOwner(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "klaret" ? (
        loadingDone ? (
          <div className="cc-skel" style={{ height: 120 }} />
        ) : !done || done.length === 0 ? (
          <p className="cc-dim op-empty">Ingen klarede opgaver endnu.</p>
        ) : (
          <div className="op-group">
            {done.map((d) => (
              <div key={d.id} className="op-row op-row-done">
                <span className="op-check done" aria-hidden="true" />
                <div className="op-row-body">
                  <div className="op-row-title">{d.title}</div>
                  <div className="op-row-meta">
                    {d.companyId ? <a href={`/virksomheder/${d.companyId}`} className="op-row-company">{d.company}</a> : d.company && <span className="op-row-company">{d.company}</span>}
                  </div>
                </div>
                <span className="cc-mono op-done-at">{new Date(d.doneAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span>
                <button
                  type="button"
                  className="cc-btn cc-btn-ghost"
                  style={{ fontSize: 12, padding: "2px 8px" }}
                  onClick={async () => {
                    try {
                      await patchItem(d.id, { done: false });
                      setDone((cur) => cur?.filter((x) => x.id !== d.id) ?? cur);
                      notify("Opgaven er åben igen");
                      void reload();
                    } catch (e) {
                      notify(e instanceof Error ? e.message : "kunne ikke fortryde");
                    }
                  }}
                >
                  Fortryd
                </button>
              </div>
            ))}
          </div>
        )
      ) : visible.length === 0 ? (
        <p className="cc-dim op-empty">
          {tab === "dag" ? "Intet forfalder i dag." : "Ingen åbne opgaver eller næste skridt."}
        </p>
      ) : (
        (["vigtig", ...BUCKET_ORDER] as const).filter((b) => visible.some((i) => b === "vigtig" ? i.important : !i.important && i.bucket === b)).map((b) => (
          <div key={b} className="op-group">
            <div className="op-group-label">{b === "vigtig" ? "Vigtig" : BUCKET_LABEL[b]}</div>
            {visible.filter((i) => b === "vigtig" ? i.important : !i.important && i.bucket === b).map((i) => (
              <TaskRow
                key={i.id}
                item={i}
                today={today}
                onComplete={complete}
                onReschedule={reschedule}
                onChanged={changed}
                canDecide={currentUser === "" || currentUser === i.owner}
                onDecide={() => reload()}
                highlight={highlight === i.id}
              />
            ))}
          </div>
        ))
      )}

      {toast && <div role="status" className="op-toast">{toast}</div>}
    </div>
  );
}

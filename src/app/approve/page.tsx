"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import WarnBanner from "@/components/WarnBanner";
import InboxTopBar from "@/components/inbox/InboxTopBar";
import InboxTabs from "@/components/inbox/InboxTabs";
import InboxFilterBar from "@/components/inbox/InboxFilterBar";
import InboxList from "@/components/inbox/InboxList";
import InboxDetail from "@/components/inbox/InboxDetail";
import { jevPriority, type ActFn, type QueueDraft, type Tab } from "@/components/inbox/types";
import "@/components/inbox/inbox.css";
import ReconcileBanner from "@/components/inbox/ReconcileBanner";

const LIST_PAGE = 30;

// Suspense er påkrævet af Next 16 når en client-side page bruger
// useSearchParams (?id=<draftId> — URL-state for detaljevisningen), ellers
// fejler production-build (missing-suspense-with-csr-bailout).
export default function ApprovePage() {
  return (
    <Suspense fallback={<div className="cc-skel" style={{ height: 480, borderRadius: 14 }} />}>
      <InboxApp />
    </Suspense>
  );
}

function InboxApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [drafts, setDrafts] = useState<QueueDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, "god" | "daarlig">>({});
  const [labelStat, setLabelStat] = useState<{ god: number; daarlig: number; nok: boolean } | null>(null);

  const fetchQueue = useCallback(async (): Promise<QueueDraft[]> => {
    const res = await fetch("/api/approve/queue", { cache: "no-store" });
    if (!res.ok) throw new Error(`køen svarede ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.drafts) ? (data.drafts as QueueDraft[]) : [];
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchQueue();
        if (!cancelled) { setDrafts(d); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error && e.message ? `Kunne ikke hente køen (${e.message}).` : "Kunne ikke hente køen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchQueue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/approve/label", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const m: Record<string, "god" | "daarlig"> = {};
        for (const l of data.labels ?? []) m[l.draftId] = l.label;
        setLabels(m);
        setLabelStat(data.stats ?? null);
      } catch { /* labels er en ekstra — køen virker uden dem */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const setLabel = useCallback(async (id: string, value: "god" | "daarlig" | null) => {
    const draft = drafts.find((d) => d.id === id);
    setLabels((prev) => {
      const next = { ...prev };
      if (value) next[id] = value; else delete next[id];
      return next;
    });
    try {
      const res = await fetch("/api/approve/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, label: value, jevLead: draft?.jev?.lead ?? null, jevDraft: draft?.jev?.draft ?? null }),
      });
      if (res.ok) setLabelStat((await res.json()).stats ?? null);
    } catch { /* mistet label er ikke værd at afbryde arbejdet for */ }
  }, [drafts]);

  const patchLocal = useCallback((d: QueueDraft) => {
    // Flet — POST-svaret mangler GET-berigelsen (Jev, historik, modtager); en
    // ren udskiftning fik badges til at forsvinde efter hver handling.
    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...d } : x)));
  }, []);

  // ---- URL-state (?id=<draftId>) — link + tilbage-knap -------------------
  // Ingen lokal kopi/useState nødvendig — searchParams ER kilden, og Next
  // rerenderer allerede når den ændres (undgår en synkron setState-i-effect).
  const selectedId = searchParams.get("id");

  const setSelectedId = useCallback((id: string | null, opts?: { push?: boolean }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("id", id); else params.delete("id");
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (opts?.push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }, [pathname, router, searchParams]);

  // ---- pause-status + dagens send-loft (GET-only preflight — sender intet) --
  const [pauseInfo, setPauseInfo] = useState<{ paused: boolean; until?: string } | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  // Hvilke afsendere har creds sat — driver "Ikke forbundet"-pillen ved
  // afsender-valget i stedet for det gamle "Gmail er ikke sat op"-banner
  // (ui-common2.md §18: ingen bannere, en lille rolig pille).
  const [senders, setSenders] = useState<{ lucas: boolean; charlie: boolean } | null>(null);
  const refreshSendStatus = useCallback(async () => {
    try {
      const pf = await fetch("/api/approve/send").then((r) => r.json());
      if (pf?.ok) {
        setPauseInfo({ paused: !!pf.paused, until: pf.until });
        setCap(typeof pf.cap === "number" ? pf.cap : null);
        if (pf.senders) setSenders({ lucas: !!pf.senders.lucas, charlie: !!pf.senders.charlie });
      }
    } catch { /* status-bjælken er ekstra info, ikke kritisk */ }
  }, []);
  // Hent status ved mount — pakket i en IIFE (setState sker efter await, ikke
  // synkront i effect-kroppen) i stedet for at kalde refreshSendStatus()
  // direkte, som react-hooks/set-state-in-effect flager.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pf = await fetch("/api/approve/send").then((r) => r.json());
        if (!cancelled && pf?.ok) {
          setPauseInfo({ paused: !!pf.paused, until: pf.until });
          setCap(typeof pf.cap === "number" ? pf.cap : null);
          if (pf.senders) setSenders({ lucas: !!pf.senders.lucas, charlie: !!pf.senders.charlie });
        }
      } catch { /* status-bjælken er ekstra info, ikke kritisk */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- faner + filtre -----------------------------------------------------
  const [tab, setTabState] = useState<Tab>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingSort, setPendingSort] = useState<"jev" | "newest">("jev");
  const [seenOnly, setSeenOnly] = useState(false);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState<"ok" | "all" | "best" | "A" | "B" | "C">("ok");
  const [shownCount, setShownCount] = useState(LIST_PAGE);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    setShownCount(LIST_PAGE);
    setSelected(new Set());
    setSeenOnly(false);
    setSelectedId(null, { push: false });
  }, [setSelectedId]);

  const branches = useMemo(
    () => Array.from(new Set(drafts.map((d) => d.branch).filter(Boolean))).sort((a, b) => a.localeCompare(b, "da")),
    [drafts]
  );

  const counts = useMemo(() => {
    const pendingAll = drafts.filter((d) => d.status === "pending");
    const seen = pendingAll.filter((d) => d.history?.seenBefore).length;
    const approvedList = drafts.filter((d) => d.status === "approved" || d.status === "edited");
    const approved = approvedList.length;
    const approvedCharlie = approvedList.filter((d) => (d.sender ?? "lucas") === "charlie").length;
    const approvedLucas = approved - approvedCharlie;
    const sent = drafts.filter((d) => d.status === "sent").length;
    const rejected = drafts.filter((d) => d.status === "rejected").length;
    const followups = drafts.filter((d) => d.source === "opfoelgning").length;
    return { pending: pendingAll.length, seen, approved, approvedLucas, approvedCharlie, sent, rejected, followups };
  }, [drafts]);

  const tabCounts: Record<Tab, number> = useMemo(() => ({
    pending: counts.pending, approved: counts.approved, followups: counts.followups, sent: counts.sent, rejected: counts.rejected,
  }), [counts]);

  // Base pr. fane, FØR gradeFilter/søgning/branche — "Set før" og
  // Jev-prioritet/nyeste-sortering hører kun til "Til godkendelse".
  const baseByTab = useMemo(() => {
    if (tab === "pending") {
      let base = drafts.filter((d) => d.status === "pending");
      if (seenOnly) {
        base = base.filter((d) => d.history?.seenBefore);
        const rank: Record<string, number> = { varm: 0, lun: 1, kold: 2, "død": 3 };
        base = [...base].sort((a, b) =>
          (rank[a.history?.warmth ?? "kold"] - rank[b.history?.warmth ?? "kold"]) ||
          ((a.history?.daysSince ?? 9999) - (b.history?.daysSince ?? 9999)));
      } else if (pendingSort === "jev") {
        base = [...base].sort((a, b) => jevPriority(b) - jevPriority(a));
      }
      return base;
    }
    if (tab === "approved") return drafts.filter((d) => d.status === "approved" || d.status === "edited");
    if (tab === "sent") return drafts.filter((d) => d.status === "sent");
    if (tab === "rejected") return drafts.filter((d) => d.status === "rejected");
    // Opfølgninger (spec §11, backend landet 2026-09-22): kladder fra
    // sekvens-motoren. Findes feltet ikke endnu (ældre kø/lokal DB), er
    // listen bare tom — InboxList viser da den tomme tilstand.
    return drafts.filter((d) => d.source === "opfoelgning");
  }, [drafts, tab, seenOnly, pendingSort]);

  const visible = useMemo(() => {
    let base = baseByTab;
    if (branchFilter !== "all") base = base.filter((d) => d.branch === branchFilter);
    if (gradeFilter === "best") {
      base = base.filter((d) => (d.jev?.grade ?? "?") === "A" && !(d.jev?.flags ?? []).includes("send ikke"))
        .sort((a, b) => jevPriority(b) - jevPriority(a));
    } else if (gradeFilter === "ok") {
      base = base.filter((d) => (d.jev?.grade ?? "?") !== "C" && !(d.jev?.flags ?? []).includes("send ikke"));
    } else if (gradeFilter !== "all") {
      base = base.filter((d) => (d.jev?.grade ?? "?") === gradeFilter);
    }
    const needle = q.trim().toLowerCase();
    if (needle) base = base.filter((d) => `${d.name} ${d.city} ${d.branch} ${d.subject}`.toLowerCase().includes(needle));
    return base;
  }, [baseByTab, branchFilter, gradeFilter, q]);

  // ---- delt handling (knapper OG tastatur-triage) -------------------------
  const actOn: ActFn = useCallback(async (id, action, payload) => {
    // Næste kladde beregnes FØR status ændres — ellers er den handlede
    // kladde allerede filtreret ud, og "næste" bliver forkert.
    let nextId: string | null = null;
    if (action === "approve" || action === "edit" || action === "reject") {
      const idx = visible.findIndex((d) => d.id === id);
      if (idx >= 0) nextId = visible[idx + 1]?.id ?? visible[idx - 1]?.id ?? null;
    }
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify((action === "edit" || action === "set-demos" || action === "set-sender" || action === "set-recipient") && payload ? { id, action, ...payload } : { id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, violations: Array.isArray(data.violations) ? data.violations : [data.error ?? "Ukendt fejl"] };
      }
      patchLocal(data.draft as QueueDraft);
      if ((action === "approve" || action === "edit" || action === "reject") && id === selectedId) {
        setSelectedId(nextId, { push: false });
      }
      return { ok: true };
    } catch {
      // Netværksfejl (fx serveren væk midt i et klik) — samme besked som resten
      // af siden bruger, og busy-state hos kalderen nulstilles altid i dens finally.
      return { ok: false, violations: ["Netværksfejl. Prøv igen."] };
    }
  }, [patchLocal, visible, selectedId, setSelectedId]);

  // ---- tastatur: j/k flytter, a godkend, r afvis, e ret, space/x vælg ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (document.querySelector(".cc-palette")) return;
      const idx = visible.findIndex((d) => d.id === selectedId);
      const cur = idx >= 0 ? visible[idx] : visible[0];
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = Math.min((idx < 0 ? -1 : idx) + 1, visible.length - 1);
        if (nextIdx >= shownCount) setShownCount((c) => c + LIST_PAGE);
        const next = visible[nextIdx];
        if (next) setSelectedId(next.id, { push: false });
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = visible[Math.max((idx < 0 ? 0 : idx) - 1, 0)];
        if (prev) setSelectedId(prev.id, { push: false });
      } else if (cur && tab === "pending" && k === "a") {
        e.preventDefault();
        actOn(cur.id, "approve");
      } else if (cur && tab === "pending" && k === "r") {
        e.preventDefault();
        actOn(cur.id, "reject");
      } else if (cur && tab === "pending" && k === "e") {
        e.preventDefault();
        document.getElementById(`inbox-body-${cur.id}`)?.focus();
      } else if (cur && tab === "pending" && (e.key === " " || k === "x")) {
        e.preventDefault();
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(cur.id)) next.delete(cur.id); else next.add(cur.id);
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, tab, actOn, shownCount, setSelectedId]);

  // ---- desktop: åbn altid noget i højre panel (mail-app-mønster) --------
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (isMobile) return;
    if (selectedId && visible.some((d) => d.id === selectedId)) return;
    if (visible.length > 0) setSelectedId(visible[0].id, { push: false });
    else if (selectedId) setSelectedId(null, { push: false });
  }, [isMobile, visible, selectedId, setSelectedId]);

  const selectedDraft = useMemo(() => drafts.find((d) => d.id === selectedId) ?? null, [drafts, selectedId]);
  const openDraft = useCallback((id: string) => setSelectedId(id, { push: true }), [setSelectedId]);
  const closeDraft = useCallback(() => setSelectedId(null, { push: false }), [setSelectedId]);

  // ---- send de godkendte (uændret flow — se ui-common.md: ikke rørt) -----
  const [sendMsg, setSendMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendProg, setSendProg] = useState<{ processed: number; total: number; sent: number; failed: number; line: string } | null>(null);
  const sendApproved = useCallback(async (senderFilter?: "lucas" | "charlie") => {
    if (sendBusy) return;
    const filterCount = senderFilter === "lucas" ? counts.approvedLucas
      : senderFilter === "charlie" ? counts.approvedCharlie
      : counts.approved;
    if (filterCount === 0) return;
    const qs = senderFilter ? `?sender=${senderFilter}` : "";
    const who = senderFilter === "lucas" ? " (kun Lucas)" : senderFilter === "charlie" ? " (kun Charlie)" : "";

    let confirmText = `Send ${filterCount} godkendte udkast${who}?`;
    try {
      const pf = await fetch(`/api/approve/send${qs}`).then((r) => r.json());
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
          `Klar til at sende${who}:`,
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
      const res = await fetch(`/api/approve/send${qs}`, { method: "POST" });
      const ct = res.headers.get("content-type") || "";

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
        await refreshSendStatus();
        return;
      }

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
      await refreshSendStatus();
    } catch {
      setSendMsg("Netværksfejl ved afsendelse.");
    } finally {
      setSendBusy(false);
    }
  }, [sendBusy, counts.approved, counts.approvedLucas, counts.approvedCharlie, load, refreshSendStatus]);

  const [resetBusy, setResetBusy] = useState(false);
  const resetApproved = useCallback(async () => {
    if (resetBusy || sendBusy || counts.approved === 0) return;
    if (!window.confirm(`Flyt alle ${counts.approved} godkendte tilbage til Afventer?\n\nDer sendes INTET — du kan bagefter godkende dem igen enkeltvis eller i bulk.`)) return;
    setResetBusy(true);
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-approved" }),
      });
      const d = await res.json().catch(() => ({}));
      setSendMsg(res.ok ? `${d.reset ?? 0} flyttet til afventer — intet sendt.` : (d.error ?? "Kunne ikke nulstille."));
      await load();
    } catch {
      setSendMsg("Netværksfejl ved nulstilling.");
    } finally {
      setResetBusy(false);
    }
  }, [resetBusy, sendBusy, counts.approved, load]);

  // ---- Jev / berigelse / følgertal (uændrede rute-kald) -------------------
  const [jevRunBusy, setJevRunBusy] = useState(false);
  const [jevRunMsg, setJevRunMsg] = useState("");
  const runJevNow = useCallback(async () => {
    if (jevRunBusy) return;
    setJevRunBusy(true);
    setJevRunMsg("Vurderer…");
    try {
      const res = await fetch("/api/jev-run?limit=30", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setJevRunMsg(
        res.ok && d.ok
          ? `${d.leads?.judged ?? 0} leads · ${d.drafts?.judged ?? 0} kladder vurderet` +
            (d.drafts?.remaining ? ` · ${d.drafts.remaining} mangler` : " · alle kladder i køen er vurderet")
          : (d.error ?? "Kunne ikke vurdere.")
      );
      await load();
    } catch {
      setJevRunMsg("Netværksfejl.");
    } finally {
      setJevRunBusy(false);
    }
  }, [jevRunBusy, load]);

  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState("");
  const enrichQueue = useCallback(async () => {
    if (enrichBusy) return;
    let mangler = 0;
    let pris = "?";
    try {
      const pre = await fetch("/api/queue-enrich", { cache: "no-store" });
      const d = await pre.json();
      mangler = d.mangler ?? 0;
      pris = d.anslaaetPris ?? "?";
    } catch {
      setEnrichMsg("Kunne ikke hente status.");
      return;
    }
    if (mangler === 0) { setEnrichMsg("Alle kladder har allerede forretningsdata."); return; }
    if (!window.confirm(`Slå ${mangler} forretninger op hos Google?\n\nKoster ca. ${pris}. De får website, anmeldelsestal og drift-status, og bliver derefter Jev-vurderet.\n\nPermanent lukkede forretninger afvises automatisk. Intet sendes.`)) return;
    setEnrichBusy(true);
    setEnrichMsg("Slår op…");
    try {
      const res = await fetch("/api/queue-enrich?limit=250", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setEnrichMsg(
        res.ok && d.ok
          ? `${d.beriget} beriget · ${d.vurderet} vurderet · ${d.lukkede} permanent lukkede afvist${d.mangler ? ` · ${d.mangler} mangler endnu` : ""}`
          : (d.error ?? "Kunne ikke berige.")
      );
      await load();
    } catch {
      setEnrichMsg("Netværksfejl.");
    } finally {
      setEnrichBusy(false);
    }
  }, [enrichBusy, load]);

  const [socialBusy, setSocialBusy] = useState(false);
  const [socialMsg, setSocialMsg] = useState("");
  const fetchFollowers = useCallback(async () => {
    if (socialBusy) return;
    setSocialBusy(true);
    setSocialMsg("Henter…");
    try {
      const res = await fetch("/api/jev-social?limit=30", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setSocialMsg(
        res.ok && d.ok
          ? d.requested === 0
            ? "Ingen afventende kladder med Facebook-link klar."
            : `${d.fetched}/${d.requested} hentet · ca. $${d.costUsd}.`
          : (d.error ?? "Kunne ikke hente følgertal.")
      );
      await load();
    } catch {
      setSocialMsg("Netværksfejl.");
    } finally {
      setSocialBusy(false);
    }
  }, [socialBusy, load]);

  // ---- bulk: godkend/afvis (uændret) --------------------------------------
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkApprove = useCallback(async () => {
    const pendings = visible.filter((d) => d.status === "pending");
    if (pendings.length === 0) return;
    const byBranch = new Map<string, number>();
    for (const d of pendings) byBranch.set(d.branch || "ukendt", (byBranch.get(d.branch || "ukendt") ?? 0) + 1);
    const mix = [...byBranch.entries()].sort((a, b) => b[1] - a[1]);
    const mixLine = mix.slice(0, 4).map(([b, n]) => `${n} ${b}`).join(", ") + (mix.length > 4 ? ` + ${mix.slice(4).reduce((a, [, n]) => a + n, 0)} andre` : "");
    const scopeNote = pendings.length < counts.pending ? ` (filtreret — ${counts.pending - pendings.length} udenfor filteret røres ikke)` : "";
    if (!window.confirm(`Godkend ${pendings.length} afventende udkast${scopeNote}?\n\nBranche-miks: ${mixLine}.\n\nDe markeres til afsendelse — intet sendes.`)) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve-many", ids: pendings.map((d) => d.id) }),
      });
      const data = await res.json();
      if (!res.ok) window.alert(`Kunne ikke godkende: ${data.error ?? "ukendt fejl"}. Alt står stadig som afventende.`);
      else if (data.approved < pendings.length) window.alert(`${data.approved} af ${pendings.length} godkendt — resten var ikke længere afventende.`);
      await load();
    } catch {
      window.alert("Netværksfejl — intet blev ændret.");
    } finally {
      setBulkBusy(false);
    }
  }, [visible, counts.pending, load]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve-many", ids: targets.map((d) => d.id) }),
      });
      const data = await res.json();
      if (!res.ok) window.alert(`Kunne ikke godkende: ${data.error ?? "ukendt fejl"}. Alt står stadig som afventende.`);
      else if (data.approved < targets.length) window.alert(`${data.approved} af ${targets.length} valgte godkendt — resten var ikke længere afventende.`);
      await load();
    } catch {
      window.alert("Netværksfejl — intet blev ændret.");
    } finally {
      setSelBusy(false);
      setSelected(new Set());
    }
  }, [selectedPending, load]);

  const [rejBusy, setRejBusy] = useState(false);
  const rejectSelected = useCallback(async () => {
    const targets = selectedPending;
    if (targets.length === 0) return;
    if (!window.confirm(`Afvis ${targets.length} valgte udkast? De ryger ud af køen (lead'en blokeres 14 dage).`)) return;
    setRejBusy(true);
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject-many", ids: targets.map((d) => d.id) }),
      });
      const data = await res.json();
      if (!res.ok) window.alert(`Kunne ikke afvise: ${data.error ?? "ukendt fejl"}. Alt står stadig som afventende.`);
      await load();
    } catch {
      window.alert("Netværksfejl — intet blev ændret.");
    } finally {
      setRejBusy(false);
      setSelected(new Set());
    }
  }, [selectedPending, load]);

  const gradeCPending = useMemo(
    () => drafts.filter((d) => d.status === "pending" && d.jev?.grade === "C"),
    [drafts]
  );
  const rejectGradeC = useCallback(async () => {
    const targets = gradeCPending;
    if (targets.length === 0) return;
    if (!window.confirm(`Afvis ${targets.length} udkast med karakter C? Kun dem hvor Jev har vurderet BÅDE forretningen og kladden. Lead'en blokeres 14 dage — intet slettes.`)) return;
    setRejBusy(true);
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject-many", ids: targets.map((d) => d.id) }),
      });
      const data = await res.json();
      if (!res.ok) window.alert(`Kunne ikke afvise: ${data.error ?? "ukendt fejl"}. Alt står stadig som afventende.`);
      await load();
    } catch {
      window.alert("Netværksfejl — intet blev ændret.");
    } finally {
      setRejBusy(false);
      setSelected(new Set());
    }
  }, [gradeCPending, load]);

  const [seenBusy, setSeenBusy] = useState(false);
  const [seenMsg, setSeenMsg] = useState("");
  const rejectSeenAll = useCallback(async () => {
    if (seenBusy || counts.seen === 0) return;
    if (!window.confirm(`Afvis alle ${counts.seen} kladder under "Set før"?\n\nDet er kladder hvor forretningen allerede er kontaktet før (i arket eller fra køen). De ryger ud af køen og kommer ikke tilbage. Intet sendes.`)) return;
    setSeenBusy(true);
    setSeenMsg("Afviser…");
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject-seen" }),
      });
      const d = await res.json().catch(() => ({}));
      setSeenMsg(res.ok ? `${d.rejected ?? 0} kladder afvist — de er ude af køen.` : (d.error ?? "Kunne ikke afvise."));
      await load();
    } catch {
      setSeenMsg("Netværksfejl — intet blev ændret.");
    } finally {
      setSeenBusy(false);
    }
  }, [seenBusy, counts.seen, load]);

  const shownList = visible; // InboxList klipper selv til shownCount
  const selectedIndex = selectedDraft ? visible.findIndex((d) => d.id === selectedDraft.id) : -1;

  return (
    <div className="inbox-page">
      <InboxTopBar
        pending={counts.pending}
        approved={counts.approved}
        approvedLucas={counts.approvedLucas}
        approvedCharlie={counts.approvedCharlie}
        cap={cap}
        pause={pauseInfo}
        sendBusy={sendBusy}
        resetBusy={resetBusy}
        sendProg={sendProg}
        sendMsg={sendMsg}
        loading={loading}
        onRefresh={load}
        onSend={() => sendApproved()}
        onSendLucas={() => sendApproved("lucas")}
        onSendCharlie={() => sendApproved("charlie")}
        onReset={resetApproved}
      />

      {tab !== "followups" && (
        <InboxFilterBar
          tab={tab}
          gradeFilter={gradeFilter}
          setGradeFilter={setGradeFilter}
          pendingSort={pendingSort}
          setPendingSort={setPendingSort}
          q={q}
          setQ={(v) => { setQ(v); setShownCount(LIST_PAGE); }}
          branchFilter={branchFilter}
          setBranchFilter={(v) => { setBranchFilter(v); setShownCount(LIST_PAGE); }}
          branches={branches}
          showSearch={drafts.length > 10}
          seenOnly={seenOnly}
          setSeenOnly={(v) => { setSeenOnly(v); setShownCount(LIST_PAGE); }}
          seenCount={counts.seen}
          labelStat={labelStat}
          selection={tab === "pending" ? {
            selectedCount: selectedPending.length,
            visibleCount: visible.filter((d) => d.status === "pending").length,
            totalPendingCount: counts.pending,
            onSelectAll: selectAllVisible,
            onClear: clearSelection,
            onApproveSelected: approveSelected,
            onRejectSelected: rejectSelected,
            onBulkApprove: bulkApprove,
            selBusy, rejBusy, bulkBusy,
          } : null}
          tools={tab === "pending" ? {
            jevRunBusy, jevRunMsg, onRunJev: runJevNow,
            enrichBusy, enrichMsg, onEnrich: enrichQueue,
            socialBusy, socialMsg, onFetchFollowers: fetchFollowers,
            followerCostKr: Math.ceil(visible.length * 0.012 * 7),
            gradeCCount: gradeCPending.length, onRejectGradeC: rejectGradeC,
            seenBusy, seenMsg, onRejectSeenAll: rejectSeenAll,
          } : null}
        />
      )}

      {loading && drafts.length === 0 ? (
        <div className="cc-skel" style={{ flex: 1, borderRadius: 14 }} />
      ) : error ? (
        <WarnBanner
          role="alert"
          action={<button type="button" className="inbox-btn" onClick={load} disabled={loading}>{loading ? "Henter…" : "Prøv igen"}</button>}
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{error}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>Køen er der stadig — der er bare ikke hul igennem lige nu. Intet blev ændret.</div>
        </WarnBanner>
      ) : (
        <>
        <ReconcileBanner drafts={drafts} onDone={() => void load()} />
        <div className="inbox-split">
          <div className="inbox-listpane">
            {/* Status-fanerne ligger her — en kompakt segmented control OVER
                listen, ikke en side-fane-bjælke i toppen af siden (Lucas
                22/9: de rigtige side-faner Godkend/Svar/Henvendelser lander
                senere, håndteret af skallen efter merge). */}
            <InboxTabs active={tab} counts={tabCounts} onChange={setTab} />
            <div className="inbox-listscroll">
              <InboxList
                drafts={shownList}
                selectedId={selectedId}
                onOpen={openDraft}
                showCheckbox={tab === "pending"}
                selected={selected}
                onToggleCheck={toggleSelect}
                shownCount={shownCount}
                onShowMore={() => setShownCount((c) => c + LIST_PAGE)}
                tab={tab}
              />
            </div>
          </div>
          <div className="inbox-detailpane" data-open={selectedDraft != null}>
            {selectedDraft ? (
              <InboxDetail
                key={selectedDraft.id}
                draft={selectedDraft}
                label={labels[selectedDraft.id] ?? null}
                onLabel={setLabel}
                senders={senders}
                onClose={closeDraft}
                onPrev={() => { const prev = visible[selectedIndex - 1]; if (prev) setSelectedId(prev.id, { push: false }); }}
                onNext={() => { const next = visible[selectedIndex + 1]; if (next) setSelectedId(next.id, { push: false }); }}
                canPrev={selectedIndex > 0}
                canNext={selectedIndex >= 0 && selectedIndex < visible.length - 1}
                onAct={actOn}
              />
            ) : (
              <div className="inbox-detail-empty">Vælg en kladde i listen.</div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

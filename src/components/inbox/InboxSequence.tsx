"use client";

import { useEffect, useState } from "react";

interface SequenceInfo {
  ok: true;
  found: boolean;
  sentCount: number;
  history: { step: number; sentAt: string; angle: string | null }[];
  maxTouches: number;
  nextStep: number | null;
  nextAngle: string | null;
  nextAngleLabel: string | null;
  nextDueAt: string | null;
  pendingDraft: boolean;
  stopped: boolean;
  stoppedReason: string | null;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

// "Sekvens"-sektion (spec §11): hvor mange mails er sendt til leadet, hvornår,
// og næste planlagte trin + vinkel. Henter fra /api/approve/sequence — egen
// let rute der genbruger src/lib/hq/sequence.ts's GAP_DAYS/nextAngle, ikke en
// ny udregning her. Fejler den (fx lokal DB uden pg), forsvinder sektionen
// bare stille — kladden er stadig fuldt brugbar uden den.
export default function InboxSequence({ leadId }: { leadId: string }) {
  const [info, setInfo] = useState<SequenceInfo | null>(null);
  const [failed, setFailed] = useState(false);

  // Ingen reset af info/failed her: parent monterer InboxDetail (og dermed
  // denne) med `key={draft.id}` ved kladde-skift, så en ny leadId altid
  // betyder en frisk instans — aldrig et leadId-skift i en levende instans.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/approve/sequence?leadId=${encodeURIComponent(leadId)}`, { cache: "no-store" });
        const d = await res.json();
        if (!cancelled) { if (d?.ok) setInfo(d); else setFailed(true); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  if (failed || !info) return null;
  if (!info.found) {
    return (
      <div className="inbox-sequence">
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
          Sekvens
        </div>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Ingen sekvensdata for dette lead endnu.</span>
      </div>
    );
  }
  if (info.sentCount === 0 && !info.stopped && info.nextStep == null) return null;

  return (
    <div className="inbox-sequence">
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        Sekvens
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
        <span>
          {info.sentCount === 0
            ? "Ingen mails sendt endnu."
            : `${info.sentCount} mail${info.sentCount === 1 ? "" : "s"} sendt · sidst ${fmt(info.history.at(-1)!.sentAt)}`}
        </span>
        {info.stopped ? (
          <span style={{ color: "var(--red)", fontWeight: 600 }}>Stoppet: {info.stoppedReason}</span>
        ) : info.nextStep && info.nextAngleLabel ? (
          <span>
            Næste: trin {info.nextStep}/{info.maxTouches} · {info.nextAngleLabel}
            {info.pendingDraft
              ? " · ligger klar til godkendelse"
              : info.nextDueAt ? ` · klar ${fmt(info.nextDueAt)}` : ""}
          </span>
        ) : info.sentCount > 0 ? (
          <span>Sekvensen er færdig ({info.maxTouches}/{info.maxTouches} trin sendt).</span>
        ) : null}
      </div>
    </div>
  );
}

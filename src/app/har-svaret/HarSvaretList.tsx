"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lifecycleChipStyle, lifecycleLabel } from "@/components/virksomheder/lifecycle";
import BookMeeting, { tomorrowISO } from "@/components/virksomheder/BookMeeting";
import { gmailRepliesUrl, OLD_MAILBOX } from "@/lib/hq/gmail-link";
import { BUCKET_LABEL, BUCKET_ORDER, type ReplyBucket } from "@/lib/hq/reply-bucket";

export interface HarSvaretRow {
  id: string;
  rowNo: number;
  name: string;
  place: string; // "by · branche"
  phone: string;
  email: string;
  jev: string; // "" = ingen karakter
  owner: string;
  lifecycle: string;
  bucket: ReplyBucket;
  why: string; // én linje: hvorfor denne kanal
  hasReply: boolean;
  replyAt: number; // ms, 0 = ingen
  replyWhen: string; // "12. jun. 2026 · 120 d siden"
  replyLag: string; // "1 d efter vores mail"
  replyCategory: string; // "Spørgsmål"
  replySubject: string;
  replyAccount: string; // "lucas" | "charlie"
  snippet: string; // "" = ingen tekst
  phoneInReply: string; // nummer fra svaret hvis de bad om opkald
  weSent: string;
  marks: string[];
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

const telHref = (n: string) => `tel:${n.replace(/\s+/g, "")}`;
const reSubject = (s: string) => (!s ? "" : `?subject=${encodeURIComponent(/^re:/i.test(s) ? s : `Re: ${s}`)}`);

function Actions({ row, me }: { row: HarSvaretRow; me: "lucas" | "charlie" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [later, setLater] = useState(false);
  const [due, setDue] = useState(tomorrowISO);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(label);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  }

  // Log opkald: eksplicit knap (tel:-linket logger ikke selv — på en pc uden telefon sker opkaldet ikke).
  const logCall = () => run("Opkald logget", () => post(`/api/virksomheder/${row.id}/activity`, { type: "opkald", summary: `Ringede til ${row.name}` }));
  const ringLater = () => run(`Opgave oprettet til ${due}`, async () => {
    await post("/api/opgaver", { companyId: row.id, owner: me, title: `Ring til ${row.name}`, due });
    setLater(false);
  });
  // Luk = det eksisterende udfald "ikke interesseret": lead-status, stop af kolde kladder, tidslinje. Intet sendes.
  const close = () => run("Lukket", () => post(`/api/replies/${row.rowNo}/udfald`, { outcome: "ikke-interesseret", note: "Lukket fra Har svaret", owner: me }));

  const gmail = row.email ? <a href={gmailRepliesUrl(row.email, row.replyAccount || row.owner, me)} title={row.replyAccount === OLD_MAILBOX ? "Svaret ligger i den gamle postkasse" : undefined} target="_blank" rel="noopener noreferrer" className={row.bucket === "tjek" || row.bucket === "gammel" || row.bucket === "luk" ? "cc-btn cc-btn-accent" : "cc-btn"}>Åbn i Gmail</a> : null;
  const write = row.email ? <a href={`mailto:${row.email}${reSubject(row.replySubject)}`} className={row.bucket === "skriv" ? "cc-btn cc-btn-accent" : "cc-btn"}>Skriv tilbage</a> : null;
  const callNumber = row.phoneInReply || row.phone;
  const call = callNumber ? <a href={telHref(callNumber)} className={row.bucket === "ring" ? "cc-btn cc-btn-accent" : "cc-btn"}>Ring{row.phoneInReply ? ` ${row.phoneInReply}` : ""}</a> : null;
  const closed = row.bucket === "luk"; // nej: ingen Ring, ingen Mail igen — kun Luk og Gmail

  return (
    <div className="hs-actions">
      <div className="hs-btns">
        {row.bucket === "luk" && <button type="button" className="cc-btn cc-btn-accent" disabled={busy} onClick={close}>Luk (nej tak)</button>}
        {row.bucket === "ring" && call}
        {(row.bucket === "skriv" || row.bucket === "ring") && write}
        {(row.bucket === "skriv" || row.bucket === "ring") && gmail}
        {(row.bucket === "tjek" || row.bucket === "gammel" || row.bucket === "luk") && gmail}
        {!closed && (
          <details className="hs-more">
            <summary className="cc-btn" aria-label="Flere handlinger">…</summary>
            <div className="hs-more-body">
              {row.bucket !== "ring" && call && (
                <div className="hs-warn">
                  <a href={telHref(callNumber)} className="cc-btn">Ring</a>
                  <span>De bad ikke om opkald. Tjek reklamebeskyttelse (CVR) først.</span>
                </div>
              )}
              {row.bucket !== "skriv" && row.bucket !== "ring" && write}
              <button type="button" className="cc-btn" disabled={busy} onClick={logCall}>Log opkald</button>
              <button type="button" className="cc-btn" disabled={busy} onClick={() => setLater((v) => !v)} aria-expanded={later}>Ring senere</button>
              <BookMeeting companyId={row.id} owner={me} />
            </div>
          </details>
        )}
      </div>
      {later && (
        <div className="hs-later">
          <input type="date" value={due} min={tomorrowISO()} onChange={(e) => setDue(e.target.value)} aria-label="Ring senere den" />
          <button type="button" className="cc-btn" disabled={busy || !due} onClick={ringLater}>Gem</button>
        </div>
      )}
      {msg && <span className="hs-msg" role="status">{msg}</span>}
    </div>
  );
}

export default function HarSvaretList({ rows, me, captureReady }: { rows: HarSvaretRow[]; me: "lucas" | "charlie"; captureReady: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReplyBucket | "alle">("alle");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const counts = Object.fromEntries(BUCKET_ORDER.map((b) => [b, rows.filter((r) => r.bucket === b).length])) as Record<ReplyBucket, number>;
  const shown = filter === "alle" ? rows : rows.filter((r) => r.bucket === filter);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch("/api/replies/capture", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "kunne ikke hente svar");
      const failed = Object.keys(body.errors ?? {});
      setRefreshMsg(`${body.inserted} nye svar hentet${failed.length ? ` · fejl på ${failed.join(", ")}` : ""}`);
      router.refresh();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "kunne ikke hente svar");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="cc-card hs-card">
      <div className="hs-toolbar">
        <div className="hs-chips" role="group" aria-label="Filtrér efter kanal">
          <button type="button" className="hs-chip" aria-pressed={filter === "alle"} onClick={() => setFilter("alle")}>Alle <b>{rows.length}</b></button>
          {BUCKET_ORDER.map((b) => (
            <button key={b} type="button" className="hs-chip" data-bucket={b} aria-pressed={filter === b} disabled={counts[b] === 0} onClick={() => setFilter(b)}>
              {BUCKET_LABEL[b]} <b>{counts[b]}</b>
            </button>
          ))}
        </div>
        <div className="hs-refresh">
          {refreshMsg && <span className="hs-msg" role="status">{refreshMsg}</span>}
          <button type="button" className="cc-btn" disabled={refreshing || !captureReady} onClick={refresh} title={captureReady ? "Henter nye svar fra Gmail (læser kun)" : "Slås til sammen med migration 0017"}>
            {refreshing ? "Henter…" : "Opdatér svar"}
          </button>
        </div>
      </div>
      <ul className="hs-list">
        {shown.map((r) => (
          <li key={r.id} className="hs-row" data-bucket={r.bucket}>
            <div className="hs-who">
              <Link href={`/virksomheder/${r.id}`} className="cc-link hs-name">{r.name || "(uden navn)"}</Link>
              <span className="hs-sub">{r.place || "–"}</span>
              <div className="hs-tags">
                <span className="cc-chip" style={{ ...lifecycleChipStyle(r.lifecycle), whiteSpace: "nowrap" }}>{lifecycleLabel(r.lifecycle)}</span>
                {r.jev && <span className="cc-chip" style={{ background: "var(--bg-3)", color: "var(--text-muted)" }}>Jev {r.jev}</span>}
                {r.marks.map((m) => <span key={m} className="cc-chip hs-mark">{m}</span>)}
              </div>
              <span className="hs-sub">{r.weSent}</span>
            </div>
            <div className="hs-reply">
              {r.hasReply ? (
                <>
                  <div className="hs-reply-head">
                    <span className="cc-chip hs-cat">{r.replyCategory}</span>
                    <span className="hs-sub">Svarede {r.replyWhen}{r.replyLag ? ` · ${r.replyLag}` : ""}</span>
                  </div>
                  {r.snippet ? (
                    <details className="hs-snippet">
                      <summary>{r.snippet}</summary>
                    </details>
                  ) : (
                    <span className="hs-sub">Uddraget er slettet efter 180 dage. Åbn Gmail for teksten.</span>
                  )}
                </>
              ) : (
                <span className="hs-sub">Ingen svar-mail hentet.</span>
              )}
              <span className="hs-why"><b>{BUCKET_LABEL[r.bucket]}:</b> {r.why}</span>
            </div>
            <Actions row={r} me={me} />
          </li>
        ))}
      </ul>
    </div>
  );
}

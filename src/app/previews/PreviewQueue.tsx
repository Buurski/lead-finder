"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "ny" | "researcher" | "bygger" | "preview klar" | "godkendt" | "kladde klar" | "sendt/lukket";
interface PreviewRequest {
  id: string;
  company: string;
  channel: "formular" | "mail";
  email: string;
  status: Status;
  research?: string;
  previewUrl?: string;
  screenshotUrl?: string;
  mailDraft?: string;
  createdAt: string;
}
const statuses: Status[] = ["ny", "researcher", "bygger", "preview klar", "godkendt", "kladde klar", "sendt/lukket"];

export default function PreviewQueue() {
  const [requests, setRequests] = useState<PreviewRequest[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/previews", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRequests((await res.json()).requests ?? []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke hente preview-køen"); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/previews", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) { setRequests(data.requests ?? []); setError(""); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Kunne ikke hente preview-køen");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function approve(item: PreviewRequest) {
    const res = await fetch("/api/previews", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: "godkendt" }),
    });
    if (res.ok) await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div><h1 className="cc-h1">Kinly Preview-kø</h1><p className="cc-dim">Inbound requests — ingen automatisk mail.</p></div>
        <button className="cc-btn" onClick={() => void load()}>Opdatér</button>
      </div>
      {error && <div className="cc-card cc-card-pad" role="alert">Kunne ikke hente køen: {error}</div>}
      {requests.length === 0 && !error && <div className="cc-card cc-card-pad">Ingen inbound previews endnu.</div>}
      {requests.map((item) => (
        <article className="cc-card cc-card-pad" key={item.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{item.company}</h2>
              <div className="cc-dim" style={{ marginTop: 5 }}>{item.channel} · {item.email}</div>
            </div>
            <span className="cc-pill">{item.status}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 16, fontSize: 13 }}>
            <Field label="Research" value={item.research} />
            <Field label="Preview" value={item.previewUrl} link />
            <Field label="Screenshot" value={item.screenshotUrl} link />
            <Field label="Mailkladde" value={item.mailDraft ? "Klar som tekst — ikke sendt" : "—"} />
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select aria-label={`Status for ${item.company}`} value={item.status} onChange={async (e) => {
              await fetch("/api/previews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: e.target.value }) });
              await load();
            }}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            {item.status === "preview klar" && <button className="cc-btn" onClick={() => void approve(item)}>Godkend manuelt</button>}
          </div>
        </article>
      ))}
    </div>
  );
}

function Field({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  return <div><div className="cc-kicker">{label}</div>{value && link ? <a href={value} target="_blank" rel="noreferrer">Åbn link</a> : <div>{value || "—"}</div>}</div>;
}

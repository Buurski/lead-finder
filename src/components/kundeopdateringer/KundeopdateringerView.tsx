"use client";
import { useState } from "react";
import UpdateEditor, { type CustomerUpdateDTO } from "./UpdateEditor";
import "@/components/virksomheder/virksomheder.css";
import "./kundeopdateringer.css";

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

const EMPTY_LABEL: Record<string, string> = {
  kladde: "Ingen kladder endnu. Lav en fra en virksomheds profil (Log arbejde → kunden må se det → Lav kundeopdatering).",
  sendt: "Ingen sendte opdateringer endnu.",
  kasseret: "Ingen kasserede opdateringer.",
};

export default function KundeopdateringerView({ status, updates }: { status: string; updates: CustomerUpdateDTO[] }) {
  const [items, setItems] = useState(updates);
  const [selectedId, setSelectedId] = useState<string | null>(updates[0]?.id ?? null);
  const selected = items.find((u) => u.id === selectedId) ?? null;

  // Ret status væk fra det aktuelle filter (fx "sendt") → forsvinder fra
  // listen med det samme, i stedet for at vente på en fuld genindlæsning.
  function handleChange(next: CustomerUpdateDTO) {
    if (next.status === status) {
      setItems((prev) => prev.map((u) => (u.id === next.id ? next : u)));
      return;
    }
    const remaining = items.filter((u) => u.id !== next.id);
    setItems(remaining);
    setSelectedId((cur) => (cur === next.id ? (remaining[0]?.id ?? null) : cur));
  }

  if (items.length === 0) {
    return (
      <div className="cc-card cc-card-pad">
        <p className="cc-dim" style={{ fontSize: 13 }}>{EMPTY_LABEL[status] ?? "Ingen kundeopdateringer."}</p>
      </div>
    );
  }

  return (
    <div className="ko-grid">
      <div className="cc-card">
        {items.map((u) => (
          <button
            key={u.id}
            type="button"
            className="ko-row"
            aria-current={selectedId === u.id ? "true" : undefined}
            onClick={() => setSelectedId(u.id)}
          >
            <div className="ko-row-top">
              <span className="ko-row-company">{u.company}</span>
              <span className="ko-row-time cc-mono">{relTime(u.at)}</span>
            </div>
            <span className="ko-row-subject">{u.subject}</span>
          </button>
        ))}
      </div>
      <div className="cc-card cc-card-pad">
        {selected ? <UpdateEditor key={selected.id} update={selected} onChange={handleChange} /> : <p className="cc-dim" style={{ fontSize: 13 }}>Vælg en kladde i listen.</p>}
      </div>
    </div>
  );
}

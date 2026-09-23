"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Relation = { id: string; otherId: string; name: string; label: string };
type Hit = { id: string; name: string; city: string; clientNo: number | null };

export default function RelationsPanel({ companyId, relations }: { companyId: string; relations: Relation[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(value: string) {
    setQuery(value);
    if (!value.trim()) { setHits([]); return; }
    const response = await fetch(`/api/virksomheder/search?q=${encodeURIComponent(value)}&exclude=${companyId}`);
    if (response.ok) setHits((await response.json()) as Hit[]);
  }
  async function add(otherId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/virksomheder/${companyId}/relationer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otherId, label }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error || "Kunne ikke tilføje relationen");
      setOpen(false); setQuery(""); setHits([]); setLabel(""); router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/virksomheder/${companyId}/relationer/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Kunne ikke fjerne relationen");
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="cc-card cc-card-pad virk-relations">
    <div className="virk-section-title"><span>Hænger sammen med</span><button className="cc-link" type="button" onClick={() => setOpen(!open)}>+ Tilføj</button></div>
    {relations.length ? <div className="virk-relations-list">{relations.map((r) => <span className="virk-relation" key={r.id}>
      <Link href={`/virksomheder/${r.otherId}`}>{r.name}{r.label ? <small> · {r.label}</small> : null}</Link>
      <button type="button" aria-label={`Fjern relation til ${r.name}`} disabled={busy} onClick={() => remove(r.id)}>×</button>
    </span>)}</div> : <p className="cc-dim">Ingen relationer endnu.</p>}
    {open && <div className="virk-relation-search">
      <input type="search" value={query} onChange={(event) => void search(event.target.value)} placeholder="Søg virksomhed" aria-label="Søg virksomhed" />
      <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Relation, fx samme ejer (valgfrit)" aria-label="Relationens navn" />
      <div className="virk-relation-results">{hits.filter((hit) => !relations.some((r) => r.otherId === hit.id)).map((hit) => <button key={hit.id} type="button" disabled={busy} onClick={() => void add(hit.id)}>{hit.name}{hit.city ? ` · ${hit.city}` : ""}</button>)}</div>
    </div>}
    {error && <p className="kb-err" role="alert">{error}</p>}
  </section>;
}

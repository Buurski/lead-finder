"use client";
// Inspiration: formater og mønstre fra research (W2/W4) + egne links. Det stærkeste står øverst.
import { useState } from "react";
import { EXPLAIN, type RefDto } from "@/lib/hq/marketing-types";
import Info from "./Info";
import { mk } from "./api";
import "./marketing.css";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const GROUPS: { key: string; title: string; help: string }[] = [
  { key: "format", title: "Formater der virker", help: "Et format er en opskrift på hele videoen, ikke kun åbningen. De to første er de stærkeste i vores research." },
  { key: "ai-format", title: "AI-formater til Kinly", help: "Måder at vise AI på i en Kinly-video. Alt det, videoen påstår, skal være sandt den dag, den lægges ud." },
  { key: "moenster", title: "Mønstre fra research", help: "Gentagne mønstre fra videoer, der har klaret sig godt. A er stærkest dokumenteret." },
  { key: "link", title: "Vores egne links", help: "Opslag, I selv har fundet og vil huske." },
];

function Item({ r }: { r: RefDto }) {
  const strong = r.data.strong === true;
  const url = str(r.data.url);
  return (
    <article className="cc-card mk-item">
      <div className="mk-chips">
        {str(r.data.code) && <span className="cc-chip">{str(r.data.code)}</span>}
        {strong && <span className="cc-chip mk-chip-nu">Stærkest</span>}
        {str(r.data.evidence) && <><span className="cc-chip">Belæg {str(r.data.evidence)}</span><Info label="Hvad er belæg?">{EXPLAIN.belaeg}</Info></>}
      </div>
      <h3 className="mk-item-title">{r.title}</h3>
      {r.body && <p className="mk-p mk-small" style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>}
      {str(r.data.examples) && <p className="mk-p mk-small mk-dim">{str(r.data.examples)}</p>}
      {url && <a className="cc-link" style={{ textDecoration: "underline", fontSize: 13 }} href={url} target="_blank" rel="noreferrer noopener">Åbn opslaget</a>}
    </article>
  );
}

export default function Inspiration({ initial }: { initial: RefDto[] }) {
  const [items, setItems] = useState(initial);
  const [f, setF] = useState({ title: "", url: "", why: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await mk<{ item: RefDto }>({ action: "inspirationAdd", item: f });
      setItems((xs) => [...xs, res.item]);
      setF({ title: "", url: "", why: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mk-wrap">
      {GROUPS.map((g) => {
        const list = items.filter((r) => str(r.data.group) === g.key).sort((a, b) => Number(b.data.strong === true) - Number(a.data.strong === true));
        if (list.length === 0 && g.key !== "link") return null;
        return (
          <section key={g.key} className="mk-wrap" aria-labelledby={`mk-i-${g.key}`}>
            <h2 className="mk-h2" id={`mk-i-${g.key}`}>{g.title}<Info label={`Hvad er ${g.title.toLowerCase()}?`}>{g.help}</Info></h2>
            {g.key === "link" && (
              <form className="cc-card mk-card mk-form" onSubmit={submit}>
                <div className="mk-field"><label className="mk-label" htmlFor="i-title">Hvad er det?</label><input id="i-title" className="cc-input mk-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} /></div>
                <div className="mk-field"><label className="mk-label" htmlFor="i-url">Link</label><input id="i-url" type="url" className="cc-input mk-input" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
                <div className="mk-field"><label className="mk-label" htmlFor="i-why">Hvorfor er det godt?</label><textarea id="i-why" className="mk-textarea" rows={2} maxLength={2000} value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} /></div>
                {error && <p className="mk-err" role="alert">{error}</p>}
                <div className="mk-actions"><button type="submit" className="cc-btn cc-btn-accent mk-btn" disabled={busy || !f.title.trim()}>{busy ? "Gemmer…" : "Gem link"}</button></div>
              </form>
            )}
            <div className="mk-list">{list.map((r) => <Item key={r.id} r={r} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

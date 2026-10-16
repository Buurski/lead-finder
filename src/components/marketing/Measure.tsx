"use client";
// Manuel måling: tal læses af fra Instagram/TikTok og skrives ind her. Intet hentes automatisk.
// Et felt der lades tomt betyder "ikke målt" (ikke nul).
import { useState } from "react";
import { measurePayload, savesSharesPer1000 } from "@/lib/hq/marketing-calc";
import type { DraftDto, MeasureDto, RefDto } from "@/lib/hq/marketing-types";
import Info from "./Info";
import { mk, niceDay } from "./api";
import "./marketing.css";

const NUMS: { key: string; label: string; help: string }[] = [
  { key: "views", label: "Visninger", help: "Hvor mange gange videoen er vist. Står i opslagets tal." },
  { key: "saves", label: "Gemt", help: "Hvor mange der har gemt videoen." },
  { key: "shares", label: "Delt", help: "Hvor mange der har sendt videoen videre." },
  { key: "profileVisits", label: "Profilbesøg", help: "Hvor mange der trykkede ind på profilen fra videoen." },
  { key: "newFollowers", label: "Nye følgere", help: "Nye følgere i dagene efter, som kommer fra videoen." },
  { key: "linkClicks", label: "Klik på link", help: "Klik på linket i profilen. Kun hvis I kan se det." },
  { key: "inquiries", label: "Henvendelser", help: "Hvor mange der skrev eller ringede, fordi de så videoen. Skriv det selv ind, når I ved det." },
];
const nf = (n: number | null) => (n == null ? "–" : n.toLocaleString("da-DK", { maximumFractionDigits: 1 }));

export default function Measure({ drafts, tests, initial, today }: { drafts: DraftDto[]; tests: RefDto[]; initial: MeasureDto[]; today: string }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState<Record<string, string>>({ postedOn: today });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const pickable = drafts.filter((d) => d.status === "godkendt" || d.status === "postet");
  const titleOf = (m: MeasureDto) => drafts.find((d) => d.id === m.draftId)?.title ?? (m.postUrl ? "Opslag uden kladde" : "–");
  const testOf = (m: MeasureDto) => tests.find((t) => t.id === m.abId);

  const txt = (n: number | null) => (n == null ? "" : String(n));
  function edit(m: MeasureDto) {
    setEditId(m.id);
    setSaved(false);
    setError("");
    setF({
      postedOn: m.postedOn, draftId: m.draftId ?? "", abId: m.abId ?? "", arm: m.arm, postUrl: m.postUrl, note: m.note,
      views: txt(m.views), saves: txt(m.saves), shares: txt(m.shares), profileVisits: txt(m.profileVisits),
      newFollowers: txt(m.newFollowers), linkClicks: txt(m.linkClicks), inquiries: txt(m.inquiries),
    });
    document.getElementById("m-date")?.scrollIntoView({ block: "center" });
  }
  function cancelEdit() {
    setEditId(null);
    setF({ postedOn: today });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      // Ved ret sendes tomme felter med (tomt = ikke målt); ved ny måling udelades de.
      const measure = editId ? Object.fromEntries(Object.entries({ ...Object.fromEntries(NUMS.map((n) => [n.key, ""])), draftId: "", abId: "", arm: "", postUrl: "", note: "", ...f }).map(([k, v]) => [k, NUMS.some((n) => n.key === k) && v !== "" ? Number(v) : v])) : measurePayload(f);
      if (editId) {
        const res = await mk<{ measure: MeasureDto }>({ action: "measureUpdate", id: editId, measure });
        setRows((r) => r.map((x) => (x.id === editId ? res.measure : x)));
        setEditId(null);
        setF({ postedOn: f.postedOn });
      } else {
        const res = await mk<{ measure: MeasureDto }>({ action: "measureAdd", measure });
        setRows((r) => [res.measure, ...r]);
        setF({ postedOn: f.postedOn });
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mk-wrap">
      <form className="cc-card mk-card mk-form" onSubmit={submit}>
        <h2 className="mk-h2">
          {editId ? "Ret målingen" : "Læg en måling ind"}
          <Info label="Hvordan måler jeg?">Åbn videoen i Instagram eller TikTok, tryk på “Indsigt” og skriv tallene af. Lad et felt stå tomt, hvis I ikke kan se tallet. Tomt er ikke det samme som nul.</Info>
        </h2>
        <div className="mk-grid2">
          <div className="mk-field"><label className="mk-label" htmlFor="m-date">Dato for opslaget</label><input id="m-date" type="date" className="cc-input mk-input" value={f.postedOn ?? ""} onChange={(e) => set("postedOn", e.target.value)} required /></div>
          <div className="mk-field">
            <label className="mk-label" htmlFor="m-draft">Hvilken video?</label>
            <select id="m-draft" className="cc-input mk-select" value={f.draftId ?? ""} onChange={(e) => setF((x) => ({ ...x, draftId: e.target.value, postUrl: x.postUrl || drafts.find((d) => d.id === e.target.value)?.postUrl || "" }))}>
              <option value="">Vælg (valgfrit)</option>
              {pickable.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div className="mk-field">
            <label className="mk-label" htmlFor="m-ab">Hører den til en test?<Info label="Hvad er en test?">Vælg kun en test, hvis opslaget er en del af en A/B-test. Så tæller det med i dommen.</Info></label>
            <select id="m-ab" className="cc-input mk-select" value={f.abId ?? ""} onChange={(e) => setF((x) => ({ ...x, abId: e.target.value, arm: e.target.value ? x.arm ?? "" : "" }))}>
              <option value="">Nej</option>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          {f.abId && (
            <div className="mk-field">
              <label className="mk-label" htmlFor="m-arm">Udgave</label>
              <select id="m-arm" className="cc-input mk-select" value={f.arm ?? ""} onChange={(e) => set("arm", e.target.value)} required>
                <option value="">Vælg A eller B</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </div>
          )}
          <div className="mk-field"><label className="mk-label" htmlFor="m-url">Link til opslaget</label><input id="m-url" type="url" className="cc-input mk-input" placeholder="https://…" value={f.postUrl ?? ""} onChange={(e) => set("postUrl", e.target.value)} /></div>
        </div>
        <div className="mk-grid2">
          {NUMS.map((n) => (
            <div key={n.key} className="mk-field">
              <label className="mk-label" htmlFor={`m-${n.key}`}>{n.label}<Info label={`Hvad er ${n.label.toLowerCase()}?`}>{n.help}</Info></label>
              <input id={`m-${n.key}`} type="number" min={0} step={1} inputMode="numeric" className="cc-input mk-input" value={f[n.key] ?? ""} onChange={(e) => set(n.key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="mk-field"><label className="mk-label" htmlFor="m-note">Note</label><textarea id="m-note" className="mk-textarea" rows={2} maxLength={1000} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
        {error && <p className="mk-err" role="alert">{error}</p>}
        {saved && <p className="mk-p mk-small" role="status">Målingen er gemt.</p>}
        {editId && <p className="mk-p mk-small">Du retter en måling, du har gemt før. Tomme tal betyder “ikke målt”.</p>}
        <div className="mk-actions"><button type="submit" className="cc-btn cc-btn-accent mk-btn" disabled={busy || !f.postedOn}>{busy ? "Gemmer…" : editId ? "Gem rettelse" : "Gem måling"}</button>{editId && <button type="button" className="cc-btn mk-btn" onClick={cancelEdit} disabled={busy}>Annullér</button>}</div>
      </form>

      <section className="cc-card mk-card" aria-labelledby="mk-mtab">
        <h2 className="mk-h2" id="mk-mtab">
          Målinger
          <Info label="Hvad er gem+del pr. 1000?">Gemt plus delt, regnet pr. 1000 visninger. Så kan en lille og en stor video sammenlignes ligeligt. Det er det tal, A/B-testene dømmer på.</Info>
        </h2>
        {rows.length === 0 ? (
          <div className="mk-note"><strong>Ingen målinger endnu.</strong><span>Når den første video er lagt ud, så skriv tallene ind ovenfor.</span></div>
        ) : (
          <div className="mk-scroll" tabIndex={0} role="region" aria-label="Målinger (kan rulles sidelæns)">
            <table className="mk-table">
              <thead><tr><th>Dato</th><th>Video</th><th>Test</th><th className="num">Visninger</th><th className="num">Gemt</th><th className="num">Delt</th><th className="num">Gem+del pr. 1000</th><th className="num">Profilbesøg</th><th className="num">Henvendelser</th><th><span className="mk-sr">Ret</span></th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>{niceDay(m.postedOn)}</td>
                    <td>{m.postUrl ? <a className="cc-link" style={{ textDecoration: "underline" }} href={m.postUrl} target="_blank" rel="noreferrer noopener">{titleOf(m)}</a> : titleOf(m)}</td>
                    <td>{testOf(m) ? `${testOf(m)!.title} (${m.arm})` : "–"}</td>
                    <td className="num">{nf(m.views)}</td><td className="num">{nf(m.saves)}</td><td className="num">{nf(m.shares)}</td>
                    <td className="num">{nf(savesSharesPer1000(m))}</td>
                    <td className="num">{nf(m.profileVisits)}</td><td className="num">{nf(m.inquiries)}</td>
                    <td><button type="button" className="cc-btn mk-btn-sm" onClick={() => edit(m)} aria-label={`Ret målingen fra ${niceDay(m.postedOn)}`}>Ret</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";
// "Importér Meta-leads": vælg CSV'en fra Leads Center, så bliver hver række en henvendelse
// med kilde = Meta + annoncenavn og en opgave "Ring til Meta-lead". Intet sendes.
import { useRef, useState } from "react";

type Result = {
  created: { line: number; name: string; companyId: string }[];
  duplicates: { line: number; name: string; reason: string }[];
  skipped: { line: number; reason: string }[];
};

/** Leads Center/Ads Manager eksporterer nogle gange som UTF-16 — afkod efter BOM. */
async function readText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

export default function MetaImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/previews/meta-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: await readText(file) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data as Result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <strong>Meta-leads</strong>
          <div className="cc-kicker" style={{ textTransform: "none", letterSpacing: 0 }}>Download CSV i Leads Center, og vælg filen her. Dubletter springes over, og intet sendes.</div>
        </div>
        <input ref={input} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <button className="cc-btn cc-btn-accent" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Importerer…" : "Importér Meta-leads (CSV)"}</button>
      </div>
      {error && <div role="alert" style={{ color: "var(--red)" }}>{error}</div>}
      {result && (
        <div role="status" style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <div><strong>{result.created.length} nye</strong> · {result.duplicates.length} dubletter · {result.skipped.length} sprunget over</div>
          {result.created.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.created.map((c) => <li key={c.line}><a className="cc-link" href={`/virksomheder/${c.companyId}`}>{c.name}</a> · opgave: ring i dag</li>)}
            </ul>
          )}
          {[...result.duplicates, ...result.skipped].length > 0 && (
            <ul className="cc-kicker" style={{ margin: 0, paddingLeft: 18, textTransform: "none", letterSpacing: 0 }}>
              {result.duplicates.map((d) => <li key={`d${d.line}`}>Linje {d.line} ({d.name}): {d.reason}</li>)}
              {result.skipped.map((s) => <li key={`s${s.line}`}>Linje {s.line}: {s.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

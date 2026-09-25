// "Bliver fundet på Google" — Search Console for én kunde. Ét tal-sæt (28 dage) med
// ændring siden forrige måling, klik pr. dag i 90 dage med markering af vores
// arbejde, og top-søgninger. Kun aggregater fra GSC; ingen persondata.
export interface GscView {
  periodStart: string;
  periodEnd: string;
  takenAt: string;
  clicks: number;
  impressions: number;
  position: number | null;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
  daily: { date: string; clicks: number; impressions: number }[];
  previous: { clicks: number; impressions: number; position: number | null } | null;
}
export interface WorkMark { date: string; text: string }

const num = (n: number) => n.toLocaleString("da-DK");
const dag = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

function Delta({ now, before, lowerIsBetter = false }: { now: number | null; before: number | null | undefined; lowerIsBetter?: boolean }) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="cc-dim">uændret</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return <span style={{ color: good ? "var(--green)" : "var(--red)" }}>{d > 0 ? "+" : "−"}{num(Math.abs(d))} siden sidst</span>;
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span className="cc-dim" style={{ fontSize: 11.5 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ fontSize: 11.5 }}>{children}</span>
    </div>
  );
}

function ClicksChart({ daily, marks }: { daily: GscView["daily"]; marks: WorkMark[] }) {
  // Linjen strækkes til bredden (non-scaling stroke); tekst og markeringer er HTML,
  // så de har samme størrelse på mobil og desktop.
  const H = 100;
  const max = Math.max(1, ...daily.map((d) => d.clicks));
  const pct = (i: number) => (daily.length === 1 ? 50 : (i / (daily.length - 1)) * 100);
  const y = (v: number) => H - (v / max) * (H - 6) - 1;
  const idx = new Map(daily.map((d, i) => [d.date, i]));
  const inRange = marks.filter((m) => idx.has(m.date));
  return (
    <figure style={{ margin: 0, display: "grid", gap: 4 }}>
      <div style={{ position: "relative", height: H }}>
        <span className="cc-dim" style={{ position: "absolute", top: -2, left: 0, fontSize: 11 }}>{num(max)} klik</span>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
          role="img" aria-label={`Klik pr. dag, ${dag(daily[0].date)}–${dag(daily[daily.length - 1].date)}. Højeste dag: ${num(max)} klik.`}>
          <line x1={0} x2={100} y1={H} y2={H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {inRange.map((m, k) => (
            <line key={k} x1={pct(idx.get(m.date)!)} x2={pct(idx.get(m.date)!)} y1={0} y2={H} stroke="var(--border-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
          <polyline points={daily.map((d, i) => `${pct(i)},${y(d.clicks)}`).join(" ")} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {daily.map((d, i) => (
          <span key={d.date} title={`${dag(d.date)}: ${num(d.clicks)} klik, ${num(d.impressions)} visninger`}
            style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(i) - 50 / daily.length}%`, width: `${100 / daily.length}%` }} />
        ))}
        {inRange.map((m, k) => (
          <span key={k} title={`${dag(m.date)}: ${m.text}`} aria-label={`${dag(m.date)}: ${m.text}`}
            style={{ position: "absolute", bottom: -5, left: `calc(${pct(idx.get(m.date)!)}% - 5px)`, width: 10, height: 10, borderRadius: 99, background: "var(--accent)", border: "1.5px solid var(--text)" }} />
        ))}
      </div>
      <div className="cc-dim" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
        <span>{dag(daily[0].date)}</span><span>{dag(daily[daily.length - 1].date)}</span>
      </div>
      {inRange.length > 0 && (
        <figcaption className="cc-dim" style={{ fontSize: 11.5 }}>
          {inRange.map((m) => `${dag(m.date)}: ${m.text}`).join(" · ")}
        </figcaption>
      )}
    </figure>
  );
}

export default function GscCard({ gsc, marks }: { gsc: GscView | null; marks: WorkMark[] }) {
  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 12 }}>
      <div className="virk-section-title"><span>Bliver fundet på Google</span></div>
      {!gsc ? (
        <p className="cc-dim" style={{ margin: 0, fontSize: 12.5 }}>
          Ingen Search Console-tal endnu. Tilføj HQ&apos;s service-account som &quot;Begrænset bruger&quot; på kundens ejendom i Search Console (mailen står under Indstillinger); tallene hentes hver mandag.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            <Stat label="Klik (28 dage)" value={num(gsc.clicks)}><Delta now={gsc.clicks} before={gsc.previous?.clicks} /></Stat>
            <Stat label="Visninger (28 dage)" value={num(gsc.impressions)}><Delta now={gsc.impressions} before={gsc.previous?.impressions} /></Stat>
            <Stat label="Gns. placering" value={gsc.position == null ? "–" : String(gsc.position).replace(".", ",")}><Delta now={gsc.position} before={gsc.previous?.position} lowerIsBetter /></Stat>
          </div>
          {gsc.daily.some((d) => d.clicks > 0) ? (
            <div style={{ display: "grid", gap: 4 }}>
              <span className="cc-dim" style={{ fontSize: 12 }}>Klik pr. dag, 90 dage{marks.length ? " · prikker = vores arbejde" : ""}</span>
              <ClicksChart daily={gsc.daily} marks={marks} />
            </div>
          ) : (
            <p className="cc-dim" style={{ margin: 0, fontSize: 12.5 }}>Ingen klik i de seneste 90 dage — for lidt data til en graf.</p>
          )}
          {gsc.topQueries.length > 0 && (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead>
                <tr className="cc-dim" style={{ textAlign: "left" }}>
                  <th scope="col" style={{ fontWeight: 500, padding: "4px 0" }}>Top-søgninger</th>
                  <th scope="col" style={{ fontWeight: 500, textAlign: "right" }}>Klik</th>
                  <th scope="col" style={{ fontWeight: 500, textAlign: "right" }}>Placering</th>
                </tr>
              </thead>
              <tbody>
                {gsc.topQueries.map((q) => (
                  <tr key={q.query} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "5px 0" }}>{q.query}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(q.clicks)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{String(q.position).replace(".", ",")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <span className="cc-dim" style={{ fontSize: 11.5 }}>Search Console · {dag(gsc.periodStart)}–{dag(gsc.periodEnd)} · målt {dag(gsc.takenAt)}</span>
        </>
      )}
    </section>
  );
}

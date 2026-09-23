type Point = { takenAt: string; performance: number | null; seo: number | null; accessibility: number | null; onpage: number | null };

const series = [
  { key: "performance", label: "Hastighed", color: "#111111" },
  { key: "seo", label: "SEO", color: "#5c8d16" },
  { key: "accessibility", label: "Tilgængelighed", color: "#4777a6" },
  { key: "onpage", label: "On-page", color: "#9b62a2" },
] as const;

export default function SeoChart({ points, compact = false }: { points: Point[]; compact?: boolean }) {
  const data = [...points].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (!data.length) return <p className="cc-dim" style={{ margin: 0, fontSize: 13 }}>Første måling kommer mandag.</p>;
  const width = 600;
  const height = compact ? 68 : 190;
  const left = compact ? 2 : 28;
  const right = width - 8;
  const top = 10;
  const bottom = height - (compact ? 8 : 25);
  const x = (i: number) => left + (data.length === 1 ? (right - left) / 2 : i * (right - left) / (data.length - 1));
  const y = (v: number) => bottom - v * (bottom - top) / 100;
  const visible = compact ? series.slice(0, 1) : series;
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="SEO-scorer over tid" style={{ width: "100%", height: compact ? 68 : "auto", display: "block" }}>
        {!compact && [0, 50, 100].map((n) => <g key={n}><line x1={left} x2={right} y1={y(n)} y2={y(n)} stroke="#e2e5df" /><text x={0} y={y(n) + 4} fontSize="11" fill="#667067">{n}</text></g>)}
        {visible.map((s) => {
          const segments: string[][] = [];
          data.forEach((point, i) => {
            const value = point[s.key];
            if (value == null) return;
            if (i === 0 || data[i - 1][s.key] == null) segments.push([]);
            segments.at(-1)!.push(`${x(i)},${y(value)}`);
          });
          return <g key={s.key}>{segments.map((segment, i) => segment.length > 1
            ? <polyline key={i} points={segment.join(" ")} fill="none" stroke={s.color} strokeWidth={compact ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
            : <circle key={i} cx={Number(segment[0]?.split(",")[0])} cy={Number(segment[0]?.split(",")[1])} r="3" fill={s.color} />)}</g>;
        })}
        {!compact && [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, arr) => arr.indexOf(v) === i).map((i) => <text key={i} x={x(i)} y={height - 3} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="11" fill="#667067">{new Date(data[i].takenAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</text>)}
      </svg>
      {!compact && <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5 }}>
        {series.map((s) => <span key={s.key} style={{ color: "var(--text-muted)" }}><span style={{ display: "inline-block", width: 12, height: 3, background: s.color, verticalAlign: "middle", marginRight: 5 }} />{s.label}</span>)}
      </div>}
    </div>
  );
}

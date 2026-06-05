import type { DailySent } from "@/lib/deck";

// A calm 14-day usage sparkline: mails-per-day as a sage area chart with an
// accent stroke, and reply-days marked with small accent dots overlaid. Pure
// SVG (viewBox + width:100%) so it scales to any width; 80px tall on mobile.
export default function UsageSparkline({ data, height = 96 }: { data: DailySent[]; height?: number }) {
  const W = 320;
  const H = height;
  const padY = 10;
  const n = data.length;

  const totalMails = data.reduce((a, d) => a + d.count, 0);
  const totalReplies = data.reduce((a, d) => a + d.replies, 0);

  if (n === 0 || totalMails === 0) {
    return (
      <section className="cc-card cc-card-pad" aria-label="Aktivitet sidste 14 dage">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>Aktivitet · 14 dage</span>
          <span className="cc-dim" style={{ fontSize: 12 }}>ingen mails sendt endnu</span>
        </div>
        <div style={{ height: 40, borderRadius: 8, background: "var(--bg-3)" }} />
      </section>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.count));
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - padY - (v / max) * (H - 2 * padY);

  const linePts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`);
  const linePath = `M ${linePts.join(" L ")}`;
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;

  return (
    <section className="cc-card cc-card-pad" aria-label="Aktivitet sidste 14 dage">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Aktivitet · 14 dage</span>
        <span className="cc-dim" style={{ fontSize: 12 }}>
          {totalMails} mails · <span style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{totalReplies} svar</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${totalMails} mails og ${totalReplies} svar over 14 dage`}
        style={{ display: "block" }}
      >
        <path d={areaPath} fill="var(--accent)" fillOpacity={0.18} />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) =>
          d.replies > 0 ? (
            <circle key={i} cx={x(i)} cy={y(d.count)} r={Math.min(5, 2.5 + d.replies)} fill="var(--accent-ink)" stroke="var(--surface)" strokeWidth={1.5} />
          ) : null,
        )}
      </svg>
    </section>
  );
}

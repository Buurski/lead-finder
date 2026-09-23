import Link from "next/link";

export interface KpiItem {
  label: string;
  value: number;
  sub: string;
  href: string;
  hero?: boolean;
}

// Hele kortet er et link (Lucas' krav) — klik hvor som helst i kortet
// tager dig til den relevante kø. Tallet er statisk (diskret CRM-bevægelse,
// 22/9): ingen optælling, kun den korte hover-fade fra hq.css.
export default function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="hq-kpi-row">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`hq-kpi-card cc-focus${it.hero ? " hero" : ""}`}>
          <span className="hq-kpi-label">{it.label}</span>
          <span className="hq-kpi-num tnum">{it.value.toLocaleString("da-DK")}</span>
          <span className="hq-kpi-sub">
            <span className="hq-kpi-dot" aria-hidden="true" />
            {it.sub}
          </span>
        </Link>
      ))}
    </div>
  );
}

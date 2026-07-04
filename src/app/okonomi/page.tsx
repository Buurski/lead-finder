import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { SUBSCRIPTIONS, computeSplit, monthlyDkk, type Share, type Subscription } from "@/lib/subscriptions";

export const metadata = { title: "Økonomi · Command Center" };

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr`;

const SHARE_META: Record<Share, { label: string; color: string; dim: string }> = {
  lucas: { label: "Lucas", color: "var(--blue)", dim: "var(--blue-dim)" },
  charlie: { label: "Charlie", color: "var(--amber)", dim: "var(--amber-dim)" },
  selskab: { label: "Selskab", color: "var(--accent)", dim: "var(--accent-soft)" },
};

function ShareChip({ share }: { share: Share }) {
  const m = SHARE_META[share];
  return (
    <span
      className="cc-chip"
      style={{ background: m.dim, color: m.color, border: "none", whiteSpace: "nowrap" }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, display: "inline-block", marginRight: 5 }} />
      {share === "selskab" ? "Selskab · 50/50" : m.label}
    </span>
  );
}

function SubRow({ s, max }: { s: Subscription; max: number }) {
  const m = monthlyDkk(s);
  const meta = SHARE_META[s.share];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 14px", padding: "12px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 34, height: 34, borderRadius: 10, background: meta.dim, color: meta.color,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, flexShrink: 0,
          }}
        >
          {s.name[0]}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            {s.name}
            <span className="cc-dim" style={{ fontWeight: 400, fontSize: 12 }}>
              {s.amount} {s.currency}/{s.period}{s.estimate ? " · ~estimat" : ""}
            </span>
          </div>
          {s.note && <div className="cc-dim" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</div>}
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShareChip share={s.share} />
          <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", minWidth: 74 }}>{kr(m)}<span className="cc-dim" style={{ fontWeight: 400, fontSize: 11 }}>/md</span></span>
        </div>
        <div style={{ width: 150, height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
          <div style={{ width: `${Math.max(4, (m / max) * 100)}%`, height: "100%", borderRadius: 3, background: meta.color }} />
        </div>
      </div>
    </div>
  );
}

function PersonCard({
  name, color, dim, own, half, ownLabel,
}: { name: string; color: string; dim: string; own: number; half: number; ownLabel: string }) {
  const total = own + half;
  const ownPct = total > 0 ? (own / total) * 100 : 0;
  return (
    <section className="cc-card cc-card-pad" style={{ flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: dim, color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {name[0]}
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>betaler pr. måned</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{kr(total)}</div>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--border)", marginBottom: 8 }} aria-hidden>
        <div style={{ width: `${ownPct}%`, background: color }} />
        <div style={{ width: `${100 - ownPct}%`, background: "var(--accent)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span><span style={{ color }}>●</span> {ownLabel}: <strong>{kr(own)}</strong></span>
        <span><span style={{ color: "var(--accent)" }}>●</span> ½ selskab: <strong>{kr(half)}</strong></span>
      </div>
    </section>
  );
}

export default function OkonomiPage() {
  const split = computeSplit();
  const subs = [...SUBSCRIPTIONS].sort((a, b) => monthlyDkk(b) - monthlyDkk(a));
  const max = monthlyDkk(subs[0]);
  const segs = (["lucas", "charlie", "selskab"] as Share[]).map((s) => ({
    share: s,
    value: s === "lucas" ? split.lucas : s === "charlie" ? split.charlie : split.selskab,
  }));

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Wallet"
        title="Økonomi"
        subtitle="Faste abonnementer, verificeret mod kvitteringer. Redigér i src/lib/subscriptions.ts."
      />

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        {/* Total + fordelingsbar */}
        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{kr(split.total)}</span>
            <span className="cc-dim" style={{ fontSize: 13 }}>pr. måned i alt · {kr(split.total * 12)} pr. år</span>
          </div>
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "var(--border)" }} aria-hidden>
            {segs.map((seg) => (
              <div key={seg.share} style={{ width: `${(seg.value / split.total) * 100}%`, background: SHARE_META[seg.share].color }} title={`${SHARE_META[seg.share].label}: ${kr(seg.value)}`} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", fontSize: 12.5 }}>
            {segs.map((seg) => (
              <span key={seg.share}>
                <span style={{ color: SHARE_META[seg.share].color }}>●</span>{" "}
                {SHARE_META[seg.share].label}
                {seg.share === "selskab" ? " (deles 50/50)" : ""}: <strong>{kr(seg.value)}</strong>
                <span className="cc-dim"> · {Math.round((seg.value / split.total) * 100)}%</span>
              </span>
            ))}
          </div>
        </section>

        {/* Person-kort */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <PersonCard name="Lucas" color="var(--blue)" dim="var(--blue-dim)" own={split.lucas} half={split.selskab / 2} ownLabel="egne" />
          <PersonCard name="Charlie" color="var(--amber)" dim="var(--amber-dim)" own={split.charlie} half={split.selskab / 2} ownLabel="egne" />
        </div>

        {/* Tjenester */}
        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
            <Icon name="Receipt" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Abonnementer</h2>
            <span className="cc-chip" style={{ marginLeft: "auto" }}>{subs.length} aktive</span>
          </div>
          {subs.map((s) => <SubRow key={s.name} s={s} max={max} />)}
          <p className="cc-dim" style={{ fontSize: 12, marginTop: 12 }}>
            Selskabsposter splittes 50/50 til selskabet selv betaler. Kurser: 1 USD ≈ 6,90 kr · 1 EUR ≈ 7,46 kr.
            Kie.ai er uregelmæssige kredit-køb (~snit). Claude Max-kvitteringer ligger i personlige indbakker.
          </p>
        </section>
      </div>
    </div>
  );
}

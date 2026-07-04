import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { SUBSCRIPTIONS, computeSplit, monthlyDkk, personalFor, type Share, type Subscription } from "@/lib/subscriptions";
import PaymentsClient from "./PaymentsClient";

export const metadata = { title: "Økonomi · Command Center" };
export const dynamic = "force-dynamic";

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr`;

const SHARE_META: Record<Share, { label: string; color: string; dim: string }> = {
  lucas: { label: "Lucas", color: "var(--blue)", dim: "var(--blue-dim)" },
  charlie: { label: "Charlie", color: "var(--amber)", dim: "var(--amber-dim)" },
  selskab: { label: "Selskab", color: "var(--accent)", dim: "var(--accent-soft)" },
};

function ShareChip({ s }: { s: Subscription }) {
  const m = SHARE_META[s.share];
  return (
    <span className="cc-chip" style={{ background: m.dim, color: m.color, border: "none", whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, display: "inline-block", marginRight: 5 }} />
      {s.personal ? `${m.label} · egen` : s.share === "selskab" ? "Selskab · 50/50" : m.label}
    </span>
  );
}

function SubRow({ s, max }: { s: Subscription; max: number }) {
  const m = monthlyDkk(s);
  const meta = SHARE_META[s.share];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 14px", padding: "12px 0", borderTop: "1px solid var(--border)", opacity: s.personal ? 0.75 : 1 }}>
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
          <ShareChip s={s} />
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
  name, who, color, dim, own, half,
}: { name: string; who: "lucas" | "charlie"; color: string; dim: string; own: number; half: number }) {
  const total = own + half;
  const personal = personalFor(who);
  return (
    <section className="cc-card cc-card-pad" style={{ flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: dim, color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {name[0]}
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>skylder til det fælles pr. md</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{kr(total)}</div>
      </div>
      <div style={{ fontSize: 12.5, display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="cc-dim">½ selskabsposter</span>
          <strong>{kr(half)}</strong>
        </div>
        {own > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="cc-dim">egne delte poster</span>
            <strong>{kr(own)}</strong>
          </div>
        )}
        {personal.map((p) => (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px dashed var(--border)" }}>
            <span className="cc-dim">{p.name} <span style={{ fontSize: 11 }}>(egen plan — splittes ikke)</span></span>
            <span className="cc-dim">{kr(monthlyDkk(p))}/md</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OkonomiPage() {
  const split = computeSplit();
  const shared = SUBSCRIPTIONS.filter((s) => !s.personal).sort((a, b) => monthlyDkk(b) - monthlyDkk(a));
  const personal = SUBSCRIPTIONS.filter((s) => s.personal);
  const max = monthlyDkk(shared[0]);

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Wallet"
        title="Økonomi"
        subtitle="Fælles abonnementer, split og overførsler. Redigér poster i src/lib/subscriptions.ts."
      />

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        {/* Fælles total */}
        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{kr(split.total)}</span>
            <span className="cc-dim" style={{ fontSize: 13 }}>fælles pr. måned · {kr(split.total * 12)} pr. år · {kr(split.total / 2)} pr. person</span>
          </div>
          <p className="cc-dim" style={{ fontSize: 12.5 }}>
            Alt fælles deles 50/50 til selskabet selv betaler. Egne Claude Max-planer er holdt udenfor.
          </p>
        </section>

        {/* Person-kort */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <PersonCard name="Lucas" who="lucas" color="var(--blue)" dim="var(--blue-dim)" own={split.lucas} half={split.selskab / 2} />
          <PersonCard name="Charlie" who="charlie" color="var(--amber)" dim="var(--amber-dim)" own={split.charlie} half={split.selskab / 2} />
        </div>

        {/* Overførsler */}
        <PaymentsClient owedPerMonth={split.owedCharlie} />

        {/* Tjenester */}
        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
            <Icon name="Receipt" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Fælles abonnementer</h2>
            <span className="cc-chip" style={{ marginLeft: "auto" }}>{shared.length} aktive</span>
          </div>
          {shared.map((s) => <SubRow key={s.name} s={s} max={max} />)}

          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "18px 0 4px" }}>
            <Icon name="CircleDollarSign" style={{ width: 17, height: 17, color: "var(--text-dim)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--text-muted)" }}>Egne planer (udenfor splittet)</h2>
          </div>
          {personal.map((s) => <SubRow key={s.name} s={s} max={max} />)}

          <p className="cc-dim" style={{ fontSize: 12, marginTop: 12 }}>
            Beløb verificeret mod kvitteringer 4/7. Kurser: 1 USD ≈ 6,90 kr · 1 EUR ≈ 7,46 kr.
            Kie.ai er holdt ude (uregelmæssige kredit-køb — tages op hvis det bliver fast).
          </p>
        </section>
      </div>
    </div>
  );
}

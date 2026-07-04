import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { SUBSCRIPTIONS, computeSplit, monthlyDkk, type Share } from "@/lib/subscriptions";

export const metadata = { title: "Økonomi · Command Center" };

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr`;

const SHARE_LABEL: Record<Share, string> = {
  lucas: "Lucas",
  charlie: "Charlie",
  selskab: "Selskab (50/50)",
};

export default function OkonomiPage() {
  const split = computeSplit();

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Wallet"
        title="Økonomi"
        subtitle="Faste abonnementer og hvem der bærer dem. Redigér i src/lib/subscriptions.ts."
      />

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <Icon name="Receipt" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Abonnementer</h2>
            <span className="cc-chip" style={{ marginLeft: "auto" }}>{kr(split.total)}/md i alt</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="cc-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-dim)" }}>
                  <th style={{ padding: "6px 8px" }}>Tjeneste</th>
                  <th style={{ padding: "6px 8px" }}>Pris</th>
                  <th style={{ padding: "6px 8px" }}>Pr. md (DKK)</th>
                  <th style={{ padding: "6px 8px" }}>Deles af</th>
                  <th style={{ padding: "6px 8px" }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {SUBSCRIPTIONS.map((s) => (
                  <tr key={s.name} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{s.name}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {s.amount} {s.currency}/{s.period}
                      {s.estimate && <span className="cc-dim" title="Ikke bekræftet mod kvittering"> ~est.</span>}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{kr(monthlyDkk(s))}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span className="cc-chip">{SHARE_LABEL[s.share]}</span>
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--text-dim)" }}>{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <Icon name="Scale" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Split pr. måned</h2>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, fontSize: 13 }}>
            <div>
              <div className="cc-dim">Lucas (egne + ½ selskab)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{kr(split.owedLucas)}</div>
              <div className="cc-dim">heraf egne: {kr(split.lucas)}</div>
            </div>
            <div>
              <div className="cc-dim">Charlie (egne + ½ selskab)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{kr(split.owedCharlie)}</div>
              <div className="cc-dim">heraf egne: {kr(split.charlie)}</div>
            </div>
            <div>
              <div className="cc-dim">Selskabsposter i alt</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{kr(split.selskab)}</div>
              <div className="cc-dim">splittes 50/50 til selskabet selv betaler</div>
            </div>
          </div>
          <p className="cc-dim" style={{ fontSize: 12, marginTop: 12 }}>
            ~est. = beløb ikke bekræftet mod kvittering — ret i src/lib/subscriptions.ts.
            Kurser: 1 USD ≈ 6,90 kr · 1 EUR ≈ 7,46 kr.
          </p>
        </section>
      </div>
    </div>
  );
}

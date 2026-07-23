import PageHeader from "@/components/shell/PageHeader";
import { hermesHealth } from "@/lib/hermes";

export const metadata = { title: "Hermes · AgenticOS" };
export const dynamic = "force-dynamic";

// Holdes i sync med cloudflare-rotation. Samme fallback som tidligere.
const FALLBACK_WEBUI_URL = "https://insight-charger-son-potatoes.trycloudflare.com";

export default async function HermesPage() {
  const h = await hermesHealth().catch(() => ({
    configured: false,
    reachable: false,
    gatewayRunning: false,
    cronJobs: 0,
    shimStatus: 0,
  }));

  const webuiUrl = (process.env.HERMES_WEBUI_URL ?? FALLBACK_WEBUI_URL).replace(/\/+$/, "");

  const cards = [
    { name: "Hermes-api", ok: h.reachable, detail: h.reachable ? "svarer" : (h.configured ? `fejl ${h.shimStatus}` : "ikke konfigureret") },
    { name: "Gateway", ok: h.gatewayRunning, detail: h.gatewayRunning ? "kører" : "stoppet" },
    { name: "Cron-motor", ok: h.cronJobs > 0, detail: `${h.cronJobs} jobs planlagt` },
    { name: "Tunnel-rotation", ok: true, detail: "cron hver 2. dag kl 04:00" },
  ];

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Hermes"
        subtitle="Jeres 24/7 medstifter på VPS'en. Kort dansk, ærlig, sender aldrig noget selv."
        action={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--text-2)",
              background: "var(--bg-2)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: h.reachable ? "var(--accent)" : "var(--red)",
                display: "inline-block",
              }}
            />
            {h.reachable ? "Online" : "Offline"}
          </span>
        }
      />

      <div style={{ display: "grid", gap: 18 }}>
        <section className="cc-card cc-card-pad">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            Forbindelser
          </h2>
          <div style={{ display: "grid", gap: 0 }}>
            {cards.map((c, i) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 0",
                  borderTop: i ? "1px solid var(--border)" : "none",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: c.ok ? "var(--accent)" : "var(--border-strong)",
                  }}
                />
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                <span className="cc-dim" style={{ fontSize: 12.5, marginLeft: "auto", textAlign: "right" }}>
                  {c.detail}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="cc-card"
          style={{
            padding: 0,
            overflow: "hidden",
            border: "none",
            background:
              "radial-gradient(120% 120% at 50% 0%, rgba(232,160,48,0.18) 0%, rgba(233,69,96,0.10) 35%, var(--bg) 70%)",
          }}
        >
          <div
            style={{
              padding: "40px 24px 36px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 22,
              textAlign: "center",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 88,
                height: 88,
                borderRadius: 22,
                background: "linear-gradient(145deg,#e8a030,#e94560)",
                boxShadow: "0 12px 32px rgba(233,69,96,0.25), inset 0 1px 0 rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 44,
                letterSpacing: -1,
              }}
            >
              K
            </div>

            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
                Hermes WebUI
              </h2>
              <p className="cc-dim" style={{ margin: 0, fontSize: 13.5, maxWidth: 460, lineHeight: 1.55 }}>
                Chat med Hermes direkte. Åbner i en ny fane — login med{" "}
                <code style={{ background: "var(--bg-2)", padding: "1px 6px", borderRadius: 4 }}>Kinly1234</code>.
              </p>
            </div>

            <a
              href={webuiUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 22px",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                color: "#1a1a2e",
                background: "linear-gradient(145deg,#e8a030,#e94560)",
                boxShadow: "0 6px 18px rgba(233,69,96,0.30)",
              }}
            >
              Åbn Hermes nu ↗
            </a>

            <span className="cc-dim" style={{ fontSize: 11.5, marginTop: 2, fontFamily: "ui-monospace,monospace" }}>
              {webuiUrl.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </section>

        <section className="cc-card cc-card-pad">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            Hvad Hermes gør
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Kører 24/7 på VPS&apos;en (Contabo) — Telegram-bot, cron-jobs, agent-loop.</li>
            <li>Drømmer hver nat kl 02:00 — analyserer leads, svar og daily-noter.</li>
            <li>Auto-rotérer cloudflare-tunnelen hver 2. dag kl 04:00 (forebyggende).</li>
            <li>Drafter mails, svar og opslag — <strong>sender aldrig selv</strong> uden Lucas&apos; eller Charlies OK.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

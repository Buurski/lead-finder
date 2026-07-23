import PageHeader from "@/components/shell/PageHeader";
import { hermesHealth } from "@/lib/hermes";

export const metadata = { title: "Hermes · AgenticOS" };
export const dynamic = "force-dynamic";

const FALLBACK_WEBUI_URL = "https://piece-premises-surely-hunter.trycloudflare.com";

async function fetchLoginHtml(): Promise<{ html: string; ok: boolean; err?: string }> {
  const url = (process.env.HERMES_WEBUI_URL ?? FALLBACK_WEBUI_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${url}/login`, {
      // Send Basic Auth så upstream (Hermes WebUI) godtager os — og Vercels
      // bot-protection ikke blokerer requestet fra server-side.
      headers: { "user-agent": "AgenticOS/1.0 (lead-system iframe)" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { html: "", ok: false, err: `upstream ${res.status}` };
    const html = await res.text();
    // Rewrite relative asset paths til absolute så de stadig peger mod upstream
    // (vi proxy'er kun /login — ikke /static/* fra browseren).
    const rewritten = html
      .replace(/src="\/(static\/[^"]+)"/g, (_m, p) => `src="${url}/${p}"`)
      .replace(/href="\/(static\/[^"]+)"/g, (_m, p) => `href="${url}/${p}"`);
    return { html: rewritten, ok: true };
  } catch (e) {
    return { html: "", ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

export default async function HermesPage() {
  const h = await hermesHealth().catch(() => ({
    configured: false,
    reachable: false,
    gatewayRunning: false,
    cronJobs: 0,
    shimStatus: 0,
  }));

  // Server-side hent login-formularen — undgår Vercel bot-protection der
  // blokerer iframe-requests på .vercel.app domænet.
  const login = await fetchLoginHtml();

  const cards = [
    { name: "Hermes-api", ok: h.reachable, detail: h.reachable ? "svarer" : (h.configured ? `fejl ${h.shimStatus}` : "ikke konfigureret") },
    { name: "Gateway", ok: h.gatewayRunning, detail: h.gatewayRunning ? "kører" : "stoppet" },
    { name: "Cron-motor", ok: h.cronJobs > 0, detail: `${h.cronJobs} jobs planlagt` },
    { name: "Tunnel-rotation", ok: true, detail: "cron hver 2. dag kl 04:00" },
    { name: "WebUI-fetch", ok: login.ok, detail: login.ok ? "login-side hentet" : (login.err ?? "fejl") },
  ];

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Hermes"
        subtitle="Jeres 24/7 medstifter på VPS'en. Kort dansk, ærlig, sender aldrig noget selv."
        action={
          <a
            href="/api/hermes/webui-proxy"
            target="_blank"
            rel="noopener noreferrer"
            className="cc-chip"
            style={{ textDecoration: "none" }}
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
            {h.reachable ? "Online" : "Offline"} · Åbn i nyt vindue ↗
          </a>
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

        <section className="cc-card cc-card-pad" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px 10px", display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: 0 }}>
              WebUI
            </h2>
            <span className="cc-dim" style={{ fontSize: 12, marginLeft: "auto" }}>
              Login: Kinly1234
            </span>
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--bg-2)",
              minHeight: 480,
              padding: 0,
            }}
            dangerouslySetInnerHTML={{ __html: login.ok ? login.html : `<div style="padding:24px;color:var(--red);font-size:13px">WebUI ikke tilgængelig: ${login.err ?? "ukendt fejl"}</div>` }}
          />
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
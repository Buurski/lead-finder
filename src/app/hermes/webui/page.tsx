import PageHeader from "@/components/shell/PageHeader";

export const metadata = { title: "Hermes WebUI · AgenticOS" };
export const dynamic = "force-dynamic";

const WEBUI_URL = "https://number-producers-investigations-galleries.trycloudflare.com";

export default function HermesWebUIPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Hermes WebUI"
        subtitle="Den fulde Hermes-agent i browseren — åbnes i nyt vindue."
      />
      <div className="hermes-webui-shell">
        {/* Card-boks som på YT-billedet */}
        <div className="hermes-webui-card">
          <div className="hermes-webui-mark-box">
            <img
              src="/brand/kinly-mark-tight-512.png"
              alt="Kinly mark"
            />
          </div>

          <div className="hermes-webui-card-text">
            <h1>Hermes WebUI</h1>
            <p>
              Den fuldstændige Hermes-agent kører som selvstændig app på vores VPS,
              tunneleret via Cloudflare. Åbn i nyt vindue for fuld arbejdsplads.
            </p>
            <a
              href={WEBUI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hermes-webui-cta"
            >
              ⚕ Åbn Hermes WebUI i nyt vindue
            </a>
          </div>
        </div>

        <div className="hermes-webui-meta">
          <span><span className="hermes-live-dot" /> Online · port 8789</span>
          <span>·</span>
          <span>Login: Kinly1234</span>
          <span>·</span>
          <span>Via cloudflare-tunnel</span>
        </div>
      </div>
    </div>
  );
}
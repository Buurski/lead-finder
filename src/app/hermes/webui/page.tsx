export const metadata = { title: "Hermes WebUI · AgenticOS" };
export const dynamic = "force-dynamic";

const WEBUI_URL = "https://number-producers-investigations-galleries.trycloudflare.com";

export default function HermesWebUIPage() {
  return (
    <div data-hermes-page className="hermes-webui-shell">
      {/* Stort K-logo med orange glow (som den første version du kunne lide) */}
      <div className="hermes-webui-mark-wrap">
        <img
          src="/brand/kinly-mark-tight-512.png"
          alt="Kinly mark"
          className="hermes-webui-mark"
        />
      </div>

      <h1>Hermes WebUI</h1>
      <p>
        Det fuldstændige Hermes-command-center kører som selvstændig app på vores VPS,
        tunneleret via Cloudflare. Det åbnes i et nyt vindue så det får al den plads det har brug for —
        og så du kan have flere faner åbne samtidig.
      </p>

      <a
        href={WEBUI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hermes-webui-cta"
      >
        Åbn Hermes WebUI i nyt vindue
      </a>

      <div className="hermes-webui-meta">
        <span><span className="hermes-live-dot" /> Online · port 8789</span>
        <span>·</span>
        <span>Login: Kinly1234</span>
        <span>·</span>
        <span>Via cloudflare-tunnel</span>
      </div>
    </div>
  );
}
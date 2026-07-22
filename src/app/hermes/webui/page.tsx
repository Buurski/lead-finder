export const metadata = { title: "Hermes WebUI · AgenticOS" };
export const dynamic = "force-static";

const WEBUI_URL = "https://tom-scholarships-synthetic-checked.trycloudflare.com";

export default function HermesWebUIPage() {
  return (
    <div className="hermes-landing" data-hermes-page>
      <div className="hermes-landing-mark-wrap">
        <div className="hermes-landing-glow" />
        <img
          src="/brand/kinly-mark-tight-512.png"
          alt="Hermes"
          className="hermes-landing-mark"
        />
      </div>

      <h1 className="hermes-landing-title">Hermes WebUI</h1>
      <p className="hermes-landing-subtitle">
        Det fuldstændige Hermes-command-center kører som selvstændig app — åbnes i nyt vindue for fuld arbejdsplads.
      </p>

      <a
        href={WEBUI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hermes-landing-cta"
      >
        Åbn Hermes WebUI
      </a>

      <div className="hermes-landing-meta">
        <span className="hermes-landing-status">
          <span className="hermes-live-dot" />
          Online · port 8789
        </span>
        <span>·</span>
        <span>Login: Kinly1234</span>
        <span>·</span>
        <span>Via cloudflare-tunnel</span>
      </div>
    </div>
  );
}
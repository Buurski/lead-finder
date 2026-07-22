export const metadata = { title: "Hermes · AgenticOS" };
export const dynamic = "force-static";

const WEBUI_URL = "https://number-producers-investigations-galleries.trycloudflare.com";

export default function HermesLandingPage() {
  return (
    <div className="hermes-landing" data-hermes-page>
      {/* Stort K-logo med orange glow BAG (ikke firkant omkring) */}
      <div className="hermes-landing-mark-wrap">
        <div className="hermes-landing-glow" />
        <img
          src="/brand/kinly-mark-tight-512.png"
          alt="Hermes"
          className="hermes-landing-mark"
        />
      </div>

      <h1 className="hermes-landing-title">Hermes</h1>
      <p className="hermes-landing-subtitle">
        Jeres 24/7 medstifter på VPS&apos;en. Kort dansk, ærlig, sender aldrig noget selv.
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
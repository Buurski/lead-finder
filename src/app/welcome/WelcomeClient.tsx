"use client";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";

const POINTS = [
  { icon: "LayoutDashboard", t: "Mission Control", d: "Forsiden. 'Hvad kræver mig nu?' — svar, kø, pipeline, tal." },
  { icon: "Users", t: "Leads & Godkendelse", d: "Pipeline af virksomheder. Udkast venter på et ja i Godkendelse." },
  { icon: "Briefcase", t: "Klienter", d: "Aktive kunder, aftaler, SEO-status og leverancer." },
  { icon: "LayoutGrid", t: "Studio", d: "Byg en demo til en lead på minutter — recon + branche-template." },
  { icon: "Brain", t: "Memory & Journal", d: "Vores second brain: noter, priser, daglige briefs." },
];

export default function WelcomeClient() {
  const router = useRouter();

  function start() {
    // Remember the visit for a year so the redirect only happens once.
    document.cookie = `cc_welcomed=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push("/");
  }

  return (
    <div className="cc-fade" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", padding: "10px 0 26px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 16px", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22 }}>ls</div>
        <h1 className="cc-h1" style={{ fontSize: 30 }}>Velkommen til dit command center.</h1>
        <p className="cc-sub" style={{ maxWidth: "52ch", margin: "8px auto 0" }}>
          Det her er stedet vi driver det hele fra. Rolig, personlig, ét sted. Vi laver ekstraordinære
          kodede hjemmesider til lokale virksomheder — og kunden ejer 100% af koden. Bare os, til en fair pris.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {POINTS.map((p) => (
          <section key={p.t} className="cc-card cc-card-pad" style={{ display: "flex", gap: 13, alignItems: "center" }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--bg-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon name={p.icon} style={{ width: 19, height: 19, color: "var(--accent-ink)" }} />
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.t}</div>
              <div className="cc-muted" style={{ fontSize: 13 }}>{p.d}</div>
            </div>
          </section>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 26 }}>
        <button className="cc-btn cc-btn-accent" onClick={start} style={{ height: 44, padding: "0 28px", fontSize: 15 }}>
          Kom i gang →
        </button>
        <p className="cc-dim" style={{ fontSize: 12, marginTop: 12 }}>
          Alt der sender, sletter eller koster, spørger altid først. Intet sker bag din ryg.
        </p>
      </div>
    </div>
  );
}

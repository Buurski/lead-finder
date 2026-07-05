"use client";

// Route-level error boundary: en uncaught render-fejl gav før Next.js' rå,
// hvide fejlskærm. Denne fallback holder tonen (rolig, dansk) og giver en
// vej tilbage uden at maskere fejlen — digest logges til konsollen.
import { useEffect } from "react";
import Link from "next/link";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error:", error);
  }, [error]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Noget gik galt her.
        </h1>
        <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Siden ramte en fejl under visning. Dine data er der stadig — prøv igen, eller gå til Mission Control.
          {error.digest ? <span style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--text-dim)" }}>ref: {error.digest}</span> : null}
        </p>
        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{ border: "none", cursor: "pointer", padding: "9px 18px", borderRadius: 9, background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 13.5, fontFamily: "inherit" }}
          >
            Prøv igen
          </button>
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center", padding: "9px 18px", borderRadius: 9, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 600, fontSize: 13.5 }}
          >
            Mission Control
          </Link>
        </div>
      </div>
    </div>
  );
}

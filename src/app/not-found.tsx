// 404-fallback i appens egen tone i stedet for Next.js' rå standardside.
import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Siden findes ikke.
        </h1>
        <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Adressen peger ikke på noget længere — den kan være flyttet i en oprydning.
        </p>
        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", marginTop: 18, padding: "9px 18px", borderRadius: 9, background: "var(--accent)", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 13.5 }}
        >
          Til Mission Control
        </Link>
      </div>
    </div>
  );
}

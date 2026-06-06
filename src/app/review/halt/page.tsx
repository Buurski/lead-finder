import { setPauseUntil, getPauseStatus } from "@/lib/sheets";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";

// /review/halt — Linked from the morning notification email so Lucas can stop
// all sends from his phone (no app needed).
//
// IMPORTANT: pausing is now an explicit POST (a button Lucas taps), NOT a
// side effect of rendering the page. Email clients (Gmail/Outlook) prefetch
// links for safety scanning, so a GET-render mutation could silently pause every
// send for 24h without Lucas ever clicking. The form below works with no JS — a
// plain HTML POST — so it stays phone-friendly while being scanner-safe.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Stop alt i dag · Command Center",
  robots: { index: false, follow: false },
};

const PAUSE_HOURS = 24;

async function haltAction() {
  "use server";
  const until = new Date(Date.now() + PAUSE_HOURS * 60 * 60 * 1000).toISOString();
  await setPauseUntil("all", until);
  revalidatePath("/review/halt");
}

export default async function HaltPage() {
  let paused = false;
  let until: string | null = null;
  let error: string | null = null;

  try {
    const status = await getPauseStatus("all");
    paused = status.paused;
    until = status.until;
  } catch (err) {
    error = err instanceof Error ? err.message : "Ukendt fejl";
  }

  const card: React.CSSProperties = {
    maxWidth: 440,
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-soft)",
    padding: "40px 34px",
    textAlign: "center",
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={card}>
        {error ? (
          <>
            <p style={{ fontSize: 38, margin: 0 }}>⚠️</p>
            <h1 className="display" style={{ fontSize: 24, margin: "12px 0 0", color: "var(--red)" }}>
              Halt fejlede
            </h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>{error}</p>
            <p style={{ marginTop: 18, fontSize: 14 }}>
              <a href="/api/review/halt-all" style={{ color: "var(--accent-ink)" }}>
                Prøv API-endepunktet direkte
              </a>
            </p>
          </>
        ) : paused ? (
          <>
            <p style={{ fontSize: 38, margin: 0 }}>🛑</p>
            <h1 className="display" style={{ fontSize: 24, margin: "12px 0 0" }}>
              Alt er stoppet
            </h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>
              Ingen cold-mails eller follow-ups går ud.
            </p>
            {until && (
              <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-dim)" }}>
                Pause udløber: {new Date(until).toLocaleString("da-DK")}
              </p>
            )}
            <p style={{ marginTop: 24 }}>
              <Link href="/" style={{ color: "var(--accent-ink)", fontSize: 13.5 }}>
                ← Tilbage til Mission Control
              </Link>
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 38, margin: 0 }}>🛑</p>
            <h1 className="display" style={{ fontSize: 24, margin: "12px 0 0" }}>
              Stop alle udsendelser?
            </h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>
              Sætter cold-mails og follow-ups på pause i de næste {PAUSE_HOURS} timer.
            </p>
            <form action={haltAction} style={{ marginTop: 22 }}>
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "13px 18px",
                  background: "var(--red)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                Stop alt i {PAUSE_HOURS} timer
              </button>
            </form>
            <p style={{ marginTop: 16 }}>
              <Link href="/" style={{ color: "var(--text-dim)", fontSize: 13 }}>
                Annullér — tilbage til Mission Control
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

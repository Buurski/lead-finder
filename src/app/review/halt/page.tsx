import { setPauseUntil, getPauseStatus } from "@/lib/sheets";
import type { Metadata } from "next";

// /review/halt — Linked from the morning notification email so Lucas can tap
// "🛑 Stop alt i dag" directly on his phone (no app, no JS needed).
//
// The page auto-pauses for 24h on first load. Server-side action means it
// works from any client and we don't need a separate submit step.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Stop alt i dag · Lead Finder",
  robots: { index: false, follow: false },
};

const PAUSE_HOURS = 24;

export default async function HaltPage() {
  let until: string | null = null;
  let alreadyPaused = false;
  let error: string | null = null;

  try {
    const existing = await getPauseStatus("all");
    if (existing.paused) {
      alreadyPaused = true;
      until = existing.until;
    } else {
      until = new Date(Date.now() + PAUSE_HOURS * 60 * 60 * 1000).toISOString();
      await setPauseUntil("all", until);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Ukendt fejl";
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
        {error ? (
          <>
            <p className="text-4xl">⚠️</p>
            <h1 className="text-xl font-bold mt-3 text-red-700">Halt fejlede</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <p className="mt-4 text-sm">
              <a href="/api/review/halt-all" className="text-blue-600 underline">
                Prøv API-endepunktet direkte
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl">🛑</p>
            <h1 className="text-xl font-bold mt-3">
              {alreadyPaused ? "Allerede pauset" : "Alle udsendelser stoppet"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {alreadyPaused
                ? "Systemet er allerede pauset."
                : "Ingen cold-mails eller follow-ups går ud i de næste 24 timer."}
            </p>
            {until && (
              <p className="mt-3 text-xs text-slate-500">
                Pause udløber: {new Date(until).toLocaleString("da-DK")}
              </p>
            )}
            <p className="mt-6">
              <a href="/review" className="text-blue-600 underline text-sm">
                Tilbage til review-køen
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

import { computeTodaysQueue } from "@/lib/queue";
import { getPauseStatus } from "@/lib/sheets";
import ReviewQueueClient from "@/components/ReviewQueueClient";
import type { Metadata, Viewport } from "next";

// Disable caching — the queue changes by the minute as Lucas marks skips,
// and we always want a fresh snapshot when he opens the page.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Morning review · Lead Finder",
  description: "Today's cold + follow-up queue. Skip leads before 10:00.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lead Review",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default async function ReviewPage() {
  const [queue, pause] = await Promise.all([
    computeTodaysQueue(),
    getPauseStatus(),
  ]);

  // Serialize the queue entries to a plain shape — the client component
  // doesn't need the rowIndex (it derives it from the leadId).
  const serialised = queue.entries.map((e) => ({
    id: e.lead.id,
    name: e.lead.name,
    branch: e.lead.branch,
    city: e.lead.city,
    score: e.lead.score,
    website: e.lead.website,
    email: e.lead.email,
    websiteQualityTier: e.lead.websiteQualityTier,
    kind: e.kind,
    concern: e.concern,
    willClaimBroken: e.willClaimBroken,
    treatedAsAlive: e.treatedAsAlive,
    daysSinceSent: e.daysSinceSent,
    skipReason: e.lead.skipReason,
  }));

  return (
    <ReviewQueueClient
      entries={serialised}
      summary={queue.summary}
      overflow={queue.overflow}
      paused={pause.paused}
      pausedUntil={pause.until}
    />
  );
}

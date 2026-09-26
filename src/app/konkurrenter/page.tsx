import { getDb } from "@/lib/db/client";
import { listPosts } from "@/lib/hq/posts";
import { loadLatestReport } from "@/lib/hq/competitors";
import { listMyDay } from "@/lib/hq/tasks";
import { copenhagenNow } from "@/lib/settings";
import { MAIL_LINKS } from "@/lib/demos";
import PageHeader from "@/components/shell/PageHeader";
import KonkurrenterBoard, { type KinlyRow, type SavedIdea } from "@/components/konkurrenter/KonkurrenterBoard";

// /konkurrenter — ugentlig Jev-scan af danske webbureauer (Hermes' cron,
// søndag nat, POST /api/agent/competitors). Kinly-rækken øverst i tabellen
// bruger KUN data der reelt findes i dette repo (kinly.dk-branchesider fra
// demos.ts, egen udgivet-tælling fra blog-basen) — resten er bevidst "—".
export const dynamic = "force-dynamic";
export const metadata = { title: "Konkurrenter · Kinly HQ" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Titel-præfikser sat af KonkurrenterBoard's "Gem til senere"/"→ Annonce-idé"
// (opgaver uden due, så de bevidst IKKE optræder i kalenderen — se spec).
const IDEA_PREFIX = /^(Idé|Annonce-idé): /;

export default async function KonkurrenterPage() {
  const { date: today } = copenhagenNow();
  // Sekventielt, ikke Promise.all: lokal pglite tåler kun 1 samtidig forbindelse
  // (fælles-regel #23 — se getHqSummary for samme mønster).
  const report = await loadLatestReport();
  const udgivet = await listPosts(getDb(), { stage: "udgivet" });
  const myDay = await listMyDay(getDb(), { owner: "lucas", today });
  const cutoff = new Date(`${today}T00:00:00.000Z`).getTime() - THIRTY_DAYS_MS;
  const blogPosts30d = udgivet.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= cutoff).length;
  const savedIdeas: SavedIdea[] = myDay
    .filter((i) => i.kind === "task" && IDEA_PREFIX.test(i.title))
    .map((i) => ({ id: i.id, title: i.title }));

  const kinly: KinlyRow = {
    name: "Kinly",
    url: "https://kinly.dk",
    https: true,
    services: MAIL_LINKS.filter((l) => l.group === "Kinly-branchesider").map((l) => l.label),
    blogPosts30d,
    positioning: "Kodede hjemmesider (ingen skabelon) til lokale danske virksomheder.",
  };

  return (
    <div className="cc-fade kinly-page">
      <PageHeader
        icon="Users"
        title="Konkurrenter"
        subtitle="Ugentlig Jev-scan af bureauer, freelancere, AI-byggere og idéer fra X/LinkedIn — og hvad Kinly skal gøre ved det."
      />
      <KonkurrenterBoard report={report} kinly={kinly} savedIdeas={savedIdeas} />
    </div>
  );
}

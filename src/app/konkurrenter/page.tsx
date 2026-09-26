import { getDb } from "@/lib/db/client";
import { listPosts } from "@/lib/hq/posts";
import { loadLatestReport } from "@/lib/hq/competitors";
import { MAIL_LINKS } from "@/lib/demos";
import PageHeader from "@/components/shell/PageHeader";
import KonkurrenterBoard, { type KinlyRow } from "@/components/konkurrenter/KonkurrenterBoard";

// /konkurrenter — ugentlig Jev-scan af danske webbureauer (Hermes' cron,
// søndag nat, POST /api/agent/competitors). Kinly-rækken øverst i tabellen
// bruger KUN data der reelt findes i dette repo (kinly.dk-branchesider fra
// demos.ts, egen udgivet-tælling fra blog-basen) — resten er bevidst "—".
export const dynamic = "force-dynamic";
export const metadata = { title: "Konkurrenter · Kinly HQ" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function KonkurrenterPage() {
  const [report, udgivet] = await Promise.all([
    loadLatestReport(),
    listPosts(getDb(), { stage: "udgivet" }),
  ]);
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const blogPosts30d = udgivet.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= cutoff).length;

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
        subtitle="Ugentlig Jev-scan af danske webbureauer — mønstre, huller og hvor Kinly står."
      />
      <KonkurrenterBoard report={report} kinly={kinly} />
    </div>
  );
}

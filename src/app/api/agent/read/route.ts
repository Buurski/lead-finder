// Læse-endpoint til Hermes-chatten og VPS-jobs: ét sted at hente CRM-tilstand.
// Undtaget fra proxyens Basic auth (api/agent/-præfikset); beskyttet af HMAC med
// HERMES_API_SECRET — samme skema som /api/agent/tasks og /api/hermes/crm-dossier:
//   X-Timestamp: <unix-sek>   Authorization: Bearer hex(hmac(secret, `${ts}.GET.${path}.`))
// hvor path = pathname + query (fx "/api/agent/read?what=sog&q=ktvvs").
// Kun læsning — ingen skrivninger her.
// Lucas OS (privat økonomi) har sin egen læse-nøgle — se lib/lucas-os-read.ts (kun what=udgifter).
import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { getAgentFeed } from "@/lib/hq/agent-feed";
import { getAttention } from "@/lib/hq/attention";
import { cmsUsageAll } from "@/lib/hq/cms-usage";
import { listUpdates, type UpdateStatus } from "@/lib/hq/customer-updates";
import { listPipeline } from "@/lib/hq/deals";
import { BlogInputError, getPost, listPosts } from "@/lib/hq/posts";
import { listCustomerContacts } from "@/lib/hq/customer-contacts";
import { searchAll } from "@/lib/hq/search";
import { listMyDay, type Owner } from "@/lib/hq/tasks";
import { loadDigest, summarizeDigest } from "@/lib/inbox-digest";
import { projectForLucasOs, readerOf, udgifterResponse } from "@/lib/lucas-os-read";
import { copenhagenNow } from "@/lib/settings";

export const runtime = "nodejs";

const WHATS = ["opmaerksomhed", "min-dag", "pipeline", "sog", "kundeopdateringer", "feed", "cms", "replies", "blog", "blog-post", "customer-contacts", "udgifter"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const what = url.searchParams.get("what") || "";
  const reader = readerOf(req, what);
  if (!reader) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  // Lucas OS-nøglen får kun de tilladte felter (V3-1); Hermes-nøglen uændret.
  const out = (body: Record<string, unknown>) => NextResponse.json(reader === "lucas-os" && what !== "udgifter" ? projectForLucasOs(what, body) : body);
  if (what === "udgifter") return udgifterResponse(); // KV, ikke Postgres → før pg-tjekket
  if (!pgEnabled()) return NextResponse.json({ ok: false, error: "CRM kører ikke på Postgres" }, { status: 503 });
  const db = getDb();
  const today = copenhagenNow().date;

  switch (what) {
    case "opmaerksomhed": {
      const items = await getAttention(db, { today });
      return out({ ok: true, today, items });
    }
    case "min-dag": {
      const ownerRaw = url.searchParams.get("owner") || "";
      const owner = (["lucas", "charlie"] as readonly string[]).includes(ownerRaw) ? (ownerRaw as Owner) : undefined;
      const items = await listMyDay(db, { owner, today });
      return out({ ok: true, today, items });
    }
    case "pipeline": {
      const cards = await listPipeline(db);
      return out({ ok: true, cards });
    }
    case "sog": {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q || q.length > 120) return NextResponse.json({ ok: false, error: "q mangler" }, { status: 400 });
      const groups = await searchAll(db, q);
      return NextResponse.json({ ok: true, q, groups });
    }
    case "kundeopdateringer": {
      const status = url.searchParams.get("status") || "kladde";
      const rows = await listUpdates(db, status as UpdateStatus);
      return NextResponse.json({ ok: true, status, rows });
    }
    case "feed": {
      const raw = Number(url.searchParams.get("limit")) || 20;
      const limit = Math.min(Math.max(raw, 1), 100);
      const rows = await getAgentFeed(db, limit);
      return NextResponse.json({ ok: true, rows });
    }
    case "cms": {
      const rows = await cmsUsageAll();
      return NextResponse.json({ ok: true, rows });
    }
    case "replies": {
      // Svar-indbakken (digesten). loadDigest har allerede påført "besvaret/fjernet".
      const d = await loadDigest();
      const summary = summarizeDigest(d);
      const items = (d?.items ?? []).map((i) => ({
        id: i.id, from: i.from, fromName: i.fromName ?? null, subject: i.subject, date: i.date,
        category: i.category, importance: i.importance, needsReply: i.needsReply,
        reason: i.reason, leadId: i.leadId ?? null, gmailLink: i.gmailLink ?? null,
      }));
      return NextResponse.json({ ok: true, summary, generatedBy: d?.generatedBy ?? null, items });
    }
    case "blog": {
      // Blog-pipelinen (/blog): kort-listen uden body. stage udeladt = alle kolonner.
      const stage = (url.searchParams.get("stage") || "").trim();
      try {
        const cards = await listPosts(db, stage ? { stage } : {});
        return out({ ok: true, stage: stage || null, cards });
      } catch (err) {
        if (err instanceof BlogInputError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
        throw err;
      }
    }
    case "blog-post": {
      // Fuld post inkl. body — id (uuid) eller slug.
      const key = (url.searchParams.get("id") || url.searchParams.get("slug") || "").trim();
      if (!key) return NextResponse.json({ ok: false, error: "id eller slug mangler" }, { status: 400 });
      try {
        const post = await getPost(db, key);
        return NextResponse.json({ ok: true, post });
      } catch (err) {
        if (err instanceof BlogInputError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
        throw err;
      }
    }
    case "customer-contacts": {
      // Kundeliste til Hermes' mail-sync (26/9): mailadresser + domæne pr. kunde,
      // så scriptet matcher på deltagere (From/To/Cc) i stedet for fritekst.
      const customers = await listCustomerContacts(db);
      return NextResponse.json({ ok: true, customers });
    }
    default:
      return NextResponse.json({ ok: false, error: "ukendt what", mulige: WHATS }, { status: 400 });
  }
}

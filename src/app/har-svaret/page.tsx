import { getDb } from "@/lib/db/client";
import { listRepliedLeadsWithContext } from "@/lib/hq/replied-leads";
import { BUCKET_ORDER, phoneInText } from "@/lib/hq/reply-bucket";
import { currentUser } from "@/lib/current-user";
import PageHeader from "@/components/shell/PageHeader";
import HarSvaretList, { type HarSvaretRow } from "./HarSvaretList";
import "./har-svaret.css";

export const metadata = { title: "Har svaret · Command Center" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Copenhagen" });

// Kalenderdage i København (ikke 24-timersperioder): i går kl. 23 er "i går", også kl. 09.
const dkDay = (t: number) => Date.parse(new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }));
const dayDiff = (a: string, b: string) => Math.round((dkDay(Date.parse(a)) - dkDay(Date.parse(b))) / 86_400_000);
function ageLabel(iso: string): string {
  const d = dayDiff(new Date().toISOString(), iso);
  return d <= 0 ? "i dag" : d === 1 ? "i går" : `${d} d siden`;
}

const CATEGORY_LABEL: Record<string, string> = {
  interested: "Interesseret",
  question: "Spørgsmål",
  objection: "Indvending",
  "not-interested": "Nej tak",
  unsubscribe: "Afmeld",
  "auto-reply": "Autosvar",
  "wrong-person": "Forkert person",
  other: "Uklart",
};

function weSentLabel(mailsSent: number, lastMailAt: string | null): string {
  const when = lastMailAt ? dateFmt.format(new Date(lastMailAt)) : "";
  if (mailsSent > 0) return `Vi skrev ${mailsSent} ${mailsSent === 1 ? "mail" : "mails"}${when ? ` · sidst ${when}` : ""}`;
  if (when) return `Vi skrev sidst ${when} (indholdet er ikke registreret her)`;
  return "Hvad vi skrev er ikke registreret her (se Sendt i Gmail)";
}

// Egen side (ikke en sektion på forsiden): ~75 rækker med handlinger fylder for meget ovenpå
// forsidens kort. Forsiden viser tallet og linker hertil.
export default async function HarSvaretPage() {
  const user = await currentUser();
  const me = user === "charlie" ? "charlie" : "lucas";
  const { leads, captureReady } = await listRepliedLeadsWithContext(getDb());
  const rows: HarSvaretRow[] = leads
    .map((l) => ({
      id: l.id,
      rowNo: l.rowNo,
      name: l.name,
      place: [l.city, l.branch].filter(Boolean).join(" · "),
      phone: l.phone,
      email: l.email,
      jev: l.jevGrade ?? "",
      owner: l.owner ?? "",
      lifecycle: l.lifecycle,
      bucket: l.bucket,
      why: l.why,
      hasReply: l.reply !== null,
      replyAt: l.reply ? Date.parse(l.reply.receivedAt) : 0,
      replyWhen: l.reply ? `${dateFmt.format(new Date(l.reply.receivedAt))} · ${ageLabel(l.reply.receivedAt)}` : "",
      replyLag: l.reply && l.lastMailAt && dayDiff(l.reply.receivedAt, l.lastMailAt) >= 0 ? `${dayDiff(l.reply.receivedAt, l.lastMailAt)} d efter vores mail` : "",
      replyCategory: l.reply ? (CATEGORY_LABEL[l.reply.category] ?? l.reply.category) : "",
      replySubject: l.reply?.subject ?? "",
      replyAccount: l.reply?.account ?? "",
      snippet: l.reply?.snippet ?? "",
      phoneInReply: l.reply?.asksCall && l.reply.snippet ? (phoneInText(l.reply.snippet) ?? "") : "",
      weSent: weSentLabel(l.mailsSent, l.lastMailAt),
      marks: [l.calledNoLog ? "Markeret ringet, ingen log" : "", l.cvrUnchecked ? "CVR ikke tjekket" : ""].filter(Boolean),
    }))
    // Bucket-rækkefølge, så nyeste svar først (svar uden dato sidst), så navn.
    .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || b.replyAt - a.replyAt || a.name.localeCompare(b.name, "da"));

  return (
    <div className="cc-fade">
      <PageHeader icon="Phone" title="Har svaret" subtitle={`${rows.length} leads har svaret på en mail og er stadig åbne. Kanalen følger det de skrev.`} />
      <p className="hs-note" role="note">Tjek reklamebeskyttelse før opkald. Se §10-notat.</p>
      {!captureReady && (
        <p className="hs-note hs-note-warn" role="note">Svar-uddrag er ikke slået til endnu, så ingen svar kan vises og alle står som «Tjek først».</p>
      )}
      {rows.length === 0 ? (
        <div className="cc-card hs-empty">Ingen åbne leads har svaret lige nu.</div>
      ) : (
        <HarSvaretList rows={rows} me={me} captureReady={captureReady} />
      )}
    </div>
  );
}

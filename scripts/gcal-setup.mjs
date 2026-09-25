// Engangs-opsætning af kalenderen HQ lægger opgaver i (Lucas 25/9).
// Kinly's Workspace tillader kun free/busy-deling UD af organisationen, så vi
// vender den om: service-accounten ejer kalenderen "Kinly HQ – <navn>" og deler
// den IND til personen (læseadgang). Idempotent: findes kalenderen, genbruges den.
//
//   GOOGLE_KEY_FILE=sa-key.json node scripts/gcal-setup.mjs buur.aigro@gmail.com Lucas
//
// Udskriver kalender-id'et, der sættes som HQ_GCAL_<NAVN> i Vercel.
import { google } from "googleapis";

const [email, name] = process.argv.slice(2);
if (!email || !name) throw new Error("brug: node scripts/gcal-setup.mjs <mail> <Navn>");
const auth = new google.auth.GoogleAuth({ keyFile: process.env.GOOGLE_KEY_FILE, scopes: ["https://www.googleapis.com/auth/calendar"] });
const cal = google.calendar({ version: "v3", auth });

const summary = `Kinly HQ – ${name}`;
const list = await cal.calendarList.list({ maxResults: 250 });
let id = list.data.items?.find((c) => c.summary === summary)?.id;
if (!id) {
  const created = await cal.calendars.insert({ requestBody: { summary, description: "Opgaver fra Kinly HQ (synkes hver time). Ret opgaver i HQ, ikke her.", timeZone: "Europe/Copenhagen" } });
  id = created.data.id;
  console.log("oprettet", summary);
}
const acl = await cal.acl.list({ calendarId: id });
if (!acl.data.items?.some((r) => r.scope?.value === email)) {
  await cal.acl.insert({ calendarId: id, sendNotifications: true, requestBody: { role: "reader", scope: { type: "user", value: email } } });
  console.log("delt med", email, "(læseadgang; Google sender en mail med link til at tilføje kalenderen)");
}
console.log(`HQ_GCAL_${name.toUpperCase()}=${id}`);

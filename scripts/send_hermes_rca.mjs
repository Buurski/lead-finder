import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const c of [path.join(__dirname, "..", ".env.local"), path.join(__dirname, ".env.local")]) {
  try { for (const line of fs.readFileSync(c, "utf-8").split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m || process.env[m[1]]) continue;
    let v = m[2].trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    process.env[m[1]] = v; } } catch {}
}
const U = process.env.GMAIL_USER, P = process.env.GMAIL_APP_PASSWORD;
const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: U, pass: P } });
const body = `Lucas —

Tog to skridt tilbage. Ingen patch. Fandt den FAELLES rod bag alle 6 haeng.
Fuld rapport: KnowledgeOS/wiki/os/hermes/root-cause-analysis-2026-06-16.md

KORT:
Hver "fix" justerede EN knap i samme sloejfe. Sloejfen blev aldrig brudt.
Rod: Telegram long-poll (getUpdates) er en single-owner ressource, men systemet
passer skoedeloest paa poll-ejerskab — OG recovery = "genstart hele den tunge
gateway", hvilket SELV laver haeng-symptomet (drain-timeout -> SIGKILL ->
getUpdates-conflict-vindue).

To haeng-familier, samme rod:
A) KODE/RACE: overlappende reconnect-tasks UDEN laas -> 'NoneType has no
   attribute updater' (en race, ikke null-bug) -> 10 fejl -> tvungen genstart
   -> drain-timeout -> SIGKILL. Fix #4's guard er ikke atomisk -> racen lever.
B) OPERATIONEL: en ANDEN getUpdates-poller paa samme token et andet sted ->
   evig 409 Conflict som handleren ikke kan slippe ud af.

>>> DEN VIGTIGE: BOT HAENGER LIGE NU (familie B).
Tjekkede live 19:04. Telegram siger: ingen webhook, pending=0, kun EEN gateway
paa VPS'en — men konstant "Conflict: terminated by other getUpdates request".
Det betyder: en ANDEN instans poller @Buurhermesbot lige nu og sluger beskederne.
Den er IKKE paa VPS'en.

UNHANG #6 (gor dette foerst, ingen VPS-genstart noedvendig):
  Koerer du en Hermes/telegram-poller et andet sted? Din laptop? En glemt proces?
  ps aux | grep -iE 'telegram|hermes.*gateway'  -> draeb den -> bot kommer tilbage.
  (Genstart fixer det IKKE — genstart 19:00 gik direkte tilbage i conflict-loop.)

ANBEFALET AEGTE FIX (venter paa dit ja):
  HOVED: skift Telegram til WEBHOOK (push). Draeber familie A OG B paa een gang —
  ingen getUpdates -> ingen conflict, ingen None.updater-stige. ~0,5-1 dag, medium
  risiko (kraever TLS + indgaaende rute; I har allerede HTTPS-flade via hermes-api).
  ALT 1: poll-only sidecar-proces (restart-isolation). ~1-2 dage.
  ALT 2: laas om reconnect + STOP self-restart (mindste aegte fix). ~2-4 timer.

UANSET valg — tilfoej observability saa naeste haeng er debugbart paa MINUTTER:
heartbeat-fil + lastUpdateAgeSeconds paa /api/hermes/status + watchdog-cron.

Roerte INTET paa VPS'en. Ingen patch, ingen config, ingen token-rotation, ingen
genstart. Venter paa din beslutning.

— Claude`;
const info = await t.sendMail({
  from: U, to: "buur.aigro@gmail.com",
  subject: "[Task done] Hermes — systemic root-cause analysis",
  text: body,
});
console.log("SENT", info.messageId);

// hermes/index.js — minimal Telegram control bot (Railway-ready skeleton).
//
// Long-polls Telegram for messages from the ONE allowed chat (Lucas) and answers.
// It can trigger the app's engine PREVIEW (writes nothing) and report status, but
// it CANNOT send mail and CANNOT run a real engine fill without an explicit "ja".
// No external deps: uses fetch + the Telegram HTTP API directly.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_ID, APP_URL (optional), CRON_SECRET (optional).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = String(process.env.TELEGRAM_ALLOWED_CHAT_ID || "");
const APP_URL = process.env.APP_URL || "";
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

if (!TOKEN || !ALLOWED) {
  console.log("[hermes] TELEGRAM_BOT_TOKEN / TELEGRAM_ALLOWED_CHAT_ID not set — see SETUP_HERMES.md. Idling.");
}

// Pending confirmations keyed by chat id (e.g. a real engine run awaiting "ja").
const pending = new Map();

async function send(chatId, text) {
  if (!API) return;
  try {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error("[hermes] send failed", e);
  }
}

async function enginePreview() {
  if (!APP_URL) return "APP_URL ikke sat — kan ikke kalde motoren.";
  try {
    const res = await fetch(`${APP_URL}/api/engine/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "preview", limit: 12 }),
    });
    const d = await res.json();
    return `Preview: ville drafte ${d?.summary?.drafted ?? "?"} (skrev intet). Skriv "ja kør" for at fylde køen.`;
  } catch {
    return "Kunne ikke nå motoren lige nu.";
  }
}

async function handle(chatId, text) {
  const t = (text || "").trim().toLowerCase();

  if (String(chatId) !== ALLOWED) {
    // Never obey anyone but Lucas.
    return;
  }

  if (t === "ping") return send(chatId, "Hermes er vågen 👋");
  if (t.startsWith("hvad")) return send(chatId, "Jeg kigger på kø + svar… (fuld status kommer når jeg er deployet).");
  if (t.includes("kør") && t.includes("motor")) {
    pending.set(chatId, "engine-run");
    const msg = await enginePreview();
    return send(chatId, msg);
  }
  if (t === "ja kør" && pending.get(chatId) === "engine-run") {
    pending.delete(chatId);
    // NOTE: a real fill calls /api/engine/run {mode:"run",confirm:true}. Left as
    // an explicit TODO so v1 never fills the live queue unattended.
    return send(chatId, "Forstået — men i v1 fylder jeg ikke køen automatisk. Gør det selv i appen, så er du sikker.");
  }
  if (t.includes("mail") || t.includes("send")) {
    return send(chatId, "Jeg sender aldrig mail selv. Det skal du gøre fra /approve i appen.");
  }
  return send(chatId, 'Jeg forstod ikke helt. Prøv "ping", "hvad kræver mig?", eller "kør motoren".');
}

async function poll() {
  if (!API) return;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();
      for (const u of data.result || []) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (msg?.text) await handle(msg.chat.id, msg.text);
      }
    } catch (e) {
      console.error("[hermes] poll error", e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

console.log("[hermes] starting Telegram control loop…");
poll();

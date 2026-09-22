import { after, NextResponse } from "next/server";
import { allowLoginMail, issueLoginToken, magicEnabled, userForEmail } from "@/lib/auth/magic";
import { clientIp, rateLimitCheck } from "@/lib/auth/rate-limit";
import { formatFrom, getTransporter } from "@/lib/senders";

export const runtime = "nodejs";

// POST (formular) → mail et login-link til brugerens egen adresse.
// Svarer ALTID det samme, så man ikke kan teste hvilke mails der er brugere.
export async function POST(req: Request) {
  const back = (q: string) => NextResponse.redirect(new URL(`/login?${q}`, req.url), 303);

  if (!magicEnabled()) return back("fejl=1");
  // Kun fra vores egen login-side — ikke formular-POST'er fra fremmede sites.
  if (req.headers.get("sec-fetch-site") === "cross-site") return back("fejl=1");

  const rl = await rateLimitCheck(clientIp(req), "magic");
  if (!rl.allowed) return back("fejl=for-mange");

  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").slice(0, 200);
  const user = userForEmail(email);
  // Linket bygges KUN af den konfigurerede APP_URL — aldrig af request-host
  // (en forfalsket Host kunne ellers sende tokenet til en fremmed side).
  const base = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
  if (!/^https:\/\/[^/]+$/.test(base)) {
    console.error(JSON.stringify({ evt: "auth.magic.no_app_url" }));
    return back("sendt=1");
  }
  // Token + mail efter svaret, så svartiden ikke afslører om mailen er kendt.
  if (user) after(async () => {
    if (!(await allowLoginMail(user))) return;
    const token = await issueLoginToken(user);
    const link = `${base}/login?t=${encodeURIComponent(token)}`;
    try {
      await getTransporter("lucas").sendMail({
        from: formatFrom("lucas"),
        to: user.email,
        subject: "Log ind på Kinly HQ",
        text: `Klik for at logge ind (virker i 15 minutter, én gang):\n\n${link}\n\nHar du ikke bedt om det, kan du ignorere mailen.`,
      });
    } catch (err) {
      console.error(JSON.stringify({ evt: "auth.magic.mail_failed", error: String(err).slice(0, 200) }));
    }
  });
  return back("sendt=1");
}

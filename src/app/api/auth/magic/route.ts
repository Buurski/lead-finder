import { NextResponse } from "next/server";
import { issueLoginToken, userForEmail } from "@/lib/auth/magic";
import { clientIp, rateLimitCheck } from "@/lib/auth/rate-limit";
import { formatFrom, getTransporter } from "@/lib/senders";

export const runtime = "nodejs";

// POST (formular) → mail et login-link til brugerens egen adresse.
// Svarer ALTID det samme, så man ikke kan teste hvilke mails der er brugere.
export async function POST(req: Request) {
  const back = (q: string) => NextResponse.redirect(new URL(`/login?${q}`, req.url), 303);

  const rl = await rateLimitCheck(clientIp(req), "magic");
  if (!rl.allowed) return back("fejl=for-mange");

  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").slice(0, 200);
  const user = userForEmail(email);
  if (user) {
    const token = await issueLoginToken(user);
    const base = process.env.APP_URL || new URL(req.url).origin;
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
  }
  return back("sendt=1");
}

import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/cc-auth";

// Log ud: rydder cc_sess og sender brugeren til /login.
//
// Har browseren den fælles kode (Basic) cachelagret, sender den den med på
// ALLE kald — også dette — og ville ellers straks logge ind igen. Derfor svarer
// vi i det tilfælde 401 med en ny Basic-udfordring: et "Anuller" i dialogen
// rydder den cachelagrede kode for denne browser-session.
export async function POST(req: Request): Promise<NextResponse> {
  const clearCookie = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 0, path: "/" };

  if (req.headers.get("authorization")) {
    const res = new NextResponse(
      "Du er nu logget ud.\n\nBrowseren viste sin kode-dialog, fordi den stadig husker den fælles kode. Tryk Anuller for at rydde den — så er du helt ude.",
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Command Center", charset="UTF-8"',
          "Clear-Site-Data": '"cookies"',
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
    res.cookies.set(SESSION_COOKIE, "", clearCookie);
    return res;
  }

  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", clearCookie);
  res.headers.set("Clear-Site-Data", '"cookies"');
  return res;
}

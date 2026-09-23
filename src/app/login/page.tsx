import "./login.css";
import LoginForm from "./login-form";

// Login: mail + adgangskode (personligt login). Koden til første login sættes
// offline (scripts/hq-bootstrap.ts) og tastes ind via opsætningskode-togglen.
// ?t=… er den gamle magic-link-bekræftelse og bliver liggende, så links der
// allerede er sendt ikke brænder.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const q = await searchParams;
  const token = typeof q.t === "string" ? q.t : "";
  const msg =
    q.fejl === "for-mange" ? "For mange forsøg. Prøv igen om lidt."
    : q.fejl ? "Linket er udløbet eller allerede brugt. Bed om et nyt."
    : "";

  return (
    <main className="login-shell">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- statisk brand-asset, ikke optimeringsbehov */}
        <img src="/brand/kinly-wordmark-light.svg" alt="Kinly" className="login-wordmark" />
        <div className="login-copy">
          <h1 className="login-title">{token ? "Bekræft login" : "Log ind på Kinly HQ"}</h1>
          <p className="login-sub">
            {token
              ? "Tryk for at bekræfte engangslinket fra mailen."
              : "Log ind med din mail og adgangskode."}
          </p>
        </div>
        {token ? (
          <form method="post" action="/api/auth/verify" className="login-form">
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="login-btn">Log ind</button>
          </form>
        ) : (
          <LoginForm initialMsg={msg} />
        )}
        {token && msg && <p role="status" className="login-msg">{msg}</p>}
        {/* Fuld sideindlæsning (ikke <Link>): proxyen skal svare 401, så browserens kode-dialog vises. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        {!token && <a href="/?kode=1" className="login-alt">Log ind med fælles kode i stedet</a>}
      </div>
    </main>
  );
}

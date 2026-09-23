import "./login.css";

// Login: mail et engangs-link (magic link). Med ?t=… vises en bekræft-knap,
// der POST'er tokenet — så mail-scannere ikke kan bruge linket op.
// Login-LOGIKKEN (form action/method/felter) er urørt — kun markup/stil er nyt.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const q = await searchParams;
  const token = typeof q.t === "string" ? q.t : "";
  const msg =
    q.sendt ? "Tjek din mail — linket virker i 15 minutter."
    : q.fejl === "for-mange" ? "For mange forsøg. Prøv igen om lidt."
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
            {token ? "Tryk for at bekræfte engangslinket fra mailen." : "Indtast din mail — vi sender et engangslink, der virker i 15 minutter."}
          </p>
        </div>
        {token ? (
          <form method="post" action="/api/auth/verify" className="login-form">
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="login-btn">Log ind</button>
          </form>
        ) : (
          <form method="post" action="/api/auth/magic" className="login-form">
            <label htmlFor="email" className="login-label">Din mail</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="cc-input" />
            <button type="submit" className="login-btn">Send login-link</button>
          </form>
        )}
        {msg && <p role="status" className="login-msg">{msg}</p>}
      </div>
    </main>
  );
}

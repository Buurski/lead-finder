// Login: mail et engangs-link (magic link). Med ?t=… vises en bekræft-knap,
// der POST'er tokenet — så mail-scannere ikke kan bruge linket op.
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
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, display: "grid", gap: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Kinly HQ</h1>
        {token ? (
          <form method="post" action="/api/auth/verify" style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="cc-btn">Log ind</button>
          </form>
        ) : (
          <form method="post" action="/api/auth/magic" style={{ display: "grid", gap: 12 }}>
            <label htmlFor="email">Din mail</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="cc-input" />
            <button type="submit" className="cc-btn">Send login-link</button>
          </form>
        )}
        {msg && <p role="status">{msg}</p>}
      </div>
    </main>
  );
}

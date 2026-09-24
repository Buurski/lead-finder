"use client";

import { useState, type FormEvent } from "react";

// Login-formular (klient): POST til /api/auth/password, eller — foldet ud —
// /api/auth/setup med engangs-opsætningskoden. Ingen mail-sending.
export default function LoginForm({ initialMsg = "" }: { initialMsg?: string }) {
  const [msg, setMsg] = useState(initialMsg);
  const [busy, setBusy] = useState(false);

  function felt(e: FormEvent<HTMLFormElement>): Record<string, string> {
    return Object.fromEntries([...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)]));
  }

  async function send(url: string, body: Record<string, string>) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        window.location.assign("/");
        return;
      }
      setMsg(data?.error ?? "Noget gik galt. Prøv igen.");
    } catch {
      setMsg("Kunne ikke få forbindelse. Prøv igen.");
    }
    setBusy(false);
  }

  return (
    <>
      <form
        className="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send("/api/auth/password", felt(e));
        }}
      >
        <label htmlFor="email" className="login-label">Din mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="cc-input" />
        <label htmlFor="password" className="login-label">Adgangskode</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="cc-input" />
        <button type="submit" className="login-btn" disabled={busy}>Log ind</button>
      </form>

      <details className="login-setup">
        <summary>Første gang? Brug opsætningskode</summary>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send("/api/auth/setup", felt(e));
          }}
        >
          <label htmlFor="ny-email" className="login-label">Din mail</label>
          <input id="ny-email" name="email" type="email" required autoComplete="email" className="cc-input" />
          <label htmlFor="kode" className="login-label">Opsætningskode</label>
          <input id="kode" name="code" type="text" required autoComplete="one-time-code" className="cc-input" />
          <label htmlFor="ny-password" className="login-label">Ny adgangskode</label>
          <input id="ny-password" name="password" type="password" required autoComplete="new-password" className="cc-input" />
          <button type="submit" className="login-btn" disabled={busy}>Gem adgangskode og log ind</button>
        </form>
      </details>

      {msg && <p role="status" className="login-msg">{msg}</p>}
    </>
  );
}

"use client";
import { useState, type FormEvent } from "react";

interface Profile {
  name: string;
  email: string;
  hasPassword: boolean;
}

// Konto-kort på Indstillinger: hvem er logget ind, skift/sæt egen adgangskode,
// og log ud. "delt" (fælles koden) kan ikke skifte kode — den er ikke en person.
export default function AccountCard({
  user,
  profile,
}: {
  user: "lucas" | "charlie" | "delt" | null;
  profile: Profile | null;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "fejl"; text: string } | null>(null);

  const person = user === "lucas" || user === "charlie";
  const initials = profile?.name?.trim()?.[0]?.toUpperCase() ?? (person ? String(user)[0].toUpperCase() : "K");

  async function skift(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    if (next !== repeat) {
      setMsg({ kind: "fejl", text: "De to nye koder er ikke ens." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, nextPassword: next }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        setMsg({ kind: "ok", text: "Adgangskoden er skiftet." });
        setCurrent("");
        setNext("");
        setRepeat("");
      } else {
        setMsg({ kind: "fejl", text: d?.error ?? "Kunne ikke skifte koden." });
      }
    } catch {
      setMsg({ kind: "fejl", text: "Kunne ikke få forbindelse." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          aria-hidden="true"
          style={{
            width: 42, height: 42, borderRadius: "50%", background: "var(--bg-2)",
            border: "1px solid var(--border)", display: "grid", placeItems: "center",
            fontWeight: 600, fontSize: 15,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {profile ? `${profile.name} · ${profile.email}` : person ? "Din konto" : "Fælles login"}
          </div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>
            {person
              ? profile?.hasPassword
                ? "Du logger ind med din egen mail og adgangskode."
                : "Du er logget ind via opsætning — vælg din adgangskode herunder."
              : "Du er logget ind med den fælles kode. Log ind med din egen mail og opsætningskode for at få din egen konto her."}
          </div>
        </div>
      </div>

      {person && (
        <form onSubmit={skift} style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {profile?.hasPassword ? "Skift adgangskode" : "Vælg adgangskode"}
          </div>
          {profile?.hasPassword && (
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Nuværende adgangskode"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              style={inp}
            />
          )}
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Ny adgangskode (mindst 8 tegn)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            style={inp}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Gentag den nye adgangskode"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
            style={inp}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Gemmer…" : "Gem adgangskode"}
            </button>
            {msg && (
              <span
                role="status"
                style={{ fontSize: 13, color: msg.kind === "ok" ? "var(--accent, #2e7)" : "var(--red, #e5484d)" }}
              >
                {msg.text}
              </span>
            )}
          </div>
        </form>
      )}

      <form method="post" action="/api/auth/logout" style={{ display: "grid", gap: 8 }}>
        <button type="submit" style={btnGhost}>
          Log ud
        </button>
        {!person && (
          <span className="cc-dim" style={{ fontSize: 12 }}>
            Bruger du den fælles kode, viser browseren sin kode-dialog igen ved log ud — tryk Anuller for at rydde den.
          </span>
        )}
      </form>
    </section>
  );
}

const inp: React.CSSProperties = {
  width: "100%", height: 38, borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg-2)", padding: "0 12px", fontSize: 14, color: "var(--text)",
};

const btn: React.CSSProperties = {
  height: 38, padding: "0 18px", borderRadius: 8, border: "none", cursor: "pointer",
  background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600,
};

const btnGhost: React.CSSProperties = {
  height: 38, padding: "0 18px", borderRadius: 8, cursor: "pointer", justifySelf: "start",
  border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text)",
  fontSize: 14, fontWeight: 500,
};

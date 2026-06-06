"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

interface Settings {
  autoEngine: boolean;
  dailyLimit: number;
  autoEngineHour: number;
}

export default function SettingsClient({ initial, initialNextRun }: { initial: Settings; initialNextRun: string | null }) {
  const [s, setS] = useState<Settings>(initial);
  const [nextRun, setNextRun] = useState<string | null>(initialNextRun);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  async function save(patch: Partial<Settings>) {
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (d.settings) setS(d.settings);
      setNextRun(d.nextRun ?? null);
      setToast("Gemt.");
      setTimeout(() => setToast(""), 2500);
    } catch {
      setToast("Kunne ikke gemme.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 640 }}>
      <section className="cc-card cc-card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="Sparkles" style={{ width: 20, height: 20, color: "var(--accent-ink)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Auto-kør motor hver morgen</div>
            <div className="cc-dim" style={{ fontSize: 12.5 }}>
              {s.autoEngine
                ? `Tændt — næste kørsel ${nextRun ?? `kl ${String(s.autoEngineHour).padStart(2, "0")}:00`}. Fylder kun køen, sender aldrig.`
                : "Slukket. Motoren kører kun når du selv trykker."}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={s.autoEngine}
            aria-label="Auto-kør motor"
            onClick={() => save({ autoEngine: !s.autoEngine })}
            disabled={saving}
            style={{
              width: 46, height: 27, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
              background: s.autoEngine ? "var(--accent)" : "var(--border-strong)", transition: "background 160ms ease",
            }}
          >
            <span style={{ position: "absolute", top: 3, left: s.autoEngine ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left 160ms cubic-bezier(0.22,1,0.36,1)", boxShadow: "0 1px 3px oklch(0% 0 0 / 0.2)" }} />
          </button>
        </div>
      </section>

      <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 16 }}>
        <Field label="Drafts pr. kørsel" hint="Hvor mange udkast motoren laver (1–25).">
          <input
            type="number" min={1} max={25} value={s.dailyLimit}
            onChange={(e) => setS({ ...s, dailyLimit: Number(e.target.value) })}
            onBlur={(e) => save({ dailyLimit: Number(e.target.value) })}
            style={numInp}
          />
        </Field>
        <Field label="Tidspunkt (time)" hint="Dansk time for morgen-kørslen (0–23). Cron tjekker hver time og kører på dette klokkeslæt.">
          <input
            type="number" min={0} max={23} value={s.autoEngineHour}
            onChange={(e) => setS({ ...s, autoEngineHour: Number(e.target.value) })}
            onBlur={(e) => save({ autoEngineHour: Number(e.target.value) })}
            style={numInp}
          />
        </Field>
        <p className="cc-dim" style={{ fontSize: 12, margin: 0 }}>
          Vercel-cron tjekker hver time og kører motoren på det valgte tidspunkt — kun hvis kontakten ovenfor er tændt, og højst én gang om dagen. Selv da sendes der aldrig mail; den fylder kun godkendelse.
        </p>
      </section>

      {toast && (
        <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "var(--text)", color: "var(--bg)", padding: "10px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500 }}>{toast}</div>
      )}
    </div>
  );
}

const numInp: React.CSSProperties = {
  width: 80, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 14, color: "var(--text)",
};

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div className="cc-dim" style={{ fontSize: 12.5 }}>{hint}</div>
      </div>
      {children}
    </div>
  );
}

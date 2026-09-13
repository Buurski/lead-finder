"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, ArrowRight, Pencil, Receipt } from "lucide-react";
import Link from "next/link";
import type { Client } from "@/lib/sheets";
import type { ClientEconomy } from "@/lib/invoices";

const WS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  demo:          { label: "Demo",    color: "var(--blue)", bg: "var(--blue-dim)" },
  "in progress": { label: "I gang",  color: "var(--text-muted)", bg: "var(--bg-3)" },
  live:          { label: "Live",    color: "var(--green)", bg: "var(--green-dim)" },
};

function safeProjectLabel(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    const parts = value.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || "Projektmappe tilkoblet";
  }
}

export default function ClientCard({ client, economy }: { client: Client; economy?: ClientEconomy }) {
  // Ukendt status må ikke vises som "Demo" — så ville en forkert værdi i
  // arket ligne en rigtig tilstand. Vis den rå værdi i stedet.
  const ws = WS_STYLE[client.websiteStatus] ?? { label: client.websiteStatus?.trim() || "Status ukendt", color: "var(--amber)", bg: "var(--amber-dim)" };
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [monthly, setMonthly] = useState(client.monthlyFee || "");
  const [setup, setSetup] = useState(client.setupFee || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [removing, setRemoving] = useState(false);
  const isPaying = (parseFloat(client.monthlyFee) || 0) > 0;

  async function remove() {
    if (!window.confirm(`Fjern "${client.name}" som klient? (sletter rækken i CRM — kan ikke fortrydes)`)) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/clients/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: client.name }),
      });
      if (!res.ok) throw new Error("kunne ikke fjerne");
      router.refresh();
    } catch {
      setRemoving(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/clients/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id, monthlyFee: monthly, setupFee: setup }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "fejl");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fejl");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-light)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
            {client.name}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{client.branch}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{
            background: ws.bg,
            color: ws.color,
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}>{ws.label}</span>
          <button onClick={remove} disabled={removing} title="Fjern denne klient fra CRM"
            style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 11, cursor: "pointer", padding: 0 }}>
            {removing ? "Fjerner…" : "Fjern"}
          </button>
        </div>
      </div>

      {client.projectFolder && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-dim)",
          fontFamily: "var(--font-display)",
          background: "var(--bg-3)",
          borderRadius: 6,
          padding: "5px 8px",
          overflow: "hidden",
        }}>
          <FolderOpen size={11} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {safeProjectLabel(client.projectFolder)}
          </span>
        </div>
      )}

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-3)", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: 11, color: "var(--text-dim)" }}>
              kr/md
              <input
                type="number" inputMode="numeric" value={monthly} placeholder="0"
                onChange={(e) => setMonthly(e.target.value)}
                style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: 11, color: "var(--text-dim)" }}>
              setup kr
              <input
                type="number" inputMode="numeric" value={setup} placeholder="0"
                onChange={(e) => setSetup(e.target.value)}
                style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
              />
            </label>
          </div>
          {err && <span role="alert" style={{ fontSize: 11, color: "var(--red)" }}>{err}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: "var(--text)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Gemmer…" : "Gem"}
            </button>
            <button onClick={() => { setEditing(false); setMonthly(client.monthlyFee || ""); setSetup(client.setupFee || ""); setErr(""); }} disabled={saving}
              style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 12.5, cursor: "pointer" }}>
              Annullér
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
          {/* Tom streng betyder "ingen har tastet det ind", ikke "0 kr" — vis forskellen. */}
          {isPaying ? (
            <span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{client.monthlyFee} kr</span>
              <span style={{ color: "var(--text-dim)" }}>/md · </span>
              <span>{client.setupFee.trim() ? `${client.setupFee} kr setup` : "setup ikke udfyldt"}</span>
            </span>
          ) : (
            <span style={{ color: "var(--text-dim)" }}>{client.monthlyFee.trim() ? "0 kr/md — aftalt gratis" : "Pris ikke udfyldt endnu"}</span>
          )}
          <button onClick={() => setEditing(true)}
            title="Rediger pris"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            <Pencil size={12} /> {isPaying ? "Rediger" : "Sæt pris"}
          </button>
        </div>
      )}

      {/* Økonomi-status. Mangler kilden, står linjen slet ikke — hellere tavshed
          end et tal ingen kan stole på. */}
      {economy && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: economy.tone === "red" ? "var(--red)" : economy.tone === "amber" ? "var(--amber)" : "var(--text-dim)" }}>
          <Receipt size={13} style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{economy.text}</span>
        </div>
      )}

      {/* Én tydelig primær handling — resten hører hjemme på klientens side. */}
      <Link href={`/clients/${client.id}`} className="cc-btn cc-btn-accent"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", padding: "10px 0", fontSize: 13.5, fontWeight: 600, marginTop: "auto" }}
      >
        Åbn klient <ArrowRight size={14} />
      </Link>
    </div>
  );
}

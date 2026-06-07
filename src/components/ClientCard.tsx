"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, CheckCircle, Clock, ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";
import type { Client } from "@/lib/sheets";

const WS_STYLE = {
  demo:          { label: "Demo klar", color: "#4338ca", bg: "#e0e7ff" },
  "in progress": { label: "I gang",    color: "#b45309", bg: "#fef3c7" },
  live:          { label: "Live",      color: "#15803d", bg: "#dcfce7" },
};

export default function ClientCard({ client }: { client: Client }) {
  const ws = WS_STYLE[client.websiteStatus] ?? WS_STYLE.demo;
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
        gap: 14,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-light)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
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

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
        {client.briefFilled
          ? <CheckCircle size={13} style={{ color: "#22c55e" }} />
          : <Clock size={13} />
        }
        {client.briefFilled ? "Brief udfyldt" : "Brief mangler"}
      </div>

      {client.projectFolder && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-dim)",
          fontFamily: "var(--font-fraunces), serif",
          background: "var(--bg-3)",
          borderRadius: 6,
          padding: "5px 8px",
          overflow: "hidden",
        }}>
          <FolderOpen size={11} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {client.projectFolder}
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
          {err && <span style={{ fontSize: 11, color: "var(--red, #dc2626)" }}>{err}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: "var(--green)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
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
          {isPaying ? (
            <span>
              <span style={{ color: "var(--green)", fontWeight: 600 }}>{client.monthlyFee} kr</span>
              <span style={{ color: "var(--text-dim)" }}>/md · </span>
              <span>{client.setupFee || 0} kr setup</span>
            </span>
          ) : (
            <span style={{ color: "var(--text-dim)" }}>Ingen pris endnu — prospect</span>
          )}
          <button onClick={() => setEditing(true)}
            title="Rediger pris"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            <Pencil size={12} /> {isPaying ? "Rediger" : "Sæt pris"}
          </button>
        </div>
      )}

      <Link href={`/clients/${client.id}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--accent-ink)", textDecoration: "none", marginTop: client.briefFilled ? "auto" : 0 }}
      >
        Åbn klient <ArrowRight size={13} />
      </Link>

      {!client.briefFilled && (
        <Link href={`/clients/${client.id}/brief`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "var(--green)",
            color: "#fff",
            borderRadius: 8,
            padding: "9px 0",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            marginTop: "auto",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
        >
          Start Design <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

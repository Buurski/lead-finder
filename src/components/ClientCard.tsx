"use client";
import { FolderOpen, CheckCircle, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Client } from "@/lib/sheets";

const WS_STYLE = {
  demo:          { label: "Demo klar", color: "#4338ca", bg: "#e0e7ff" },
  "in progress": { label: "I gang",    color: "#b45309", bg: "#fef3c7" },
  live:          { label: "Live",      color: "#15803d", bg: "#dcfce7" },
};

export default function ClientCard({ client }: { client: Client }) {
  const ws = WS_STYLE[client.websiteStatus] ?? WS_STYLE.demo;

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
        <span style={{
          background: ws.bg,
          color: ws.color,
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}>{ws.label}</span>
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

      {client.monthlyFee && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          <span style={{ color: "var(--green)", fontWeight: 600 }}>{client.monthlyFee} kr</span>
          <span style={{ color: "var(--text-dim)" }}>/md · </span>
          <span>{client.setupFee} kr setup</span>
        </div>
      )}

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

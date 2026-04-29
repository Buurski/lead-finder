"use client";
import { useState } from "react";
import { Mail, Send, Eye } from "lucide-react";
import type { Lead } from "@/lib/sheets";
import EmailPreviewModal from "./EmailPreviewModal";

const EMAIL_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  "":       { label: "Ikke sendt",  color: "#64748b", bg: "#f1f5f9" },
  sent:     { label: "Sendt",       color: "#b45309", bg: "#fef3c7" },
  opened:   { label: "Åbnet ✓",    color: "#15803d", bg: "#dcfce7" },
  clicked:  { label: "Klikket ✓✓", color: "#14532d", bg: "#bbf7d0" },
  replied:  { label: "Svarede! 🎉", color: "#14532d", bg: "#bbf7d0" },
};

export default function EmailPanel({ lead, onUpdate }: { lead: Lead; onUpdate: (updated: Partial<Lead>) => void }) {
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewType, setPreviewType] = useState<"cold" | "followup">("cold");

  if (!lead.email) return null;

  const status = EMAIL_STATUS_LABELS[lead.emailStatus] ?? EMAIL_STATUS_LABELS[""];
  const hasFollowup = !!lead.followupSentAt;
  const canSendFollowup = !!lead.emailSentAt && !lead.emailOpenedAt && !hasFollowup;

  async function send(type: "cold" | "followup") {
    setSending(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.ok) {
        const now = new Date().toISOString();
        onUpdate(type === "cold"
          ? { emailSentAt: now, emailStatus: "sent" }
          : { followupSentAt: now }
        );
      } else {
        alert(`Fejl: ${data.error}`);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Mail size={13} color="var(--text-dim)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Email
        </span>
      </div>

      <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8, wordBreak: "break-all" }}>
        {lead.email}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ background: status.bg, color: status.color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>
          {status.label}
        </span>
        {lead.emailSentAt && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {new Date(lead.emailSentAt).toLocaleDateString("da-DK")}
          </span>
        )}
        {hasFollowup && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>· Follow-up sendt</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!lead.emailSentAt && (
          <>
            <button
              onClick={() => send("cold")}
              disabled={sending}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sending ? 0.6 : 1 }}
            >
              <Send size={12} />
              {sending ? "Sender..." : "Send mail"}
            </button>
            <button
              onClick={() => { setPreviewType("cold"); setShowPreview(true); }}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              <Eye size={12} />
              Preview
            </button>
          </>
        )}
        {canSendFollowup && (
          <button
            onClick={() => send("followup")}
            disabled={sending}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#b45309", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sending ? 0.6 : 1 }}
          >
            <Send size={12} />
            {sending ? "Sender..." : "Send follow-up"}
          </button>
        )}
        {lead.emailStatus !== "replied" && lead.emailSentAt && (
          <button
            onClick={() => onUpdate({ emailStatus: "replied" })}
            style={{ background: "transparent", color: "#15803d", border: "1px solid #86efac", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            Marker som svarede
          </button>
        )}
      </div>

      {showPreview && (
        <EmailPreviewModal
          lead={lead}
          type={previewType}
          onClose={() => setShowPreview(false)}
          onSend={() => { setShowPreview(false); send(previewType); }}
        />
      )}
    </div>
  );
}

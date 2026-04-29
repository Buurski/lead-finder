"use client";
import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import type { Lead } from "@/lib/sheets";

interface Template { subject: string; text: string; html: string; }

export default function EmailPreviewModal({
  lead, type, onClose, onSend,
}: {
  lead: Lead;
  type: "cold" | "followup";
  onClose: () => void;
  onSend: () => void;
}) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/leads/${lead.id}/email-preview?type=${type}`)
      .then((r) => r.json())
      .then((data) => { setTemplate(data); setLoading(false); });
  }, [lead.id, type]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "min(560px, 95vw)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {type === "cold" ? "Kold mail" : "Follow-up"} — preview
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Henter preview...</p>
        ) : template ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Til</span>
              <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 500 }}>{lead.email}</p>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Emne</span>
              <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600 }}>{template.subject}</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Besked</span>
              <div
                style={{ margin: "8px 0 0", background: "var(--surface-raised, #f8fafc)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: template.html }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
                Annuller
              </button>
              <button onClick={onSend} style={{ display: "flex", alignItems: "center", gap: 6, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Send size={13} />
                Send mail
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: "#dc2626", fontSize: 13 }}>Kunne ikke hente preview.</p>
        )}
      </div>
    </div>
  );
}

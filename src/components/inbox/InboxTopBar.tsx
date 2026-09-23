import Icon from "@/components/shell/Icon";

// Kompakt status-bjælke øverst: tal + pause-status (fra GET /api/approve/send,
// den eksisterende preflight-rute — kalder aldrig POST/send) + selve
// "Send godkendte"-knappen. Bekræftelses-/preflight-flowet ligger uændret i
// InboxApp (sendApproved) — denne komponent er ren visning + knap-triggere.
export default function InboxTopBar({
  pending,
  approved,
  approvedLucas,
  approvedCharlie,
  cap,
  pause,
  sendBusy,
  resetBusy,
  sendProg,
  sendMsg,
  onSend,
  onSendLucas,
  onSendCharlie,
  onReset,
}: {
  pending: number;
  approved: number;
  approvedLucas: number;
  approvedCharlie: number;
  cap: number | null;
  pause: { paused: boolean; until?: string } | null;
  sendBusy: boolean;
  resetBusy: boolean;
  sendProg: { processed: number; total: number; sent: number; failed: number; line: string } | null;
  sendMsg: string;
  onSend: () => void;
  onSendLucas: () => void;
  onSendCharlie: () => void;
  onReset: () => void;
}) {
  return (
    <div className="inbox-statusbar">
      <div className="inbox-stat">
        <b>{pending}</b>
        <span>Til godkendelse</span>
      </div>
      <div className="inbox-stat">
        <b>{approved}</b>
        <span>Godkendt · klar</span>
      </div>
      <div className="inbox-stat">
        <b>{cap ?? "–"}</b>
        <span>Send-loft pr. klik</span>
      </div>

      {pause?.paused && (
        <div className="inbox-pause">
          <Icon name="Pause" style={{ width: 14, height: 14, color: "var(--amber)" }} />
          Afsendelse på pause{pause.until ? ` til ${pause.until}` : ""}
        </div>
      )}

      <div className="spacer" />

      {sendProg ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
          <div className="inbox-progress-track">
            <div className="inbox-progress-fill" style={{ width: `${sendProg.total ? Math.round((sendProg.processed / sendProg.total) * 100) : 0}%` }} />
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{sendProg.line} · {sendProg.sent} sendt{sendProg.failed ? ` · ${sendProg.failed} fejlede` : ""}</span>
        </div>
      ) : (
        sendMsg && approved === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>✓ {sendMsg}</span>
      )}

      {approved > 0 && (
        <>
          {approvedLucas > 0 && approvedCharlie > 0 && (
            <>
              <button type="button" className="inbox-btn" disabled={sendBusy || resetBusy} onClick={onSendLucas}>Kun Lucas ({approvedLucas})</button>
              <button type="button" className="inbox-btn" disabled={sendBusy || resetBusy} onClick={onSendCharlie}>Kun Charlie ({approvedCharlie})</button>
            </>
          )}
          <button type="button" className="inbox-btn" disabled={sendBusy || resetBusy} onClick={onReset} title="Flyt alle godkendte tilbage til Afventer — der sendes intet">
            {resetBusy ? "Nulstiller…" : "→ Afventer"}
          </button>
          <button type="button" className="inbox-send-btn" disabled={sendBusy || resetBusy} onClick={onSend}>
            {sendBusy ? "Sender…" : `Send godkendte (${approved})`}
          </button>
        </>
      )}
    </div>
  );
}

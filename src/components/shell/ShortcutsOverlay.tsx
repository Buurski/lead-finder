"use client";
import Icon from "./Icon";

// "?"-overlay (Bundle G): oversigt over globale genveje. Ren visning — selve
// tastelytningen bor i AppShell saa der kun er ét globalt keydown-sted.
const GLOBAL = [
  { keys: "⌘K", what: "Søg og hop til side" },
  { keys: "M", what: "Mission Control" },
  { keys: "G", what: "Godkendelse" },
  { keys: "S", what: "Svar (indbakke)" },
  { keys: "L", what: "Leads" },
  { keys: "?", what: "Denne oversigt" },
  { keys: "Esc", what: "Luk overlay / palette" },
];

const APPROVE = [
  { keys: "J / K", what: "Næste / forrige udkast" },
  { keys: "A", what: "Godkend fokuseret udkast" },
  { keys: "R", what: "Afvis fokuseret udkast" },
  { keys: "E", what: "Redigér fokuseret udkast" },
  { keys: "Space", what: "Vælg/fravælg til batch-godkend" },
];

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="cc-palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="cc-palette cc-fade"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tastatur-genveje"
        style={{ padding: 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Icon name="Keyboard" style={{ width: 16, height: 16, color: "var(--accent-ink)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Genveje</h2>
          <button
            onClick={onClose}
            aria-label="Luk"
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}
          >
            <Icon name="X" style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <ShortcutList title="Globalt" rows={GLOBAL} />
          <ShortcutList title="Godkendelse" rows={APPROVE} />
        </div>
        <p className="cc-dim" style={{ fontSize: 11.5, margin: "12px 0 0" }}>
          Bogstav-genvejene virker kun når du ikke skriver i et felt.
        </p>
      </div>
    </div>
  );
}

function ShortcutList({ title, rows }: { title: string; rows: { keys: string; what: string }[] }) {
  return (
    <div>
      <div className="cc-navgroup-label" style={{ padding: "0 0 6px" }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.keys + r.what} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span className="cc-kbd" style={{ minWidth: 44, textAlign: "center" }}>{r.keys}</span>
            <span>{r.what}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

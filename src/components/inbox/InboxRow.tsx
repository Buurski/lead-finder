import { DEFAULT_SEQUENCE_LENGTH, GRADE_META, type QueueDraft } from "./types";

// Én række i listen. Bevidst enkel — 150 rækker har ikke brug for
// virtualisering (ui-common.md).
export default function InboxRow({
  draft,
  selected,
  showCheckbox,
  checked,
  onToggleCheck,
  onOpen,
}: {
  draft: QueueDraft;
  selected: boolean;
  showCheckbox: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onOpen: () => void;
}) {
  const g = draft.jev?.grade ?? "?";
  const gm = GRADE_META[g] ?? GRADE_META["?"];
  const initials = (draft.sender ?? draft.sentBy) === "charlie" ? "C" : "L";
  const contacted = draft.history?.seenBefore;

  // Opfølgnings-kladder viser sekvens-fremdrift i stedet for det normale
  // emne; stoppede sekvenser viser hvorfor (spec §11).
  const stopped = draft.source === "opfoelgning" && draft.status === "rejected" && draft.stoppedReason;
  const subjectLine = stopped
    ? `Stoppet: ${draft.stoppedReason}`
    : draft.source === "opfoelgning" && draft.step
      ? `Opfølgning ${draft.step}/${DEFAULT_SEQUENCE_LENGTH}${draft.professionalism ? ` · ${draft.professionalism}` : ""}`
      : draft.subject;

  return (
    <div className="inbox-row" data-selected={selected}>
      {showCheckbox && (
        <input
          type="checkbox"
          className="inbox-row-checkbox"
          checked={checked}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Vælg ${draft.name}`}
        />
      )}
      <button type="button" onClick={onOpen} style={{ all: "unset", flex: 1, minWidth: 0, cursor: "pointer", display: "flex", gap: 10 }}>
        <span className="inbox-row-avatar" aria-hidden="true">{initials}</span>
        <span className="inbox-row-main">
          <span className="inbox-row-top">
            <span className="inbox-row-name">{draft.name}</span>
            <span className="inbox-row-grade" style={{ color: gm.fg, background: gm.bg, borderColor: gm.border }}>{g}</span>
          </span>
          <span className="inbox-row-meta">{[draft.branch, draft.city].filter(Boolean).join(" · ")}</span>
          <span className="inbox-row-subject" style={stopped ? { color: "var(--red)" } : undefined}>{subjectLine}</span>
          {contacted && (
            <span className="inbox-row-bottom">
              <span className="inbox-row-contacted">
                kontaktet før{draft.history?.lastContactAt ? ` · sidst ${draft.history.lastContactAt}` : ""}
              </span>
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

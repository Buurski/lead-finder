import InboxRow from "./InboxRow";
import type { QueueDraft, Tab } from "./types";

export default function InboxList({
  drafts,
  selectedId,
  onOpen,
  showCheckbox,
  selected,
  onToggleCheck,
  shownCount,
  onShowMore,
  tab,
}: {
  drafts: QueueDraft[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  showCheckbox: boolean;
  selected: Set<string>;
  onToggleCheck: (id: string) => void;
  shownCount: number;
  onShowMore: () => void;
  tab: Tab;
}) {
  const shown = drafts.slice(0, shownCount);

  if (drafts.length === 0) {
    return (
      <div className="inbox-empty-list">
        {tab === "followups"
          ? "Opfølgninger kommer her, når sekvenserne er slået til."
          : "Intet her endnu."}
      </div>
    );
  }

  return (
    <div>
      {shown.map((d) => (
        <InboxRow
          key={d.id}
          draft={d}
          selected={d.id === selectedId}
          showCheckbox={showCheckbox}
          checked={selected.has(d.id)}
          onToggleCheck={() => onToggleCheck(d.id)}
          onOpen={() => onOpen(d.id)}
        />
      ))}
      {drafts.length > shown.length && (
        <button type="button" className="inbox-btn" onClick={onShowMore} style={{ margin: "14px auto", display: "block" }}>
          Vis flere ({drafts.length - shown.length} tilbage)
        </button>
      )}
    </div>
  );
}

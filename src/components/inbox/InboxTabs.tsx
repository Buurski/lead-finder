import { TAB_META, TAB_ORDER, type Tab } from "./types";

export default function InboxTabs({
  active,
  counts,
  onChange,
}: {
  active: Tab;
  counts: Record<Tab, number>;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="inbox-tabs" role="tablist" aria-label="Indbakke-faner">
      {TAB_ORDER.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={active === t}
          className="inbox-tab"
          data-active={active === t}
          onClick={() => onChange(t)}
        >
          {TAB_META[t]}
          <span className="n">{counts[t]}</span>
        </button>
      ))}
    </div>
  );
}

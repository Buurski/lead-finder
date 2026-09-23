import type { Tab } from "./types";

type GradeFilter = "ok" | "all" | "best" | "A" | "B" | "C";
type Sort = "jev" | "newest";

// Filtre og bulk-handlinger som diskrete chip-rækker (ikke en væg af knapper).
// Alt herunder er 1:1-funktion fra det gamle /approve — kun grupperingen er ny.
export default function InboxFilterBar({
  tab,
  gradeFilter,
  setGradeFilter,
  pendingSort,
  setPendingSort,
  q,
  setQ,
  branchFilter,
  setBranchFilter,
  branches,
  showSearch,
  seenOnly,
  setSeenOnly,
  seenCount,
  labelStat,
  selection,
  tools,
}: {
  tab: Tab;
  gradeFilter: GradeFilter;
  setGradeFilter: (g: GradeFilter) => void;
  pendingSort: Sort;
  setPendingSort: (s: Sort) => void;
  q: string;
  setQ: (v: string) => void;
  branchFilter: string;
  setBranchFilter: (v: string) => void;
  branches: string[];
  showSearch: boolean;
  seenOnly: boolean;
  setSeenOnly: (v: boolean) => void;
  seenCount: number;
  labelStat: { god: number; daarlig: number; nok: boolean } | null;
  selection: {
    selectedCount: number;
    visibleCount: number;
    totalPendingCount: number;
    onSelectAll: () => void;
    onClear: () => void;
    onApproveSelected: () => void;
    onRejectSelected: () => void;
    onBulkApprove: () => void;
    selBusy: boolean;
    rejBusy: boolean;
    bulkBusy: boolean;
  } | null;
  tools: {
    jevRunBusy: boolean;
    jevRunMsg: string;
    onRunJev: () => void;
    enrichBusy: boolean;
    enrichMsg: string;
    onEnrich: () => void;
    socialBusy: boolean;
    socialMsg: string;
    onFetchFollowers: () => void;
    followerCostKr: number;
    gradeCCount: number;
    onRejectGradeC: () => void;
    seenBusy: boolean;
    seenMsg: string;
    onRejectSeenAll: () => void;
  } | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="inbox-filterbar">
        {showSearch && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg navn, by eller emne…"
            aria-label="Søg i udkast"
            className="inbox-search"
          />
        )}
        {branches.length > 1 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            aria-label="Filtrér på branche"
            className="inbox-search"
            style={{ cursor: "pointer", flex: "0 0 auto" }}
          >
            <option value="all">Alle brancher</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}

        <div className="inbox-chipgroup" role="group" aria-label="Karakter">
          {(["best", "ok", "all", "A", "B", "C"] as const).map((key) => (
            <button key={key} type="button" className="inbox-chip" data-active={gradeFilter === key} onClick={() => setGradeFilter(key)}>
              {key === "best" ? "Bedste" : key === "ok" ? "Skjul dårlige" : key === "all" ? "Alle" : key}
            </button>
          ))}
        </div>

        {tab === "pending" && (
          <div className="inbox-chipgroup" role="group" aria-label="Sortering">
            <button type="button" className="inbox-chip" data-active={pendingSort === "jev"} onClick={() => setPendingSort("jev")}>Jev-prioritet</button>
            <button type="button" className="inbox-chip" data-active={pendingSort === "newest"} onClick={() => setPendingSort("newest")}>Nyeste</button>
          </div>
        )}

        {tab === "pending" && seenCount > 0 && (
          <button type="button" className="inbox-chip-solo" data-active={seenOnly} onClick={() => setSeenOnly(!seenOnly)} title="Vis kun kladder hvor forretningen er kontaktet før">
            ⚠ Set før ({seenCount})
          </button>
        )}

        {labelStat && labelStat.god + labelStat.daarlig > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }} title="Dine God/Dårlig-domme kalibrerer attraktivitets-formlen">
            {labelStat.god} god · {labelStat.daarlig} dårlig{labelStat.nok ? " · nok til at måle" : ""}
          </span>
        )}
      </div>

      {tab === "pending" && selection && (
        <div className="inbox-filterbar">
          {selection.selectedCount > 0 ? (
            <>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{selection.selectedCount} valgt</span>
              <button type="button" className="inbox-chip-solo" onClick={selection.onApproveSelected} disabled={selection.selBusy}>
                {selection.selBusy ? "Godkender…" : "Godkend valgte"}
              </button>
              <button type="button" className="inbox-chip-solo" data-tone="risk" onClick={selection.onRejectSelected} disabled={selection.rejBusy}>
                {selection.rejBusy ? "Afviser…" : "Afvis valgte"}
              </button>
              <button type="button" className="inbox-chip" onClick={selection.onClear}>Ryd valg</button>
            </>
          ) : (
            <>
              <button type="button" className="inbox-chip" onClick={selection.onSelectAll}>
                {selection.visibleCount < selection.totalPendingCount ? `Vælg filtrerede (${selection.visibleCount})` : "Vælg alle"}
              </button>
              {selection.visibleCount > 0 && (
                <button type="button" className="inbox-chip-solo" onClick={selection.onBulkApprove} disabled={selection.bulkBusy}>
                  {selection.bulkBusy ? "Godkender…" : `Godkend alle (${selection.visibleCount})`}
                </button>
              )}
            </>
          )}

          {tools && (
            <>
              <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
              <button type="button" className="inbox-chip" onClick={tools.onRunJev} disabled={tools.jevRunBusy} title="Kør en Jev-vurdering nu i stedet for at vente på nat-cronnen">
                {tools.jevRunBusy ? "Vurderer…" : "Vurdér nu"}
              </button>
              <button type="button" className="inbox-chip" onClick={tools.onEnrich} disabled={tools.enrichBusy} title="Slå forretningerne op hos Google — koster Places-kald">
                {tools.enrichBusy ? "Slår op…" : "Hent forretningsdata"}
              </button>
              <button type="button" className="inbox-chip" onClick={tools.onFetchFollowers} disabled={tools.socialBusy} title="Facebook-følgertal — koster ca. samme beløb pr. side">
                {tools.socialBusy ? "Henter…" : `Hent følgertal (ca. ${tools.followerCostKr} kr)`}
              </button>
              {tools.gradeCCount > 0 && (
                <button type="button" className="inbox-chip-solo" data-tone="risk" onClick={tools.onRejectGradeC}>
                  Afvis alle C ({tools.gradeCCount})
                </button>
              )}
              {seenOnly && seenCount > 0 && (
                <button type="button" className="inbox-chip-solo" data-tone="risk" onClick={tools.onRejectSeenAll} disabled={tools.seenBusy}>
                  {tools.seenBusy ? "Afviser…" : `Afvis alle "Set før" (${seenCount})`}
                </button>
              )}
              {(tools.jevRunMsg || tools.enrichMsg || tools.socialMsg || tools.seenMsg) && (
                <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                  {tools.jevRunMsg || tools.enrichMsg || tools.socialMsg || tools.seenMsg}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

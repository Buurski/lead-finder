"use client";
// Låsen + Hermes' fremdrift på et kort i Arbejder. Bruges på tavlen og i dialogen.
// Teksten afhænger af klokken (`now`), så server og browser kan være et minut
// uenige — derfor suppressHydrationWarning på de tidsafhængige elementer.
import type { BlogWork } from "@/lib/hq/posts";
import Icon from "@/components/shell/Icon";
import { workLine } from "./blog-utils";

export default function WorkStatus({ work, now, onRetry, busy }: { work: BlogWork; now: number; onRetry?: () => void; busy?: boolean }) {
  const { state, text, pct } = workLine(work, now);
  return (
    <div className="bl-work" data-state={state} suppressHydrationWarning>
      <div className="bl-work-lock">
        <Icon name="Lock" style={{ width: 12, height: 12 }} /> Under arbejde hos Hermes
      </div>
      {text && <div className="bl-work-line" suppressHydrationWarning>{text}</div>}
      {state !== "idle" && (
        <div className="bl-work-bar" role="progressbar" aria-label="Hermes' fremdrift" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          <span style={{ width: `${pct ?? 0}%` }} suppressHydrationWarning />
        </div>
      )}
      {(state === "failed" || state === "stale") && onRetry && (
        <button
          type="button"
          className="cc-btn bl-work-retry"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
        >
          <Icon name="RefreshCw" style={{ width: 13, height: 13 }} /> Prøv igen
        </button>
      )}
    </div>
  );
}

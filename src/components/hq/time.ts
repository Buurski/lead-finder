// Fælles "for N siden"-formattering til HQ-kortene (Team, Agent-jobs).
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} t siden`;
  const days = Math.round(hrs / 24);
  return `${days} d siden`;
}

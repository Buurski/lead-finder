"use client";
// Sidst åbnede virksomheder til ⌘K-paletten ("Seneste"). Rent lokalt (per
// browser) — bruges kun til at vise genveje, aldrig læst/skrevet af Claude.
// localStorage kan mangle (privat vindue, blokerede cookies) — alt er try/catch.

const KEY = "cc-recent-companies";
const MAX = 8;

export interface RecentCompany {
  id: string;
  name: string;
}

export function readRecentCompanies(): RecentCompany[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentCompany => !!x && typeof x === "object" && typeof (x as RecentCompany).id === "string" && typeof (x as RecentCompany).name === "string",
    );
  } catch {
    return [];
  }
}

export function pushRecentCompany(entry: RecentCompany): void {
  try {
    const next = [entry, ...readRecentCompanies().filter((x) => x.id !== entry.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stille fald tilbage til ingen historik
  }
}

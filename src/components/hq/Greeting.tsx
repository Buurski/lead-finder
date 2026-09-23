import type { CurrentUser } from "@/lib/current-user";

function greetPrefix(hour: number): string {
  if (hour < 10) return "God morgen";
  if (hour < 17) return "God dag";
  return "God aften";
}

function nameFor(user: CurrentUser): string {
  if (user === "lucas") return "Lucas";
  if (user === "charlie") return "Charlie";
  return "";
}

// "TIRSDAG 22. SEPTEMBER" — bygget af Intl i Europe/Copenhagen (samme mønster
// som copenhagenNow()), så datoen aldrig hopper en dag pga. servertidszonen.
function dateLabelFor(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day}. ${parts.month}`.toUpperCase();
}

export default function Greeting({ user, hour, date }: { user: CurrentUser; hour: number; date: string }) {
  const name = nameFor(user);
  const greeting = name ? `${greetPrefix(hour)}, ${name}` : greetPrefix(hour);
  return (
    <div className="hq-greeting">
      <h1>{greeting}</h1>
      <div className="hq-date hq-mono">{dateLabelFor(date)}</div>
    </div>
  );
}

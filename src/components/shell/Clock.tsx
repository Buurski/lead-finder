"use client";
import { useEffect, useState } from "react";

// Local time, Copenhagen-friendly. Renders nothing until mounted so server and
// client markup match (no hydration mismatch on the seconds boundary).
export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="cc-clock" aria-hidden style={{ opacity: 0 }}>00:00</span>;
  const time = now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  const day = now.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
  return (
    <span className="cc-clock" suppressHydrationWarning>
      <span style={{ color: "var(--text-dim)" }}>{day}</span>
      <span style={{ margin: "0 7px", color: "var(--border-strong)" }}>·</span>
      {time}
    </span>
  );
}

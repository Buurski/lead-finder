"use client";
import { useState } from "react";

export default function CalendarLinks({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const webcal = url.replace(/^https:/, "webcal:");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError("");
    } catch { setError("Kunne ikke kopiere linket. Markér og kopiér adressen ovenfor."); }
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <a className="cc-link" href={webcal}>Åbn kalenderabonnement</a>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <code style={{ overflowWrap: "anywhere", fontSize: 12 }}>{url}</code>
      <button type="button" className="cc-btn" onClick={() => void copy()}>{copied ? "Kopieret" : "Kopiér"}</button>
    </div>
    {error && <span role="alert" className="op-quickadd-err">{error}</span>}
  </div>;
}

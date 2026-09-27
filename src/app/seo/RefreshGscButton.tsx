"use client";
// "Hent nu" — kinly.dk's Search Console-tal med det samme i stedet for at vente på mandags-cron'en.
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshGscButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function refresh() {
    setState("busy");
    try {
      const res = await fetch("/api/seo/kinly-refresh", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setState("idle");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "ukendt fejl");
      setState("error");
    }
  }
  return <>
    <button type="button" className="cc-btn" disabled={state === "busy"} onClick={refresh}>{state === "busy" ? "Henter…" : "Hent tal nu"}</button>
    {state === "error" && <span className="konk-finding-error">Kunne ikke hente: {msg}</span>}
  </>;
}

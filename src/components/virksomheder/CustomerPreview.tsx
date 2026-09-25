"use client";
import { useState } from "react";

// Billede til kundekortet: kinly.dk-projektbilledet når kunden har en case, ellers et
// skærmbillede af deres egen side (automatisk for nye kunder), ellers initialer.
export default function CustomerPreview({ domain, name, image }: { domain: string | null; name: string; image?: string | null }) {
  const [failed, setFailed] = useState(0);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "K";
  const sources = [image, domain ? `/api/shot?d=${encodeURIComponent(domain)}` : null].filter(Boolean) as string[];
  const src = sources[failed];
  return <div className="kunde-preview">
    {src ? <img src={src} alt={`${name}: ${image && failed === 0 ? "projektbillede fra kinly.dk" : "forsiden af deres hjemmeside"}`} loading="lazy" onError={() => setFailed((n) => n + 1)} /> : <span aria-hidden="true">{initials}</span>}
  </div>;
}

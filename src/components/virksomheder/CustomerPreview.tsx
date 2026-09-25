"use client";
import { useState } from "react";

export default function CustomerPreview({ domain, name }: { domain: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "K";
  return <div className="kunde-preview">
    {domain && !failed ? <img src={`/api/shot?d=${encodeURIComponent(domain)}`} alt={`Forhåndsvisning af ${name}`} loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">{initials}</span>}
  </div>;
}

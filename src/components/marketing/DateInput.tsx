"use client";
// Dato-felt der først gemmer, når datoen er hel og rimelig. Et almindeligt onChange-felt gemmer 0002-10-16,
// mens man taster årstallet (0002 → 0020 → 0202 → 2026), og låser feltet midt i tastningen.
// Gemmer først, når man har holdt en kort pause (ellers bliver "2" i dagen til den 2. på vej mod den 24.).
// Tømmes feltet, gemmes "ingen dato" først når man forlader det.
import { useEffect, useRef, useState } from "react";

const okDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2020 && Number(v.slice(0, 4)) <= 2100;

export default function DateInput({ value, onCommit, disabled, id, min, className = "cc-input mk-input", label }: {
  value: string | null; onCommit: (v: string | null) => void; disabled?: boolean; id?: string; min?: string; className?: string; label?: string;
}) {
  const [v, setV] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setV(value ?? ""); } // serveren svarede med en anden dato: vis den
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const commit = (next: string) => { if (timer.current) clearTimeout(timer.current); if (okDay(next) && next !== value) onCommit(next); };
  return (
    <input
      id={id} type="date" className={className} value={v} min={min} disabled={disabled} aria-label={label}
      onChange={(e) => {
        const next = e.target.value;
        setV(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(next), 700);
      }}
      onBlur={() => { if (v === "" && value) onCommit(null); else commit(v); }}
    />
  );
}

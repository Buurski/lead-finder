"use client";
// Tryk-for-forklaring (ⓘ): en lille knap der folder en kort hverdagsforklaring ud.
// Bruges efter overskrifter og feltnavne, så Charlie aldrig møder et fagord uden hjælp.
import { useId, useState, type ReactNode } from "react";
import "./marketing.css";

export default function Info({ children, label = "Forklaring" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="mk-info-btn" aria-expanded={open} aria-controls={id} aria-label={label} title={label} onClick={() => setOpen((v) => !v)}>
        i
      </button>
      {open && (
        <span id={id} className="mk-info-text" role="note">
          {children}
        </span>
      )}
    </>
  );
}

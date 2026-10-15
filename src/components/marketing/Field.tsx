"use client";
// Feltnavn + hjælp (ⓘ) + selve feltet. Navnet er en rigtig <label>, så skærmlæsere og tastaturbrugere
// ved, hvad feltet hedder. Er barnet et enkelt input/select/textarea, kobles det automatisk; ellers send forId.
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import Info from "./Info";
import "./marketing.css";

export default function Field({ label, info, forId, children }: { label: string; info?: string; forId?: string; children: ReactNode }) {
  const auto = useId();
  const id = forId ?? auto;
  const direct = isValidElement(children) && typeof children.type === "string" && ["input", "select", "textarea"].includes(children.type);
  return (
    <div className="mk-field">
      <span className="mk-label">
        <label htmlFor={id}>{label}</label>
        {info && <Info label={`Hvad er ${label.toLowerCase()}?`}>{info}</Info>}
      </span>
      {direct ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children}
    </div>
  );
}

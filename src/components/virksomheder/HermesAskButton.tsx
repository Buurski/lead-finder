"use client";

// Åbner Hermes-docken (Task 7, bygges senere) med kundens kontekst forudfyldt.
// Docken lytter (eller vil lytte) efter "hermes:open" på window — se
// docs/superpowers/specs/2026-09-22-kinly-crm-hq-design.md §10.
export default function HermesAskButton({ companyId, name }: { companyId: string; name: string }) {
  function ask() {
    window.dispatchEvent(
      new CustomEvent("hermes:open", { detail: { companyId, prompt: `Hvad skal jeg vide om ${name}?` } }),
    );
  }
  return (
    <button className="cc-btn virk-btn-press" onClick={ask}>
      Spørg Hermes om kunden
    </button>
  );
}

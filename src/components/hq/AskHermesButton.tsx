"use client";

// Hermes-docken lytter efter dette event og åbner sig selv (fase 2 Task 7,
// bygges parallelt) — knappen her skal bare sende det.
export default function AskHermesButton() {
  return (
    <button
      type="button"
      className="hq-btn-lime cc-focus"
      onClick={() => window.dispatchEvent(new CustomEvent("hermes:open"))}
    >
      Spørg Hermes
    </button>
  );
}

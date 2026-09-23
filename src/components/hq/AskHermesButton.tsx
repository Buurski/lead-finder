"use client";

// Hermes-docken lytter efter dette event og åbner sig selv med prompten
// forudfyldt (fase 2 Task 7, bygges parallelt) — knappen her skal bare
// sende det, i det format Task 7 forventer.
export default function AskHermesButton({ prompt = "Hvad skal jeg fokusere på i dag?" }: { prompt?: string }) {
  return (
    <button
      type="button"
      className="hq-btn-lime cc-focus"
      onClick={() => window.dispatchEvent(new CustomEvent("hermes:open", { detail: { prompt } }))}
    >
      Spørg Hermes
    </button>
  );
}

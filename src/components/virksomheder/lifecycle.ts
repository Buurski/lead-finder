// Livsfase-labels og chip-farver, delt mellem listen og profilen.
export const LIFECYCLE_LABEL: Record<string, string> = {
  ny: "Ny",
  kontaktet: "Kontaktet",
  svaret: "Svaret",
  interesseret: "Interesseret",
  kunde: "Kunde",
  tabt: "Tabt",
  ikke_egnet: "Ikke egnet",
  flettet: "Flettet",
};

export function lifecycleLabel(lifecycle: string): string {
  return LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
}

const CHIP_STYLE: Record<string, { background: string; color: string }> = {
  ny: { background: "var(--bg-3)", color: "var(--text-muted)" },
  kontaktet: { background: "var(--blue-dim)", color: "var(--blue)" },
  svaret: { background: "var(--amber-dim)", color: "var(--amber)" },
  interesseret: { background: "var(--accent-soft)", color: "var(--accent-ink)" },
  kunde: { background: "var(--green-dim)", color: "var(--green)" },
  tabt: { background: "var(--red-dim)", color: "var(--red)" },
  ikke_egnet: { background: "var(--red-dim)", color: "var(--red)" },
  flettet: { background: "var(--bg-3)", color: "var(--text-dim)" },
};

export function lifecycleChipStyle(lifecycle: string): { background: string; color: string } {
  return CHIP_STYLE[lifecycle] ?? CHIP_STYLE.ny;
}

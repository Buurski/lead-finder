// Kundeprofil til gratis udkast: Jev dømmer stil, størrelse og ambition, så
// Hermes kan vælge referencer der ligner kunden (ikke én skabelon til alle).
// Uden Jev (ingen nøgle/timeout) → ingen profil; Hermes falder tilbage på branchen.
// Kundens egen fritekst sendes kun med når JEV_REPLIES=1 (samme DPA-gate som svar).
import { choice, jevAsk, score } from "../jev.ts";

export const STILE = {
  klassisk_lokal: "Klassisk lokal forretning — tryg, enkel, traditionel",
  moderne_minimal: "Moderne og minimalistisk — rent, luftigt, skarpt",
  eksklusiv: "Eksklusiv/luksus — mørke eller dæmpede farver, elegant typografi",
  varm_personlig: "Varm og personlig — ejeren i centrum, bløde farver, fotos af mennesker",
  robust_haandvaerk: "Robust håndværk — kraftig, praktisk, kontakt/tilbud i fokus",
  ung_trendy: "Ung og trendy — sociale medier, farverig, legende",
} as const;
export const STOERRELSE = {
  solo: "Enkeltperson/soloselvstændig",
  lille: "Lille team (2–9)",
  etableret: "Etableret virksomhed (10+) eller flere afdelinger",
} as const;
const AMBITION = [
  "Vil bare have noget der ser ordentligt ud",
  "Vil findes på Google lokalt",
  "Vil have flere kunder/bookinger via siden",
  "Vil vækste online (SEO, kampagner, flere sider)",
];

export interface DraftProfile {
  stil: keyof typeof STILE;
  stilSikkerhed: number;
  stoerrelse: keyof typeof STOERRELSE;
  ambition: number; // 0..3
  at: string;
}

export async function profileDraftRequest(r: {
  company: string;
  branch?: string;
  website?: string;
  questionnaire?: string;
}): Promise<DraftProfile | null> {
  const state: Record<string, string> = { virksomhed: r.company, branche: r.branch ?? "", hjemmeside: r.website ?? "" };
  if (process.env.JEV_REPLIES === "1" && r.questionnaire) state.kundens_ord = r.questionnaire.slice(0, 1500);
  const res = await jevAsk(
    state,
    {
      stil: { type: "choice", instructions: "Hvilken visuel stil passer bedst til denne danske lokale virksomhed og dens kunder?", criteria: STILE },
      stoerrelse: { type: "choice", instructions: "Hvor stor er virksomheden sandsynligvis?", criteria: STOERRELSE },
      ambition: { type: "score", instructions: "Hvad vil virksomheden sandsynligvis opnå med en ny hjemmeside?", criteria: AMBITION },
    },
    { timeoutMs: 8000 },
  );
  const s = choice(res?.answers, "stil");
  const st = choice(res?.answers, "stoerrelse");
  const a = score(res?.answers, "ambition");
  if (!s || !st || a === undefined || !(s.choice in STILE) || !(st.choice in STOERRELSE)) return null;
  return {
    stil: s.choice as DraftProfile["stil"],
    stilSikkerhed: Math.round(s.confidence * 100) / 100,
    stoerrelse: st.choice as DraftProfile["stoerrelse"],
    ambition: a,
    at: new Date().toISOString(),
  };
}

/** Profiler en ny forespørgsel og gem profilen på den. Fejl vælter aldrig flowet. */
export async function attachProfile(id: string, input: Parameters<typeof profileDraftRequest>[0]): Promise<void> {
  try {
    const profile = await profileDraftRequest(input);
    if (!profile) return;
    const { setPreviewProfile } = await import("../preview-queue.ts");
    await setPreviewProfile(id, profile);
  } catch (err) {
    console.error(JSON.stringify({ evt: "draft-profile.failed", error: String(err).slice(0, 200) }));
  }
}

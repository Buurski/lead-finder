// post-score.ts — Jev-bedømmelse af blogidéer, FØR nogen skriver dem. Seks
// uafhængige noul-spørgsmål (0-1, skaleret til 0-100) om samme idé, kørt i ét
// jevAsk-kald (spørgsmål er parallelle server-side, output er gratis). Input
// er kun titel + kategori + note — aldrig brødteksten (en idé har typisk
// ingen tekst endnu).
//
// Jev returnerer ikke fritekst-begrundelser (kun noul/score/choice-tal), så
// "why" står tom med vilje her — vi finder ikke på en begrundelse API'et ikke
// gav (spec: "kort begrundelse HVIS API'et giver det").
//
// Kaster ALDRIG: jev.ts's egen kontrakt er null ved slået-fra/timeout/fejl, og
// et ugyldigt svar (manglende eller ude-af-rækkevidde akse) er her en fejl —
// IKKE nul-scores, for et 0-tal ville se ud som en rigtig, lav bedømmelse.
import "server-only";
import type { Db } from "../db/client.ts";
import { jevAsk, jevEnabled, noul, type JevAnswers, type JevQuestion } from "../jev.ts";
import { recordScores, SCORE_AXES, type BlogScores, type ScoreAxis } from "./posts.ts";

export const SCORE_QUESTIONS: Record<ScoreAxis, JevQuestion> = {
  styrke: {
    type: "noul",
    instructions:
      "Sælger denne blogidé Kinlys egne ydelser — kodede hjemmesider til små lokale virksomheder, 'derfor os'-argumenter — frem for at være generel viden uden salgsværdi for Kinly?",
  },
  kundebase: {
    type: "noul",
    instructions:
      "Er emnet væsentligt for Kinlys typiske kunde — en lokal dansk småvirksomhedsejer (frisør, håndværker, café, klinik) — frem for et emne der taler til et andet publikum?",
  },
  seo: {
    type: "noul",
    instructions:
      "Er der reel, konkret lokal søgeefterspørgsel bag emnet, fx 'webbureau <by>' eller 'hvad koster en hjemmeside' — noget folk rent faktisk søger på, ikke bare et emne der lyder relevant?",
  },
  geo: {
    type: "noul",
    instructions:
      "Vil dette emne kunne blive citeret i AI-søgesvar (ChatGPT, Google AI Overview) — giver det klare svar, egne data eller FAQ-egnet indhold en AI kan gengive?",
  },
  marked: {
    type: "noul",
    instructions:
      "Er der reel efterspørgsel/marked for dette emne blandt danske små virksomhedsejere lige nu — er det noget de rent faktisk overvejer eller mangler svar på?",
  },
  gap: {
    type: "noul",
    instructions:
      "Dækker danske konkurrenter (andre web- og marketingbureauer) dette emne dårligt på deres blogs — er der et konkurrence-hul Kinly kan udnytte?",
  },
};

export interface PostScoreInput {
  title: string;
  category: string;
  note: string;
}

/**
 * Parser Jevs svar til de seks akser. Mangler eller er ude af 0-1-området på
 * blot én akse, er hele svaret ugyldigt — fail-closed, ikke en 0-score for den
 * manglende akse (som ville se ud som "Jev mener nul", ikke "Jev svarede ikke").
 */
export function parseJevScores(answers: JevAnswers | undefined): Record<ScoreAxis, { score: number; why: string }> | null {
  const out = {} as Record<ScoreAxis, { score: number; why: string }>;
  for (const axis of SCORE_AXES) {
    const n = noul(answers, axis);
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) return null;
    out[axis] = { score: Math.max(1, Math.round(n * 100)), why: "" };
  }
  return out;
}

/**
 * Bedømmer én idé med Jev og gemmer resultatet (recordScores). Bruges både af
 * POST /api/posts/[id]/score ("Bedøm igen") og af baggrundskaldet ved
 * oprettelse. Returnerer null uden at kaste når Jev er slået fra, ikke svarer,
 * eller svarer ugyldigt — kalderen afgør selv hvad det betyder (route → 400,
 * baggrundskald → stille no-op, jf. "fejl i Jev må aldrig fejle oprettelsen").
 */
export async function assessPost(db: Db, id: string, input: PostScoreInput): Promise<BlogScores | null> {
  if (!jevEnabled()) return null;
  const result = await jevAsk(
    { titel: input.title, kategori: input.category, note: input.note },
    SCORE_QUESTIONS,
    { timeoutMs: 20_000 },
  );
  if (!result) return null;
  const parsed = parseJevScores(result.answers);
  if (!parsed) {
    console.warn(JSON.stringify({ evt: "post-score.invalid_answer" }));
    return null;
  }
  return recordScores(db, id, parsed, result.model);
}

// annoncer.ts — læser annonce-stillsene og gemmer godkend/drop. Stillsene ligger i
// src/data/annoncer.json (bygges af scripts/annonce-stills.mjs). Beslutninger er en
// append-only log i `store` (lokalt .send_queue/, på Vercel KV), så to personer aldrig
// overskriver hinanden: sidste række pr. motiv vinder. HQ poster og betaler intet.
import "server-only";
import { store } from "../store.ts";
import data from "../../data/annoncer.json" with { type: "json" };
import { ANNONCE_STATUSES, foldBeslutninger, type Annonce, type AnnonceBeslutning, type AnnonceStatus } from "./annoncer-types.ts";
import { CompetitorInputError } from "./competitors.ts";

export const BESLUTNING_KEY = "marketing-annoncer-beslutninger";

export const loadAnnoncer = (): Annonce[] => data as Annonce[];

export async function listBeslutninger(): Promise<Record<string, AnnonceBeslutning>> {
  return foldBeslutninger(await store.readAll(BESLUTNING_KEY));
}

export async function setBeslutning(slug: unknown, status: unknown, actor: string): Promise<Record<string, AnnonceBeslutning>> {
  if (typeof slug !== "string" || !loadAnnoncer().some((a) => a.slug === slug)) throw new CompetitorInputError("Ukendt annonce.");
  if (typeof status !== "string" || !(ANNONCE_STATUSES as readonly string[]).includes(status)) throw new CompetitorInputError("Ukendt status.");
  const row: AnnonceBeslutning = { slug, status: status as AnnonceStatus, by: actor, at: new Date().toISOString() };
  await store.append(BESLUTNING_KEY, row);
  return listBeslutninger();
}

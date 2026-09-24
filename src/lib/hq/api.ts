// Fælles for HQ's skrive-ruter: auth-vagt, hvem der handler, og ensartede fejl.
import "server-only";
import { NextResponse } from "next/server";
import { assertWriteRequest } from "../cc-auth.ts";
import { currentUser } from "../current-user.ts";
import { DealInputError } from "./deals.ts";
import { BlogInputError } from "./posts.ts";
import { MergeError } from "../pg/merge.ts";
import { BillingError } from "./billing.ts";
import { UpdateError } from "./customer-updates.ts";
import { DraftInputError } from "./company-draft.ts";

export class HqInputError extends Error {}

/** Kører handleren bag write-vagten; input-fejl → 400, auth → 403, resten → 500. */
export async function hqWrite<T>(req: Request, handler: (actor: string) => Promise<T>): Promise<Response> {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  const actor = (await currentUser()) ?? "delt";
  try {
    return NextResponse.json(await handler(actor));
  } catch (err) {
    if (err instanceof HqInputError || err instanceof DealInputError || err instanceof BlogInputError || err instanceof MergeError || err instanceof BillingError || err instanceof UpdateError || err instanceof DraftInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(JSON.stringify({ evt: "hq.write.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ error: "noget gik galt" }, { status: 500 });
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HqInputError("ugyldig forespørgsel");
  return b as Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(v: unknown, label = "id"): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new HqInputError(`ugyldigt ${label}`);
  return v;
}

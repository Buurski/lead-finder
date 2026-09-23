import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getAttention } from "@/lib/hq/attention";
import { currentUser } from "@/lib/current-user";
import { copenhagenNow } from "@/lib/settings";
import { isCommandCenterRequest } from "@/lib/cc-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?owner=lucas|charlie — "hvad kræver min opmærksomhed nu?" til klokken +
// HQ-forsiden. Læse-rute: samme auth-mønster som /api/soeg. Uden ?owner
// bruges den indloggede person (lokalt uden auth → null → begge ejere).
async function authorized(req: Request): Promise<boolean> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (!authConfigured) return true;
  return isCommandCenterRequest(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const ownerParam = url.searchParams.get("owner");
  let owner: "lucas" | "charlie" | null;
  if (ownerParam === "lucas" || ownerParam === "charlie") owner = ownerParam;
  else {
    const me = await currentUser();
    owner = me === "lucas" || me === "charlie" ? me : null; // "delt"/null → vis for begge
  }
  const { date } = copenhagenNow();
  const items = await getAttention(getDb(), { owner, today: date });
  return NextResponse.json({ items });
}

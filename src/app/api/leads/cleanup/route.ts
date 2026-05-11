import { NextResponse } from "next/server";
import { getLeads, deleteLeadRows } from "@/lib/sheets";

// Known Danish/international chains that won't benefit from a custom website.
// Add more entries here as needed — matching is case-insensitive and partial.
const CHAIN_KEYWORDS = [
  "flammen",
  "louis nielsen",
  "synoptik",
  "specsavers",
  "mcdonald",
  "burger king",
  "subway",
  "kfc",
  "starbucks",
  "joe & the juice",
  "sunset boulevard",
  "pizza hut",
  "domino",
  "fitness world",
  "sats fitness",
  "deloitte",
  "pwc",
  "kpmg",
  "ernst & young",
  "bdo revision",
  "7-eleven",
  "matas",
  "netto",
  "føtex",
  "bilka",
  "jysk",
  "normal a/s",
  "søstrene grene",
  "sportsmaster",
  "intersport",
  "elgiganten",
  "power (elektronik",
  "harold nyborg",
  "bauhaus",
  "silvan",
  "xl-byg",
  "stark",
  "jem & fix",
  "lidl",
  "aldi",
  "rema 1000",
  "coop",
  "kvickly",
  "wagamama",
  "sticks'n'sushi",
  "hereford beefstouw",
  "wingstop",
  "pizza king",
];

function isChain(name: string, extra: string[]): boolean {
  const lower = name.toLowerCase();
  return [...CHAIN_KEYWORDS, ...extra].some((kw) => lower.includes(kw.toLowerCase()));
}

// GET — preview which leads would be deleted (dry run)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const extra = searchParams.get("extra")?.split(",").filter(Boolean) ?? [];

  const leads = await getLeads();
  const matches = leads.filter((l) => isChain(l.name, extra));

  return NextResponse.json({
    count: matches.length,
    leads: matches.map((l) => ({ id: l.id, name: l.name, branch: l.branch, city: l.city, status: l.status })),
  });
}

// POST — delete chain leads. Pass { extra: ["keyword1", ...] } to add ad-hoc chain names.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const extra: string[] = Array.isArray(body.extra) ? body.extra : [];

  const leads = await getLeads();
  const toDelete = leads.filter((l) => isChain(l.name, extra));

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, message: "No chain leads found" });
  }

  const sheetRowNumbers = toDelete.map((l) => Number(l.id));
  await deleteLeadRows(sheetRowNumbers);

  return NextResponse.json({
    deleted: toDelete.length,
    names: toDelete.map((l) => l.name),
  });
}

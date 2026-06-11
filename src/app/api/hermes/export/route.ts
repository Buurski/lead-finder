import { NextResponse } from "next/server";
import { getHermesMessages, listHermesSessions } from "@/lib/hermes";
import { writeVaultNote } from "@/lib/vault";

export const dynamic = "force-dynamic";

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[æå]/g, "a")
      .replace(/ø/g, "o")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "samtale"
  );
}

// POST { sessionId } → gemmer hele samtalen som vault-note
// (wiki/os/sessions/<dato>-<slug>.md) via GitHub contents-API.
export async function POST(req: Request) {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ugyldig JSON" }, { status: 400 });
  }
  const sessionId = String(body.sessionId ?? "");
  if (!SESSION_RE.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "ugyldigt sessionId" }, { status: 400 });
  }

  const msgs = await getHermesMessages(sessionId);
  if (!msgs.length) {
    return NextResponse.json({ ok: false, error: "ingen beskeder i sessionen" }, { status: 404 });
  }
  const meta = (await listHermesSessions()).find((s) => s.id === sessionId);
  const title = meta?.title || msgs[0].text.slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  const rel = `wiki/os/sessions/${date}-${slugify(title)}.md`;

  const lines = [
    `# Hermes-samtale — ${title}`,
    "",
    `*Profil: ${meta?.profile ?? "?"} · gemt fra Command Center ${date} · ${msgs.length} beskeder*`,
    "",
    ...msgs.map((m) => `**${m.role === "you" ? "Lucas" : "Hermes"}:** ${m.text}\n`),
  ];

  const res = await writeVaultNote(rel, lines.join("\n"), `hermes: gem samtale "${title}" (via Command Center)`);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.reason ?? "vault-skrivning fejlede" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, path: rel });
}

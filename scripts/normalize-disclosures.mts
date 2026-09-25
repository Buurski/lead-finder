// Engangs: oversæt gamle præsentationer ("Sammen med Lucas …", "Jeg hedder Lucas …",
// salgselev-teksten) i IKKE-sendte kladder til den fælles tekst (tone-mixer DISCLOSURE).
// Tør-kørsel som standard; skriv kun med --apply. Kræver DATA_BACKEND=pg + DATABASE_URL
// (læs fra fil, aldrig i chat). Sendte/låste kladder røres ikke (updateDraft afviser FINAL).
//   node --experimental-strip-types scripts/normalize-disclosures.mts [--apply]
import { readQueue, updateDraft } from "../src/lib/queue.ts";
import { adaptToSender } from "../src/lib/tone-mixer.ts";

const apply = process.argv.includes("--apply");
const open = (await readQueue()).filter((d) => ["pending", "approved", "edited"].includes(d.status));
const changed = open.filter((d) => adaptToSender(d.body ?? "") !== (d.body ?? ""));
console.log(`${open.length} åbne kladder, ${changed.length} med gammel præsentation${apply ? "" : " (tør-kørsel)"}`);
for (const d of changed) {
  if (!apply) {
    console.log(`- ${d.id} ${d.name}`);
    continue;
  }
  const ok = await updateDraft(d.id, { body: adaptToSender(d.body ?? "") });
  console.log(`${ok ? "✓" : "✗ (låst/sendt)"} ${d.id} ${d.name}`);
}
process.exit(0);

import { readVaultJson } from "@/lib/vault";
import { safeHref } from "@/lib/safe-href";

interface OmverdenItem {
  title: string;
  summary: string;
  url?: string;
  source: string;
  tag?: string;
}

interface OmverdenFile {
  at: string;
  items: OmverdenItem[];
}

// Samme kilde som den gamle OmverdenCard (data/omverden.json i vaulten), men
// hentet server-side her så resten af HQ ikke venter på den — pakket i
// Suspense af page.tsx. Ingen fil/fetch-fejl → intet afsnit (ikke en fejl,
// bare ikke sat op endnu). En reel netværksfejl viser en rolig tekst.
export default async function OmverdenSection() {
  let file: OmverdenFile | null = null;
  let failed = false;
  try {
    file = await readVaultJson<OmverdenFile>("data/omverden.json", { preferRemote: true });
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <section className="hq-omverden-wrap" aria-label="Omverden">
        <div className="hq-section-label">Omverden</div>
        <p className="hq-agent-error">Omverden kunne ikke hentes lige nu.</p>
      </section>
    );
  }

  const items = (file?.items ?? []).filter((i) => i && typeof i.title === "string" && i.title.trim()).slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section className="hq-omverden-wrap" aria-label="Omverden">
      <div className="hq-section-label">Omverden</div>
      <div className="hq-omverden">
        {items.map((it) => (
          <div key={it.title} className="hq-om-card">
            <span className="tag" aria-hidden="true" />
            <div>
              <p className="hq-om-title">
                {it.url ? (
                  <a href={safeHref(it.url)} target="_blank" rel="noopener noreferrer" className="cc-focus">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )}
              </p>
              {it.summary && <p className="hq-om-summary">{it.summary}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

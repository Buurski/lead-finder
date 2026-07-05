"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

type Group = "cafe" | "service";
type Demo = { slug: string; name: string; group: Group; unique: string };

// The six hand-built Studio demos. rev2 = culturally-rooted revisions (0 slop).
const DEMOS: Demo[] = [
  { slug: "gudruns-goodies-rev2", name: "Guðrun's Goodies", group: "cafe", unique: "Islandsk scrollytelling. Nordlys, runer og basalt som rytme gennem siden." },
  { slug: "cafe-wilder-rev2", name: "Café Wilder", group: "cafe", unique: "Fransk brasserie. Bordeaux og messing, Fraunces + Libre Franklin." },
  { slug: "pipers-hus", name: "Restaurant Pipers Hus", group: "cafe", unique: "Fjord og bypark. Rolig dansk kroæstetik med Roskilde-stedfølelse." },
  { slug: "o-s-barbershop", name: "O's Barbershop", group: "service", unique: "Barber-håndværk. Råt, mørkt og maskulint med fokus på snittet." },
  { slug: "the-nail-studio", name: "The Nail Studio", group: "service", unique: "Premium negle. Blød, lys storby-elegance i København." },
  { slug: "frisoer-alex", name: "Frisør Alex", group: "service", unique: "Klassisk herrebarber. Algade-adresse, direkte og no-nonsense." },
];

type FilterId = "cafe" | "service" | "alle";
const FILTERS: { id: FilterId; label: string }[] = [
  { id: "cafe", label: "3 caféer" },
  { id: "service", label: "3 service" },
  { id: "alle", label: "Alle 6" },
];

export default function CompareClient() {
  const [filter, setFilter] = useState<FilterId>("cafe");
  const shown =
    filter === "alle" ? DEMOS : DEMOS.filter((d) => d.group === filter);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="cc-tabs" role="tablist" aria-label="Vælg sammenligning" style={{ flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            data-active={filter === f.id}
            className="cc-tab"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="cmp-scroll">
        {shown.map((d) => {
          const href = "/studio/demo-site/" + d.slug;
          return (
            <div key={d.slug} className="cmp-col cc-card">
              <div className="cmp-head">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                  <div className="cc-dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.35, whiteSpace: "normal" }}>
                    <span style={{ color: "var(--accent, #c98a3a)" }}>•</span> {d.unique}
                  </div>
                </div>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cc-btn"
                  style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5 }}
                  aria-label={"Åbn " + d.name + " i ny fane"}
                >
                  Åbn <Icon name="ArrowUpRight" style={{ width: 14, height: 14 }} />
                </a>
              </div>
              <div className="cmp-frame">
                <iframe
                  src={href}
                  title={d.name}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .cmp-scroll {
          display: grid;
          grid-template-columns: repeat(${shown.length}, minmax(0, 1fr));
          gap: 14px;
        }
        .cmp-col {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }
        .cmp-head {
          padding: 13px 15px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
        }
        .cmp-frame {
          height: 70vh;
          min-height: 460px;
          overflow: hidden;
          background: #fff;
        }
        @media (max-width: 860px) {
          .cmp-scroll {
            display: flex;
            grid-template-columns: none;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 6px;
            margin: 0 -4px;
          }
          .cmp-col {
            flex: 0 0 86vw;
            scroll-snap-align: center;
          }
          .cmp-frame {
            height: 64vh;
            min-height: 380px;
          }
        }
      `}</style>
    </div>
  );
}

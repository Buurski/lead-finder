"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import AttentionPanel from "./AttentionPanel";
import type { AttentionItem } from "@/lib/hq/attention";

// Klokken i topbaren: "hvad kræver min opmærksomhed nu?" — opgaver, svar,
// kladder, fakturaer, gratis udkast og kunder der venter, samlet af
// hq/attention.ts. Tallet = antal haster-punkter; klik åbner panelet med
// hele listen (Haster / Til opfølgning). Henter selv (ikke via AppShell), så
// den altid viser den friskeste liste når man skifter side.
export default function Bell() {
  const pathname = usePathname();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/login") return;
    let alive = true;
    // Ét retry-forsøg: siden har ofte en byge af prefetch-kald lige efter
    // hydrering (nav-links, ⌘K), og klokkens eget kald kan tabe det kapløb.
    // Et enkelt gensvar 1s senere er billigere end at vise en falsk "intet".
    function load(retriesLeft: number) {
      fetch("/api/opmaerksomhed")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (alive && Array.isArray(d?.items)) setItems(d.items);
        })
        .catch(() => {
          if (alive && retriesLeft > 0) setTimeout(() => load(retriesLeft - 1), 1000);
        });
    }
    load(1);
    return () => {
      alive = false;
    };
  }, [pathname]);

  const haster = items.filter((i) => i.level === "haster").length;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="cc-cmdk"
        onClick={() => setOpen((v) => !v)}
        aria-label={haster > 0 ? `${haster} ting kræver dig` : "Intet kræver dig lige nu"}
        aria-expanded={open}
        style={{ paddingLeft: 10, paddingRight: 10, position: "relative" }}
      >
        <Icon name="Bell" style={{ width: 15, height: 15 }} />
        {haster > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 16, height: 16, padding: "0 4px",
              display: "grid", placeItems: "center",
              borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: "var(--red)", color: "#fff",
            }}
          >
            {haster}
          </span>
        )}
      </button>

      <AttentionPanel items={items} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

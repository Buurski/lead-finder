// HTML-visningen af månedsrapporten (kunde-rapport-model.ts). Selvstændigt
// dokument: åbnes fra HQ, kan printes, og ser ud som det kunden får som PDF.
// Ingen tekst skrives her: alt kundevendt kommer fra modellen, så de to
// visninger (HTML + PDF) aldrig siger noget forskelligt. Grafer = inline SVG.
import { readFileSync } from "node:fs";
import path from "node:path";
import { PERSONLIG_AFSLUTNING, type Nogletal, type RapportModel } from "./kunde-rapport-model.ts";
import { KINLY_MAERKE } from "../kinly-maerke.ts";
import { LUCAS_FOTO } from "../lucas-foto.ts";

// Kinlys egen skrift (Archivo, som kinly.dk) indlejret, så rapporten ligner os,
// også når den gemmes eller vedhæftes. Mangler filerne, falder den tilbage til systemskrift.
function fontFace(): string {
  const f = (fil: string, vaegt: number) => {
    try {
      const b64 = readFileSync(
        path.join(process.cwd(), "src/lib/fonts", fil),
      ).toString("base64");
      return `@font-face{font-family:Archivo;font-weight:${vaegt};font-display:swap;src:url(data:font/ttf;base64,${b64}) format("truetype")}`;
    } catch {
      return "";
    }
  };
  return (
    f("archivo-400.ttf", 400) +
    f("archivo-700.ttf", 700) +
    f("archivo-800.ttf", 800)
  );
}

const logo = (hoejde: number) =>
  `<svg viewBox="${KINLY_MAERKE.viewBox}" height="${hoejde}" role="img" aria-label="Kinly"><path fill="${C.ink}" d="${KINLY_MAERKE.ord}"/>${KINLY_MAERKE.firkanter.map((r) => `<rect fill="${C.ember}" x="${r.x}" y="${r.y}" width="${r.s}" height="${r.s}" rx="${r.r}"/>`).join("")}</svg>`;

const C = {
  paper: "#faf6ef",
  card: "#ffffff",
  surface: "#f3ede2",
  ink: "#191713",
  mid: "#55504a",
  faded: "#8a847b",
  rule: "#e4dccd",
  ember: "#d4500f",
  emberSoft: "#e8b597",
  emberDeep: "#a63b05",
  good: "#3f7a5a",
  goodBg: "#e8f1ea",
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function retning(n: {
  pil?: string;
  vurdering?: string;
  foer?: string;
}): string {
  if (!n.pil || !n.foer || n.pil === "lige") return ""; // "som sidst" er støj
  const pil = n.pil === "op" ? "↑" : "↓";
  const cls =
    n.vurdering === "bedre"
      ? "bedre"
      : n.vurdering === "daarligere"
        ? "vaerre"
        : "lige";
  const tekst = `${n.pil === "op" ? "op" : "ned"} fra ${n.foer}`;
  return `<span class="ret ${cls}">${pil} ${esc(tekst)}</span>`;
}

function soejler(uger: RapportModel["ugeKlik"]): string {
  const W = 640,
    H = 190,
    top = 26,
    bund = 28,
    gap = 8;
  const max = Math.max(1, ...uger.map((u) => u.klik));
  const bw = (W - gap * (uger.length - 1)) / uger.length;
  const bars = uger
    .map((u, i) => {
      const h = Math.max(2, ((H - top - bund) * u.klik) / max);
      const x = i * (bw + gap);
      const y = H - bund - h;
      const sidst = i === uger.length - 1;
      const label =
        i % 2 === uger.length % 2 || sidst
          ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(u.uge)}</text>`
          : "";
      const val =
        sidst || u.klik === max
          ? `<text x="${x + bw / 2}" y="${y - 7}" text-anchor="middle" class="val">${u.klik}</text>`
          : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${sidst ? C.ember : "#e8b597"}"/>${val}${label}`;
    })
    .join("");
  const beskriv = `Besøg fra Google uge for uge: ${uger.map((u) => `${u.uge} ${u.klik}`).join(", ")}.`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(beskriv)}" class="graf"><line x1="0" x2="${W}" y1="${H - bund}" y2="${H - bund}" stroke="${C.rule}"/>${bars}</svg>`;
}

function bjaelker(
  rows: { tekst: string; tal: number; under?: string }[],
  enhed: string,
): string {
  const max = Math.max(1, ...rows.map((r) => r.tal));
  return `<div class="bars">${rows
    .map(
      (r) =>
        `<div class="bar-row"><div class="bar-top"><span class="bar-navn">${esc(r.tekst)}</span><span class="bar-tal">${r.tal} ${esc(enhed)}${r.under ? ` <span class="bar-under">· ${esc(r.under)}</span>` : ""}</span></div><div class="bar-spor"><div class="bar-fyld" style="width:${Math.max(2, Math.round((r.tal / max) * 100))}%"></div></div></div>`,
    )
    .join("")}</div>`;
}

function tal(n: Nogletal): string {
  return `<div class="tal"><div class="tal-label">${esc(n.label)}</div><div class="tal-v">${esc(n.vaerdi)}</div>${retning(n)}<p class="tal-f">${esc(n.forklaring)}</p></div>`;
}

const MARK: Record<string, string> = {
  ok: "✓",
  obs: "!",
  info: "+",
  ikke_maalt: "?",
};

export function renderKundeRapportHtml(r: RapportModel): string {
  const med = r.variant === "med-adgang";
  const heroRet =
    r.hero.pil && r.hero.foer
      ? retning({
          pil: r.hero.pil,
          vurdering:
            r.hero.pil === "op"
              ? "bedre"
              : r.hero.pil === "ned"
                ? "daarligere"
                : "uaendret",
          foer: r.hero.foer,
        })
      : "";

  const vigtigste = r.vigtigste.length
    ? `<ol class="fund">${r.vigtigste
        .map(
          (f, i) =>
            `<li class="fund-kort"><div class="fund-nr">${i + 1}</div><div><div class="fund-top"><h3>${esc(f.titel)}</h3><span class="tag ${f.alvor === "Tager vi først" ? "tag-hoej" : ""}">${esc(f.alvor)}</span></div><p class="fund-tekst">${esc(f.tekst)}</p><p class="fund-betyder"><strong>Hvad det betyder:</strong> ${esc(f.betyder)}</p><p class="fund-goer"><strong>Det gør vi:</strong> ${esc(f.goer)}</p></div></li>`,
        )
        .join(
          "",
        )}</ol>${r.vigtigsteNote ? `<p class="note">${esc(r.vigtigsteNote)}</p>` : ""}`
    : `<div class="alt-ok"><span class="alt-ok-mark">✓</span><p>${esc(r.vigtigsteNote)}</p></div>`;

  const gjort = `<section><h2>Det har vi gjort for jer i ${esc(r.maanedNavn.split(" ")[0])}</h2><ul class="gjort">${r.gjort.map((s) => `<li><span class="tjek-m" aria-hidden="true">✓</span><span>${esc(s)}</span></li>`).join("")}</ul></section>`;
  const vigtigTitel = r.haster
    ? "Det tager vi os af først"
    : "Det kan blive endnu bedre";
  const vigtigSektion = r.vigtigste.length
    ? `<section><h2>${vigtigTitel}</h2>${vigtigste}</section>`
    : "";
  const godt = r.godt.length
    ? `<section><h2>Det går godt</h2><div class="godt">${r.godt.map((g) => `<div><strong>${esc(g.titel)}</strong>${esc(g.tekst)}</div>`).join("")}</div></section>`
    : "";

  const google = med
    ? `<section><h2>Sådan finder folk jer</h2>${
        r.ugeKlik.length >= 4
          ? `<h3 class="sub">Besøg fra Google, uge for uge</h3>${soejler(r.ugeKlik)}<p class="forkl">Hver søjle er en uge. Den orange søjle er den seneste hele uge.</p>`
          : ""
      }${
        r.soegeord.length
          ? `<h3 class="sub">Det søger folk på, når de finder jer</h3>${bjaelker(
              r.soegeord.map((q) => ({
                tekst: q.tekst,
                tal: q.klik,
                under: q.plads,
              })),
              "besøg",
            )}<p class="forkl">"Typisk nr." er hvor højt I står på Google, når nogen søger sådan. Nr. 1 er øverst.</p>`
          : ""
      }${
        r.sider.length
          ? `<h3 class="sub">Her lander folk på jeres side</h3>${bjaelker(
              r.sider.map((s) => ({ tekst: s.side, tal: s.klik })),
              "besøg",
            )}`
          : ""
      }</section>`
    : "";

  const googleKort = r.googleKort
    ? `<section><h2>Sådan står I i Google</h2><div class="gkort"><div class="gkort-adr">${esc(r.googleKort.adresse)}</div><div class="gkort-titel">${esc(r.googleKort.titel)}</div>${r.googleKort.beskrivelse ? `<div class="gkort-besk">${esc(r.googleKort.beskrivelse)}</div>` : ""}</div><p class="forkl">Det er det, folk ser, før de vælger at klikke. Google kan en gang imellem vise lidt andet.</p></section>`
    : "";

  const tjek = r.tjek
    .map(
      (g) =>
        `<div class="tjek-gruppe"><h3 class="sub">${esc(g.gruppe)}</h3><ul class="tjek">${g.linjer
          .map(
            (l) =>
              `<li class="tjek-${l.status}"><span class="tjek-m" aria-hidden="true">${MARK[l.status]}</span><span><strong>${esc(l.navn)}.</strong> ${esc(l.tekst)}</span></li>`,
          )
          .join("")}</ul></div>`,
    )
    .join("");

  // Ældre frosne rapporter har ikke `personlig`: så vises kontakt + afslutning uden note.
  const kontakt = `<section class="kontakt"><div class="kontakt-top"><img class="kontakt-foto" src="${LUCAS_FOTO}" alt="Lucas Buur" width="60" height="60"><div><div class="kontakt-navn">Lucas Buur</div><div class="kontakt-firma">Kigger jeres side igennem hver måned</div><div class="kontakt-linjer"><a href="tel:+4523242482">+45 23 24 24 82</a><a href="mailto:lucas@kinly.dk">lucas@kinly.dk</a></div></div></div>${r.personlig?.note ? `<blockquote class="kontakt-note"><p>${esc(r.personlig.note)}</p></blockquote>` : ""}<p class="kontakt-afsl">${esc(r.personlig?.afslutning ?? PERSONLIG_AFSLUTNING)}</p></section>`;

  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex">
<title>Månedsrapport ${esc(r.maanedNavn)} · ${esc(r.kunde)}</title>
<style>
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
${fontFace()}
body{margin:0;background:${C.paper};color:${C.ink};font:16px/1.6 Archivo,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:40px 20px 56px}
h1,h2{font-weight:800;letter-spacing:-.02em}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:1px solid ${C.rule};padding-bottom:14px;margin-bottom:28px;flex-wrap:wrap}
.brand{display:block;line-height:0}
.meta{font-size:13px;color:${C.mid}}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${C.mid};margin:0 0 6px}
h1{font-size:34px;line-height:1.15;margin:0 0 4px}
.dom{color:${C.mid};margin:0 0 28px}
.hero{background:${C.card};border:1px solid ${C.rule};border-top:4px solid ${C.ember};border-radius:14px;padding:28px}
.hero-tal{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.hero-n{font-weight:800;font-size:80px;line-height:1;letter-spacing:-.03em}
.hero-e{font-size:18px;color:${C.mid}}
.hero p{margin:12px 0 0;font-size:17px}
.hero p.nul{margin-top:12px;font-size:13px;line-height:1.5;color:${C.mid}}
section{margin-top:40px}
h2{font-size:25px;margin:0 0 14px}
h3{margin:0}
.sub{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:${C.mid};font-weight:600;margin:22px 0 10px}
.fund{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.fund-kort{display:grid;grid-template-columns:36px 1fr;gap:14px;background:${C.card};border:1px solid ${C.rule};border-radius:12px;padding:18px}
.fund-nr{width:32px;height:32px;border-radius:50%;background:${C.ember};color:#fff;display:grid;place-items:center;font-weight:700}
.fund-top{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}
.fund-top h3{font-size:18px}
.fund-tekst{margin:6px 0 10px;font-size:16.5px}
.fund-betyder,.fund-goer{margin:4px 0;font-size:15px;color:${C.mid}}
.fund-goer strong,.fund-betyder strong{color:${C.ink}}
.tag{font-size:12px;padding:3px 9px;border-radius:99px;background:${C.surface};color:${C.mid};white-space:nowrap}
.tag-hoej{background:#fbe3d6;color:${C.emberDeep};font-weight:600}
.note{font-size:14.5px;color:${C.mid};margin:12px 0 0}
.alt-ok{display:flex;gap:14px;align-items:center;background:${C.goodBg};border-radius:12px;padding:18px}
.alt-ok p{margin:0}
.alt-ok-mark{width:32px;height:32px;flex:none;border-radius:50%;background:${C.good};color:#fff;display:grid;place-items:center;font-weight:700}
.liste{margin:0;padding-left:20px}.liste li{margin:6px 0}
.graf{width:100%;height:auto;display:block}
.graf .ax{font-size:12px;fill:${C.faded}}.graf .val{font-size:14px;font-weight:700;fill:${C.ink}}
.forkl{font-size:14px;color:${C.mid};margin:8px 0 0}
.bars{display:grid;gap:12px}
.bar-top{display:flex;justify-content:space-between;gap:10px;font-size:15px}
.bar-navn{font-weight:600}.bar-tal{white-space:nowrap}.bar-under{color:${C.faded}}
.bar-spor{height:10px;border-radius:99px;background:${C.surface};margin-top:5px}
.bar-fyld{height:100%;border-radius:99px;background:${C.ember}}
.tal-grid,.godt{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.tal-grid>:last-child:nth-child(odd),.godt>:last-child:nth-child(odd){grid-column:1/-1}
.tal{background:${C.card};border:1px solid ${C.rule};border-radius:12px;padding:16px}
.tal-label{font-size:13.5px;color:${C.mid}}
.tal-v{font-weight:800;font-size:28px;line-height:1.2;margin-top:2px}
.tal-f{margin:8px 0 0;font-size:14px;color:${C.mid};line-height:1.45}
.ret{display:inline-block;margin-top:6px;font-size:13px;font-weight:600;padding:2px 9px;border-radius:99px}
.ret.bedre{background:${C.goodBg};color:${C.good}}.ret.vaerre{background:#fbe3d6;color:${C.emberDeep}}.ret.lige{background:${C.surface};color:${C.mid}}
.hero .ret{font-size:14px;margin:0}
.gkort{background:${C.card};border:1px solid ${C.rule};border-radius:12px;padding:16px 18px;font-family:Arial,sans-serif}
.gkort-adr{font-size:13px;color:#4d5156}.gkort-titel{font-size:19px;color:#1a0dab;margin:3px 0}.gkort-besk{font-size:14px;color:#4d5156;line-height:1.5}
.nyt{background:${C.card};border:1px solid ${C.rule};border-left:4px solid ${C.ember};border-radius:12px;padding:16px 18px;margin-top:24px}.nyt-maerke{margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${C.emberDeep};font-weight:700}.nyt-linje{margin:6px 0}.nyt-linje strong{display:block}
.godt div{background:${C.goodBg};border-radius:12px;padding:14px 16px;border-left:4px solid ${C.good}}
.gjort{list-style:none;margin:0;padding:0;display:grid;gap:8px}.gjort li{display:grid;grid-template-columns:24px 1fr;gap:10px}.gjort .tjek-m{background:${C.goodBg};color:${C.good}}
.bilag{margin-top:56px;padding-top:8px;border-top:2px solid ${C.ink}}
.godt strong{display:block;margin-bottom:4px}
.adgang{background:${C.surface};border-radius:12px;padding:18px 20px}
.adgang h2{font-size:21px;margin-bottom:8px}.adgang p{margin:0}
.tjek{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.tjek li{display:grid;grid-template-columns:24px 1fr;gap:10px;font-size:15px;line-height:1.45}
.tjek-m{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;margin-top:1px}
.tjek-ok .tjek-m{background:${C.goodBg};color:${C.good}}.tjek-obs .tjek-m{background:#fbe3d6;color:${C.emberDeep}}
.tjek-info .tjek-m,.tjek-ikke_maalt .tjek-m{background:${C.surface};color:${C.mid}}
.maalt{margin-top:44px;border-top:1px solid ${C.rule};padding-top:18px;font-size:13.5px;color:${C.mid}}
.maalt p{margin:4px 0}
.kontakt{background:${C.card};border:1px solid ${C.rule};border-radius:14px;padding:22px 24px}
.kontakt-top{display:flex;gap:16px;align-items:center}
.kontakt-foto{width:60px;height:60px;border-radius:50%;object-fit:cover;flex:none;display:block}
.kontakt-navn{font-weight:700;font-size:17px;line-height:1.3}.kontakt-firma{font-size:14px;color:${C.mid}}
.kontakt-linjer{display:flex;flex-wrap:wrap;gap:2px 16px;margin-top:4px;font-size:15px}
.kontakt-linjer a{color:${C.ink};text-decoration:none;border-bottom:1px solid ${C.rule}}
.kontakt-note{margin:18px 0 0;padding:2px 0 2px 16px;border-left:3px solid ${C.emberSoft}}
.kontakt-note p{margin:0;font-size:16.5px;line-height:1.55;overflow-wrap:anywhere}
.kontakt-afsl{margin:16px 0 0;font-size:15px;color:${C.mid}}
@media (max-width:520px){.wrap{padding:24px 16px 40px}h1{font-size:28px}.hero{padding:20px}.hero-n{font-size:64px}.tal-grid,.godt{grid-template-columns:1fr}.fund-kort{grid-template-columns:28px 1fr;gap:10px;padding:16px}.fund-nr{width:28px;height:28px}.fund-top{flex-direction:column;align-items:flex-start;gap:6px}}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}section,.fund-kort,.tal,.hero{break-inside:avoid}.bilag{break-before:page}}
</style></head><body><div class="wrap">
<header><span class="brand">${logo(30)}</span><span class="meta">Månedsrapport · målt ${esc(r.maaltDato)}</span></header>
<p class="eyebrow">${esc(r.maanedNavn)}</p>
<h1>${esc(r.kunde)}</h1>
<p class="dom">${esc(r.domaene)}</p>

<div class="hero"><div class="hero-tal"><span class="hero-n">${esc(r.hero.tal)}</span><span class="hero-e">${esc(r.hero.enhed)}</span>${heroRet}</div><p>${esc(r.hero.saetning)}</p>
${r.nulpunktTekst ? `<p class="nul">Det her er vores nulpunkt. ${esc(r.nulpunktTekst)}</p>` : ""}</div>

${r.nyt.length ? `<section class="nyt"><p class="nyt-maerke">Nyt siden sidst</p>${r.nyt.map((n) => `<div class="nyt-linje"><strong>${esc(n.titel)}</strong> ${esc(n.tekst)}</div>`).join("")}</section>` : ""}
${r.haster ? vigtigSektion : ""}
${godt}
${gjort}
${google}
${r.haster ? "" : vigtigSektion}
${r.nogletal.length ? `<section><h2>Tallene</h2><div class="tal-grid">${r.nogletal.map(tal).join("")}</div></section>` : ""}
${googleKort}
${r.udenAdgang ? `<section class="adgang"><h2>Vil I se mere?</h2><p>${esc(r.udenAdgang)}</p></section>` : ""}
${r.naesteGang.length ? `<section><h2>Det kan vi tage næste gang</h2><ul class="liste">${r.naesteGang.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p class="note">Ingen af delene haster. Sig til, hvis I vil have noget af det med.</p></section>` : ""}
${kontakt}
<section class="bilag"><p class="eyebrow">Bilag</p><h2>Hele tjekket</h2><p class="forkl" style="margin:0 0 4px">${r.iOrden.ok} af ${r.iOrden.ialt} ting er i orden.</p>${tjek}</section>

<div class="maalt"><p><strong>Sådan har vi målt</strong></p>${r.maalt.map((s) => `<p>${esc(s)}</p>`).join("")}</div>
</div></body></html>`;
}

// demos.ts — demo-website routing (brief §9). Two demos per message; pick the
// two most relevant for the branch. Strip-safe (no enums) so the node engine
// can import it. URLs mirror src/lib/email.ts DEMO_URLS.

export interface Demo {
  label: string;
  url: string;
}

const D = {
  underKlippen: { label: "Café / dansk", url: "https://under-klippen.vercel.app/" },
  zaytoon: { label: "Restaurant / takeaway", url: "https://zaytoon-six.vercel.app/" },
  denlillemaler: { label: "Maler / håndværk", url: "https://denlillemaler.vercel.app/" },
  ktvvs: { label: "VVS / el", url: "https://ktvvs.vercel.app/" },
  buurfoto: { label: "Fotograf", url: "https://buurfoto.vercel.app/" },
  streetcut: { label: "Barber", url: "https://streetcut.vercel.app/" },
  salonArtec: { label: "Salon / skønhed", url: "https://salon-artec.vercel.app/Salon%20Artec.html" },
  vestfjends: { label: "Service / lokal", url: "https://vestfjends.vercel.app/" },
} as const;

// Catalog for the Studio grid — every demo we can show a lead, tagged by the
// branch family it best represents. Read-only; the engine still routes via
// pickDemoPair below.
export interface DemoEntry extends Demo {
  branch: "mad" | "skønhed" | "håndværk" | "foto" | "service";
}
export const DEMO_CATALOG: DemoEntry[] = [
  { ...D.underKlippen, branch: "mad" },
  { ...D.zaytoon, branch: "mad" },
  { ...D.salonArtec, branch: "skønhed" },
  { ...D.streetcut, branch: "skønhed" },
  { ...D.denlillemaler, branch: "håndværk" },
  { ...D.ktvvs, branch: "håndværk" },
  { ...D.buurfoto, branch: "foto" },
  { ...D.vestfjends, branch: "service" },
];

const FOOD_INTL =
  /pizza|pizzeria|italia|sushi|kebab|shawarma|falafel|tapas|libanon|tyrk|grill|mexicansk|wok|asia|thai|indisk|kinesisk/i;
const FOOD = /café|cafe|restaurant|bager|konditori|spise|køkken|bistro|brasserie|kro|smørrebrød|frokost/i;
const BARBER = /barber|herrefrisør|herre ?frisør|herreklip/i;
const BEAUTY = /frisør|frisor|salon|skønhed|skonhed|hud|negle|kosmetolog|wax|makeup|spa|klinik|beauty|hair/i;
const PHOTO = /fotograf|foto|photo/i;
const CRAFT_UTIL = /vvs|elektriker|el-|blikkenslager|mekaniker|smed|kloak|varme/i;
const CRAFT = /maler|tømrer|tomrer|snedker|murer|tag|tagdækker|håndværk|entreprenør|anlæg/i;
// Service/maintenance: vinduespudser, rengøring, handyman, gartner, flytte, etc.
// Without this branch, Pro Vindues Polering and similar fell to default = wrong demos.
const SERVICE_MAINT = /vindues|vindue|polering|pudser|rengør|rengoring|cleaning|servicemand|handyman|gartner|flytte|flytning|haveservice|service mand|viceværts?|nedrivning/i;

// Returns two distinct, branch-relevant demos. Photo is the one case that maps
// to a single strong demo (we still return two by pairing with a neutral one).
export function pickDemoPair(branch: string, name: string): [Demo, Demo] {
  const t = `${name} ${branch}`.toLowerCase();

  if (BARBER.test(t)) return [D.streetcut, D.salonArtec];
  if (BEAUTY.test(t)) return [D.salonArtec, D.streetcut];
  if (PHOTO.test(t)) return [D.buurfoto, D.underKlippen];
  if (FOOD_INTL.test(t)) return [D.zaytoon, D.underKlippen];
  if (FOOD.test(t)) return [D.underKlippen, D.zaytoon];
  if (CRAFT_UTIL.test(t)) return [D.ktvvs, D.denlillemaler];
  if (CRAFT.test(t)) return [D.denlillemaler, D.ktvvs];
  if (SERVICE_MAINT.test(t)) return [D.vestfjends, D.denlillemaler];
  return [D.vestfjends, D.underKlippen];
}

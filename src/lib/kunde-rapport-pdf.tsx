// PDF-visningen af månedsrapporten (react-pdf, som fakturaerne). Samme model
// som HTML-visningen (hq/kunde-rapport-model.ts); her skrives ingen kundetekst,
// kun layout. Skrift = Archivo (som kinly.dk), logo = Kinlys ordmærke. Pile og
// flueben tegnes som figurer, aldrig som tegn (skriften har dem ikke).
import path from "node:path";
import {
  Document,
  Font,
  Page,
  Path,
  Rect,
  Svg,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Circle,
} from "@react-pdf/renderer";
import type { Nogletal, RapportModel } from "./hq/kunde-rapport-model.ts";
import { KINLY_MAERKE } from "./kinly-maerke.ts";

const fontSti = (fil: string) => path.join(process.cwd(), "src/lib/fonts", fil);
Font.register({
  family: "Archivo",
  fonts: [
    { src: fontSti("archivo-400.ttf"), fontWeight: 400 },
    { src: fontSti("archivo-700.ttf"), fontWeight: 700 },
    { src: fontSti("archivo-800.ttf"), fontWeight: 800 },
  ],
});
Font.registerHyphenationCallback((w) => [w]); // ingen orddeling midt i danske ord

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
  emberBg: "#fbe3d6",
  good: "#3f7a5a",
  goodBg: "#e8f1ea",
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.paper,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Archivo",
    fontSize: 10.5,
    color: C.ink,
    lineHeight: 1.45,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingBottom: 8,
    marginBottom: 18,
  },
  meta: { fontSize: 9, color: C.mid },
  eyebrow: {
    fontSize: 8.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: C.mid,
    marginBottom: 3,
  },
  h1: { fontWeight: 800, fontSize: 26, lineHeight: 1.2, marginBottom: 4 },
  dom: { color: C.mid, marginBottom: 16 },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 8,
    padding: 14,
  },
  hero: { borderTopWidth: 4, borderTopColor: C.ember },
  godtKort: {
    backgroundColor: C.goodBg,
    borderLeftWidth: 3,
    borderLeftColor: C.good,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  heroRow: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap" },
  heroN: { fontWeight: 800, fontSize: 44, lineHeight: 1, marginRight: 8 },
  heroE: { fontSize: 13, color: C.mid, marginBottom: 4, marginRight: 8 },
  heroP: { fontSize: 12, marginTop: 8 },
  nul: {
    marginTop: 10,
    padding: 9,
    borderRadius: 6,
    backgroundColor: C.surface,
    fontSize: 10,
    color: C.mid,
  },
  h2: {
    fontWeight: 800,
    fontSize: 17,
    lineHeight: 1.25,
    marginTop: 20,
    marginBottom: 8,
  },
  sub: {
    fontSize: 8.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.mid,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 6,
  },
  fund: { flexDirection: "row", marginBottom: 8 },
  fundNr: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.ember,
    color: "#fff",
    textAlign: "center",
    fontWeight: 700,
    fontSize: 10,
    paddingTop: 4,
    marginRight: 10,
  },
  fundTitel: { fontWeight: 700, fontSize: 12 },
  tag: {
    fontSize: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: C.surface,
    color: C.mid,
    marginLeft: 6,
  },
  tagHoej: { backgroundColor: C.emberBg, color: C.emberDeep, fontWeight: 700 },
  small: { fontSize: 9.5, color: C.mid, marginTop: 3 },
  bold: { fontWeight: 700, color: C.ink },
  okBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.goodBg,
    borderRadius: 8,
    padding: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  cell: { width: "50%", padding: 4 },
  talLabel: { fontSize: 9, color: C.mid },
  talV: { fontWeight: 800, fontSize: 21, lineHeight: 1.25, marginTop: 1 },
  ret: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  bar: { marginBottom: 7 },
  barTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
  },
  spor: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.surface,
    marginTop: 3,
  },
  fyld: { height: 6, borderRadius: 3, backgroundColor: C.ember },
  tjek: { flexDirection: "row", marginBottom: 4 },
  gkort: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 8,
    padding: 12,
  },
  footer: {
    position: "absolute",
    top: 806, // A4 = 842 pt; "bottom" placerede foden forkert i react-pdf
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: C.faded,
  },
});

/** Lille pil/streg som figur. */
function PilIkon({ pil, farve }: { pil: string; farve: string }) {
  const d =
    pil === "op"
      ? "M4 9 L4 2 M1.5 4.5 L4 2 L6.5 4.5"
      : pil === "ned"
        ? "M4 1 L4 8 M1.5 5.5 L4 8 L6.5 5.5"
        : "M1 5 L7 5 M4.5 2.5 L7 5 L4.5 7.5";
  return (
    <Svg width={8} height={10} viewBox="0 0 8 10" style={{ marginRight: 3 }}>
      <Path d={d} stroke={farve} strokeWidth={1.4} fill="none" />
    </Svg>
  );
}

function Retning({ n }: { n: Pick<Nogletal, "pil" | "vurdering" | "foer"> }) {
  if (!n.pil || !n.foer || n.pil === "lige") return null; // "som sidst" er støj
  const [bg, fg] =
    n.vurdering === "bedre"
      ? [C.goodBg, C.good]
      : n.vurdering === "daarligere"
        ? [C.emberBg, C.emberDeep]
        : [C.surface, C.mid];
  const tekst = `${n.pil === "op" ? "op" : "ned"} fra ${n.foer}`;
  return (
    <View style={[s.ret, { backgroundColor: bg }]}>
      <PilIkon pil={n.pil} farve={fg} />
      <Text style={{ fontSize: 8.5, color: fg, fontWeight: 700 }}>{tekst}</Text>
    </View>
  );
}

function Mark({ status }: { status: string }) {
  const [bg, fg] =
    status === "ok"
      ? [C.goodBg, C.good]
      : status === "obs"
        ? [C.emberBg, C.emberDeep]
        : [C.surface, C.mid];
  return (
    <Svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      style={{ marginRight: 7, marginTop: 1 }}
    >
      <Circle cx={6} cy={6} r={6} fill={bg} />
      {status === "ok" ? (
        <Path
          d="M3.3 6.2 L5.2 8 L8.8 4.2"
          stroke={fg}
          strokeWidth={1.4}
          fill="none"
        />
      ) : status === "obs" ? (
        <Path d="M6 3 L6 6.8 M6 8.4 L6 9" stroke={fg} strokeWidth={1.5} />
      ) : (
        <Path d="M3.5 6 L8.5 6" stroke={fg} strokeWidth={1.4} />
      )}
    </Svg>
  );
}

function Soejler({ uger }: { uger: RapportModel["ugeKlik"] }) {
  const W = 507,
    H = 120,
    bund = 16,
    top = 14,
    gap = 6;
  const max = Math.max(1, ...uger.map((u) => u.klik));
  const bw = (W - gap * (uger.length - 1)) / uger.length;
  return (
    <View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {uger.map((u, i) => {
          const h = Math.max(1.5, ((H - top - bund) * u.klik) / max);
          return (
            <Rect
              key={u.uge}
              x={i * (bw + gap)}
              y={H - bund - h}
              width={bw}
              height={h}
              rx={2}
              fill={i === uger.length - 1 ? C.ember : C.emberSoft}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: -bund + 2 }}>
        {uger.map((u, i) => (
          <Text
            key={u.uge}
            style={{
              width: bw + (i < uger.length - 1 ? gap : 0),
              fontSize: 6.5,
              color: C.faded,
              textAlign: "center",
            }}
          >
            {i % 2 === uger.length % 2 || i === uger.length - 1 ? u.uge : ""}
          </Text>
        ))}
      </View>
      <Text style={s.small}>
        Hver søjle er en uge. Den orange søjle er den seneste hele uge (
        {uger[uger.length - 1].klik} besøg).
      </Text>
    </View>
  );
}

function Bjaelker({
  rows,
  enhed,
}: {
  rows: { tekst: string; tal: number; under?: string }[];
  enhed: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.tal));
  return (
    <View>
      {rows.map((r) => (
        <View key={r.tekst} style={s.bar} wrap={false}>
          <View style={s.barTop}>
            <Text style={s.bold}>{r.tekst}</Text>
            <Text>
              {r.tal} {enhed}
              {r.under ? (
                <Text style={{ color: C.faded }}> · {r.under}</Text>
              ) : null}
            </Text>
          </View>
          <View style={s.spor}>
            <View
              style={[
                s.fyld,
                { width: `${Math.max(2, Math.round((r.tal / max) * 100))}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Logo({ h }: { h: number }) {
  return (
    <Svg
      viewBox={KINLY_MAERKE.viewBox}
      style={{ height: h, width: (h * 1540) / 620 }}
    >
      <Path d={KINLY_MAERKE.ord} fill={C.ink} />
      {KINLY_MAERKE.firkanter.map((f) => (
        <Rect
          key={f.x}
          x={f.x}
          y={f.y}
          width={f.s}
          height={f.s}
          rx={f.r}
          fill={C.ember}
        />
      ))}
    </Svg>
  );
}

function Vigtigste({ r }: { r: RapportModel }) {
  if (!r.vigtigste.length) return null;
  return (
    <View>
      <Text style={s.h2} minPresenceAhead={140}>
        {r.haster ? "Det tager vi os af først" : "Det kan blive endnu bedre"}
      </Text>
      {r.vigtigste.map((f, i) => (
        <View key={f.titel} style={[s.card, s.fund]} wrap={false}>
          <Text style={s.fundNr}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={s.fundTitel}>{f.titel}</Text>
              <Text style={f.alvor === "Tager vi først" ? [s.tag, s.tagHoej] : s.tag}>
                {f.alvor}
              </Text>
            </View>
            <Text style={{ fontSize: 11, marginTop: 4 }}>{f.tekst}</Text>
            <Text style={s.small}>
              <Text style={s.bold}>Hvad det betyder: </Text>
              {f.betyder}
            </Text>
            <Text style={s.small}>
              <Text style={s.bold}>Det gør vi: </Text>
              {f.goer}
            </Text>
          </View>
        </View>
      ))}
      {r.vigtigsteNote ? <Text style={s.small}>{r.vigtigsteNote}</Text> : null}
    </View>
  );
}

function RapportDokument({ r }: { r: RapportModel }) {
  const heroVurdering =
    r.hero.pil === "op"
      ? "bedre"
      : r.hero.pil === "ned"
        ? "daarligere"
        : "uaendret";
  return (
    <Document
      title={`Månedsrapport ${r.maanedNavn} - ${r.kunde}`}
      author="Kinly"
      language="da"
    >
      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text>{r.kunde} · månedsrapport fra Kinly · kinly.dk</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Side ${pageNumber} af ${totalPages}`
            }
          />
        </View>
        <View style={s.head} fixed>
          <Logo h={18} />
          <Text style={s.meta}>Månedsrapport · målt {r.maaltDato}</Text>
        </View>

        <Text style={s.eyebrow}>{r.maanedNavn}</Text>
        <Text style={s.h1}>{r.kunde}</Text>
        <Text style={s.dom}>{r.domaene}</Text>

        <View style={[s.card, s.hero]} wrap={false}>
          <View style={s.heroRow}>
            <Text style={s.heroN}>{r.hero.tal}</Text>
            <Text style={s.heroE}>{r.hero.enhed}</Text>
            <Retning
              n={{
                pil: r.hero.pil,
                foer: r.hero.foer,
                vurdering: heroVurdering,
              }}
            />
          </View>
          <Text style={s.heroP}>{r.hero.saetning}</Text>
          {r.nulpunktTekst ? (
            <Text style={s.nul}>
              <Text style={s.bold}>Det her er vores nulpunkt. </Text>
              {r.nulpunktTekst}
            </Text>
          ) : null}
        </View>

        {r.nyt.length ? (
          <View style={[s.card, { marginTop: 14, borderLeftWidth: 4, borderLeftColor: C.ember }]} wrap={false}>
            <Text style={[s.eyebrow, { color: C.emberDeep, fontWeight: 700 }]}>Nyt siden sidst</Text>
            {r.nyt.map((n) => (
              <View key={n.titel} style={{ marginTop: 4 }}>
                <Text style={s.bold}>{n.titel}</Text>
                <Text>{n.tekst}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {r.haster ? <Vigtigste r={r} /> : null}

        {r.godt.length ? (
          <View wrap={false}>
            <Text style={s.h2} minPresenceAhead={140}>Det går godt</Text>
            {r.godt.map((g) => (
              <View key={g.titel} style={s.godtKort} wrap={false}>
                <Text style={s.bold}>{g.titel}</Text>
                <Text style={{ fontSize: 10, marginTop: 2 }}>{g.tekst}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View wrap={false}>
          <Text style={s.h2} minPresenceAhead={140}>
            Det har vi gjort for jer i {r.maanedNavn.split(" ")[0]}
          </Text>
          {r.gjort.map((t) => (
            <View key={t} style={s.tjek}>
              <Mark status="ok" />
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>

        {r.variant === "med-adgang" ? (
          <View>
            {r.ugeKlik.length < 4 && !r.soegeord.length ? <Text style={s.h2} minPresenceAhead={140}>Sådan finder folk jer</Text> : null}
            {r.ugeKlik.length >= 4 ? (
              <View wrap={false}>
                <Text style={s.h2} minPresenceAhead={140}>Sådan finder folk jer</Text>
                <Text style={s.sub}>Besøg fra Google, uge for uge</Text>
                <Soejler uger={r.ugeKlik} />
              </View>
            ) : null}
            {r.soegeord.length ? (
              <View wrap={false}>
                {r.ugeKlik.length < 4 ? <Text style={s.h2} minPresenceAhead={140}>Sådan finder folk jer</Text> : null}
                <Text style={s.sub}>Det søger folk på, når de finder jer</Text>
                <Bjaelker
                  rows={r.soegeord.map((q) => ({
                    tekst: q.tekst,
                    tal: q.klik,
                    under: q.plads,
                  }))}
                  enhed="besøg"
                />
                <Text style={s.small}>
                  &quot;Typisk nr.&quot; er hvor højt I står på Google, når
                  nogen søger sådan. Nr. 1 er øverst.
                </Text>
              </View>
            ) : null}
            {r.sider.length ? (
              <View wrap={false}>
                <Text style={s.sub}>Her lander folk på jeres side</Text>
                <Bjaelker
                  rows={r.sider.map((x) => ({ tekst: x.side, tal: x.klik }))}
                  enhed="besøg"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {r.haster ? null : <Vigtigste r={r} />}

        {r.nogletal.length ? (
          <View wrap={false}>
            <Text style={s.h2}>Tallene</Text>
            <View style={s.grid}>
              {r.nogletal.map((n) => (
                <View key={n.label} style={s.cell} wrap={false}>
                  <View style={[s.card, { padding: 10 }]}>
                    <Text style={s.talLabel}>{n.label}</Text>
                    <Text style={s.talV}>{n.vaerdi}</Text>
                    <Retning n={n} />
                    <Text style={s.small}>{n.forklaring}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {r.googleKort ? (
          <View wrap={false}>
            <Text style={s.h2} minPresenceAhead={140}>Sådan står I i Google</Text>
            <View style={s.gkort}>
              <Text style={{ fontSize: 8.5, color: "#4d5156" }}>
                {r.googleKort.adresse}
              </Text>
              <Text
                style={{ fontSize: 13, color: "#1a0dab", marginVertical: 2 }}
              >
                {r.googleKort.titel}
              </Text>
              {r.googleKort.beskrivelse ? (
                <Text style={{ fontSize: 9.5, color: "#4d5156" }}>
                  {r.googleKort.beskrivelse}
                </Text>
              ) : null}
            </View>
            <Text style={s.small}>
              Det er det, folk ser, før de vælger at klikke. Google kan en gang
              imellem vise lidt andet.
            </Text>
          </View>
        ) : null}

        {r.udenAdgang ? (
          <View style={[s.nul, { marginTop: 18, padding: 12 }]} wrap={false}>
            <Text
              style={{
                fontWeight: 800,
                fontSize: 14,
                color: C.ink,
                marginBottom: 4,
              }}
            >
              Vil I se mere?
            </Text>
            <Text style={{ fontSize: 10.5, color: C.ink }}>{r.udenAdgang}</Text>
          </View>
        ) : null}

        {r.naesteGang.length ? (
          <View wrap={false}>
            <Text style={s.h2} minPresenceAhead={140}>Det kan vi tage næste gang</Text>
            {r.naesteGang.map((t) => (
              <Text key={t} style={{ marginBottom: 3 }}>
                · {t}
              </Text>
            ))}
            <Text style={s.small}>
              Ingen af delene haster. Sig til, hvis I vil have noget af det med.
            </Text>
          </View>
        ) : null}

        <View
          style={{
            marginTop: 22,
            borderTopWidth: 1,
            borderTopColor: C.rule,
            paddingTop: 10,
          }}
          wrap={false}
        >
          <Text style={[s.bold, { fontSize: 9.5 }]}>Sådan har vi målt</Text>
          {r.maalt.map((t) => (
            <Text key={t} style={[s.small, { fontSize: 9 }]}>
              {t}
            </Text>
          ))}
          <Text style={{ marginTop: 10 }}>
            Har I spørgsmål, så skriv eller ring. Lucas, Kinly
          </Text>
        </View>

        <View break>
          <Text style={s.eyebrow}>Bilag</Text>
          <Text style={[s.h2, { marginTop: 4 }]}>Hele tjekket</Text>
        </View>
        <Text style={[s.small, { marginTop: 0 }]}>
          {r.iOrden.ok} af {r.iOrden.ialt} ting er i orden.
        </Text>
        {r.tjek.map((g) => (
          <View key={g.gruppe}>
            <Text style={s.sub}>{g.gruppe}</Text>
            {g.linjer.map((l) => (
              <View key={l.navn} style={s.tjek} wrap={false}>
                <Mark status={l.status} />
                <Text style={{ flex: 1 }}>
                  <Text style={s.bold}>{l.navn}. </Text>
                  {l.tekst}
                </Text>
              </View>
            ))}
          </View>
        ))}

      </Page>
    </Document>
  );
}

export async function renderKundeRapportPdf(r: RapportModel): Promise<Buffer> {
  return renderToBuffer(<RapportDokument r={r} />);
}

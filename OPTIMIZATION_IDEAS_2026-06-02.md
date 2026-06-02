# Lead-system — optimering & idéer (2026-06-02)

Gennemgang af hele systemet (kode, scripts, data, logs) med fokus på: du har lige
vundet en **skønhedssalon** — hvad gør vi nu, og hvad kan gøres bedre?

## Tallene lige nu (fra Leads-arket, 8.469 rækker)

| Segment | I alt | Sendt | Svar | Svarrate | Bounce | Kunder |
|---|---|---|---|---|---|---|
| photo | 357 | 26 | 5 | **19,2 %** | 6 | 0 |
| food | 951 | 290 | 37 | **12,8 %** | 10 | 2 |
| craftUtility (VVS/el) | 844 | 74 | 9 | **12,2 %** | 1 | 0 |
| beauty | 1.237 | 218 | 18 | 8,3 % | 7 | 0* |
| other | 2.397 | 118 | 8 | 6,8 % | 4 | 0 |
| craft | 1.444 | 59 | 4 | 6,8 % | 0 | 0 |
| professional | 1.239 | 64 | 3 | 4,7 % | 3 | 0 |

Samlet: ~809 mails sendt, **84 svar (~10 %)**, 31 bounces (3,8 %), **9 åbninger, 0 klik.**
Kunder i Clients-arket: Vestfjends VVS, Zaytoon, Restaurant Under Klippen.

\*Beauty viser 0 kunder + 1 "interested" (RR Studio, Aalborg — Rikke spurgte om pris).
**Den salon du har vundet er ikke registreret i systemet endnu.**

## De 5 vigtigste fund

1. **Klik-tracking er død kode.** Funktionen `buildTrackedClickUrl()` findes i
   `src/lib/email.ts`, men bruges aldrig — demo-linksene i mails er rå URL'er. Derfor
   0 klik ud af 809 mails. Du kan ikke se hvilke demoer der virker. (Åbnings-tracking
   er også svag: kun 9.)

2. **Den vundne salon er ikke fanget.** Din største win er ikke i Clients-arket, og
   der er intet om *hvordan* den blev vundet (mail/messenger/opkald), hvilken besked,
   eller hvad de sagde. Uden det kan systemet ikke lære af det der virker.

3. **Beauty-flaskehalsen er e-mail-fremfinding — ikke afsendelse.** 1.237 beauty-leads,
   men de gode (svag/ingen hjemmeside) mangler en findbar e-mail. Derfor skiftede vi til
   Messenger for beauty — og nu er messenger-puljen også tom. Beauty-leads falder ned
   mellem de to kanaler.

4. **Beauty svarer lavere (8,3 %) end food/VVS** — men det er der du lige har konverteret.
   Det tyder på at beauty *konverterer* bedre end det *svarer* (kvalitet > kvantitet), eller
   at beskeden/demoen kan strammes.

5. **84 svar, men kun 3 markeret interested/client.** Bliver alle svar fulgt op?
   Der ligger sandsynligvis flere kunder i de 84.

## Idéer — hvad vi kan gå i gang med

**A. Fix klik-tracking + lille "hvad virker"-overblik.** Pak demo-links ind i
`buildTrackedClickUrl()` (funktionen findes allerede). Så ser du klik pr. demo/segment/by.
Lav værdi, lille indsats. *Lille opgave.*

**B. Fang vinderen — registrér den vundne salon.** Tilføj den til Clients-arket med:
kanal (mail/messenger/opkald), hvilken besked/pattern, by, branche, pris, og hvad de sagde
ja til. Bagudfyld nu. Det starter en feedback-løkke der re-vægter targeting. *Lille opgave.*

**C. Dobbelt ned på beauty — men fix e-mail-fremfindingen.** Dedikeret beauty-pass der
henter e-mails fra Instagram/FB-bio + kontaktformular-fallback. ELLER en bro: beauty-leads
*uden* e-mail ryger automatisk i messenger-digesten. Lige nu tabes de. *Mellem opgave.*

**D. Beauty-specifik demo + besked.** `salon-artec` er bygget på en rigtig prospect
(Salon Artec, Skive). Byg 2-3 niche-demoer (frisør / negle-vipper / hudpleje-kosmetolog /
barber) så hver under-branche får en matchende demo i stedet for altid de samme to.
Vinkel der rammer: "folk googler før de booker." *Mellem opgave.*

**E. Test kanalen for beauty.** Beauty bor på Facebook/Instagram. Kør 2 ugers test:
Messenger-først for beauty vs. mail-først, og sammenlign svar/konvertering. *Mellem opgave.*

**F. Referral-flywheel fra den nye kunde.** Når salon-siden er live: brug den som *den*
beauty-demo, bed om en anbefaling til andre saloner + en udtalelse. Én glad salon =
social proof til de næste 50 beauty-pitches. *Lav-indsats, høj effekt.*

**G. Skær targeting til.** professional (4,7 %) og craft (6,8 %) underpræsterer.
photo (19,2 %) er underudnyttet — kun 26 sendt. Flyt scrape/send-budget mod
food/photo/VVS/beauty. *Lille opgave.*

**H. Svar-assistent.** Auto-klassificér hvert indkommende svar (interesseret / ikke nu /
afmeld / spørgsmål) og udkast et svar i din stemme. Konverterer flere af de 84 svar. *Mellem opgave.*

## Det første jeg har brug for fra dig
Hvilken salon vandt du, og hvordan (mail/messenger/opkald)? Så registrerer jeg den (idé B)
og bruger den som udgangspunkt for beauty-demoen (idé D) og flywheelet (idé F).

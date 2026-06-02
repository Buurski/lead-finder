# Night Build — Optimeringslog (akkumuleres under byggeriet)

Lucas' ønske (2026-06-02): byg mere bevidst, ikke forhastet. Hver gang jeg ser et
punkt der kan gøres bedre, lander det her + i `BUILD_STATUS.json.optimization_backlog`
så vi kan optimere systemet maksimalt — ikke kun ramme færdig-kriterierne.

## Fundet under Del 0-2

1. **Niche beauty-demoer (brief §9 idé D).** Beauty bruger kun `salon-artec` +
   `streetcut`. Byg frisør / negle-vipper / hudpleje / barber-specifikke demoer så
   hver beauty-lead får 2 *forskellige* relevante. Når VIDA er live → brug den som
   beauty-demo + bed om udtalelse (flywheel).

2. **research_lead Google-reviews.** Mangler Google Business anmeldelsestekst (hvad
   roses de for) — pr. brief §8 det stærkeste personlige krog-signal. Tilføj.

3. **Chrome-agent fallback** til JS-tunge sider (Timma-booking m.fl.) som fetch +
   `r.jina.ai` ikke fanger.

4. **Email-finder forældet.** Kun website + CVR; kasserer gmail/hotmail blindt
   (missede VIDA). Udvid til FB/IG/booking. 164 beauty-leads (score ≥60) uden email.

5. **Ét datalag (Del 5).** `.send_queue` JSON vs Sheets kan divergere (VIDA vundet,
   aldrig registreret). Saml kø-state mod ét lag.

6. **Reply-assistent (Del 5).** 84 svar → kun ~3 kunder. Klassificér + udkast svar i
   Lucas' stemme for at konvertere flere.

7. **isProfessionalEnough-kalibrering.** Tærskler (reviews ≥40/80, score ≥55/70) er
   førstegæt — kalibrér mod rigtige vundne (VIDA, Zaytoon, Under Klippen, Vestfjends)
   vs tabte leads.

## Hvordan disse bruges

Når natten er færdig: gennemgå denne liste med Lucas, og de bedste punkter føjes til
et nyt `/goal` (Del 5 + polish) så vi kan køre endnu en fokuseret optimeringsrunde.

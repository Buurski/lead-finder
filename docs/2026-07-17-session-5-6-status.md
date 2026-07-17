---
title: "Status — session 5+6 (lead-system: dedup/badge + omverden)"
tags: [os, status, lead-system, outreach, last30days]
status: done
date: 2026-07-17
author: Claude (for Lucas)
---

> **FLYT MIG:** hører hjemme i vaulten som `wiki/os/2026-07-17-session-5-6-status.md`.
> Skrevet her fordi safety-classifieren blokerede vault-skrivninger under sessionen.

# Session 5+6 status — 2026-07-17

Kørt samlet i én Claude Code-session (Workflows-cwd). Verificeret: `node scripts/test_all.mjs` alle suiter grønne, `npm run build` grøn, lint 0 fejl. Committet på branch `feature/session5-6-dedup-omverden` (491d5a2) — IKKE pushet/merget.

## Session 5 — dedup + svar-tracking

**Diagnose (rodårsag):**
- Dedup fandtes allerede 2 steder: `suppress.ts` (hård all-time gate på ekstern cold-ingress: `/api/approve/add` + `cron/ingest-leadgen`, match på place_id + navn+by) og `isContactable` (engine PICK, pr. Sheets-række).
- **Hullet:** intet match på email/domæne. Samme forretning i to Sheets-rækker (anden stavning/by) eller samme email på tværs af rækker kunne draftes igen. `email_dup_skipped: 20` i seneste batch kom fra Cowork-agentens egen prompt-dedup, ikke koden.
- Svar-tracking FANDTES allerede: `sync-replies.ts` scanner begge Gmail-konti via IMAP (manuel knap + Vercel-cron) → `emailStatus: "replied"` → `isContactable` = false → aldrig gen-kontakt. Ja/nej-skel findes ikke automatisk; Lucas markerer selv i /replies (statusser som not-interested blokerer også).

**Definition "allerede sendt" (nedskrevet, kode = `isContactable` + kø-status):**
kø-draft i pending/approved/edited/sent (eller rejected < 14 dage) ELLER Sheets-række med emailSentAt / followupSentAt / emailStatus ∈ {sent, opened, clicked, replied, followup} / worked-status (kontaktet, client, nej, …) / callbackDate sat.

**Bygget (C — hårdt dedup-gate, TDD: 11 nye tests først, alle grønne):**
- `contactable.ts`: `EmailBlock` — eksakt email + firma-domæne (freemail som gmail blokerer kun eksakt adresse, aldrig hele domænet). `contactedEmailBlock(leads)` bygger blokken fra alle ikke-kontaktbare leads.
- `suppress.ts`: `BlockSets` har nu `emailBlock`; `suppressionReason` afviser på email/domæne. Begge ingress-ruter sender email med og batch-dedupper også på email.
- `engine.ts` PICK: kandidater filtreres mod email-blokken — en række hvis email matcher en kontaktet række draftes aldrig, uanset navnestavning.

**Bygget (A — badge i /approve):**
- `/api/approve/queue` GET beriger hver draft med `history` (navn+by-nøgle ELLER email/domæne mod Sheets all-time) — 60s modul-cache. Sheets nede → køen leveres stadig, `historyOk: false`.
- `/approve` UI: rød chip "⚠ set før · {grund}" på pending drafts (fx "mail sendt 2026-07-01", "svarede").

**Council-review (2 friske linser):** dedup-korrekthed: ingen fund. Send-gate: urørt, ingen nye Sheets-skrivninger; ét gult perf-fund → fixet med 60s-cachen.

**Ikke lavet:** B (morgen-digest, "hvis tid"). Automatisk ja/nej-klassificering af svar (replied-blok + /replies-markering dækker dedup-behovet).

**Rest-risiko:** badge-UI ikke screenshot-verificeret (safety-classifier-nedbrud blokerede serverstart under sessionen) — logik testet; verificér visuelt ved næste `next start`.

## Session 6 — last30days + Hermes

**Arkitektur (hard gate respekteret):** last30days er Claude Code-skill → kører KUN lokalt. Mønster genbrugt fra leadgen-flowet: **lokal scheduled task producerer → vault-fil er kontrakten → alt andet læser.**

- `scripts/scheduled/omverden-daily/SKILL.md` (canonical; live-kopi skal i `Documents/Claude/Scheduled/omverden-daily/` — Lucas aktiverer selv). Kl. 06:30: last30days doctor → 4 faste emner → kuratér max 5 punkter → skriv `data/omverden.json` i vaulten → sikker git-push (pull --rebase --autostash først; safe-push.sh-buggen undgås).
- `/api/omverden` læser filen via `readVaultJson` (lokal mirror → GitHub raw fallback).
- `OmverdenCard` på Mission Control (Today, under dagens brief): max 5 punkter med kilde-tag, link, relevans-summary. Dato-stemplet; > 36 t → "gammel kørsel" + dæmpet. Ingen fil → kortet vises ikke.

**Rollefordeling:**
- **Lokalt:** skill-kørsel + kuratering + vault-push (eneste mulige sted).
- **Hermes (VPS):** kun heartbeat — dagligt cron tjekker `at` via GitHub raw, pinger Telegram hvis > 36 t. Kører ALDRIG skillet. Idé skal appendes til `wiki/os/hermes-cron-ideer.md` som #6 (tekst nederst her); Lucas opretter selv.
- **Vercel:** intet nyt cron — kun læse-ruten.

**Fallback maskine slukket:** kørsel springes over (ingen kø); forsiden viser stale-stempel; Hermes-heartbeat minder om det.

**Koordinering session 3 (Lucas OS):** samme `data/omverden.json` er delt kontrakt — Lucas OS læser samme fil, dobbeltkør IKKE søgningerne. Skema i SKILL.md.

## TODO for Lucas
1. Flyt denne note til vaultens `wiki/os/`.
2. Kopiér `scripts/scheduled/omverden-daily/SKILL.md` → `Documents/Claude/Scheduled/omverden-daily/SKILL.md` og opret scheduled task (06:30).
3. Append Hermes-idé #6 (nedenfor) til `wiki/os/hermes-cron-ideer.md` og opret evt. cronet.
4. Review + merge `feature/session5-6-dedup-omverden` (ikke pushet).
5. Visuel verifikation af badge + OmverdenCard ved næste serverstart.

### Hermes-idé #6 til kataloget (append)

```bash
hermes cron add --name "omverden-heartbeat" --schedule "0 10 * * *" --deliver telegram \
  --prompt "Hent https://raw.githubusercontent.com/Buurski/KnowledgeOS/master/data/omverden.json og læs at-feltet. Er timestampet ældre end 36 timer (eller filen mangler), send: 'omverden-daily har ikke kørt siden <dato> — tænd maskinen / kør tasken manuelt.' Ellers: send INTET (stilhed = alt ok)."
```
Værdi: fanger at maskinen var slukket ved 06:30-tasken. Hermes kører ALDRIG selve skillet — kun påmindelsen.

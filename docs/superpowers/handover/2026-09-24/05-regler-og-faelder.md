# 05 — Hårde regler og kendte fælder

## Ufravigelige (Lucas' regler — gælder også hvis han glemmer at nævne dem)

1. **Udgående = kladder.** Kolde mails, svar, kundeopdateringer, gratis-udkast-mails: systemet laver kladder, Lucas/Charlie trykker selv send (bekræft-trin). Messenger sendes aldrig automatisk. Test-mails kun til `buur.aigro@gmail.com`, aldrig rigtige leads.
2. **Send-gaten må aldrig svækkes:** `canSendTo` (svaret/bounced/afmeldt/delt adresse ≥3/placeholder), `followup-gate.ts` (max 5 berøringer, ≥4 dage, trin = sendte+1, kun kendt adresse), "sendt = endelig" (en sendt/system-stoppet kladde kan aldrig godkendes igen), dobbeltklik-værn, kunder (`client_no` sat) = status `client` ⇒ ingen kold mail. Rør du send-vejen: Codex Sol-review + test før merge.
3. **Hemmeligheder** kun fra filer; aldrig i git, chat, commits, logs. Vercel env via `--value … < /dev/null`.
4. **Claude rører ALDRIG Hermes' cron-config eller `.env` på VPS'en.** Ændringer i Hermes' adfærd = besked til Hermes (Hermes-MCP `messages_send` eller `ssh hermes-vps 'hermes -p <profil> -z "…"'`) eller forslag i vault `wiki/os/hermes-cron-ideer.md`.
5. **Vault:** `git pull --rebase --autostash` før skriv; aldrig `git push --force`.
6. **Migrér før deploy** når ny kode læser nye kolonner. Git-tag før destruktivt arbejde (`pre-<emne>-<dato>`).
7. **Composio er kun til chat** (Claude på Lucas' vegne) — aldrig i produktionskode på Vercel/VPS. ⚠ Main-commit `8599a78` nævner "threadId hele vejen fra Composio" — **tjek om prod-kode kalder Composio** (må ikke) eller om det kun er VPS-digestens datakilde (også tvivlsomt — Hermes-profilerne har egne forbindelser).
8. **Space Bunny Alpha må aldrig bruges til design/UI/kundesider** (Lucas 24/9 til Hermes). Hermes-routing nu: GPT-6 Sol = orchestrator (default/lucas/charlie/cofounder), DeepSeek V4.1 Flash = worker (marketing, kundeplejer, crons).
9. **Design:** ingen orange i CRM'et (lime `#C8F04B` accent; Kinly-logo i CRM med lime prik). kinly.dk beholder orange. Diskret bevægelse (120–150 ms), faner øverst på hver hovedside. Ingen gamle "Google Sheets svarer ikke"-tilstande.
10. **Kundevendt tekst:** anti-slop-skill + brand-og-tone (`KnowledgeOS/context/brand-og-tone.md`, `forbidden-phrases.md`). Præsentation i kolde mails er nu professionel ("Jeg hedder Lucas og er medstifter af Kinly …" med rigtige cases) — ikke "sidevirksomhed/salgselev" (Lucas 23/9). Charlie-mails må aldrig indeholde Lucas' personlige detaljer (`LUCAS_ONLY`-regex i `tone-mixer.ts`).
11. **Ingen deploy-spam:** vaultens loft er 2–3 prod-deploys/dag (byggetid koster). Saml ændringer.

## Fælder der har kostet tid

- **Bash-heredoc halverer backslashes** i dette miljø. Regex/escape-kode: skriv et python-script med Write-toolet og kør det, eller brug Edit. Aldrig PowerShell `-replace`/`Set-Content` på filer med æøå (mojibake).
- **`vercel env add`** hænger uden `< /dev/null`; `--sensitive` kan prompte.
- **Codex som bygger** (`codex exec -s workspace-write`, `CODEX_HOME=$HOME/.codex-review`): kan ikke køre tests (spawn EPERM) eller committe i worktrees → orkestratoren kører `npm run verify` og committer. Giv altid `< /dev/null`. Skriv i prompten: "kun apply_patch, aldrig PowerShell-skrivning". Sol er god til både review og afgrænset byg; Luna til mekanik. Kvoten slipper op efter ~6 store kørsler.
- **Claude Sonnet-subagenter** ramte ugegrænse 23/9 (nulstilles torsdag 23:00). Opus-agenter dyre. Planlæg med Codex som parallel arbejder.
- **pglite-server lokalt**: kun `-m 1` + `DB_POOL_MAX=1`; samtidige requests giver ECONNRESET (ikke en prod-fejl). Kør sekventielle `await` i server-komponenter der ellers ville race lokalt.
- **Next 16**: `params`/`searchParams` er Promises; `proxy.ts` = middleware; stale `.next/types` giver falske typecheck-fejl efter slettede ruter → `rm -rf .next`.
- **Row-nummer**: `company.row_no` = Sheets-række (lead.id). Virksomheder oprettet i CRM'et får **negativt** row_no og ses IKKE af `getLeads()`/lead-motoren (derfor "Lav mail-kladde" på profilen). `rowIndex = Number(lead.id) − 2`, aldrig position i listen.
- **`patchLocal` i /approve** skal flette (`{...x, ...d}`), ellers forsvinder GET-berigelse (Jev, historik, modtager).
- **Proxy-matcher-undtagelser** er sikkerhedskritiske: hver undtaget rute skal selv fail-closed (HMAC/token). Tjek hver ny undtagelse (`api/kalender/`, `api/agent/`).
- **Opfølgnings-sekvens**: en sendt kladde der "godkendes igen" via forældet snapshot → dobbelt-send. Derfor `setWhere` i `writeQueue` og ledger-tjek. Rør ikke uden test.

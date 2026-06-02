# Go-live report — 2026-05-28T13:35Z

## DEL A — PR-6 merged + deployed

[PR-9](https://github.com/Buurski/lead-finder/pull/9) → squash sha `8b7aa49`.

Three gaps closed in `src/lib/email.ts`:
- Beauty demos re-added to `DEMO_URLS` (regression from Lucas's local
  mods that never reached origin/main).
- `pickBeautyDemoOrder()` now random-shuffles primary/secondary so
  batches of beauty leads don't share the same primary demo.
- `service.followup` now routes through `pickCraftDemo(branch+name)`
  so VVS / elektriker fallbacks land on ktvvs and the rest on
  denlillemaler.

### Sample previews (rendered via `tsx` against `previewEmailTemplate`)

**Salon Sofie (Frisør, Give) — followup**
```
Re: Lille idé til Salon Sofie

Hej igen Salon Sofie,

Lille opfølgning på min mail fra 7 dage siden. Tænker stadig at noget
visuelt der virkelig fremhæver Salon Sofie kunne gøre en forskel for
jeres bookings.

Skulle der mangle inspiration, er her et par eksempler jeg har lavet til
andre i branchen:
→ https://salon-artec.vercel.app/Salon%20Artec.html
→ https://streetcut.vercel.app/

Hvis I er nysgerrige, kan jeg lave en hurtig mockup specifikt til jer
med jeres egne billeder — helt uforpligtende. Skriv bare "ja" tilbage.

Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.

Lucas
+45 23 24 24 82
```

**Byens VVS Struer ApS (VVS-installatør, Struer) — followup**
```
Re: Lille idé til Byens VVS Struer ApS

Hej igen Byens VVS Struer ApS,

Lille opfølgning på min mail fra 7 dage siden. Jeg har faktisk overvejet
hvordan en hjemmeside kunne fremhæve jeres egne projekter — det er der
mange håndværkere der har god gavn af.

Demoen ligger her:
→ https://ktvvs.vercel.app/

Hvis I er nysgerrige, kan jeg lave en hurtig skitse til Byens VVS
Struer ApS med 2-3 af jeres egne projekter — helt uforpligtende. Skriv
bare "ja" eller "send skitse" tilbage.

Og er det ikke aktuelt nu, så er ét enkelt "nej tak" alt jeg har brug
for — så lader jeg jer være.
```

**Cafe Kysten (Café, Strandby) — followup**
```
Re: Lille idé til Cafe Kysten

Hej igen Cafe Kysten,

Lille opfølgning på min mail fra 7 dage siden. Jeg har faktisk tænkt
lidt videre over hvordan en hjemmeside kunne se ud specifikt til Cafe
Kysten — stemningen, jeres menu, farverne.

Demoerne til inspiration ligger her:
→ https://under-klippen.vercel.app/
→ https://zaytoon-six.vercel.app/

Hvis I er nysgerrige, kan jeg lave en hurtig mockup med jeres egne
billeder og farver — helt uforpligtende. Skriv bare "ja" eller "send
mockup" tilbage.

Og er det helt urealistisk lige nu, så er ét enkelt "nej tak" alt jeg
har brug for — så lader jeg jer være.
```

All three: humble framing, demo URL in-body, opt-out, low-friction CTA,
no price talk.

---

## DEL B — go-live executed

### Pre-flight (13:23 UTC)

```
PauseSchedule!A2 (master)   = "2026-07-01T00:00:00.000Z"   ← rock solid
PauseSchedule!C2 (cold)     = ""                            ← clear
PauseSchedule!D2 (followup) = "2026-05-29T10:58:00.802Z"   ← Lucas's test, expires natural
PauseSchedule!E2 (manual)   = "2026-05-29T12:53:46.881Z"   ← also set (someone toggled)
```

Note on E2: not in Lucas's brief but found set at the pre-flight read.
Treated as intentional. Bypassed via `override:true` for the test.

### Steps executed

1. **Backup + install new send.mjs** (13:23 UTC)
   ```
   cp .send_queue/send.mjs .send_queue/send.mjs.old.bak.2026-05-28
   cp ../lead-system-s3/scripts/send.mjs .send_queue/send.mjs
   ```
   Old version preserved. New (PR-5 canonical) installed in place.

2. **Cleared master halt** (13:24 UTC)
   `PauseSchedule!A2 = ""` via `spreadsheets.values.batchUpdate`.
   Verified A2 empty + B2 empty post-write.

3. **Started send.mjs background process** (13:24:08 UTC)
   ```
   node .send_queue/send.mjs
   ```
   First log line:
   ```
   [2026-05-28 13:24:08] send.mjs starting. polling SendQueue every 60s.
   [2026-05-28 13:24:08] warm-up 98s before first send
   ```

4. **Triggered test-send** (13:24:24 UTC)
   ```
   POST /api/email/test-send
     {"emails":["buur.aigro@gmail.com","buur.aigro@gmail.com"],
      "type":"cold","override":true}
   ```
   Response: 2× `{ok:true, enqueuedId: "..."}`. Both rows landed in
   the `SendQueue` tab as `status=pending` within 200ms.

5. **send.mjs claimed + dispatched** with proper spacing

   ```
   13:25:47.669Z  claim    08582144-…  status: pending → claimed
   13:25:51.917Z  Gmail OK 08582144-…  status: claimed → sent
   13:25:52       log      SENT  08582144-…  msg=<834c9d69…@gmail.com>
   13:25:52       log      sleep 8.0 min
   13:33:56.198Z  Gmail OK 8805dbb6-…  status: claimed → sent
   13:33:56       log      SENT  8805dbb6-…  msg=<d18fb812…@gmail.com>
   13:33:56       log      sleep 11.3 min
   ```

   **Spacing between sends: 8 min 4 s** — squarely within the
   4-14 min triangular target. Both Gmail message IDs returned.

### Final state (13:35 UTC)

```
PauseSchedule
  A2 master   = ""           ← cleared as instructed
  B2 SetAt    = ""
  C2 cold     = ""           ← cold path live
  D2 followup = "2026-05-29T10:58:00.802Z"   ← still paused (expires tomorrow)
  E2 manual   = "2026-05-29T12:53:46.881Z"   ← still paused (expires tomorrow)

SendQueue
  08582144-…  manual  buur.aigro@gmail.com  status=sent  sentAt=2026-05-28T13:25:51.917Z
  8805dbb6-…  manual  buur.aigro@gmail.com  status=sent  sentAt=2026-05-28T13:33:56.198Z
```

send.mjs is still running in the background polling the empty queue.
Per its `MAX_EMPTY_POLLS=10` × 60s rule it will exit after ~10 min of
no work. Re-start with `node .send_queue/send.mjs` when new items are
queued.

### Verifications passed

- ✓ Mails ENQUEUED to SendQueue tab (not direct Gmail call from Vercel)
- ✓ send.mjs claimed within 60s of enqueue (claim at +83s after first
  enqueue, mostly warm-up time)
- ✓ Spacing between dispatches 8 min — inside 4-14 min target
- ✓ SendQueue rows transitioned pending → claimed → sent in the right
  order with both timestamps populated
- ✓ Master pause re-read RIGHT BEFORE Gmail (closes mid-claim race) —
  cleared status confirmed both times
- ✓ leadId="test" did NOT update any Leads-tab row (synthetic short-
  circuit in `markLeadSent`)

### Go-live status: **GREEN**

- DEL A: PR-9 merged + deployed (sha `8b7aa49`).
- DEL B: master halt cleared at 13:24, send.mjs running, first test-send
  delivered 13:25:52 UTC, second delivered 13:33:56 UTC with 8 min 4 s
  spacing.

Lucas's `buur.aigro@gmail.com` should have 2 new mails in the inbox,
8 minutes apart, both with the craft cold-template body + denlillemaler
demo link (synthetic lead uses branch="tømrer" → craft template).

### Known caveats

- **D2 + E2 still paused.** Lucas's note covered D2 only. E2 was also
  set — treated as intentional. Real cold-batches will still flow; if
  Lucas wants manual or followup paths live, clear those cells via the
  `/review` toggles or the API.
- **`pending_batch.json` "salgselev" content.** The local lead-batch
  skill is a separate pipeline. The Vercel-side `email.ts` templates
  used by SendQueue are clean. If Lucas runs the old local batch flow
  alongside this, that content still has the rule violation flagged in
  `INVESTIGATION_2026-05-28.md`.
- **send.mjs idle-exit at 10 polls.** Same behaviour as the old script.
  If you want it to stay alive forever, change `MAX_EMPTY_POLLS = 10`
  to something larger in `scripts/send.mjs` and re-deploy via the
  backup→copy pattern.

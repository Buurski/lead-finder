# Overnight Execution Plan — 2026-05-12

## Mission

Execute full lead pipeline overnight:
1. Scrape new leads from Google Places API (33 cities × 22 branches)
2. Verify all leads 200 at a time until every lead has a websiteQualityTier
3. Find email addresses (bulk-find-emails) until all leads have emails
4. Spot-check 50–100 leads — manually inspect websites, quality, scoring
5. Be critical, fix bugs/scoring/logic issues found, re-scrape if needed
6. Send bulk cold emails to all eligible new leads
7. Sync failed/bounced emails
8. Final double-check: spot-check emails sent, check system state

**Hard rule: When context reaches 20%, call `/compact` before continuing.**

---

## Environment

- **App URL:** https://lead-finder-three-beta.vercel.app/ (no auth required)
- **Repo:** c:\Users\Buur\Documents\Workflows\lead-system
- **Branch:** main (last commit: `a488de5`)
- **Browser tool:** `browser-harness` (available on $PATH)
- **Working directory:** c:\Users\Buur\Documents\Workflows\lead-system

---

## Pre-Flight Checks

Before doing anything, verify the deployment is live:

```python
# Check Vercel deployment has latest commit
browser-harness -c '
new_tab("https://lead-finder-three-beta.vercel.app/")
wait_for_load()
print(page_info())
capture_screenshot()
'
```

Also verify via API the app is responding:
```bash
curl -s https://lead-finder-three-beta.vercel.app/api/email/bulk-send | head -c 200
```

If deployment is stale (shows old commit), wait 2–3 minutes and recheck. Vercel auto-deploys from main.

---

## PHASE 1: Cleanup Chain Leads

Chain leads = big brands that will never buy a custom website. Delete them first so they don't inflate counts.

**Step 1.1 — Preview what cleanup would delete:**
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/leads/cleanup" | python3 -m json.tool
```

Review the `leads` array. If you see legitimate local businesses (not chains), add them as exclusions before deleting. If count > 0 and all look like chains:

**Step 1.2 — Delete chain leads:**
```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/leads/cleanup" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

---

## PHASE 2: Scrape New Leads

The scrape runs all 33 cities × 22 branches = 726 queries. Takes 10–20 minutes. Uses Google Places API.

**Step 2.1 — Trigger scrape:**
```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/scrape" \
  --max-time 350 | python3 -m json.tool
```

Expected response: `{ "added": N, "total": M }` where N = new leads added, M = total scraped.

If it times out (>350s), that's a Vercel timeout. The scrape continues server-side. Wait 2 minutes, then check lead count to confirm it ran:
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/leads" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total leads: {len(d)}')"
```

---

## PHASE 3: Verify All Leads (200 at a time)

Verification scores websites (dead/old/mediocre/modern), adjusts scores, finds email addresses from HTML. MUST run before bulk-send.

**Step 3.1 — Check how many unverified leads exist:**
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/leads" | python3 -c "
import sys, json
leads = json.load(sys.stdin)
unverified = [l for l in leads if not l.get('websiteQualityTier') and l.get('website')]
no_website = [l for l in leads if not l.get('website')]
print(f'Unverified (have website): {len(unverified)}')
print(f'No website (no need to verify): {len(no_website)}')
print(f'Total: {len(leads)}')
"
```

**Step 3.2 — Verify loop (200 at a time):**

Run this loop until all are verified. Each run: POST /api/verify-all, wait for response, check remaining.

```bash
# Run one batch of 200
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/verify-all" \
  --max-time 350 | python3 -m json.tool
```

Expected response includes `verified`, `failed`, `remaining`.

**Keep repeating Step 3.2 until `remaining === 0` or `verified === 0` (nothing left to do).**

Typical throughput: ~200 leads/5 minutes. If 2000 unverified leads: ~50 minutes total, 10 iterations.

If a batch returns an error, wait 1 minute and retry. If 3 consecutive errors, investigate:
```bash
# Check what the error is
curl -v -X POST "https://lead-finder-three-beta.vercel.app/api/verify-all" --max-time 60 2>&1 | tail -50
```

---

## PHASE 4: Find Emails (200 at a time)

Crawls each lead's website looking for email addresses. Runs after verification so high-quality leads are prioritized.

**Step 4.1 — Check how many leads need emails:**
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/email/bulk-find-emails" | python3 -m json.tool
```

Returns `{ "count": N }` — N leads have a website but no email.

**Step 4.2 — Find email loop:**
```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/email/bulk-find-emails" \
  --max-time 350 | python3 -m json.tool
```

Returns `{ "found": N, "scanned": M, "remaining": R }`.

**Keep repeating until `remaining === 0`.**

---

## PHASE 5: Spot-Check 50–100 Leads

**This is the critical quality gate.** Manually inspect a sample of leads to validate that scoring, verification, and email discovery are working correctly.

**Step 5.1 — Pull sample leads:**
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/leads" | python3 -c "
import sys, json, random
leads = json.load(sys.stdin)
# Sample: mix of scores, branches, cities
verified = [l for l in leads if l.get('websiteQualityTier')]
sample = random.sample(verified, min(80, len(verified)))
for l in sample[:20]:  # print first 20
    print(f\"{l['score']:3d} | {l['branch']:<30s} | {l['city']:<15s} | {l.get('websiteQualityTier','?'):<10s} | {l.get('website','no website')[:50]}\")
"
```

**Step 5.2 — Investigate each lead in the sample. For each:**

```python
# For a lead with a website, visit it
browser-harness -c '
new_tab("https://example-lead-website.dk")
wait_for_load()
capture_screenshot()
print(page_info())
'
```

**What to check per lead:**
1. Does the `websiteQualityTier` (dead/old/mediocre/modern) match what the site actually looks like?
2. Does the `score` make sense? A score of 80 should be an impressive established business.
3. If email was found — is it a valid business email (not `info@` catching all, noreply, etc.)?
4. Is the lead a legitimate local business or a chain/franchise?
5. Does the branch label match the actual business?

**Step 5.3 — Document findings:**

Write observations to a local file:
```bash
cat > /tmp/spotcheck.md << 'EOF'
# Spot-Check Findings — [date]

## Issues Found

## Patterns

## Suggested Fixes

EOF
```

**Step 5.4 — Be critical. Red flags to look for:**

- `websiteQualityTier: "modern"` on a clearly outdated WordPress site → scoring bug
- `websiteQualityTier: "old"` on a proper React/Next.js site → scoring bug
- Score > 70 for a tiny local business with 2 Google reviews → scoring bug
- Email found that is clearly an auto-generated address or competitor's email
- Leads from cities outside Denmark or obviously wrong location
- Chain/franchise businesses that slipped past `isChain()` → add to CHAIN_CONTAINS in `src/lib/chains.ts`

---

## PHASE 6: Fix Issues Found

Based on spot-check findings:

### If websiteQualityTier scoring is wrong:

Read `src/app/api/verify-all/route.ts` to understand the scoring logic. Fix the tier classification.

Key file: `src/app/api/verify-all/route.ts`

After fixing, re-verify affected leads:
```bash
# Re-verify specific lead by ID
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/leads/{id}/analyze"
```

### If chain detection is missing brands:

Edit `src/lib/chains.ts` — add to `CHAIN_CONTAINS`:
```typescript
// Add new chains here in appropriate category
"new chain name",
```

Then run cleanup again:
```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/leads/cleanup" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

### If scoring weights are wrong:

Edit `src/lib/apify.ts` — `scoreLead()` function.
Edit `src/lib/sheets.ts` — `websiteQualityBonus()` function.

After scoring changes, re-run verify-all to re-score all verified leads.

### If major issues require re-scrape:

```bash
# First delete problematic leads, then re-scrape
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/scrape" --max-time 350
```

### Commit any code fixes:

```bash
cd c:\Users\Buur\Documents\Workflows\lead-system
git add -p  # stage specific changes
git commit -m "fix: [description of what was fixed based on spot-check]"
git push origin main
```

Wait for Vercel to redeploy (~1-2 min) before continuing.

---

## PHASE 7: Send Bulk Cold Emails

**Pre-send check:**
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/email/bulk-send" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"Eligible: {d['eligible']} leads\")
print('Top 10 leads:')
for l in d.get('leads', [])[:10]:
    print(f\"  {l['score']:3d} | {l['branch']:<25s} | {l['city']:<15s} | {l['email']}\")
"
```

Review the top leads. If something looks wrong (chains, wrong branches, no emails), investigate before sending.

**Send emails:**
```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/email/bulk-send" \
  --max-time 360 | python3 -m json.tool
```

Expected: `{ "sent": N, "failed": M, "results": [...] }`

**Gmail quota is ~100-500 emails/day.** If `eligible > 100`, you may need multiple runs:
- Run POST bulk-send
- Wait for response
- Re-check GET bulk-send for remaining eligible
- Repeat until eligible = 0 OR you hit Gmail limits

**If Gmail rate limit error:**
```
Error: "Connection timeout" or "535 5.7.8 Username and Password not accepted"
```
→ Wait 30 minutes, then retry.

**If error persists after retry:**
1. Check the specific error in `results[].error`
2. If it's a Gmail auth issue: the app password may have expired. Cannot fix without user.
3. If it's a connection timeout: Gmail is temporarily throttling. Wait 30-60 min.
4. If `550 5.1.1 email account does not exist`: that email is bad. It'll go into bounced. Continue.

**Track progress:**
```python
# After each send batch, check how many are now sent
browser-harness -c '
new_tab("https://lead-finder-three-beta.vercel.app/")
wait_for_load()
capture_screenshot()
'
```

---

## PHASE 8: Sync Bounced/Failed Emails

After sending, sync to mark bounced emails:

```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/email/sync-bounces" \
  --max-time 120 | python3 -m json.tool
```

Expected: `{ "bounced": N, "checked": M }`

Also sync replies (in case anyone replied during the night):
```bash
curl -s -X POST "https://lead-finder-three-beta.vercel.app/api/email/sync-replies" \
  --max-time 120 | python3 -m json.tool
```

---

## PHASE 9: Final Verification

**9.1 — Check dashboard state:**
```python
browser-harness -c '
new_tab("https://lead-finder-three-beta.vercel.app/")
wait_for_load()
capture_screenshot()
'
```

**9.2 — Verify email stats:**
```bash
curl -s "https://lead-finder-three-beta.vercel.app/api/leads" | python3 -c "
import sys, json
leads = json.load(sys.stdin)
sent = sum(1 for l in leads if l.get('emailStatus') in ['sent','opened','clicked','replied'])
bounced = sum(1 for l in leads if l.get('emailStatus') == 'bounced')
eligible = sum(1 for l in leads if 
    l.get('email') and 
    not l.get('emailSentAt') and 
    l.get('score', 0) >= 40 and
    l.get('status') not in ['skip', 'client'] and
    l.get('websiteQualityTier') != 'modern'
)
print(f'Emails sent: {sent}')
print(f'Bounced: {bounced}')
print(f'Still eligible (unsent): {eligible}')
"
```

**9.3 — Spot-check 5 sent emails:**

Pick 5 leads that received emails and verify:
1. `emailSentAt` is set (not empty)
2. `emailStatus = "sent"` (or opened/clicked if they engaged)
3. Lead score ≥ 40 (or ≥ 70 if professional)

**9.4 — Final screenshot of app:**
```python
browser-harness -c '
new_tab("https://lead-finder-three-beta.vercel.app/")
wait_for_load()
capture_screenshot()
'
```

---

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| Vercel 504 on /api/scrape | Function timeout (5 min) | Scrape still ran. Check lead count. |
| Vercel 504 on /api/verify-all | Function timeout | Some verified. Rerun. |
| Gmail 535 auth error | App password rejected | Wait 30 min. Retry. If persist → notify user. |
| Gmail 550 5.1.1 | Email doesn't exist | Expected. Will be marked bounced. Continue. |
| `fetch failed` on verify-all | External site unreachable | Expected. Continues to next lead. |
| TypeScript build error | Code change broke types | Run `npm run build`. Fix errors. Recommit. |

---

## Context Management

**HARD RULE:** When conversation context reaches 20%, run `/compact` before continuing.

After compact, reload this plan and continue from where you left off. Use git log and API status checks to determine current state.

---

## Summary Checklist

- [ ] Vercel deployment is live with commit a488de5 or later
- [ ] Chain leads cleaned up
- [ ] Leads scraped (new leads added)
- [ ] All leads verified (websiteQualityTier set on all that have websites)
- [ ] Emails found for leads with websites
- [ ] Spot-check done (50–100 leads inspected)
- [ ] Issues found and fixed (code committed, Vercel redeployed if needed)
- [ ] Bulk cold emails sent to all eligible leads
- [ ] Sync bounces run
- [ ] Sync replies run
- [ ] Final spot-check done
- [ ] Screenshot of dashboard taken

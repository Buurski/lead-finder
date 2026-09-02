#!/usr/bin/env bash
# Registreres via nyt-cronjob.sh, IKKE manuelt i jobs.json.
# Kør IKKE før GOOGLE_PLACES_API_KEY er verificeret gyldig: curl Text Search-test:
#   curl -s -X POST https://places.googleapis.com/v1/places:searchText \
#     -H "Content-Type: application/json" -H "X-Goog-Api-Key: $GOOGLE_PLACES_API_KEY" \
#     -H "X-Goog-FieldMask: places.displayName" \
#     -d '{"textQuery":"frisør Herning","languageCode":"da","maxResultCount":1}'
set -euo pipefail

CREDS=/root/.hermes/credentials.env
[ -f "$CREDS" ] || { echo "FEJL: $CREDS findes ikke — ingen credentials." >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$CREDS"; set +a
# store.ts importerer "server-only" — uden react-server-condition kaster pakken ved
# plain node (apply fejlede 2026-09-02 på VPS). Samme condition som npm test bruger.
export NODE_OPTIONS="--conditions=react-server"

mkdir -p /root/.hermes/logs
LOG="/root/.hermes/logs/leadgen-$(date +%F).log"
exec >>"$LOG" 2>&1
echo "=== leadgen $(date -Is) ==="

cd /root/lead-system
export KOS_ROOT=/root/KnowledgeOS

node scripts/leadgen/run.mjs plan
node scripts/leadgen/run.mjs source

for i in 1 2 3 4 5; do
  out=$(node scripts/leadgen/run.mjs rate)
  echo "$out"
  remaining=$(printf '%s' "$out" | grep -o '"remaining":[-0-9]*' | head -1 | cut -d: -f2 || true)
  [ -n "${remaining:-}" ] || remaining=0
  [ "$remaining" -gt 0 ] || break
done

node scripts/leadgen/run.mjs finalize
node scripts/leadgen/run.mjs apply

cd /root/KnowledgeOS
bash scripts/safe-push.sh "leadgen $(date +%F)"
echo "=== done $(date -Is) ==="

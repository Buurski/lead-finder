#!/usr/bin/env bash
# safe-push.sh — lead-system collision-safe push til main.
# Bruges til at synk'e lokale ændringer til Buurski/lead-system main.
#
# Sådan bruges:
#   bash scripts/safe-push.sh                       # default message
#   bash scripts/safe-push.sh "min commit-besked"   # custom message
#
# Hvorfor ikke bare `git push`? Fordi Hermes + scheduled tasks + Lucas'
# lokale commits kan alle skrive til samme repo → fetch-first-fejl og
# .git/index.lock. safe-push.sh tager pull --rebase --autostash først.

set -euo pipefail

MSG="${1:-lead-system: synk lokale ændringer}"

cd "$(git rev-parse --show-toplevel)"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "→ git pull --rebase --autostash origin $BRANCH"
git pull --rebase --autostash origin "$BRANCH"

echo "→ git add -A (alt unstaged + untracked)"
git add -A

# Skip commit hvis intet at committe
if git diff --cached --quiet; then
  echo "→ intet at committe — alt allerede synk't"
  exit 0
fi

echo "→ git commit -m \"$MSG\""
git commit -m "$MSG"

echo "→ git push origin $BRANCH"
git push origin "$BRANCH"

echo "✓ synk færdig"
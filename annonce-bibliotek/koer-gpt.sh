#!/usr/bin/env bash
# Som koer.sh, men prompter der starter med "Use your built-in" køres uden faelles.txt, og REFS kan sættes pr. kørsel.
# REFS="ref-booksy.png" bash koer2.sh p1 p2
cd "$(dirname "$0")"
REFS=${REFS:-"ref-booksy.png ref-kinly-enheder.png ref-font-spacegrotesk.png"}
args=(); for r in $REFS; do args+=(-i "$r"); done
for x in "$@"; do
  if head -c 30 "prompt-$x.txt" | grep -q "^Use your built-in"; then p="prompt-$x.txt"; else cat faelles.txt "prompt-$x.txt" > "full-$x.txt"; p="full-$x.txt"; fi
  echo "== $x start $(date +%H:%M:%S)" >> koe2.log
  timeout 1200 codex exec --skip-git-repo-check --sandbox workspace-write -C "$PWD" "${args[@]}" < "$p" > "run-$x.log" 2>&1
  echo "== $x EXIT=$? $(date +%H:%M:%S)" >> koe2.log
  grep -h -i -E "usage limit|error" "run-$x.log" | tail -2 >> koe2.log
done
echo "== FÆRDIG $*" >> koe2.log

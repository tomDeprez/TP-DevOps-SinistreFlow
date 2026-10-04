#!/usr/bin/env bash
# OUTIL PROF — vérifie qu'un dépôt étudiant contient un commit par ticket, avec le message EXACT attendu.
#   bash prof/tools/check-commits.sh <chemin-du-depot-clone> [branche]
set -uo pipefail

REPO="${1:?chemin du dépôt}"
BRANCH="${2:-main}"
DIR="$(cd "$(dirname "$0")" && pwd)"
EXPECTED="$DIR/expected-commits.txt"

ok=0; ko=0
LOG="$(git -C "$REPO" log "$BRANCH" --format='%s' 2>/dev/null)" || { echo "dépôt ou branche introuvable"; exit 2; }

while IFS= read -r expected; do
  [ -z "$expected" ] && continue
  case "$expected" in \#*) continue ;; esac
  if grep -qxF "$expected" <<< "$LOG"; then
    printf '  \033[32mOK\033[0m  %s\n' "$expected"; ok=$((ok+1))
  else
    ticket="$(sed -E 's/^[a-z]+\((SF-[0-9]+)\).*/\1/' <<< "$expected")"
    near="$(grep -F "($ticket)" <<< "$LOG" | head -1)"
    printf '  \033[31mKO\033[0m  %s\n' "$expected"
    [ -n "$near" ] && printf '        trouvé à la place : "%s"\n' "$near"
    ko=$((ko+1))
  fi
done < "$EXPECTED"

echo
echo "Commits conformes : $ok / $((ok+ko))"
echo "Auteurs (répartition du travail) :"
git -C "$REPO" shortlog -sn "$BRANCH" | sed 's/^/  /'
[ "$ko" -eq 0 ]

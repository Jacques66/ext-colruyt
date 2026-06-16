#!/usr/bin/env bash
#
# Construit le zip de l'extension Chrome à partir de ses seules dépendances
# d'exécution (manifest + scripts + icônes). Sortie : dist/ext-colruyt.zip.
#
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist/ext-colruyt.zip"
mkdir -p dist
rm -f "$OUT"

# -r : récursif (préserve icons/…) ; -X : pas d'attributs superflus.
zip -r -X "$OUT" manifest.json pure.js content.js icons >/dev/null

echo "Construit : $OUT"

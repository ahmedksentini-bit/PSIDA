#!/bin/bash
# Rendu local du manuel : make.sh export.md export.html dossier_images "Novembre 2026 — PSIDA version 0.99.41" sortie.pdf
# KATEX_DIR : dossier dist/ de KaTeX (par défaut, celui de node_modules à côté de ce script ou de /opt/npm-tools).
set -e
D="$(cd "$(dirname "$0")" && pwd)"; W="${WORK:-$(mktemp -d)}"
K="${KATEX_DIR:-$( [ -d "$D/node_modules/katex/dist" ] && echo "$D/node_modules/katex/dist" || echo /opt/npm-tools/node_modules/katex/dist )}"
python3 "$D/build.py" "$1" "$2" "$3" "$W" "$4"
pandoc "$W/doc_pd.md" -f markdown+tex_math_dollars -s --katex="file://$K/" --toc --toc-depth=2 \
  --shift-heading-level-by=-1 -c "$D/style.css" -o "$W/doc.html" --metadata toc-title="Sommaire"
node "$D/pdf.cjs" "$W/doc.html" "$5"
echo "brut : $5 (dossier de travail $W)"

#!/usr/bin/env bash
# Shrink an agent's finished screenshot folder before it is committed (docs/process/PLAYBOOK.md
# Stage 3): strip metadata, cap the width at 1440 px and store as 8-bit palette PNG (ImageMagick).
# File names stay the same, so every link in the agent's log still resolves. About 4x smaller.
#
#   bash scripts/cycle/shrink-screenshots.sh docs/screenshots/<role> [...]
set -euo pipefail
command -v convert >/dev/null || { echo "shrink-screenshots: ImageMagick (convert) is not installed" >&2; exit 2; }
for dir in "$@"; do
  before=$(du -sk "$dir" | cut -f1)
  find "$dir" -type f -name '*.png' -print0 | while IFS= read -r -d '' f; do
    convert "$f" -strip -resize '1440x>' -define png:compression-level=9 "PNG8:$f.tmp" && mv "$f.tmp" "$f"
  done
  echo "shrink-screenshots: $dir ${before} KB -> $(du -sk "$dir" | cut -f1) KB"
done

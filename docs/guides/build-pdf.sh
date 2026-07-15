#!/usr/bin/env bash
# Render the guides to PDF: markdown -> standalone HTML (pandoc) -> PDF (Chrome).
#
# Chrome rather than pandoc's own PDF path because the only engines installed here
# are LaTeX ones, which ignore print.css and look like a paper, not the product.
# Chrome applies the real stylesheet, including @page and break-inside rules.
#
# Usage:  ./build-pdf.sh            # renders both guides into ./pdf/
#         ./build-pdf.sh chatbot    # renders one
set -euo pipefail

cd "$(dirname "$0")"
OUT="pdf"
mkdir -p "$OUT"

chrome() {
  command -v google-chrome || command -v chromium || command -v chromium-browser
}
BROWSER="$(chrome)" || { echo "no Chrome/Chromium on PATH" >&2; exit 1; }
# pandoc is the likelier of the two to be missing, and set -e would otherwise
# kill the script with no explanation at all.
command -v pandoc >/dev/null || { echo "pandoc is not on PATH" >&2; exit 1; }

targets=("${@:-knowledge-base chatbot}")
# shellcheck disable=SC2068
for name in ${targets[@]}; do
  src="$name.md"
  [ -f "$src" ] || { echo "missing $src" >&2; exit 1; }
  html="$OUT/$name.html"
  pdf="$OUT/$name.pdf"

  # --embed-resources inlines the CSS and the screenshots as data: URIs, so the
  # HTML is self-contained and Chrome needs no local file access beyond it.
  # pagetitle, NOT metadata title: --metadata title renders pandoc's own title
  # block into the body, which duplicates the document's existing H1. pagetitle
  # only fills <title> and keeps --standalone from warning.
  pandoc "$src" \
    --from=gfm \
    --to=html5 \
    --standalone \
    --embed-resources \
    --css=print.css \
    --variable pagetitle="${name//-/ }" \
    --output "$html"

  "$BROWSER" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --no-pdf-header-footer \
    --print-to-pdf="$pdf" \
    "file://$PWD/$html" 2>/dev/null

  rm -f "$html"
  printf '  %-18s -> %s (%s KB)\n' "$src" "$pdf" "$(( $(stat -c%s "$pdf") / 1024 ))"
done

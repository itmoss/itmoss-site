#!/usr/bin/env bash
# 새 로고 원본(밝은 불투명 배경 PNG)에서 투명 배경 로고·파비콘을 만든다.
#   bash scripts/make-logo.sh
# 원본이 842×203 저해상도라 확대하지 않는다 (표시 높이 28~40px 기준).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=docs/renewal/brand/itmoss-logo-source.png
OUT=public/images/brand
SPLIT=295          # 이 열 왼쪽 = 잎 마크, 오른쪽 = 워드마크 (마크 69~273, 글자 316~769)
LEAF='#257833'     # 마크
INK='#151F1D'      # 워드마크 원색
PAPER='#ECEDEA'    # --color-paper (다크 배경용 워드마크)
PAD=8

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
read -r W H < <(magick "$SRC" -format '%w %h\n' info:)

# 배경(거의 흰색)과의 거리 → 알파. 마크와 글자는 밝기가 달라 따로 레벨을 맞춘다.
magick "$SRC" -alpha off -colorspace gray -negate -level 3%,55% \
  -fill black -draw "rectangle $SPLIT,0 $W,$H" "$TMP/mark-a.png"
magick "$SRC" -alpha off -colorspace gray -negate -level 3%,80% \
  -fill black -draw "rectangle 0,0 $((SPLIT - 1)),$H" "$TMP/word-a.png"

# 단색 레이어 + 알파 → 가장자리 색 번짐 없는 투명 레이어
layer() {
  magick -size "${W}x${H}" "xc:$1" \( "$2" -alpha off \) -compose CopyOpacity -composite "$3"
}
layer "$LEAF" "$TMP/mark-a.png" "$TMP/mark.png"
layer "$INK" "$TMP/word-a.png" "$TMP/word-ink.png"
layer "$PAPER" "$TMP/word-a.png" "$TMP/word-paper.png"

webp() {
  magick -define webp:lossless=true "$@"
}
trimmed() {
  echo -trim +repage -bordercolor none -border "$PAD"
}

webp "$TMP/mark.png" "$TMP/word-ink.png" -background none -layers flatten $(trimmed) "$OUT/logo-on-light.webp"
webp "$TMP/mark.png" "$TMP/word-paper.png" -background none -layers flatten $(trimmed) "$OUT/logo-on-dark.webp"
webp "$TMP/mark.png" $(trimmed) "$OUT/logo-mark.webp"

magick "$TMP/mark.png" -trim +repage -resize 28x28 -background none -gravity center -extent 32x32 \
  "PNG32:$OUT/favicon-32.png"
# iOS 는 투명 영역을 검게 칠하므로 흰 바탕으로 채운다
magick "$TMP/mark.png" -trim +repage -resize 136x136 -background white -gravity center -extent 180x180 \
  -alpha remove -alpha off "$OUT/apple-touch-icon.png"

# manifest.json — <img> 에 width/height 를 지정하기 위한 크기표
{
  echo '{'
  echo '  "source": "docs/renewal/brand/itmoss-logo-source.png",'
  echo '  "files": ['
  sep=''
  for f in logo-on-dark.webp logo-on-light.webp logo-mark.webp favicon-32.png apple-touch-icon.png; do
    read -r fw fh < <(magick "$OUT/$f" -format '%w %h\n' info:)
    printf '%s    { "file": "%s", "src": "/images/brand/%s", "width": %s, "height": %s }' "$sep" "$f" "$f" "$fw" "$fh"
    sep=$',\n'
  done
  printf '\n  ]\n}\n'
} > "$OUT/manifest.json"

echo "→ $OUT"
cat "$OUT/manifest.json"

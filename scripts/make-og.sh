#!/usr/bin/env bash
# 공유 카드(Open Graph) 이미지 1200×630 을 만든다.
#   bash scripts/make-og.sh
# 지구 키비주얼(우주데브리스) 위에 로고(회사명) + 한 줄. 글자는 이 둘만 넣는다.
set -euo pipefail
cd "$(dirname "$0")/.."

BG=public/images/renewal/uzudebris-earth.webp
LOGO=public/images/brand/logo-on-dark.webp
OUT=public/images/brand/og.jpg
INK='#101214'      # --color-ink
PAPER='#ECEDEA'    # --color-paper
FONT=/System/Library/Fonts/AppleSDGothicNeo.ttc
LINE='영상 해킹에 맞서는 단 하나의 AI 솔루션'

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 배경: 1200×630 으로 채워 자르고, 왼쪽을 바탕색으로 어둡게 (글자 대비)
magick "$BG" -resize 1200x630^ -gravity center -extent 1200x630 "$TMP/bg.png"
magick -size 630x1200 gradient:"${INK}-none" -rotate -90 "$TMP/fade.png"
magick "$TMP/bg.png" "$TMP/fade.png" -compose over -composite "$TMP/base.png"

magick "$TMP/base.png" \
  \( "$LOGO" -resize x96 \) -gravity northwest -geometry +80+200 -compose over -composite \
  -font "$FONT" -pointsize 40 -fill "$PAPER" -gravity northwest -annotate +84+340 "$LINE" \
  -strip -quality 85 "$OUT"

magick identify "$OUT"

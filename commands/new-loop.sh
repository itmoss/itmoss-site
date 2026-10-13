#!/bin/bash
# new-loop.sh - 작업(=루프) 하나를 이 루트 저장소(허브) 기준으로 만든다.
# 사용법: ./commands/new-loop.sh <작업명> [목표문서.md]
#
# 작업은 서비스가 아니라 "목표" 단위다. 한 작업이 여러 서비스(projects/*)에 걸칠 수 있고,
# /work-plan 이 전체 설계(design.md)를 먼저 만든 뒤 서비스별 항목으로 나눈다.
# 생성 위치: loops/<작업명>/  (허브 저장소에 기록, 서비스 저장소는 건드리지 않음)
set -euo pipefail

HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${1:-}"
BRIEF="${2:-}"

if [ -z "$NAME" ] || [ "$NAME" = "unnamed" ]; then
  echo "사용법: make loop NAME=<작업명> [BRIEF=/절대경로/brief.md]"
  echo "  예) make loop NAME=signup-email-verify"
  echo "진행 중인 작업:"; ls -1 "$HUB_ROOT/loops" 2>/dev/null | sed 's/^/  - /' || true
  exit 1
fi
if ! [[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "⚠ 작업명은 영문/숫자/.-_ 만 가능합니다: $NAME"; exit 1
fi

DIR="$HUB_ROOT/loops/$NAME"
mkdir -p "$DIR"

if [ -n "$BRIEF" ]; then
  cp "$BRIEF" "$DIR/brief.md"; echo "📄 brief.md 복사: $BRIEF"
elif [ ! -f "$DIR/brief.md" ]; then
  # 양식은 commands/brief-template.md 한 곳 (workloop 킷이 설치·갱신한다)
  TPL="$HUB_ROOT/commands/brief-template.md"
  if [ -f "$TPL" ]; then
    cp "$TPL" "$DIR/brief.md"
  else
    printf '# 목표\n(무엇을 만들거나 바꾸나)\n\n# 끝났다는 기준 (서비스 전체 기준, 숫자나 명령어로)\n-\n\n# 하지 말 것 · 사람이 할 일\n-\n' > "$DIR/brief.md"
  fi
  echo "📄 brief.md 양식 생성 → 채워 넣으세요"
fi

[ -f "$DIR/features.json" ] || printf '{\n  "work": "%s",\n  "rules": 3,\n  "services": [],\n  "features": []\n}\n' "$NAME" > "$DIR/features.json"
[ -f "$DIR/progress.md" ]   || printf '# %s 진행 기록\n' "$NAME" > "$DIR/progress.md"

echo "✅ 준비 완료: loops/$NAME/"
echo "다음: brief.md 작성 → claude 실행 → /work-plan $NAME"

#!/usr/bin/env bash
# dev 서버 스모크: astro dev 를 별도 포트로 띄워 주요 경로가 200 인지, 로그에 에러가 없는지 확인.
# 재시작 시 문제를 잡기 위해 같은 과정을 2회 반복한다.
#   bash scripts/dev-smoke.sh
set -u

cd "$(dirname "$0")/.."

PORT="${PORT:-4331}"
ROUNDS="${ROUNDS:-2}"
PATHS=(/ /privacy/ /preview/canvas/)
ERR_RE='error|Error|✘|\[ERROR\]|failed'

LOG="$(mktemp -t dev-smoke.XXXXXX)"
PID=""

stop_server() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
  fi
  PID=""
}
cleanup() {
  stop_server
  rm -f "$LOG"
}
trap cleanup EXIT INT TERM

if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "✘ 포트 $PORT 가 이미 사용 중" >&2
  exit 1
fi

fail=0
for round in $(seq 1 "$ROUNDS"); do
  echo "── 회차 $round/$ROUNDS (port $PORT)"
  : > "$LOG"
  npx astro dev --port "$PORT" --host 127.0.0.1 > "$LOG" 2>&1 &
  PID=$!

  ready=0
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
      ready=1
      break
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  if [ "$ready" -ne 1 ]; then
    echo "✘ 서버가 준비되지 않음"
    cat "$LOG"
    exit 1
  fi

  for p in "${PATHS[@]}"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$p")"
    if [ "$code" = "200" ]; then
      echo "  ok  $code $p"
    else
      echo "  ✘   $code $p"
      fail=1
    fi
  done

  # 렌더 중 로그가 다 찍히도록 잠깐 기다린 뒤 검사
  sleep 1
  if ! grep -q 'ready in' "$LOG"; then
    echo "✘ 회차 $round 서버 로그가 비었거나 시작 줄이 없음"
    fail=1
  fi
  if grep -nE "$ERR_RE" "$LOG"; then
    echo "✘ 회차 $round 로그에 에러"
    fail=1
  fi

  stop_server
done

if [ "$fail" -ne 0 ]; then
  echo "dev-smoke: 실패"
  exit 1
fi
echo "dev-smoke: 통과 ($ROUNDS 회)"

#!/usr/bin/env bash
# Lighthouse 모바일 검사: build → astro preview(:4329) → lighthouse 3회 → 중앙값이 기준에 못 미치면 실패.
# 수치는 기기에 따라 흔들리므로 회차별 중앙값을 쓴다. 서버는 끝나면(실패해도) 정리한다.
#   bash scripts/lighthouse.sh
#   SKIP_BUILD=1 RUNS=1 LH_PATHS="/ /privacy/" bash scripts/lighthouse.sh
set -u

cd "$(dirname "$0")/.."

PERF_MIN=85
A11Y_MIN=95
CLS_MAX=0.1

PORT="${PORT:-4329}"
RUNS="${RUNS:-3}"
read -r -a PATHS <<< "${LH_PATHS:-/}"
BASE="http://127.0.0.1:$PORT"

TMP="$(mktemp -d -t lighthouse.XXXXXX)"
LOG="$TMP/preview.log"
PID=""

cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

if curl -s -o /dev/null "$BASE/"; then
  echo "✘ 포트 $PORT 가 이미 사용 중" >&2
  exit 1
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "── build"
  if ! npm run build > "$TMP/build.log" 2>&1; then
    tail -40 "$TMP/build.log"
    echo "✘ build 실패"
    exit 1
  fi
fi

# 시스템 Chrome 이 없으면 Playwright 의 Chromium 을 쓴다
if [ -z "${CHROME_PATH:-}" ]; then
  pw_chrome="$(node -e "console.log(require('@playwright/test').chromium.executablePath())" 2>/dev/null || true)"
  if [ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] && [ -n "$pw_chrome" ] && [ -x "$pw_chrome" ]; then
    export CHROME_PATH="$pw_chrome"
  fi
fi

echo "── preview :$PORT"
npx astro preview --port "$PORT" --host 127.0.0.1 > "$LOG" 2>&1 &
PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "$BASE/"; then
    ready=1
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo "✘ preview 서버가 준비되지 않음"
  cat "$LOG"
  exit 1
fi

fail=0
for p in "${PATHS[@]}"; do
  slug="$(echo "$p" | tr -c 'a-zA-Z0-9' '_')"
  reports=()
  for run in $(seq 1 "$RUNS"); do
    out="$TMP/lh${slug}${run}.json"
    if ! npx -y lighthouse@12 "$BASE$p" \
        --form-factor=mobile \
        --only-categories=performance,accessibility \
        --output=json --output-path="$out" \
        --chrome-flags="--headless=new --no-sandbox" \
        --quiet > "$TMP/lh.log" 2>&1; then
      tail -20 "$TMP/lh.log"
      echo "✘ lighthouse 실행 실패: $p (회차 $run)"
      exit 1
    fi
    reports+=("$out")
  done

  if ! node - "$p" "$PERF_MIN" "$A11Y_MIN" "$CLS_MAX" "${reports[@]}" <<'NODE'
const fs = require('fs');
const [path, perfMin, a11yMin, clsMax, ...files] = process.argv.slice(2);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const runs = files.map((f) => {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (r.runtimeError) throw new Error(`${path}: ${r.runtimeError.code} ${r.runtimeError.message}`);
  const score = (c) => {
    const v = r.categories[c]?.score;
    if (typeof v !== 'number') throw new Error(`${path}: ${c} 점수 없음`);
    return Math.round(v * 100);
  };
  const cls = r.audits['cumulative-layout-shift']?.numericValue;
  if (typeof cls !== 'number') throw new Error(`${path}: CLS 값 없음`);
  return { perf: score('performance'), a11y: score('accessibility'), cls };
});
runs.forEach((x, i) => console.log(`  ${path} #${i + 1}  perf ${x.perf}  a11y ${x.a11y}  cls ${x.cls.toFixed(3)}`));
const perf = median(runs.map((x) => x.perf));
const a11y = median(runs.map((x) => x.a11y));
const cls = median(runs.map((x) => x.cls));
const bad = [];
if (perf < Number(perfMin)) bad.push(`perf ${perf} < ${perfMin}`);
if (a11y < Number(a11yMin)) bad.push(`a11y ${a11y} < ${a11yMin}`);
if (cls > Number(clsMax)) bad.push(`cls ${cls.toFixed(3)} > ${clsMax}`);
console.log(`  ${bad.length ? '✘ ' : 'ok'}  ${path} 중앙값  perf ${perf}  a11y ${a11y}  cls ${cls.toFixed(3)}${bad.length ? '  — ' + bad.join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
NODE
  then
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "lighthouse: 실패 (기준 perf≥$PERF_MIN a11y≥$A11Y_MIN cls≤$CLS_MAX)"
  exit 1
fi
echo "lighthouse: 통과 (기준 perf≥$PERF_MIN a11y≥$A11Y_MIN cls≤$CLS_MAX, ${RUNS}회 중앙값)"

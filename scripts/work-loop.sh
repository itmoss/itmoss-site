#!/usr/bin/env bash
# work-loop.sh — /work-next 와 /work-review 를 자동으로 번갈아 돌린다 (무인 반복).
#
#   bash scripts/work-loop.sh <작업> [서비스] [--max N] [--review-every N] [--budget USD] [--session-budget USD]
#                                          [--hours H] [--session-minutes M] [--model 이름] [--no-push] [--dry-run]
#   bash scripts/work-loop.sh <작업> [서비스] --status     돌고 있는지 · 최근 로그
#   bash scripts/work-loop.sh <작업> [서비스] --watch      진행 줄만 실시간으로 (루프가 끝나면 종료 — 감독 창의 Monitor 용)
#
# 토큰: 항목 하나마다 **새** `claude -p` 세션을 연다 (대화가 쌓이지 않는다). 계속할지·멈출지는
#       scripts/loop.py 가 계산한 상태로 셸이 판단한다 — 이 판단에는 토큰이 들지 않는다.
#
# 무한 루프 없음 — 아래 상한은 어떤 경우에도 넘지 않는다 (인자는 숫자·범위를 검사한다):
#   - 구현 세션 --max (기본 8, 최대 50) · 전체 claude 세션 수 = 2×max+1
#   - 비용 한도는 기본 없음 (세션·시간·항목 상한으로 반드시 멈춘다). 걸고 싶으면 --budget USD · --session-budget USD
#   - 총 시간 --hours (기본 3) · 세션당 --session-minutes (기본 40, 넘으면 그 세션을 끝낸다)
#   - 진행 없는 세션 2회 연속 · 집을 항목 없음(사람 작업 · 보류 · 대기 · 전부 완료 · 다른 창 진행 중)
#   - FAIL 3회 → 보류, WEAK 2회 → 사람 합의 는 loop.py 가 끊는다
#
# 커밋: 세션이 done 을 찍었는데 코드가 커밋되지 않았으면(헤드리스라 git 이 막힌 경우 등) 이 스크립트가
#       그 항목의 저장소에 `feat(<작업>/<id>): …` 로 커밋한다. done 없이 끝난 세션의 변경은 stash 로 치워
#       다음 항목에 섞이지 않게 한다. 시작할 때 저장소에 커밋 안 된 변경이 있으면 시작하지 않는다.
# 끝나면 (어떻게 끝나든 — 정상 · 한도 · 오류 · Ctrl-C) 한 번:
#   - 루트 저장소에 loops/<작업>/ 상태를 커밋하고, 이번 반복에서 새 커밋이 생긴 저장소를 upstream 으로 push 한다
#     (force 없음. upstream 이 없으면 origin 에 같은 이름으로). --no-push 면 커밋만.
# 권한: 헤드리스 세션은 묻지 못한다. 파일 수정(acceptEdits)과 아래 ALLOWED 도구만 허용해서 돌린다.
#       WORKLOOP_ALLOWED 로 허용 목록을, WORKLOOP_CLAUDE_ARGS 로 claude 인자를 통째로 바꿀 수 있다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOOP() { python3 "$ROOT/scripts/loop.py" --root "$ROOT" "$@"; }

WORK="" SVC="" MAX=8 EVERY=3 BUDGET=0 SBUDGET=0 HOURS=3 SMIN=40 MODEL="" PMODE="acceptEdits" DRY="" PUSH=1 STATUS="" WATCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --max) MAX="${2:-}"; shift ;;
    --review-every) EVERY="${2:-}"; shift ;;
    --budget) BUDGET="${2:-}"; shift ;;
    --session-budget) SBUDGET="${2:-}"; shift ;;
    --hours) HOURS="${2:-}"; shift ;;
    --session-minutes) SMIN="${2:-}"; shift ;;
    --model) MODEL="${2:-}"; shift ;;
    --permission-mode) PMODE="${2:-}"; shift ;;
    --no-push) PUSH="" ;;
    --dry-run) DRY=1 ;;
    --status) STATUS=1 ;;
    --watch) WATCH=1 ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    -*) echo "모르는 옵션: $1"; exit 2 ;;
    *) if [ -z "$WORK" ]; then WORK="$1"; elif [ -z "$SVC" ]; then SVC="$1"; else echo "인자가 너무 많습니다: $1"; exit 2; fi ;;
  esac
  shift
done
[ -n "$WORK" ] || { sed -n '2,7p' "$0"; exit 2; }
[ -d "$ROOT/loops/$WORK" ] || { echo "작업 없음: loops/$WORK/"; exit 2; }

# 인자 검사 — 숫자가 아니면 비교가 늘 거짓이 되어 멈추지 않을 수 있으므로 반드시 막는다
int_in() {
  case "$2" in ''|*[!0-9]*) echo "$1 는 정수여야 합니다: '$2'"; exit 2 ;; esac
  if [ "$2" -lt "$3" ] || [ "$2" -gt "$4" ]; then echo "$1 는 $3~$4 사이여야 합니다: $2"; exit 2; fi
}
num_pos() {
  python3 -c "import sys; v=float(sys.argv[1]); sys.exit(0 if 0 < v <= float(sys.argv[2]) else 1)" "$2" "$3" 2>/dev/null \
    || { echo "$1 는 0 보다 크고 $3 이하인 숫자여야 합니다: '$2'"; exit 2; }
}
num_opt() {  # 0 = 한도 없음
  [ "$2" = "0" ] && return 0
  num_pos "$@"
}
int_in --max "$MAX" 1 50
int_in --review-every "$EVERY" 1 50
int_in --session-minutes "$SMIN" 1 180
num_opt --budget "$BUDGET" 100
num_opt --session-budget "$SBUDGET" 20
num_pos --hours "$HOURS" 24
MAX_SESSIONS=$((MAX * 2 + 1))
DEADLINE=$(( $(date +%s) + $(python3 -c "import sys; print(int(float(sys.argv[1]) * 3600))" "$HOURS") ))

SCOPE="$WORK${SVC:+/$SVC}"
LOGDIR="$ROOT/.cache/workloop/autoloop"; mkdir -p "$LOGDIR"
RUN="$(date +%Y%m%d-%H%M%S)-$WORK${SVC:+-$SVC}"
LOG="$LOGDIR/$WORK${SVC:+-$SVC}.log"   # 범위마다 고정 경로 — --status 가 이걸 본다
LOCK="$ROOT/loops/$WORK/.autoloop${SVC:+-$SVC}"

lock_pid() { cat "$LOCK/pid" 2>/dev/null; }
running() { local p; p="$(lock_pid)"; [ -n "$p" ] && kill -0 "$p" 2>/dev/null; }

if [ -n "$WATCH" ]; then
  # 진행 줄(항목 · 세션 시작/끝 · 커밋 · 경고 · 종료 요약)만 흘려 보낸다. 루프가 끝나면 남은 줄을 비우고 종료
  for _ in $(seq 1 30); do running && break; sleep 1; done
  running || { echo "■ 돌고 있지 않음: $SCOPE"; [ -f "$LOG" ] && sed -n '/^■ 종료/,$p' "$LOG" | tail -12; exit 0; }
  PAT='^(── |  ▶ |    ← exit|    ✓ |    ⚠|    ⏱|    · 이번 세션|🔁|■|===|  ✓|  ✗|  ⚠|  완료 |  남은 것|  시작할 항목)'
  tail -n0 -F "$LOG" 2>/dev/null > >(grep --line-buffered -E "$PAT") &
  TPID=$!
  while running; do sleep 3; done
  sleep 2; kill "$TPID" 2>/dev/null; wait "$TPID" 2>/dev/null
  exit 0
fi
if [ -n "$STATUS" ]; then
  if running; then echo "▶ 돌고 있음: $SCOPE (pid $(lock_pid), 시작 $(cat "$LOCK/started" 2>/dev/null))"
  elif [ -d "$LOCK" ]; then echo "■ 멈춘 흔적만 있음 (pid $(lock_pid) 없음) — 다음 실행 때 자동으로 치웁니다"
  else echo "■ 돌고 있지 않음: $SCOPE"; fi
  if [ -f "$LOG" ]; then echo "── 최근 로그 (${LOG#$ROOT/})"; tail -15 "$LOG"; fi
  exit 0
fi
command -v claude >/dev/null || { echo "claude CLI 가 없습니다"; exit 2; }

# 같은 범위는 하나만 (mkdir 는 원자적). 주인 프로세스가 죽은 잠금은 치우고 다시 잡는다
if ! mkdir "$LOCK" 2>/dev/null; then
  if running; then
    echo "이미 자동 반복이 돌고 있습니다: $SCOPE (pid $(lock_pid)). 상태: bash scripts/work-loop.sh $WORK${SVC:+ $SVC} --status"
    exit 3
  fi
  echo "⚠ 멈춘 자동 반복의 잠금(pid $(lock_pid))을 치웁니다"
  rm -rf "$LOCK"; mkdir "$LOCK" || { echo "잠금 실패: $LOCK"; exit 3; }
fi
echo $$ > "$LOCK/pid"; date '+%Y-%m-%d %H:%M:%S' > "$LOCK/started"

# 이후 출력은 화면과 고정 로그에 같이 남긴다
exec > >(tee -a "$LOG") 2>&1
echo; echo "=== $(date '+%Y-%m-%d %H:%M:%S') 시작 · $SCOPE"

# 이번 반복이 건드릴 수 있는 저장소: 루트 + projects/* (서비스 지정이면 그 저장소만)
repos() {
  echo "$ROOT"
  if [ -n "$SVC" ]; then
    [ -d "$ROOT/projects/$SVC/.git" ] && echo "$ROOT/projects/$SVC"
  else
    for d in "$ROOT"/projects/*/; do [ -d "$d.git" ] && echo "${d%/}"; done
  fi
  return 0
}
is_git() { git -C "$1" rev-parse --git-dir >/dev/null 2>&1; }
rname() { if [ "$1" = "$ROOT" ]; then echo "루트"; else echo "${1#$ROOT/}"; fi; }
# loops/ 밖에 커밋 안 된 변경이 있는가
dirty() { [ -n "$(git -C "$1" status --porcelain -- . ':(exclude)loops' 2>/dev/null)" ]; }

HEADS="$(repos | while read -r r; do echo "$r=$(git -C "$r" rev-parse HEAD 2>/dev/null)"; done)"
STOP_REASON="중단됨"
STASHED=""
NOSTART=""

finish() {
  local rc=$?
  trap - EXIT INT TERM
  if [ -z "$DRY" ] && [ -z "$NOSTART" ]; then
    echo
    echo "■ 마무리 — 커밋${PUSH:+ · push}"
    # 1) 루트: loops/<작업>/ 상태만 (lock·임시파일은 .gitignore)
    if is_git "$ROOT" && [ -n "$(git -C "$ROOT" status --porcelain -- "loops/$WORK")" ]; then
      git -C "$ROOT" add -- "loops/$WORK" && \
      git -C "$ROOT" commit -q -m "chore(loop/$WORK): 작업 루프 상태 — $STOP_REASON" -- "loops/$WORK" && \
        echo "  ✓ 커밋  루트 loops/$WORK/"
    fi
    # 2) 새 커밋이 생긴 저장소만 push
    local r before now br name
    while read -r r; do
      [ -n "$r" ] || continue
      before="$(printf '%s\n' "$HEADS" | sed -n "s#^$r=##p")"
      now="$(git -C "$r" rev-parse HEAD 2>/dev/null)"
      [ -n "$now" ] && [ "$now" != "$before" ] || continue
      name="${r#$ROOT}"; name="${name#/}"; name="${name:-루트}"
      if [ -z "$PUSH" ]; then echo "  · push 생략 ($name) — --no-push"; continue; fi
      br="$(git -C "$r" rev-parse --abbrev-ref HEAD)"
      if [ "$br" = "HEAD" ]; then echo "  ⚠ $name: detached HEAD — push 생략"; continue; fi
      if git -C "$r" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
        git -C "$r" push -q && echo "  ✓ push  $name ($br)" || echo "  ✗ push 실패 $name ($br) — 직접 확인하세요 (force 하지 않음)"
      elif git -C "$r" remote get-url origin >/dev/null 2>&1; then
        git -C "$r" push -q -u origin "$br" && echo "  ✓ push  $name ($br, upstream 설정)" || echo "  ✗ push 실패 $name ($br)"
      else
        echo "  · push 생략 ($name) — remote 없음"
      fi
    done <<<"$(repos)"
    [ -n "$STASHED" ] && echo "  ⚠ 끝나지 않은 세션의 변경을 stash 로 보관:$STASHED (git stash list 로 확인)"
  fi
  rm -rf "$LOCK"
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') 끝 · $STOP_REASON"
  exit $rc
}
trap finish EXIT
trap 'STOP_REASON="Ctrl-C/종료 신호"; exit 130' INT TERM

# 시작 전 검사 — 내 작업 중인 변경이 자동 커밋에 섞이지 않게
if [ -z "$DRY" ]; then
  d=""
  while read -r r; do
    if [ -n "$r" ] && is_git "$r" && dirty "$r"; then d="$d $(rname "$r")"; fi
  done <<<"$(repos)"
  if [ -n "$d" ]; then
    NOSTART=1
    echo "커밋 안 된 변경이 있어 시작하지 않습니다:$d"
    echo "  (loops/ 밖의 변경) 커밋하거나 stash 한 뒤 다시 실행하세요 — 자동 커밋에 섞이지 않게 하려는 것입니다."
    exit 4
  fi
fi

# state → "ready done active stage 이유…" (이 범위 기준, loop.py 가 계산)
state() { LOOP scope "$WORK" ${SVC:+"$SVC"}; }

# 헤드리스 세션에 허용할 도구 — 읽기 · 편집 · 상태 스크립트 · git 커밋. 명령을 ; && | 로 묶으면 막힌다
ALLOWED="${WORKLOOP_ALLOWED:-Read Edit Write Glob Grep TodoWrite Bash(python3 scripts/loop.py:*) Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git add:*) Bash(git commit:*) Bash(git -C:*) Bash(ls:*) Bash(cat:*) Bash(head:*) Bash(tail:*) Bash(wc:*) Bash(sed -n:*) Bash(grep:*) Bash(find:*)}"
HEADLESS_NOTE="이 세션은 사람 없이 돈다 (work-loop.sh). 권한을 물을 수 없으니 Bash 명령은 하나씩 실행하고 ; && | 로 묶지 않는다. check 는 python3 scripts/loop.py check 로 돌린다. 커밋이 막히면 그대로 done 하면 work-loop.sh 가 커밋한다. 항목 하나를 끝내면 멈춘다."

COST=0 SESSIONS=0
# run_claude <라벨> <프롬프트> — 결과 JSON 은 로그 파일로, 화면에는 요약 몇 줄만. 세션 시간 상한을 넘으면 끝낸다
run_claude() {
  local label="$1" prompt="$2" out="$LOGDIR/$RUN-$1.json"
  SESSIONS=$((SESSIONS + 1))
  local args=(-p "$prompt" --output-format json --permission-mode "$PMODE"
              --append-system-prompt "$HEADLESS_NOTE")
  [ "$SBUDGET" != "0" ] && args+=(--max-budget-usd "$SBUDGET")
  local a
  for a in $ALLOWED; do args+=(--allowedTools "$a"); done
  [ -n "$MODEL" ] && args+=(--model "$MODEL")
  if [ -n "${WORKLOOP_CLAUDE_ARGS:-}" ]; then
    # shellcheck disable=SC2206
    args=(-p "$prompt" --output-format json $WORKLOOP_CLAUDE_ARGS)
  fi
  echo "  ▶ $label: claude $prompt"
  if [ -n "$DRY" ]; then echo "    (dry-run)"; return 0; fi
  # 세션을 자기 프로세스 그룹으로 띄운다 — 시간 상한에 걸리면 claude 가 띄운 자식(도구·MCP)까지 그룹째 끝낸다
  (cd "$ROOT" && exec python3 -c 'import os, sys; os.setsid(); os.execvp(sys.argv[1], sys.argv[1:])' \
      claude "${args[@]}" > "$out" 2>"$out.err") &
  local pid=$! t=0 limit=$((SMIN * 60))
  while kill -0 "$pid" 2>/dev/null; do
    sleep 2; t=$((t + 2))
    if [ "$t" -ge "$limit" ]; then
      echo "    ⏱ 세션 시간 상한 ${SMIN}분 — 끝냅니다"
      kill -TERM -- "-$pid" 2>/dev/null; sleep 3; kill -KILL -- "-$pid" 2>/dev/null; kill -KILL "$pid" 2>/dev/null
      break
    fi
  done
  wait "$pid" 2>/dev/null
  local rc=$?
  local c cost den tail
  c="$(python3 - "$out" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("0\t0\t(결과 해석 실패 — 로그 확인)"); sys.exit()
res = (d.get("result") or "").strip().splitlines()
tail = " / ".join(l.strip() for l in res[-3:] if l.strip() and not l.strip().startswith(chr(96) * 3))[:300]
print(f"{round(d.get('total_cost_usd') or 0, 4)}\t{len(d.get('permission_denials') or [])}\t{tail}")
PY
)"
  IFS=$'\t' read -r cost den tail <<<"$c"
  COST="$(python3 -c "import sys; print(round(float(sys.argv[1]) + float(sys.argv[2]), 4))" "$COST" "${cost:-0}")"
  local dn=""
  [ "${den:-0}" != "0" ] && dn=" · 권한 거부 ${den}건"
  echo "    ← exit $rc · \$${cost:-0} (누적 \$$COST)$dn · $tail"
  echo "    로그: ${out#$ROOT/}"
  return 0
}

over_budget() { [ "$BUDGET" = "0" ] && return 1; python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= float(sys.argv[2]) else 1)" "$COST" "$BUDGET"; }
limits_hit() {  # 멈춰야 하면 이유를 출력하고 0
  if over_budget; then echo "예산 \$$BUDGET 도달"; return 0; fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then echo "시간 상한 ${HOURS}시간 도달"; return 0; fi
  if [ "$SESSIONS" -ge "$MAX_SESSIONS" ]; then echo "세션 수 상한 $MAX_SESSIONS 도달"; return 0; fi
  return 1
}

# 세션이 죽어 선점이 남으면 그 레인이 2시간 막힌다 — 이번 세션이 새로 만든 선점만 푼다
release_orphans() {
  local before="$1" after="$2" c id
  [ "$after" = "-" ] && return 0
  for c in ${after//,/ }; do
    case ",$before," in *",$c,"*) continue ;; esac
    id="${c%%:*}"
    echo "    ⚠ 끝나지 않은 선점 $c — 풀어 둡니다"
    LOOP release "$WORK" "$id" --force >/dev/null 2>&1
  done
  return 0
}

# 새로 done 이 된 항목의 변경을 그 저장소에 커밋한다 (세션이 이미 커밋했으면 할 게 없다)
commit_new_done() {
  local before="$1" after="$2" id repo note msg dir
  while IFS=$'\t' read -r id repo note; do
    [ -n "$id" ] || continue
    if printf '%s\n' "$before" | cut -f1 | grep -qx "$id"; then continue; fi
    dir="$ROOT"; [ "$repo" != "." ] && dir="$ROOT/$repo"
    if ! is_git "$dir" || ! dirty "$dir"; then continue; fi
    note="${note#완료 [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]: }"
    msg="feat($WORK/$id): ${note:-자동 반복 완료}"
    git -C "$dir" add -A -- . ':(exclude)loops' && git -C "$dir" commit -q -m "$msg" && \
      echo "    ✓ 커밋 (세션이 남긴 변경) $(rname "$dir"): $msg"
  done <<<"$after"
  return 0
}

# done 없이 끝난 세션의 변경은 치워 둔다 (다음 항목 커밋에 섞이지 않게)
stash_leftovers() {
  local r
  while read -r r; do
    if [ -z "$r" ] || ! is_git "$r" || ! dirty "$r"; then continue; fi
    if git -C "$r" stash push -q -u -m "workloop $WORK: 끝나지 않은 세션의 변경 ($(date '+%m-%d %H:%M'))" -- . ':(exclude)loops'; then
      echo "    ⚠ 끝나지 않은 변경을 stash 로 보관: $(rname "$r")"
      STASHED="$STASHED $(rname "$r")"
    fi
  done <<<"$(repos)"
  return 0
}

echo "🔁 자동 반복 $SCOPE — 최대 ${MAX}항목 · review ${EVERY}항목마다 · 예산 $( [ "$BUDGET" = "0" ] && echo 없음 || echo "\$$BUDGET" ) (세션당 $( [ "$SBUDGET" = "0" ] && echo 없음 || echo "\$$SBUDGET" )) · ${HOURS}시간 · 세션당 ${SMIN}분"
read -r READY DONE ACTIVE STAGE WHY <<<"$(state)"
START_DONE=$DONE
if [ "$READY" = "0" ]; then STOP_REASON="시작할 항목 없음 — $WHY"; echo "  $STOP_REASON"; exit 0; fi

items=0 stall=0 since_review=0 stop=""
while [ "$items" -lt "$MAX" ]; do   # 상한은 조건식 자체에 — 아래 어떤 분기도 이걸 넘지 못한다
  if stop="$(limits_hit)"; then break; fi
  stop=""
  read -r READY DONE ACTIVE STAGE WHY <<<"$(state)"
  if [ "$READY" = "0" ]; then stop="더 집을 항목 없음 — $WHY"; break; fi

  items=$((items + 1))
  echo "── $items/$MAX · 완료 $DONE · $(date +%H:%M:%S)"
  DL_BEFORE="$(LOOP donelist "$WORK" ${SVC:+"$SVC"})"
  run_claude "next$items" "/work-next $WORK${SVC:+ $SVC}"
  if [ -n "$DRY" ]; then stop="dry-run"; break; fi
  read -r _ DONE2 ACTIVE2 _ _ <<<"$(state)"
  release_orphans "$ACTIVE" "$ACTIVE2"
  commit_new_done "$DL_BEFORE" "$(LOOP donelist "$WORK" ${SVC:+"$SVC"})"
  stash_leftovers

  if [ "$DONE2" -gt "$DONE" ]; then
    stall=0; since_review=$((since_review + DONE2 - DONE))
  else
    stall=$((stall + 1))
    echo "    · 이번 세션은 완료가 늘지 않았습니다 ($stall/2)"
    if [ "$stall" -ge 2 ]; then stop="진행 없는 세션 2회 연속 — 로그와 status 를 확인하세요"; break; fi
  fi

  if [ "$since_review" -ge "$EVERY" ]; then
    if stop="$(limits_hit)"; then break; fi
    stop=""
    run_claude "review$items" "/work-review $WORK${SVC:+ $SVC}"
    since_review=0
  fi
done
[ -z "$stop" ] && stop="최대 항목 수($MAX) 도달"

# 끝내기 전에 검사 안 된 완료가 있으면 한 번 더 (상한 안에서)
if [ "$since_review" -gt 0 ] && [ -z "$DRY" ] && ! limits_hit >/dev/null; then
  run_claude "review-final" "/work-review $WORK${SVC:+ $SVC}"
  read -r READY _ _ _ _ <<<"$(state)"
  [ "$READY" != "0" ] && stop="$stop · review 가 되돌린 항목 있음 (다시 돌리면 이어서 합니다)"
fi

STOP_REASON="$stop"
read -r READY DONE ACTIVE STAGE WHY <<<"$(state)"
echo
echo "■ 종료: $stop"
echo "  완료 $START_DONE → $DONE · 세션 ${SESSIONS}개 · 비용 합계 \$$COST · 단계 $STAGE"
echo "  남은 것: $WHY"
LOOP status "$WORK" ${SVC:+"$SVC"} | sed 's/^/  /'

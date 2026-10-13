#!/usr/bin/env python3
"""작업 루프 (plan → next → review) — 상태 규칙과 features.json 쓰기의 유일한 구현.

대시보드 · /work-next · /work-review 가 모두 이 스크립트를 쓴다. ready 규칙을 여기 말고 다른 곳에 다시 구현하지 않는다.
features.json 은 AI 가 직접 고치지 않고 아래 명령으로만 바꾼다 (loops/<작업>/.lock 으로 직렬화).

사용법 (프로젝트 루트에서):
  loop.py status [작업] [서비스]                 현황 (사람용)
  loop.py lanes [작업] --json                    레인 계산 결과 (대시보드용, 작업 생략 = 전체)
  loop.py claim <작업> [서비스] [--by 이름]       다음 항목 선점. 없으면 exit 3 + 무엇을 기다리는지
  loop.py release <작업> <id> --by 이름           선점 풀기 (손대지 않고 그만둘 때)
  loop.py check <작업> <id>                      check · must_not 만 실행 (상태 안 바꿈)
  loop.py done <작업> <id> --by 이름 --note "…"   check 를 직접 돌려 통과해야 done:true
  loop.py fail <작업> <id> --by 이름 --note "…"   못 끝냄 → 보류(hold). 사람이 unhold 해야 다시 ready
  loop.py review <작업> <id> PASS|FAIL|WEAK --note "…" [--fix "보강안"]
  loop.py unhold <작업> <id>                     보류 해제 (사람)
  loop.py add <작업> --file items.json           항목 추가 (/work-plan). 검증 후 덧붙인다
  loop.py edit <작업> <id> --why "…" [--desc …] [--check …] [--must-not …] [--depends F01,F02] [--owner ai|human] [--service …]
                                                 미완료·미선점 항목만 고친다 (/work-plan 재정비).
                                                 예외: WEAK 로 되돌아온 항목을 집은 창은 --by 로 자기 check 만 조일 수 있다
  loop.py migrate [작업|--all]                   이전 규칙의 features.json 을 지금 규칙으로 옮긴다 (킷 업데이트 때)
  loop.py replanned <작업>                        재정비 끝 표시 (/work-plan 이 부른다)
  loop.py scope <작업> [서비스]                    한 줄 상태 "ready done active stage 이유" (work-loop.sh 용)
  loop.py unreviewed <작업> [서비스]               아직 review 안 된 done 항목 id (/work-review 기본 대상)
  loop.py donelist <작업> [서비스]                 done 항목 "id<TAB>저장소<TAB>notes" (work-loop.sh 가 항목별 커밋에 쓴다)
  loop.py delete <작업> [--force]                  작업 삭제 = .cache/workloop/trash/ 로 옮김 (되살리기: 그 폴더를 loops/ 로 되돌림)

ready = done:false · owner:"ai" · hold 없음 · 선점 없음 · depends_on 전부 done.
  레인 안에서는 되돌아온 항목(returns)이 먼저, 그다음 features.json 순서.
  한 레인(= 한 작업 트리)에는 선점이 하나만 있을 수 있다.

must_not = 경계 조건. check 가 "됐는가"라면 must_not 은 "하지 말았어야 할 것을 했는가"다.
  실행 가능한 명령 하나이고, **0 이 아닌 종료코드가 통과**다 (0 = 경계를 넘었다 = done 거부).
  check 만 있으면 그 지표에 맞춰 최적화하는 길(테스트 삭제·하드코딩·mock 남기기)이 열린다 — must_not 이 그 길을 막는다.
  예) `git log -1 --diff-filter=D --name-only | grep -q _test` · `grep -rn "MOCK-REMOVE" projects/x/src`

항목 필드 (plan 이 쓰는 것 외에 이 스크립트가 관리하는 것):
  claim      {"by", "at"}         진행 중. CLAIM_TTL 이 지나면 버려진 것으로 보고 다시 집을 수 있다
  returns    {"fail": n, "weak": n}  review 가 되돌린 횟수
  hold       "사유"               사람 결정 필요. ready 에서 빠진다
  check_fix  "보강안"              WEAK 로 되돌아옴. done 전에 check 를 이 방향으로 고쳐야 한다
  check_was  "되돌릴 때의 check"    check_fix 가 있는데 check 가 이것과 같으면 done 을 거부한다
  reviewed   "YYYY-MM-DD"          review PASS 날짜. done 이 새로 찍히면 지워진다 → review 는 이것이 없는 항목만 본다
"""
import argparse, fcntl, json, os, random, shutil, string, subprocess, sys, time
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

NOTES_MAX = 200                 # notes 한 줄 한도. 넘으면 거부 (보강안은 check_fix 필드로 따로)
CLAIM_TTL = timedelta(hours=2)  # 항목 하나 = 30분. 2시간 넘은 선점은 버려진 것으로 본다
FAIL_HOLD = 3                   # review FAIL 이 이 횟수에 이르면 보류해 사람에게 넘긴다
CHECK_TIMEOUT = 600
LANE_CORE, LANE_E2E = "core", "e2e"

RULES = 3  # features.json 규칙 버전. 바꾸면 migrate 를 같이 고친다

EXIT_NONE = 3     # claim: 집을 항목 없음
EXIT_HUMAN = 4    # 사람 결정 필요 (WEAK 2회 등)

ROOT = Path(__file__).resolve().parent.parent


def today():
    return time.strftime("%Y-%m-%d")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def die(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)


# ── 파일 ─────────────────────────────────────────────────────────────

def loops_dir():
    return ROOT / "loops"


def work_dir(work):
    d = loops_dir() / work
    if not work or "/" in work or work.startswith(".") or not d.is_dir():
        die(f"작업 없음: loops/{work}/")
    return d


@contextmanager
def locked(work):
    """loops/<작업>/.lock — 대시보드(Go)도 같은 파일에 flock 을 건다."""
    f = open(work_dir(work) / ".lock", "a+")
    try:
        fcntl.flock(f, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()


def load(work):
    p = work_dir(work) / "features.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError as e:
        die(f"features.json 오류: {e}")


def save(work, data):
    p = work_dir(work) / "features.json"
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    os.replace(tmp, p)


def progress(work, line):
    with open(work_dir(work) / "progress.md", "a") as f:
        f.write(line.rstrip("\n") + "\n")


def find(data, fid):
    for f in data.get("features", []):
        if f.get("id") == fid:
            return f
    die(f"항목 없음: {fid}")


def service_of(data, f):
    return f.get("service") or data.get("service") or LANE_CORE


def repo_dir(service):
    return ROOT if service in (LANE_CORE, LANE_E2E) else ROOT / "projects" / service


# ── 규칙 (유일한 구현) ────────────────────────────────────────────────

def claim_fresh(f):
    c = f.get("claim")
    if not c:
        return False
    try:
        at = datetime.fromisoformat(c.get("at", ""))
    except ValueError:
        return False
    return datetime.now(at.tzinfo) - at < CLAIM_TTL


def returned(f):
    r = f.get("returns") or {}
    # 구형: notes 의 "review …" 기록만 있는 항목도 되돌아온 것으로 본다
    return bool(r.get("fail") or r.get("weak")) or (f.get("notes") or "").startswith("review ")


def problems(data):
    """없는 id · 순환 · 긴 notes — 영원히 막히는 원인을 드러낸다."""
    fs = data.get("features", [])
    ids = {f.get("id") for f in fs}
    out = []
    for f in fs:
        for d in f.get("depends_on", []) or []:
            if d not in ids:
                out.append(f"{f['id']}: depends_on 에 없는 id {d}")
        n = len(f.get("notes") or "")
        if n > NOTES_MAX:
            out.append(f"{f['id']}: notes {n}자 (한도 {NOTES_MAX}) — loop.py migrate 가 progress.md 로 옮깁니다")
    deps = {f.get("id"): [d for d in (f.get("depends_on") or []) if d in ids] for f in fs}
    state, seen_cycles = {}, set()

    def visit(n, path):
        state[n] = 1
        for d in deps.get(n, []):
            if state.get(d) == 1:
                cyc = path[path.index(d):] + [d]
                key = frozenset(cyc)
                if key not in seen_cycles:
                    seen_cycles.add(key)
                    out.append("순환 의존: " + " → ".join(cyc))
            elif not state.get(d):
                visit(d, path + [d])
        state[n] = 2

    for i in deps:
        if not state.get(i):
            visit(i, [i])
    return out


def lane_rank(s):
    return 0 if s == LANE_CORE else 2 if s == LANE_E2E else 1


def lanes(data):
    fs = data.get("features", [])
    by_id = {f.get("id"): f for f in fs}
    order = []
    for f in fs:
        s = service_of(data, f)
        if s not in order:
            order.append(s)
    order.sort(key=lane_rank)  # core 먼저, e2e 마지막, 나머지는 처음 나온 순서 (안정 정렬)
    out = []
    for s in order:
        items = [f for f in fs if service_of(data, f) == s]
        ln = {"service": s, "total": len(items), "done": 0, "human": 0, "held": 0,
              "ready": None, "active": None, "blocked": None, "waits": [], "waits_human": False}
        candidates = []
        for f in items:
            if f.get("done"):
                ln["done"] += 1
                continue
            if f.get("owner") == "human":
                ln["human"] += 1
                continue
            if f.get("hold"):
                ln["held"] += 1
                continue
            if claim_fresh(f):
                ln["active"] = ln["active"] or f
                continue
            waits = []
            for d in f.get("depends_on", []) or []:
                dep = by_id.get(d)
                if dep is None:
                    waits.append(d + "(없는 id)")
                elif not dep.get("done"):
                    waits.append(d)
            if waits:
                if ln["blocked"] is None:
                    ln["blocked"], ln["waits"] = f, waits
                    ln["waits_human"] = any(by_id.get(d, {}).get("owner") == "human" for d in waits)
            else:
                candidates.append(f)
        if candidates:
            ln["ready"] = next((f for f in candidates if returned(f)), candidates[0])
        out.append(ln)
    return out


def summary(work):
    data = load(work)
    if data is None:
        return {"work": work, "total": 0, "lanes": [], "problems": [], "stage": "plan"}
    fs = data.get("features", [])
    ls = lanes(data)
    s = {
        "work": work,
        "goal": data.get("goal", ""),
        "total": len(fs),
        "done": sum(1 for f in fs if f.get("done")),
        "human": sum(1 for f in fs if not f.get("done") and f.get("owner") == "human"),
        "held": sum(1 for f in fs if not f.get("done") and f.get("hold")),
        "returned": sum(1 for f in fs if not f.get("done") and f.get("owner") != "human" and returned(f)),
        "ready_lanes": sum(1 for l in ls if l["ready"] and not l["active"]),
        "active_lanes": sum(1 for l in ls if l["active"]),
        "lanes": ls,
        "problems": problems(data),
        "unreviewed": len(unreviewed_ids(data)),
        "rules": data.get("rules", 1),
        "replan": bool(data.get("replan")) or (bool(fs) and data.get("rules", 1) < 2),  # v3 이전은 기계적이라 재정비 불필요
    }
    # stage: 사람이 지금 무엇을 해야 하는지 기준
    if s["total"] == 0:
        s["stage"] = "plan"
    elif s["ready_lanes"] or s["active_lanes"]:
        s["stage"] = "work"
    elif s["done"] == s["total"]:
        s["stage"] = "done"
    elif s["held"]:
        s["stage"] = "hold"
    elif s["human"] or any(l["waits_human"] for l in ls):
        s["stage"] = "human"
    else:
        s["stage"] = "blocked"
    return s


# ── check 실행 ────────────────────────────────────────────────────────

def run_check(cmd):
    """항상 프로젝트 루트에서 bash -c (대시보드와 같은 위치·같은 방식)."""
    t = time.time()
    try:
        r = subprocess.run(["bash", "-c", cmd], cwd=ROOT, capture_output=True, text=True, timeout=CHECK_TIMEOUT)
        code, out = r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired as e:
        code, out = -1, f"{e.stdout or ''}{e.stderr or ''}\n⏱ 시간 초과 ({CHECK_TIMEOUT}s)"
    tail = "\n".join(out.rstrip().splitlines()[-30:])
    print(f"$ {cmd}\n{tail}\n→ exit {code} ({time.time() - t:.1f}s)")
    return code


def run_guard(cmd):
    """must_not = 경계 조건. 0 이 아닌 종료코드가 통과 (0 이면 하지 말았어야 할 것을 한 것)."""
    print("— 경계(must_not)")
    code = run_check(cmd)
    print("→ 경계 " + ("넘음 ✗ (이 명령이 통과해서는 안 됩니다)" if code == 0 else "지킴 ✓"))
    return code != 0


# ── 명령 ─────────────────────────────────────────────────────────────

def note_arg(note, what="--note"):
    note = " ".join((note or "").split())
    if not note:
        die(f"{what} 가 필요합니다 (한 줄)")
    if len(note) > NOTES_MAX:
        die(f"{what} 가 {len(note)}자입니다 — {NOTES_MAX}자 안쪽 한 줄로. 긴 설명은 progress.md·design.md 에")
    return note


def own(f, by, force):
    c = f.get("claim")
    if force:
        return
    if not c:
        die(f"{f['id']} 는 선점되지 않았습니다 — 먼저 claim")
    if c.get("by") != by:
        die(f"{f['id']} 는 {c.get('by')} 가 선점 중입니다 (--by 확인, 버려진 선점이면 --force)")


def displace(work, f, svc, why):
    """교체되어 밀려나는 notes 는 progress.md 로 옮긴다."""
    old = (f.get("notes") or "").strip()
    if old:
        progress(work, f"{today()} [{svc}] {f['id']} {why} 전 notes: {old}")


def cmd_claim(a):
    with locked(a.work):
        data = load(a.work) or {}
        ls = lanes(data)
        if a.service and not any(l["service"] == a.service for l in ls):
            die(f"레인 없음: {a.service} (있는 레인: {', '.join(l['service'] for l in ls) or '없음'})")
        pick = None
        for l in ls:
            if a.service and l["service"] != a.service:
                continue
            if l["active"]:
                if a.service:
                    c = l["active"]["claim"]
                    die(f"[{l['service']}] {l['active']['id']} 를 {c['by']} 가 진행 중입니다 ({c['at']}). "
                        f"한 레인은 한 창만 — 끝나길 기다리거나, 버려진 창이면 release --force", EXIT_NONE)
                continue
            if l["ready"]:
                pick = (l, l["ready"])
                break
        if not pick:
            for l in ls:
                if a.service and l["service"] != a.service:
                    continue
                if l["blocked"]:
                    print(f"[{l['service']}] 대기: {l['blocked']['id']} ← {', '.join(l['waits'])}")
                elif l["held"]:
                    print(f"[{l['service']}] 보류 {l['held']}건 — 사람 결정 필요 (loop.py status)")
                elif l["human"]:
                    print(f"[{l['service']}] 사람 작업 {l['human']}건 대기")
            print("집을 항목이 없습니다.")
            sys.exit(EXIT_NONE)
        l, f = pick
        by = a.by or f"{l['service']}-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
        f = find(data, f["id"])
        f["claim"] = {"by": by, "at": now_iso()}
        save(a.work, data)
    out = {k: f.get(k) for k in ("id", "service", "desc", "check", "must_not", "depends_on", "notes", "returns", "check_fix")}
    out["service"] = l["service"]
    out["by"] = by
    out["repo"] = str(repo_dir(l["service"]).relative_to(ROOT)) or "."
    print(json.dumps({k: v for k, v in out.items() if v not in (None, "", [], {})}, ensure_ascii=False, indent=2))


def cmd_release(a):
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        own(f, a.by, a.force)
        f.pop("claim", None)
        save(a.work, data)
    print(f"{a.id} 선점 해제")


def cmd_check(a):
    data = load(a.work)
    f = find(data, a.id)
    c = (f.get("check") or "").strip()
    if not c or c == "-":
        die(f"{a.id} 는 check 가 없습니다")
    ok = run_check(c) == 0
    g = (f.get("must_not") or "").strip()
    if g:
        ok = run_guard(g) and ok
    sys.exit(0 if ok else 1)


def cmd_done(a):
    note = note_arg(a.note)
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        if f.get("done"):
            die(f"{a.id} 는 이미 done")
        if f.get("owner") == "human":
            die(f"{a.id} 는 사람 작업입니다 (대시보드에서 완료)")
        own(f, a.by, a.force)
        check = (f.get("check") or "").strip()
        guard = (f.get("must_not") or "").strip()
        if f.get("check_fix") and check == (f.get("check_was") or "").strip():
            die(f"{a.id} 는 WEAK 로 되돌아온 항목입니다. check 를 보강안대로 먼저 조이세요:\n  {f['check_fix']}", EXIT_HUMAN)
    if not check or check == "-":
        die(f"{a.id} 는 check 가 없습니다 — done 으로 만들 근거가 없음")
    if run_check(check) != 0:  # 락 밖에서 돈다 (길 수 있음)
        die(f"✗ check 실패 — {a.id} 는 done 이 아닙니다. 고쳐서 다시 done, 포기하면 fail")
    if guard and not run_guard(guard):
        die(f"✗ 경계(must_not) 를 넘었습니다 — {a.id} 는 done 이 아닙니다.\n"
            f"  check 는 통과했지만 하지 말았어야 할 것을 했습니다: {guard}\n"
            f"  그 자리를 되돌리고 다시 done. 경계 자체가 틀렸다고 보면 고치지 말고 fail 로 넘기세요 (사람이 판단).", EXIT_HUMAN)
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        if (f.get("check") or "").strip() != check:
            die("check 가 실행 중에 바뀌었습니다 — 다시 done")
        if (f.get("must_not") or "").strip() != guard:
            die("must_not 이 실행 중에 바뀌었습니다 — 다시 done")
        svc = service_of(data, f)
        was = returned(f)
        displace(a.work, f, svc, "완료")
        f["done"] = True
        f["notes"] = f"완료 {today()}: {note}"
        for k in ("claim", "check_fix", "check_was", "hold", "reviewed"):
            f.pop(k, None)
        save(a.work, data)
        progress(a.work, f"{today()} [{svc}] {a.id} {'보강 ' if was else ''}완료: {note}")
    print(f"✓ {a.id} done")


def cmd_fail(a):
    note = note_arg(a.note)
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        own(f, a.by, a.force)
        svc = service_of(data, f)
        displace(a.work, f, svc, "실패")
        f["notes"] = f"실패 {today()}: {note}"
        f["hold"] = note  # 같은 이유로 다음 창이 또 집지 않게 — 사람이 unhold
        f.pop("claim", None)
        save(a.work, data)
        progress(a.work, f"{today()} [{svc}] {a.id} 실패: {note}")
    print(f"✗ {a.id} 보류됨 — 원인을 해결한 뒤 사람이: loop.py unhold {a.work} {a.id}")


def dependents(data, root_id):
    """root_id 에 (직간접으로) 기대는 항목들."""
    fs = data.get("features", [])
    out, frontier = [], {root_id}
    while frontier:
        nxt = set()
        for f in fs:
            if f["id"] not in out and f["id"] != root_id and frontier & set(f.get("depends_on") or []):
                out.append(f["id"])
                nxt.add(f["id"])
        frontier = nxt
    return out


def cmd_review(a):
    verdict = a.verdict.upper()
    if verdict not in ("PASS", "FAIL", "WEAK"):
        die("판정은 PASS · FAIL · WEAK")
    note = note_arg(a.note) if verdict != "PASS" else " ".join((a.note or "").split())
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        svc = service_of(data, f)
        if not f.get("done"):
            die(f"{a.id} 는 done 이 아닙니다 — review 대상 아님")
        if verdict == "PASS":
            f["reviewed"] = today()
            save(a.work, data)
            print(f"{a.id} PASS")
            return
        f.pop("reviewed", None)
        r = f.setdefault("returns", {})
        if verdict == "WEAK":
            fix = " ".join((a.fix or "").split())
            if not fix:
                die("WEAK 는 --fix \"<실행 가능한 명령 + 기대 결과>\" 가 필요합니다 (없으면 같은 check 로 다시 통과될 뿐)")
            if r.get("weak"):
                progress(a.work, f"{today()} [{svc}] {a.id} review WEAK(2회) — check 합의 필요: {note}")
                save(a.work, data)
                print(f"{a.id} WEAK(2회) — 되돌리지 않음. check 기준을 사람과 합의하세요: {fix}")
                sys.exit(EXIT_HUMAN)
            r["weak"] = r.get("weak", 0) + 1
            displace(a.work, f, svc, "review")
            f.update(done=False, notes=f"review {today()} WEAK: {note}", check_fix=fix, check_was=f.get("check", ""))
            progress(a.work, f"{today()} [{svc}] {a.id} review WEAK: {note} · check 보강: {fix}")
            save(a.work, data)
            print(f"{a.id} WEAK → 되돌림 (후속 항목은 그대로)")
            return
        # FAIL
        r["fail"] = r.get("fail", 0) + 1
        displace(a.work, f, svc, "review")
        f.update(done=False, notes=f"review {today()} FAIL: {note}")
        if r["fail"] >= FAIL_HOLD:
            f["hold"] = f"review FAIL {r['fail']}회 — 접근을 사람이 다시 정할 것"
        progress(a.work, f"{today()} [{svc}] {a.id} review FAIL({r['fail']}): {note}")
        back = []
        for did in dependents(data, a.id):
            d = find(data, did)
            if d.get("done") and d.get("owner") != "human":
                d.pop("reviewed", None)
                displace(a.work, d, service_of(data, d), "review")
                d.update(done=False, notes=f"review {today()} 선행 FAIL({a.id})")
                back.append(did)
        if back:
            progress(a.work, f"{today()} [{svc}] {a.id} 선행 FAIL 로 함께 되돌림: {', '.join(back)}")
        save(a.work, data)
    print(f"{a.id} FAIL → 되돌림" + (f" · 후속 {', '.join(back)}" if back else "") +
          (f" · 보류 (FAIL {r['fail']}회)" if f.get("hold") else ""))


def cmd_unhold(a):
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        if not f.get("hold"):
            die(f"{a.id} 는 보류 상태가 아닙니다")
        progress(a.work, f"{today()} [{service_of(data, f)}] {a.id} 보류 해제 (이전 사유: {f['hold']})")
        f.pop("hold", None)
        if (f.get("returns") or {}).get("fail", 0) >= FAIL_HOLD:
            f["returns"]["fail"] = 0
        save(a.work, data)
    print(f"{a.id} 보류 해제 — 다시 ready 후보")


# ── 계획 (/work-plan) ─────────────────────────────────────────────────

FEATURE_KEYS = ("id", "service", "desc", "check", "must_not", "owner", "depends_on", "done", "notes")


def validate(data):
    """추가·수정 뒤의 전체 목록이 규칙에 맞는지. 문제 목록을 돌려준다 (긴 notes 는 경고라 제외)."""
    errs, seen = [], set()
    for f in data.get("features", []):
        fid = f.get("id")
        if not fid:
            errs.append("id 없는 항목")
            continue
        if fid in seen:
            errs.append(f"id 중복: {fid}")
        seen.add(fid)
        if f.get("owner", "ai") not in ("ai", "human"):
            errs.append(f"{fid}: owner 는 ai|human")
        if not (f.get("desc") or "").strip():
            errs.append(f"{fid}: desc 없음")
        if f.get("owner", "ai") == "ai" and not (f.get("check") or "").strip():
            errs.append(f"{fid}: AI 항목은 check 가 필요합니다 (실행 가능한 명령 + 기대 결과)")
        g = (f.get("must_not") or "").strip()
        if g and g == (f.get("check") or "").strip():
            errs.append(f"{fid}: must_not 이 check 와 같습니다 — 경계는 '하지 말았어야 할 것'을 잡는 다른 명령입니다")
        if g and f.get("owner") == "human":
            errs.append(f"{fid}: must_not 은 AI 항목에만 (사람 작업은 대시보드에서 확인)")
        svc = service_of(data, f)
        if svc not in (LANE_CORE, LANE_E2E) and not (ROOT / "projects" / svc).is_dir():
            errs.append(f"{fid}: service '{svc}' — projects/{svc}/ 가 없습니다 (루트 자체는 core, 통합 검증은 e2e)")
    errs += [p for p in problems(data) if "notes" not in p]
    return errs


def cmd_add(a):
    raw = json.loads(Path(a.file).read_text() if a.file != "-" else sys.stdin.read())
    items = raw.get("features", []) if isinstance(raw, dict) else raw
    if not items:
        die("추가할 항목이 없습니다")
    with locked(a.work):
        data = load(a.work) or {"work": a.work, "services": [], "features": []}
        data.setdefault("features", [])
        before = set(validate(data))
        data.setdefault("rules", RULES)
        for it in items:
            f = {k: it[k] for k in FEATURE_KEYS if k in it}
            f.update(done=False, notes=" ".join((f.get("notes") or "").split()))
            f.setdefault("owner", "ai")
            f.setdefault("depends_on", [])
            if len(f["notes"]) > NOTES_MAX:
                die(f"{f.get('id')}: notes 는 {NOTES_MAX}자 안쪽 한 줄 (근거는 design.md 에)")
            data["features"].append(f)
        if isinstance(raw, dict):
            for svc in raw.get("services", []):
                if svc not in data.setdefault("services", []):
                    data["services"].append(svc)
            if raw.get("goal") and not data.get("goal"):
                data["goal"] = raw["goal"]
        errs = [e for e in validate(data) if e not in before]  # 원래 있던 문제는 막지 않는다 (status 가 따로 보여줌)
        if errs:
            die("추가하지 않았습니다:\n  " + "\n  ".join(errs))
        # 계획이 바뀐 시각. 대시보드는 design.md 가 이보다 오래되면 "설계가 뒤처졌다"고 알린다
        # (완료 표시로도 features.json 은 계속 바뀌므로 mtime 으로는 구분할 수 없다)
        data["planned_at"] = now_iso()
        save(a.work, data)
        progress(a.work, f"{today()} 계획: 항목 {len(items)}개 추가 ({', '.join(i['id'] for i in items)})")
    print(f"✓ {len(items)}개 추가")


def cmd_edit(a):
    with locked(a.work):
        data = load(a.work)
        f = find(data, a.id)
        if f.get("done"):
            die(f"{a.id} 는 done 입니다 — 끝난 항목은 고치지 않습니다 (필요하면 새 항목으로)")
        if claim_fresh(f):
            # 유일한 예외: WEAK 로 되돌아온 항목을 집은 창이 보강안대로 자기 check 를 조이는 것
            mine = a.by and f["claim"].get("by") == a.by
            if not mine:
                die(f"{a.id} 는 {f['claim']['by']} 가 진행 중입니다 — 끝난 뒤에")
            if not f.get("check_fix") or any(v is not None for v in (a.desc, a.depends, a.owner, a.service, a.must_not)) or a.check is None:
                die(f"{a.id} 진행 중에는 WEAK 보강(check_fix)이 있을 때 --check 만 고칠 수 있습니다")
        before = set(validate(data))
        changed = []
        if a.desc is not None:
            f["desc"] = a.desc; changed.append("desc")
        if a.check is not None:
            f["check"] = a.check; changed.append("check")
        if a.must_not is not None:
            if a.must_not.strip():
                f["must_not"] = a.must_not
            else:
                f.pop("must_not", None)   # --must-not "" 로 지운다
            changed.append("must_not")
        if a.depends is not None:
            f["depends_on"] = [d.strip() for d in a.depends.split(",") if d.strip()]; changed.append("depends_on")
        if a.owner is not None:
            f["owner"] = a.owner; changed.append("owner")
        if a.service is not None:
            f["service"] = a.service; changed.append("service")
        if not changed:
            die("바꿀 것이 없습니다 (--desc · --check · --must-not · --depends · --owner · --service)")
        errs = [e for e in validate(data) if e not in before]
        if errs:
            die("고치지 않았습니다:\n  " + "\n  ".join(errs))
        save(a.work, data)
        progress(a.work, f"{today()} [{service_of(data, f)}] {a.id} 계획 수정: {', '.join(changed)} — {a.why}")
    print(f"✓ {a.id} 수정: {', '.join(changed)}")


def cmd_replanned(a):
    with locked(a.work):
        data = load(a.work)
        if data is None:
            die("features.json 없음")
        data.pop("replan", None)
        data["rules"] = RULES
        save(a.work, data)
        progress(a.work, f"{today()} 재정비 완료 (규칙 v{RULES})")
    print(f"✓ {a.work} 재정비 표시 해제")


# ── 이전 규칙 → 지금 규칙 ─────────────────────────────────────────────

def migrate_v2(data):
    """v1 (notes 문자열에 상태를 적던 방식) → v2 (claim·returns·hold·check_fix 필드).
    기계적으로 옮길 수 있는 것만 옮기고, 판단이 필요한 점검은 replan 표시로 /work-plan 에 넘긴다."""
    moved = []
    for f in data.get("features", []):
        notes = f.get("notes") or ""
        r = {}
        if not f.get("done") and notes.startswith("review "):
            kind = "weak" if " WEAK" in notes.split(":")[0] else "fail"
            r[kind] = 1
            if kind == "weak" and "check 보강:" in notes:
                f["check_fix"] = notes.split("check 보강:", 1)[1].strip()
                f["check_was"] = f.get("check", "")
        if "· 보강 " in notes or "보강 20" in notes:  # v1 의 '되돌아왔던 항목' 표식 → WEAK 2회 규칙 유지
            r["weak"] = max(r.get("weak", 0), 1)
        if not f.get("done") and notes.startswith("실패 ") and f.get("owner") != "human":
            f["hold"] = notes[3:].strip()  # 원문 그대로 (화면에서만 접어 보인다)
        if r:
            f["returns"] = {**(f.get("returns") or {}), **r}
        if r or f.get("hold"):
            moved.append(f["id"])
    if data.get("features"):
        data["replan"] = True
    return moved


def migrate_v3(work, data):
    """v2 → v3: v1 시절 notes 에 쌓인 이력(한도 초과)을 progress.md 로 옮기고 첫 힌트 한 줄만 남긴다.
    v2 migrate 는 상태만 옮기고 긴 notes 를 그대로 둬서, 경고가 사라지지 않았다."""
    moved = []
    for f in data.get("features", []):
        notes = " ".join((f.get("notes") or "").split())
        if len(notes) <= NOTES_MAX:
            continue
        displace(work, f, service_of(data, f), "이력 정리")
        head = notes.split(" · ", 1)[0].strip()
        f["notes"] = head if len(head) <= NOTES_MAX and head != notes else ""
        moved.append(f["id"])
    return moved


def migrate_one(work):
    """이전 규칙 → 지금 규칙. 버전별로 한 단계씩 올린다."""
    with locked(work):
        data = load(work)
        if data is None or data.get("rules", 1) >= RULES:
            return None
        moved, notes = [], []
        if data.get("rules", 1) < 2:
            moved = migrate_v2(data)
        if data.get("rules", 1) < 3:
            notes = migrate_v3(work, data)
        data["rules"] = RULES
        save(work, data)
        progress(work, f"{today()} 규칙 v{RULES} 로 이전" + (f" — 상태 옮김: {', '.join(moved)}" if moved else "") +
                 (f" — 긴 notes 를 progress.md 로: {', '.join(notes)}" if notes else "") +
                 (" · /work-plan 재정비 필요" if data.get("replan") else ""))
        return moved + [i for i in notes if i not in moved]


def cmd_migrate(a):
    works = all_works() if a.all or not a.work else [a.work]
    for w in works:
        moved = migrate_one(w)
        if moved is None:
            continue
        print(f"✓ {w}: 규칙 v{RULES}" + (f" · 옮긴 항목 {', '.join(moved)}" if moved else "") +
              (f" → /work-plan {w} 로 재정비" if (load(w) or {}).get("replan") else ""))


def cmd_scope(a):
    """work-loop.sh 가 계속할지 판단하는 한 줄: ready done active stage 이유…"""
    s = summary(a.work)
    ls = [l for l in s["lanes"] if not a.service or l["service"] == a.service]
    ready = sum(1 for l in ls if l["ready"] and not l["active"])
    done = sum(l["done"] for l in ls)
    active = ",".join(f"{l['active']['id']}:{l['active']['claim']['by']}" for l in ls if l["active"]) or "-"
    why = []
    for l in ls:
        if l["active"]:
            why.append(f"{l['service']} 진행 중({l['active']['id']})")
        elif l["ready"]:
            why.append(f"{l['service']} 다음 {l['ready']['id']}")
        elif l["blocked"]:
            why.append(f"{l['service']} 대기({l['blocked']['id']} ← {','.join(l['waits'])})")
        elif l["held"]:
            why.append(f"{l['service']} 보류 {l['held']}")
        elif l["human"]:
            why.append(f"{l['service']} 사람 작업 {l['human']}")
    if not ls:
        why.append(f"레인 없음: {a.service}")
    print(ready, done, active, s["stage"], "; ".join(why) or "전부 완료")


def unreviewed_ids(data, service=""):
    return [f["id"] for f in data.get("features", [])
            if f.get("done") and f.get("owner") != "human" and not f.get("reviewed")
            and (not service or service_of(data, f) == service)]


def cmd_unreviewed(a):
    ids = unreviewed_ids(load(a.work) or {}, a.service or "")
    print(" ".join(ids) if ids else "(없음)")


def cmd_donelist(a):
    data = load(a.work) or {}
    for f in data.get("features", []):
        svc = service_of(data, f)
        if f.get("done") and f.get("owner") != "human" and (not a.service or svc == a.service):
            repo = os.path.relpath(repo_dir(svc), ROOT)
            print(f"{f['id']}\t{repo}\t{' '.join((f.get('notes') or '').split())}")


def cmd_delete(a):
    """작업 폴더를 휴지통으로 옮긴다. 진행 중인 창이나 자동 반복이 있으면 거부 (--force 로 무시)."""
    d = work_dir(a.work)
    with locked(a.work):
        data = load(a.work) or {}
        busy = [f"{f['id']}({f['claim'].get('by')})" for f in data.get("features", []) if claim_fresh(f)]
        auto = sorted(p.name for p in d.iterdir() if p.name.startswith(".autoloop"))
        if (busy or auto) and not a.force:
            why = (["진행 중: " + ", ".join(busy)] if busy else []) + (["자동 반복 실행 중"] if auto else [])
            die(f"{a.work} 는 아직 쓰이는 중입니다 — {' · '.join(why)}. 창을 끝낸 뒤 다시, 또는 --force", EXIT_HUMAN)
        trash = ROOT / ".cache" / "workloop" / "trash"
        trash.mkdir(parents=True, exist_ok=True)
        dest = trash / f"{a.work}-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.move(str(d), str(dest))
    for p in dest.glob(".autoloop*"):
        shutil.rmtree(p, ignore_errors=True)
    (dest / ".lock").unlink(missing_ok=True)
    print(f"✓ {a.work} 삭제 → {dest.relative_to(ROOT)}  (되살리기: mv {dest.relative_to(ROOT)} loops/{a.work})")


def all_works():
    d = loops_dir()
    return sorted(p.name for p in d.iterdir() if p.is_dir() and not p.name.startswith(".")) if d.exists() else []


def cmd_lanes(a):
    works = [a.work] if a.work else all_works()
    print(json.dumps({w: summary(w) for w in works}, ensure_ascii=False))


def git_line(service):
    d = repo_dir(service)
    try:
        r = subprocess.run(["git", "-C", str(d), "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=5)
        if r.returncode != 0:
            return "git 저장소 아님"
        dirty = subprocess.run(["git", "-C", str(d), "status", "--porcelain"], capture_output=True, text=True, timeout=5).stdout.strip()
        n = len(dirty.splitlines()) if dirty else 0
        return r.stdout.strip() + (f" · 미커밋 {n}" if n else " · clean")
    except Exception:
        return "git 확인 불가"


def show(work, only=""):
    s = summary(work)
    print(f"== [{work}] {s.get('done', 0)}/{s['total']} 완료" + (f" · review 대기 {s['unreviewed']}" if s.get("unreviewed") else "") + " ==")
    for p in s["problems"]:
        print(f"  ⚠ {p}")
    if not s["total"]:
        print(f"  목록 없음 → /work-plan {work}")
        return
    for l in s["lanes"]:
        if only and l["service"] != only:
            continue
        print(f"  ▸ {l['service']:<22} {l['done']}/{l['total']}  ({git_line(l['service'])})")
        if l["active"]:
            c = l["active"]["claim"]
            print(f"      진행: {l['active']['id']} {l['active'].get('desc', '')}  ← {c['by']} ({c['at']})")
        if l["ready"]:
            r = l["ready"]
            print(f"      {'다음' if not l['active'] else '그다음'}: {r['id']} {r.get('desc', '')}" + ("  (되돌아옴)" if returned(r) else ""))
            if r.get("notes"):
                print(f"      메모: {r['notes']}")
        elif l["blocked"] and not l["active"]:
            print(f"      대기: {l['blocked']['id']} ← {', '.join(l['waits'])} 완료 필요")
        if l["held"]:
            print(f"      보류 {l['held']}건 — loop.py unhold {work} <id>")
        if l["human"]:
            print(f"      사람 작업 {l['human']}건")
        if not (l["active"] or l["ready"] or l["blocked"] or l["held"] or l["human"]):
            print("      완료")


def cmd_status(a):
    if a.work:
        show(a.work, a.service or "")
    else:
        for w in all_works():
            show(w)


def main(argv=None):
    global ROOT
    p = argparse.ArgumentParser(prog="loop.py", description="작업 루프 상태 규칙과 features.json 쓰기")
    p.add_argument("--root", help="프로젝트 루트 (기본: 이 스크립트의 상위 폴더)")
    sub = p.add_subparsers(dest="cmd")

    s = sub.add_parser("status"); s.add_argument("work", nargs="?"); s.add_argument("service", nargs="?"); s.set_defaults(fn=cmd_status)
    s = sub.add_parser("lanes"); s.add_argument("work", nargs="?"); s.add_argument("--json", action="store_true"); s.set_defaults(fn=cmd_lanes)
    s = sub.add_parser("claim"); s.add_argument("work"); s.add_argument("service", nargs="?"); s.add_argument("--by"); s.set_defaults(fn=cmd_claim)
    for name, fn in (("release", cmd_release), ("done", cmd_done), ("fail", cmd_fail)):
        s = sub.add_parser(name); s.add_argument("work"); s.add_argument("id")
        s.add_argument("--by", default=""); s.add_argument("--force", action="store_true")
        if name != "release":
            s.add_argument("--note", required=True)
        s.set_defaults(fn=fn)
    s = sub.add_parser("check"); s.add_argument("work"); s.add_argument("id"); s.set_defaults(fn=cmd_check)
    s = sub.add_parser("review"); s.add_argument("work"); s.add_argument("id"); s.add_argument("verdict")
    s.add_argument("--note", default=""); s.add_argument("--fix", default=""); s.set_defaults(fn=cmd_review)
    s = sub.add_parser("unhold"); s.add_argument("work"); s.add_argument("id"); s.set_defaults(fn=cmd_unhold)
    s = sub.add_parser("add"); s.add_argument("work"); s.add_argument("--file", required=True, help="JSON 파일 (- = stdin)"); s.set_defaults(fn=cmd_add)
    s = sub.add_parser("edit"); s.add_argument("work"); s.add_argument("id")
    for o in ("desc", "check", "depends", "service"):
        s.add_argument("--" + o)
    s.add_argument("--must-not", dest="must_not", help="경계 조건 명령 (0 이 아닌 종료코드가 통과). 빈 문자열이면 지운다")
    s.add_argument("--owner", choices=["ai", "human"]); s.add_argument("--by", default="", help="선점한 창 이름 (WEAK 보강 때)")
    s.add_argument("--why", required=True, help="고친 이유 한 줄 (progress.md)")
    s.set_defaults(fn=cmd_edit)
    s = sub.add_parser("migrate"); s.add_argument("work", nargs="?"); s.add_argument("--all", action="store_true"); s.set_defaults(fn=cmd_migrate)
    s = sub.add_parser("replanned"); s.add_argument("work"); s.set_defaults(fn=cmd_replanned)
    s = sub.add_parser("scope"); s.add_argument("work"); s.add_argument("service", nargs="?"); s.set_defaults(fn=cmd_scope)
    s = sub.add_parser("unreviewed"); s.add_argument("work"); s.add_argument("service", nargs="?"); s.set_defaults(fn=cmd_unreviewed)
    s = sub.add_parser("donelist"); s.add_argument("work"); s.add_argument("service", nargs="?"); s.set_defaults(fn=cmd_donelist)
    s = sub.add_parser("delete"); s.add_argument("work"); s.add_argument("--force", action="store_true"); s.set_defaults(fn=cmd_delete)

    argv = list(sys.argv[1:] if argv is None else argv)
    # 명령 없이 부르면 status (예전 loop-status.py <작업> [서비스] 호출과 같다)
    i = 2 if argv[:1] == ["--root"] else 0
    if len(argv) <= i or argv[i] not in sub.choices:
        argv.insert(i, "status")
    a = p.parse_args(argv)
    if a.root:
        ROOT = Path(a.root).resolve()
    a.fn(a)


if __name__ == "__main__":
    main()

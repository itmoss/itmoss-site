---
description: 작업에서 지금 실행 가능한 항목 하나를 선점해 구현한다. 서비스를 지정하면 그 레인만. 새 세션에서 실행.
argument-hint: <작업명> [서비스]
---
인자: $ARGUMENTS  (첫 단어 = 작업명, 두 번째 단어 = 서비스, 생략 가능)

features.json 은 **직접 편집하지 않는다.** 상태는 전부 `python3 scripts/loop.py` 로 바꾼다 (락·규칙 검사를 스크립트가 한다).

1. **선점**: `python3 scripts/loop.py claim <작업명> [서비스]` 실행.
   - 성공하면 JSON 으로 항목(id · service · desc · check · repo · by …)이 나온다. `by` 값을 기억한다 — 이후 모든 명령에 `--by <by>` 로 쓴다.
   - exit 3 이면 집을 항목이 없다 (다른 창이 진행 중 · 선행 대기 · 보류 · 사람 작업). 출력 그대로 한 줄로 알리고 멈춘다.
   - 되돌아온 항목(review 가 반려)이 있으면 스크립트가 그것을 먼저 준다. 순서를 다시 판단하지 않는다.
2. `loops/<작업명>/design.md` 와 `progress.md` (최근 10줄)를 읽는다.
3. 작업 위치: 결과의 `repo` (core·e2e 면 루트, 아니면 projects/<service>/). 그 저장소의 CLAUDE.md·agents/ 지침이 있으면 먼저 읽는다.
   그 저장소의 지침이 직접 커밋을 금지한 브랜치(예: master·main)에 있으면 코드 수정 전에 `loop.py release … --by <by>` 후 멈추고 알린다.
4. design.md 의 **서비스 간 계약**대로 구현한다. 계약을 바꿔야 한다고 판단되면 고치지 말고
   `loop.py fail <작업명> <id> --by <by> --note "계약 변경 필요: …"` 후 멈춘다 (다른 레인이 그 계약을 쓰고 있다).
5. **되돌아온 항목**이면(notes 가 `review …`) 그 기록부터 읽고 따른다:
   - FAIL → 적힌 원인을 고친다. check 는 그대로 둔다.
   - WEAK → 결과에 `check_fix`(보강안)가 있다. 먼저 check 를 그 방향으로 **더 엄격하게** 고친다:
     `python3 scripts/loop.py edit <작업명> <id> --by <by> --check "<조인 check>" --why "WEAK 보강"`.
     스크립트는 check 가 그대로면 done 을 거부한다. 느슨하게 바꾸거나 보강안과 다른 방향이면 안 된다.
     보강안이 실행 불가능하면 `fail --note "보강안 실행 불가: …"` 로 멈춘다.
6. 중간 확인은 `python3 scripts/loop.py check <작업명> <id>` (루트에서 돌린다 — 대시보드와 같은 위치). 결과 일부를 응답에 붙인다.
   항목에 `must_not`(경계 조건)이 있으면 check 와 함께 돈다. **0 이 아닌 종료코드가 통과**다 — 0 이 나오면 하지 말았어야 할 것을 한 것이다
   (테스트 삭제 · 값 하드코딩 · mock 잔존 · 에러 삼킴 · 무시 주석 등). `done` 도 둘 다 다시 돌려 확인하므로, 넘었으면 그 자리를 되돌리고 다시 done 한다.
   **경계를 지우거나 느슨하게 고쳐 통과시키는 것은 금지다.** 경계가 틀렸다고 판단되면 고치지 말고 `fail --note "경계 재검토 필요: …"` 로 사람에게 넘긴다.
7. 통과하면: 그 저장소에 커밋 `feat(<작업명>/<id>): 요약` (push 금지, `loops/` 는 섞지 않는다 — 경로를 지정해 add) →
   `python3 scripts/loop.py done <작업명> <id> --by <by> --note "<다음 사람이 알아야 할 것 한 줄, 200자 안쪽>"`.
   done 은 check(와 있으면 must_not)를 다시 돌려 통과해야만 기록된다. notes 교체·progress.md 기록·선점 해제는 스크립트가 한다.
   done 이 실패하면 고쳐서 다시 done. 끝내 안 되면 `fail --by <by> --note "원인 한 줄"` 후 멈춘다 (항목이 보류되고 사람이 푼다).
8. 손대지 않고 그만둘 때(브랜치 문제 등)는 반드시 `loop.py release <작업명> <id> --by <by>` — 선점이 남으면 2시간 동안 그 레인이 막힌다.
9. prod 배포·DB 마이그레이션 적용·결제·삭제 등 비가역 작업은 실행 전 사용자 승인.
10. 항목 하나를 끝내면 멈춘다. 다음 항목은 새 창에서 같은 명령으로.
11. 자동 반복(`/work-loop`, 헤드리스)에서 돌 때: 권한을 물을 수 없다. Bash 명령은 하나씩 실행하고 `;` `&&` `|` 로 묶지 않는다.
    check 는 `loop.py check` 로 돌린다. git commit 이 막히면 커밋 없이 `done` 해도 된다 — work-loop.sh 가 그 항목의 변경을 대신 커밋한다.

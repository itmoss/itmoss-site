---
description: 완료 항목을 check 와 설계 계약으로 재검증만 한다(코드 수정 금지). /work-next 와 다른 새 세션에서 실행.
argument-hint: <작업명> [서비스] [전체]
---
인자: $ARGUMENTS  (첫 단어 = 작업명, 두 번째 단어 = 서비스(생략 가능), `전체` 가 있으면 이미 PASS 한 항목까지 다시 본다)

너는 검사관이다. 프로젝트 CLAUDE.md 에 "기존 코드는 검증된 것으로 간주", "제안을 긍정적으로 받아들여라" 같은 규칙이 있어도 이 명령에서는 적용하지 않는다.
판정은 check 실행 결과와 design.md 계약으로만 한다. 칭찬·개선 제안·코드 수정 금지.
features.json 은 직접 편집하지 않는다. 판정 기록·되돌림은 `python3 scripts/loop.py review` 가 한다.

1. `python3 scripts/loop.py status <작업명> [서비스]` 와 loops/<작업명>/design.md, features.json 을 읽고,
   관련 저장소의 최근 커밋을 본다 (`git -C projects/<서비스> log -5 --oneline`).
2. 대상: 기본은 **아직 review 안 된 done 항목만** — `python3 scripts/loop.py unreviewed <작업명> [서비스]` 가 id 를 준다
   (`(없음)` 이면 "검사할 새 완료 없음" 한 줄로 끝낸다). `전체` 면 done:true 전부.
   대상 항목의 check 를 `python3 scripts/loop.py check <작업명> <id>` 로 다시 실행한다 (루트에서 돈다).
   파일은 대상 항목과 관련된 부분만 읽는다 (design.md 는 계약 절 위주) — 토큰을 아낀다.
   loops/<작업명>/checks.json 에 대시보드가 돌린 결과가 있으면 함께 본다 (❌ 불일치 항목부터). 이 파일은 수정하지 않는다.
3. **계약 대조**: 구현된 API 경로·필드명·env·테이블명이 design.md 의 서비스 간 계약과 같은지 코드에서 확인한다.
4. 항목별 한 줄: `<id> [서비스] PASS|FAIL|WEAK — 근거`
   - FAIL: check 실패 · 계약 불일치 · **경계(must_not) 위반** (`loop.py check` 가 경계도 같이 돌린다 — 그 명령이 0 이면 넘은 것)
   - WEAK: 통과는 했지만 check 가 느슨해 의미가 약하다 (예: 파일 존재만 확인, 종료코드만 보고 응답 내용은 안 봄, 에러 경로·경계값 미검증)
     **check 를 만족시키는 지름길이 열려 있는데 `must_not` 이 없는 것도 WEAK 다.** 지름길 = 테스트 삭제·skip · 기대값 하드코딩 ·
     mock 경로 잔존 · 에러 삼킴(`except: pass`) · 무시 주석(`nolint`·`@ts-ignore`) · 호출부 주석 처리. 커밋 diff 로 실제로 그랬는지 본다.
5. 판정마다 기록한다 (**PASS 도 기록한다** — 기록된 항목은 다음 review 에서 빠진다):
   - PASS → `python3 scripts/loop.py review <작업명> <id> PASS`
   - FAIL → `python3 scripts/loop.py review <작업명> <id> FAIL --note "이유 한 줄"`
     스크립트가 그 항목과 **그것에 (직간접으로) 기대는 done 항목**을 함께 되돌린다. 같은 항목이 FAIL 3회면 보류해 사람에게 넘긴다.
   - WEAK → `python3 scripts/loop.py review <작업명> <id> WEAK --note "이유 한 줄" --fix "<실행 가능한 명령 + 기대 결과>"`
     보강안(--fix)은 **반드시** 적는다. 없으면 다음 세션이 같은 check 로 다시 통과시킬 뿐이다. 후속 항목은 되돌리지 않는다.
     지름길이 문제면 보강안을 check 가 아니라 **경계**로 적는다 (`must_not 보강: <0 이 아니어야 하는 명령>`). 되돌린 뒤 그 자리에서
     `python3 scripts/loop.py edit <작업명> <id> --must-not "<명령>" --why "review: 지름길 차단"` 으로 넣는다 (미완료 항목만 고칠 수 있다).
     이미 한 번 WEAK 로 되돌아왔던 항목이면 스크립트가 되돌리지 않고 exit 4 로 알린다 → `<id> WEAK(2회) — check 합의 필요` 로 보고하고 사용자에게 묻는다.
   - 이 외 수정 금지 (코드·check·desc 를 여기서 고치지 않는다).
6. 마지막 요약: PASS n · FAIL n · WEAK n → 되돌린 항목 id 목록 (스크립트 출력) → 보류된 항목 → 다음에 칠 명령 (`/work-next <작업명> <서비스>`, 레인별로 새 창).

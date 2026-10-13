<!-- workloop:begin -->
## 작업 루프 (plan → next → review)

> 모든 작업은 이 루트 저장소에서 시작한다. 작업은 서비스가 아니라 **목표** 단위이고, 여러 서비스(projects/*)에 걸칠 수 있다.
> 설계는 전체를 한 번에, 진행은 서비스 레인별로 따로. 기억은 대화가 아니라 파일이 든다. 만드는 세션과 검사하는 세션은 분리한다.
> 이 블록은 workloop 이 관리한다 (`./workloop install <경로> --force` 가 통째로 바꾼다). 프로젝트 규칙은 블록 밖에 쓴다.

- 작업 파일: `loops/<작업>/` — brief.md(사람 작성) · design.md(전체 설계·서비스 간 계약) · features.json(할 일) · progress.md(한 줄 기록).
- 레인: features.json 의 `service` 단위. `projects/` 폴더명, 루트 자체는 `core`, 서비스를 넘는 통합 검증은 `e2e`. projects/ 가 없으면 전부 `core`.
- 명령: `/work-plan <작업>` (설계+레인 분할, 코드 없음) → `/work-next <작업> <서비스>` (레인마다 새 창, 항목 1개) → `/work-review <작업> [서비스]` (새 세션, 검증만)
- 자동 반복: `/work-loop <작업> [서비스]` (또는 `bash scripts/work-loop.sh …`) — 항목마다 **새** `claude -p` 세션으로 next → review 를 번갈아 돌린다.
  사람 작업·보류·선행 대기만 남거나, 진행 없는 세션 2회 · 최대 항목 수 · 예산에 이르면 멈추고, 끝나면 `loops/<작업>/` 상태를 커밋하고 새 커밋이 생긴 저장소를 push 한다.
- 현황: `python3 scripts/loop.py status [작업]` · 작업 만들기: `make loop NAME=<작업>` 또는 workloop 대시보드.
- **features.json 은 직접 고치지 않는다.** 읽기는 자유, 쓰기는 전부 `python3 scripts/loop.py` 로 한다
  (`claim` · `done` · `fail` · `release` · `review` · `add` · `edit`). 스크립트가 락을 걸고 규칙을 검사한다.
  - `claim` 이 다음 항목을 **선점**한다. 한 레인에는 한 창만. 두 창이 같은 항목을 집지 않는다.
  - `done` 은 check 를 직접 돌려 통과해야만 done:true 가 된다. notes 도 스크립트가 한 줄로 교체한다.
  - 항목에 `must_not`(경계 조건)이 있으면 그 명령이 **0 이 아닌 종료코드**여야 done 이 된다 (0 = 하지 말았어야 할 것을 했다 —
    테스트 삭제 · 기대값 하드코딩 · mock 잔존 · 에러 삼킴 · 무시 주석). 경계를 지우거나 느슨하게 고쳐 통과시키지 않는다 — 틀렸다고 보면 `fail` 로 넘긴다.
  - `fail` 은 항목을 **보류(hold)** 한다. 사람이 원인을 풀고 `unhold` 해야 다시 집힌다.
- design.md 의 **서비스 간 계약**은 모든 레인의 기준이다. 구현 중 계약을 바꿔야 하면 고치지 말고 멈춰 사용자에게 알린다.
- desc·depends_on·check·must_not 은 `/work-next` 에서 바꾸지 않는다. 유일한 예외: `/work-review` 가 WEAK 로 되돌리며 남긴
  보강안(`check_fix`)대로 **더 엄격하게** 조일 때 (`loop.py edit … --by <선점 이름> --check …`).
- `owner:"human"` 항목은 AI 가 실행하지 않는다 (대시보드에서 완료 체크).
- 커밋은 각 서비스 저장소에 `feat(<작업>/<id>): 요약`. `/work-next` 세션은 push 하지 않는다 (push 는 자동 반복이 끝날 때 work-loop.sh 가 한 번).
  `loops/` 는 코드 커밋에 섞지 않는다 (경로를 지정해 add).
- 비가역 작업(prod 배포·DB 마이그레이션 적용·결제·삭제)은 실행 전 사용자 승인.
<!-- workloop:end -->

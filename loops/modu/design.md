# modu — 홈페이지 리뉴얼 설계

## 한 줄 요약
itmoss.com 을 블록체인 서사에서 **"영상을 만드는 기술로 영상을 지키는 비전 AI 회사"** 로 다시 세운다.
2026.10.15 「모두의 창업」 진출자 프로필이 공개되면 심사자·멘토·창작자가 홈으로 넘어오는데, 지금 페이지는 지원 아이디어(1인 창작자 무단 재송출 탐지)와 다른 이야기(Kaia/Avalanche 해시 보존·99% 정확도)를 한다.
스크롤형 한 페이지(히어로 → 두 엔진 → 우주데브리스 → 해픽 → 소식·걸어온 길 → 연락·구독)로 바꾸고, 구독 폼과 개인정보처리방침을 더한다.

## 흐름도
```
심사자·멘토  : 모두의 창업 프로필 → itmoss.com/#top(히어로) → #uzudebris(3단계) → #record(GBSA → 모두의 창업 카드) → 대표 이력
창작자       : itmoss.com → #uzudebris → [내 채널 무료 스캔 받아보기] → https://uzudebris.com (외부, 이번 범위 밖)
뷰티 B2B     : itmoss.com → #haepick(sticky 장면, 인식 4단계 점등) → #contact(mailto)
구독자       : #contact 구독 폼 → (브라우저 fetch) → 스티비 공개 구독 엔드포인트 → 확인 메일(더블 옵트인) → 확정 + 운영자 알림
배포(사람)   : renewal/2026-10 → develop 머지 → GitHub Actions(deploy.yml) → GitHub Pages(itmoss.com, CNAME, base "/")
```
서버·DB 없음. 정적 Astro 빌드(`dist/`)만 나간다.

## 서비스별 역할
`projects/` 가 없는 단일 저장소다. 구현은 전부 **core**, 서비스를 넘는 통합 검증(브라우저·Lighthouse)은 **e2e** 레인.

| 레인 | 바뀌는 것 | 안 바뀌는 것 |
| :--- | :--- | :--- |
| core | `src/pages/index.astro` 전면 교체, `src/components/home/*`, `src/layouts/BaseLayout.astro` 재작성, `src/styles/tokens.css`·`scroll.css`, `src/scripts/*`, `src/data/news.json`, `src/config/site.js`, `src/pages/privacy.astro`, `astro.config.mjs`(redirects), `public/llms.txt`, `public/images/renewal/*`, `scripts/check-site.mjs`·`gen_images.py`·`image_prompts.json`, `README.md`, `docs/renewal/*` | `.github/workflows/deploy.yml`(develop push 시 배포 그대로), `public/CNAME`, `src/pages/notes/*.mdx` 본문, Astro 4·Tailwind 의존성(노트 페이지가 씀) |
| e2e | `playwright.config.mjs`, `tests/e2e/*.spec.mjs`, `scripts/lighthouse.sh`, `docs/renewal/test-plan.md`, devDependencies(`@playwright/test`, `@axe-core/playwright`) | 앱 코드 (검증만, 실패 원인 수정은 core 항목으로) |

## 서비스 간 계약
레인 사이(core ↔ e2e)와 항목 사이의 기준 이름이다. 바꿔야 하면 멈추고 사용자에게 묻는다.

### 페이지·앵커
| 경로 / id | 내용 |
| :--- | :--- |
| `/` `#top` | 히어로 (모두의 창업 소식 **넣지 않음**) |
| `#engines` | 두 엔진: 01 보는 엔진 JVL Vision Engine / 02 찾는 엔진 영상 지문 대조 |
| `#uzudebris` | CASE 01 우주데브리스 — 생성 AI 악용 대응 (밝은 배경 섹션) |
| `#haepick` | CASE 02 해픽 — Vision AI, `data-scene="haepick"` |
| `#record` | 소식(news.json 순서) + 걸어온 길 + 대표 이력 |
| `#contact` | 연락 + 구독 폼 `#subscribe-form` |
| `/privacy/` | 개인정보처리방침 |
| `/about` → `/#record`, `/contact` → `/#contact` | `astro.config.mjs` `redirects` (meta refresh) |
| `/notes/*` | 유지 (새 레이아웃만 적용) |
내비 링크: 우주데브리스 · 해픽 · 소식 · 연락 (캔버스와 같음).

### 컴포넌트 파일
`src/components/home/{Hero,Engines,CaseUzudebris,UzuFlowDiagram,CaseHaepick,News,Timeline,Contact,SubscribeForm}.astro` — index.astro 는 이 순서로 조립만 한다.

### 디자인 토큰 (`src/styles/tokens.css`, 유일한 색·폰트·간격 출처)
| 토큰 | 값 (캔버스) |
| :--- | :--- |
| `--color-ink` | #101214 (다크 그래파이트 바탕) |
| `--color-paper` | #ECEDEA (본문 글자 / 우주데브리스 밝은 바탕) |
| `--color-signal` | #FF6A2B (시그널 오렌지, 강조·CTA·연락 섹션 바탕) |
| `--color-signal-ink` | #B23E0C (밝은 바탕 위 오렌지 글자 — 대비용) |
| `--color-muted` / `--color-muted-on-paper` | #A9ACA6 / #3E413D (보조 문단) |
| `--color-faint` / `--color-line` / `--color-line-on-paper` | #6E716C / #2A2D2B / #C9CBC5 — `faint` 는 **본문 대비 4.5:1 미만**이므로 F25 에서 밝게 조정 가능 (토큰 값만 바꾼다) |
| `--font-sans` / `--font-mono` | 'IBM Plex Sans KR' / 'IBM Plex Mono' (Google Fonts css2, display=swap) |
| `--space-*`, `--radius-*`, `--measure` | 4px 단위 간격, 각진 모서리(0), 본문 폭 |
규칙: `src/components`, `src/layouts`, `src/pages/*.astro` 에 hex·rgb()·hsl() 직접 쓰기 금지 (`check-site colors`). 다크가 기본이고 우주데브리스 섹션만 밝게 (캔버스 그대로; 라이트 테마 토글 없음).

### 스크롤 연출 마크업 계약
| 속성 | 의미 |
| :--- | :--- |
| `data-reveal` | 화면에 들어오면 opacity/transform 으로 등장 |
| `data-step-group` + 자식 `data-step="1..n"` | 순서대로 등장 (우주데브리스 3단계) |
| `data-scene="haepick"` + `data-stage="camera|detect|ingredients|match"` | sticky 고정 장면, 단계별 인식 박스 점등 |
- 1순위: CSS `animation-timeline: view()` (`@supports` 안). 2순위: `src/scripts/scrollfx.js` 가 미지원 브라우저에서만 IntersectionObserver 로 `.is-in` 부여.
- 숨김 초기 상태는 `html.fx-css` / `html.fx-io` 아래에서만 → JS·CSS 실패 시에도 내용이 보인다.
- `@media (prefers-reduced-motion: reduce)` → 애니메이션 없음, 모두 보임.
- transform·opacity 만 애니메이션. scroll 이벤트 핸들러·rAF 루프 금지.

### 소식 데이터 `src/data/news.json`
`[{ "date": "2026", "tag": "선정", "title": "아이티모스 뷰티 AI 플랫폼, GBSA AI 멤버십 기업 선정", "href": "https://www.gbsa.or.kr/", "logo": "/images/renewal/gbsa-logo.webp" }, { "date": "2026.10", "tag": "진출", "title": "우주데브리스, 「모두의 창업」 2차 1라운드 진출", "body": "… 멘토기관 동국대학교 산학협력단", "href": "<미결정>" }]` — 배열 순서 = 화면 순서 (GBSA 먼저). 같은 카드 컴포넌트.

### 구독 폼
| 이름 | 값 |
| :--- | :--- |
| 설정 | `src/config/site.js` → `export const SUBSCRIBE_ACTION` (스티비 공개 폼 action URL, 비밀 아님 — 커밋한다), `SUBSCRIBE_FIELDS = { email: 'email', … }` (임베드 코드 기준) , `CONTACT_EMAIL` |
| 폼 | `<form id="subscribe-form" novalidate>` · `input[name=email][type=email][autocomplete=email]` · `input[name=consent][type=checkbox][required]` · 허니팟 `input[name=website]`(시각·보조기기 숨김, tabindex=-1) · `[aria-live=polite]` 결과 영역 · 동의 문구에 `/privacy/` 링크 |
| 모듈 | `src/scripts/subscribe.js`: `validateSubmission({email, consent, website}) → { ok: true } | { ok: false, error: 'email'|'consent'|'bot' }`, `createSubmitter({ action, fields, fetchImpl })` → `submit(data) → Promise<'ok'|'fail'|'busy'>` (진행 중 재호출은 'busy', 네트워크 1회) |
| 상태 문구 | 성공·실패·형식 오류·동의 누락·준비 중 — 문구는 `copy.md ## 구독 폼` |
| 엔드포인트 비었을 때 | 폼은 보이되 제출 버튼 비활성 + "준비 중" 안내 (F20 전 상태) |
| 전송 | `fetch(action, { method: 'POST', body: FormData })`. 스티비가 CORS 를 막으면 대안(F21 에서 판단): 숨은 iframe `target` 제출 + "확인 메일을 확인해 주세요" 낙관적 안내. 서비스 기본 임베드 스크립트·iframe 위젯은 쓰지 않는다 |
| 키 | API 키(AccessToken) 를 프런트에 넣지 않는다 |

### 보안 meta (BaseLayout)
```
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://stibee.com; form-action 'self' https://stibee.com; frame-src 'none'; base-uri 'self'; object-src 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
```
스티비 호스트는 F21 에서 임베드 코드의 실제 호스트로 맞춘다(하위 도메인 포함). `frame-ancestors` 는 meta 로 안 되므로 쓰지 않는다. **GA4(gtag)·Font Awesome CDN·i18n 스크립트는 제거** (외부 스크립트는 구독·폰트만 허용 / 분석 도구 없음).

### 검사 스크립트 `scripts/check-site.mjs` (node 내장만)
| 명령 | 실패 조건 |
| :--- | :--- |
| `build` | `npm run build` 실패 또는 출력에 `[WARN]`·`error` |
| `copy [경로…]` | 기본 `dist/**/*.{html,txt,xml}`. `<script>`·`<style>` 를 걷어낸 본문 텍스트 + `alt`·`title`·`aria-label`·`meta content` 에 금지어(대소문자 무시): blockchain, 블록체인, kaia, avalanche, legal-tech, 99%, 100%, 혁신, 새로운 미래, 엔지니어링합니다, 완벽한, 실시간 보호, 법적 증거, 삭제 대행, 1-click, 90% 절감, zero-image, valuation calculator, 가짜입니다 |
| `colors` | `src/components/**`, `src/layouts/**`, `src/pages/*.astro` 의 hex·rgb()·hsl() (`src/styles/tokens.css` 만 예외) |
| `images` | `dist/**/*.html` 의 `<img>` 중 width·height 없음, 확장자 webp/avif 아님, 파일 > 300KB |
| `links` | `href="#x"` 대상 id 없음, uzudebris.com·apps.apple.com·play.google.com 링크 없음 |
| `jsbudget` | index.html 이 불러오는 `dist/_astro/*.js` 합계 > 50KB |
| `all` | build → copy → colors → images → links → jsbudget |
| `--self-test` | 내장 픽스처로 각 검사가 위반을 실제로 잡는지 확인 |
> brief 의 끝 기준 `grep -riE "…|99%|100%" dist` 는 CSS(`width:100%`, keyframes `100%`)에 걸려 항상 실패한다. **화면에 나가는 텍스트 기준(`check-site copy`)으로 해석**했다.

### 이미지
- 생성: `scripts/gen_images.py` (citycanvas `scripts/gen_landing_images.py` 방식: `POST https://api.openai.com/v1/images/generations`, model `OPENAI_IMAGE_MODEL`=gpt-image-2, `output_format: webp`, cwebp 로 ≤300KB, stdlib). 키는 루트 `.env` 의 `OPENAI_API_KEY` (gitignore 확인). 키 없으면 생성 없이 0 종료. `--dry-run`, 슬롯 지정 인자.
- 프롬프트: `scripts/image_prompts.json` `{ "guard": "...", "slots": [{ "slot", "file", "size", "alt", "prompt" }] }` — 슬롯 hero / uzudebris-dashboard / haepick-phone (+ 선택 bg). **글자·로고·실제 얼굴 없는 컷**, 다크 그래파이트 + 오렌지 한 점.
- 결과: `public/images/renewal/*.webp` + `public/images/renewal/manifest.json` (`images[]`: slot, file, width, height, bytes, alt, prompt, model, created_at). 컴포넌트는 매니페스트의 width/height 를 쓴다. 이미지가 아직 없으면 같은 비율의 빈 프레임(CLS 방지).
- 예산: 시안 포함 총 30장 이내 — 스크립트가 매니페스트에 누적 생성 수를 남기고 30 을 넘으면 거부.

### 환경 변수
| 이름 | 쓰는 곳 |
| :--- | :--- |
| `OPENAI_API_KEY` | gen_images.py (로컬 .env, 사람이 등록) |
| `OPENAI_IMAGE_MODEL` (기본 gpt-image-2), `OPENAI_IMAGE_QUALITY` (기본 high) | gen_images.py |
스티비 action URL 은 비밀이 아니므로 env 대신 `src/config/site.js` 에 둔다 (Actions 빌드에 별도 설정 불필요).

### 테스트 (e2e)
`playwright.config.mjs` webServer: `npm run build && npx astro preview --port 4330`, baseURL `http://localhost:4330`. 스펙: `layout` · `links` · `news` · `subscribe`(route 가로채기로 엔드포인트 대체 — 실제 스티비로 보내지 않음) · `motion` · `a11y`(axe, wcag2a/2aa). Lighthouse: `scripts/lighthouse.sh` (preview :4329, `npx -y lighthouse@12` 모바일, `PERF_MIN=85` `A11Y_MIN=95` `CLS_MAX=0.1`). 단위: `node --test tests/unit/`.

### 리뷰 산출물 (마지막 줄 형식 고정)
`docs/renewal/reviews/design-critique.md` → `남은 주요 지적: 0` · `accessibility.md` → `AA 위반: 0` · `code-review.md` → `남은 보안·개인정보 지적: 0` · `compliance.md` → 절 `## 개인정보보호법` `## 정보통신망법` `## 변호사법` `## 사람 판단 필요` (참고용, 판단은 F28 사람).

## 문구 원칙 (모든 항목 공통)
- 기준 우선순위: **최종 지원서**(Drive `1JmxnFEIxVgG_TqgYZ7nPgjEYhKWfmYIv`, 2026-10-13 판) > 피벗 계획서(`1ndaljIToDnBJ-XjzxHROODf3V8BhEHew`) > 캔버스. 같은 이름의 9월 판 지원서(`1_tFp6G8…`)는 쓰지 않는다.
- 한국어 문장. 영문 슬로건·배지 나열, 상투어(혁신·새로운 미래·엔지니어링합니다·완벽한), 이모지, 그라데이션 배경, 좌측 컬러 보더 카드, 반짝이 아이콘 금지.
- 숫자는 출처 있는 사실만 (해픽: 2025.08 출시 · 11회 업데이트 · v1.0.10 · 온디바이스 경량 모델 · 성수 팝업 2025.12.17–23). "99%"·"100%"·"실시간 보호"·"법적 증거" 금지. 캔버스 타임라인의 "실시간 피부 진단"도 "현장 피부 진단" 등으로 바꾼다.
- 우주데브리스: "발견해서 본인에게 알린다"까지. 삭제 대행·DMCA/내용증명 서식·1-Click 삭제·수작업 90% 절감·법률 판단·증거 능력 약속 없음. "플랫폼별 신고 방법 안내"는 가능.
- 딥페이크: "준비 중", "합성 가능성", "본인이 등록한 얼굴만 대조" 를 함께. 단정·정확도 수치·얼굴 검색으로 읽힐 표현·체험/업로드 금지.
- "AI 보안"은 카테고리 표기로만. 포렌식 석사는 대표 이력에만.
- 법무법인·평판관리 업체는 "도구를 함께 쓰는 곳"으로만 (알선으로 읽히지 않게) — 공개 표기 여부는 미결정.

## 비기능 요구
- 성능: 첫 화면 JS ≤ 50KB (`check-site jsbudget`), 스크롤 연출 transform/opacity, scroll 핸들러 금지. Lighthouse 모바일 Perf ≥ 85 · A11y ≥ 95 · CLS ≤ 0.1. 폰트 preconnect + display=swap, 히어로 이미지 `fetchpriority="high"`, 나머지 `loading="lazy"`.
- 접근성: 실제 `<a>`/`<button>`, 터치 타깃 ≥ 44px, 본문 대비 4.5:1, 이미지 alt, 장식 SVG `aria-hidden`, 다이어그램 SVG 는 `role="img"` + `aria-label`, 390px 가로 스크롤 없음.
- 개인정보: 수집은 구독 이메일 하나. 동의 없이 제출 불가. 미확인 7일 후 삭제·해지 즉시 삭제(스티비 설정, F20). 분석 도구 없음.
- 보안: 허니팟·형식 검증·중복 제출 방지·비밀 키 없음, CSP/referrer meta, HTTPS 강제(Pages 설정 — 배포 점검표).
- 하위 호환: 기존 URL `/about`·`/contact` 는 리다이렉트, `/notes/*` 유지, sitemap 재생성.

## 데이터·마이그레이션
없음. 기존 페이지는 git 이력으로 복원. 쓰지 않는 Gemini 원본 PNG(합계 ~55MB)는 F15 에서 삭제 — 이력에 남는다.

## 순서와 병렬
- core 레인(한 창, 순서대로): F01 → F02·F03·F04 → **F05 → F06 (10.15 전 목표: 히어로·우주데브리스)** → F07 → F08 → F09 → F10 → F11 → F12 → F13 → F14 → F15 → F16 → (F17 사람) → F18 → (F19 사람) → (F20 사람) → F21 → (F22 사람) → F23 → F24 → F25(F30 대기) → F26 → F27 → (F28 사람) → F29.
  - 같은 레인이라도 의존이 없는 F12·F16 은 F05 와 무관하게 먼저 집힐 수 있다.
- 사람 항목 F17(OpenAI 키)·F20(스티비)은 **지금 바로** 해 두면 core 레인이 멈추지 않는다 (F20 은 선행 없음).
- e2e 레인: F30 은 core 의 섹션 항목(F08·F10·F11·F13·F14·F15)이 끝나야 시작. F31·F32·F33 은 F30 뒤 병렬 가능(같은 레인이라 실제로는 순서대로). F34 가 마지막.
- 교차 의존: F25(core) ← F30(e2e, Playwright 설정). F34(e2e) ← F24·F25·F26(core).

## 배포 순서와 롤백
- 이번 범위는 **로컬 확인까지**. 작업 브랜치 `renewal/2026-10` (F01 에서 develop 기준 생성). `deploy.yml` 은 develop push 에만 반응하므로 브랜치 push 는 배포되지 않는다.
- 배포는 사람: F29 점검표 → develop 머지 → Actions → Pages. 롤백 = 머지 커밋 revert (또는 미머지).
- 기능 플래그 없음. 구독은 `SUBSCRIBE_ACTION` 이 비면 "준비 중" 상태로 안전하게 남는다.

## 리스크와 미결정
**리스크**
- 기한: 10.15 까지 이틀. F01~F06 만 먼저 끝나도 브랜치에만 있다 — 프로필 공개 전에 반영하려면 **부분 배포 여부를 사람이 결정**해야 한다 (develop 머지 = 즉시 배포).
- 스티비 공개 구독 엔드포인트의 CORS·필드명 미확인 → F21 에서 확인, 막히면 iframe target 대안(결과 확인 불가 → 낙관적 안내).
- `frontend-design` 스킬은 이 환경 스킬 목록에 없다 → 캔버스 + design.md 토큰·문구 원칙으로 대신. `claude-in-chrome` 은 `anthropic-skills:chrome-browser`; 자동 반복(`claude -p`)에서 못 쓰면 Playwright 스크린샷으로 대신.
- `claude -p` 세션에서 Drive/Artifact 커넥터가 안 될 수 있다 → F01 이 원문을 저장소로 옮겨 두어 이후 항목은 파일만 본다.
- 캔버스 `--color-faint`(#6E716C on #101214) 는 4.5:1 미달 → 본문에 쓰면 a11y 실패. 보조 라벨에만, 또는 토큰 조정.
- Lighthouse 수치는 로컬 기기에 따라 흔들린다 → 3회 중앙값 사용(lighthouse.sh).
- 외부 링크(앱스토어 등)의 실제 응답은 봇 차단으로 자동 확인이 불안정 → 자동 검사는 href 존재까지, 동작은 F28 화면 확인에서 사람이.

**미결정 질문** (기본안으로 진행, 바꾸려면 해당 항목 전에 알려 주세요)
1. 연락 이메일: 기본안 `jaster@itmoss.com` 그대로 (`CONTACT_EMAIL` 한 곳만 바꾸면 됨).
2. 대표 이력: 기본안 "20년" 통일.
3. 팀원 소개 섹션: 기본안 **두지 않음** (실명 동의 전).
4. uzudebris.com 무료 스캔 접수 화면 유무: 기본안 uzudebris.com 링크. 없으면 CTA 를 `#subscribe-form` 으로.
5. 법무법인·평판관리 업체 "함께 쓰는 곳" 공개 표기: 기본안 **표기하되 도구 공급 관계 문장으로**, F27 결과 보고 F28 에서 확정.
6. 구독 서비스: 기본안 **스티비** (Worker+메일 API 는 수신거부·목록 관리를 직접 만들어야 해서 제외).
7. 딥페이크 카드 "기업·기관용": 기본안 유지.
8. 기본 테마: 기본안 다크 + 우주데브리스 섹션만 밝게 (토글 없음).
9. **GA4 제거**: brief 의 CSP(외부 스크립트는 구독·폰트만)·"분석 도구 없음"에 따라 기존 gtag 를 지운다. 유지하려면 F03 전에 알려 주세요 (CSP·개인정보처리방침이 같이 바뀜).
10. 모두의 창업 소식 카드 "자세히 보기" 링크 대상 (플랫폼 프로필 URL) — 없으면 링크 없이 카드만.
11. 10.15 전에 히어로·우주데브리스만 먼저 develop 에 올릴지 (부분 배포).

## 변경 2026-10-13
사용자 결정: **Google Analytics(GA4, `G-FZK5GDSNNR`) 를 유지한다.** 위 "보안 meta" 의 "GA4 제거"와 미결정 9번을 이 절이 대체한다.

- **BaseLayout**: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-FZK5GDSNNR">` 유지. 인라인 초기화(`dataLayer`·`gtag('config', …)`)는 CSP 에서 `'unsafe-inline'` 없이 돌도록 `public/scripts/gtag-init.js`(→ `dist/scripts/gtag-init.js`)로 옮긴다.
- **CSP**: 아래 호스트만 추가한다. 나머지는 위 계약 그대로.
  ```
  script-src  'self' https://www.googletagmanager.com
  connect-src 'self' https://stibee.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com
  img-src     'self' data: https://*.google-analytics.com https://*.googletagmanager.com
  ```
  `script-src` 에 `'unsafe-inline'`·`*`·`'unsafe-eval'` 금지 (F03 must_not).
- **JS 예산**: `check-site jsbudget` 은 자체 번들(`dist/_astro/*.js`)만 센다. gtag.js(외부, async)는 첫 화면 50KB 계산에서 빼고, Lighthouse 수치에는 그대로 반영된다.
- **개인정보처리방침(F14)**: 방문 분석 항목을 추가한다. Google Analytics, 쿠키·이용 기록 수집, 목적(방문 통계), 거부 방법(브라우저 쿠키 설정·Google 애널리틱스 차단 부가기능). 비기능 요구의 "분석 도구 없음"은 "**새 분석 도구 추가 없음, 기존 GA4 만**"으로 읽는다.
- **컴플라이언스(F27)**: GA4 쿠키 고지도 점검 대상에 넣는다.
- **리스크**: gtag.js 가 Lighthouse Performance 를 깎는다. 85 에 못 미치면 F33 에서 원인을 보고하고, 로드를 늦추는 방안(예: `requestIdleCallback` 뒤 삽입)은 사용자 확인 뒤에 적용한다.

| id | 바꾼 것 | 이유 |
| :--- | :--- | :--- |
| F03 | desc·check(GA 스크립트·gtag-init.js·CSP 의 GA 호스트 확인으로 바꿈), must_not(인라인 스크립트 허용 금지) | GA4 유지 |
| F14 | desc·check(`Google Analytics`·`쿠키` 문구 확인 추가) | 분석 쿠키 고지 |
| F27 | desc(GA4 쿠키 고지 점검 추가) | 같은 이유 |

## 변경 2026-10-13 (2)
- `frontend-design` 스킬 설치 완료 (`anthropics/skills@frontend-design`, 전역 `~/.claude/skills/frontend-design`). 위 리스크의 "frontend-design 스킬이 없다" 는 해소 — F05·F06·F08·F09·F10·F11·F13 구현 때 이 스킬로 미적 방향을 정하되, 캔버스 구조와 이 문서의 토큰·문구 원칙이 우선한다.
- brief 의 나머지 스킬은 이미 있다: design:design-handoff · design:design-system · design:ux-copy · design:design-critique · design:accessibility-review · engineering:testing-strategy · engineering:code-review · engineering:documentation · engineering:deploy-checklist · legal:compliance-check · artifact-diagramming · claude-in-chrome(= anthropic-skills:chrome-browser).

## 변경 2026-10-13 (3)
brief 에 디자인 스킬 6개 추가(전역 설치 완료). 항목은 그대로 두고 쓰는 곳만 정한다. 우선순위는 **캔버스 구조 · 이 문서의 토큰·문구 원칙 > 스킬 제안** — 스킬이 색·폰트·문구 원칙과 다른 것을 권하면 따르지 않고 리뷰 문서에 남긴다.

| 스킬 | 쓰는 항목 | 용도 |
| :--- | :--- | :--- |
| `ui-ux-pro-max` | F03, F05 | 위계·색·업종 방향 점검 (토큰 값은 캔버스 유지) |
| `design-taste-frontend` | F05·F06·F09·F11·F13 착수 전 | 템플릿·AI 슬롭 사전 점검 |
| `make-interfaces-feel-better` | F08, F10, F13, F24 | 정렬·모션·마이크로 인터랙션 디테일 |
| `emil-design-eng` | F07, F08, F10 | 스크롤 연출·인터랙션 판단, 과한 모션 억제 |
| `web-design-guidelines` | F24 | 간격·타이포·정보 위계 리뷰 (design-critique 와 함께, 결과는 같은 문서) |
| `accessibility` | F25 | WCAG 2.2 코드 검토 (판정 기준은 AA, accessibility.md 에 합침) |

## 변경 2026-10-13 (4)
사용자 결정: **작업 브랜치 `renewal/2026-10` 을 만들지 않고 현재 브랜치(develop)에서 작업한다.** 위 "배포 순서와 롤백"의 브랜치 문장을 이 절이 대체한다.

- F01 에서 브랜치 생성·확인을 뺐다 (desc·check 수정).
- ⚠ `deploy.yml` 은 develop push 마다 GitHub Pages 에 배포한다. 따라서 **develop 을 push 하면 그 시점의 리뉴얼 진행분이 itmoss.com 에 바로 나간다.** 자동 반복은 `--no-push` 로 돌리고, push 는 사람이 상태를 보고 한다 (부분 배포 여부 = 미결정 11번).
- 롤백: 배포된 경우 해당 커밋 revert 후 push.
- 헤드리스 세션 권한: `.claude/settings.json` 허용 목록에 Drive 읽기 · Artifact · Skill · 빌드/테스트 명령(npm run · node · npx astro/playwright/lighthouse · gen_images · make images 등)을 추가했다.

## 변경 2026-10-13 (5)
사용자 결정: **구독 폼(스티비)을 이번 범위에서 뺀다 — 다음 단계에서 한다.** 위 계약의 "구독 폼" 절, CSP 의 `stibee.com`(connect-src·form-action), 개인정보처리방침의 구독 항목, 끝 기준의 구독 1회 통과는 이번에 적용하지 않는다.

- loop.py 에 항목 삭제가 없어 해당 항목은 **사람 항목 + `[제외 · 나중에]`** 로 바꿔 AI 가 집지 않게 했다: F12(subscribe.js·단위 테스트) · F20(스티비 설정) · F21(스티비 연동) · F22(실구독 확인) · F31(구독 e2e). 다시 할 때는 owner·desc 를 되돌리고 의존을 다시 건다.
- 남은 항목에서 구독 부분을 덜었다:

| id | 바꾼 것 |
| :--- | :--- |
| F02 | check 에서 `## 구독 폼` 절 요구 삭제 |
| F13 | 연락 섹션만 (메일 링크 + `/privacy/` 링크), 의존 F05 만. must_not: `src` 에 subscribe-form·stibee 가 생기면 경계 위반 |
| F14 | 처리방침은 GA4(쿠키·이용 기록·목적·거부 방법)·시행일·문의처만 |
| F23 | README 의 `## 구독 폼 설정` 요구 삭제, 의존 F16 만 |
| F26 | 코드 리뷰 범위 = CSP(GA4 호스트)·외부 링크·이미지·키 노출, 의존 F15·F18 |
| F27 | 정보통신망법(광고성 정보) 절 삭제, 의존 F02·F14 |
| F34 | 단위 테스트 단계 삭제, 의존에서 F31 삭제 |

- CSP 는 `connect-src 'self'` + GA4 호스트, `form-action 'self'` 로 둔다.
- F01: 헤드리스 세션이 캔버스를 Artifact 대신 Claude Docs 도구로 읽으려다 두 번 막혀, 캔버스 사본(`docs/renewal/canvas/Main.dc.html`)은 계획 세션이 넣었다. `sources.md` 는 F01 세션이 Drive 에서 작성한 것(stash 에서 복원). 둘 다 커밋됨 — F01 은 다음 세션이 check 통과로 done 처리한다.

## 변경 2026-10-13 (6)
사용자 요청: **디자인 캔버스 시안을 `http://localhost:4321/` 에서 직접 보며 시뮬레이션한다.**

- 새 항목 **F35** (core, F01 뒤): `src/pages/preview/canvas.astro` → dev 서버에서 `/preview/canvas/` 로 캔버스 `Main.dc.html` 을 렌더.
  - 캔버스 런타임(`support.js`, `<x-dc>`, `<helmet>`, `data-dc-script`)은 저장소에 없으므로 걷어내고, `<helmet>` 안의 폰트 `<link>`·`<style>` 은 그대로 살리며, `{{accent}}` 는 `#FF6A2B` 로 치환한다.
  - **dev 전용**: prod 빌드(`import.meta.env.PROD`)에서는 `/` 로 리다이렉트만 내보낸다 → 배포 산출물에 시안 문구가 들어가지 않는다 (must_not 이 확인). 따라서 `check-site copy` 등 산출물 검사와 충돌하지 않는다.
  - 시안 파일의 hex 색은 미리보기 전용이라 `check-site colors` 범위(`src/pages/*.astro` 최상위) 밖인 `src/pages/preview/` 에 둔다.
- 순서: 시안 확인을 먼저 할 수 있게 F03 · F04 · F16 의 depends_on 에 F35 를 추가했다 (F02 → F35 → 나머지).
- 실제 리뉴얼 페이지 `/` 는 이전처럼 F05 부터 바뀐다. 그 전까지 `/` 는 기존 페이지 그대로라 비교용으로 쓸 수 있다.

## 변경 2026-10-13 (7)
사용자 결정: **로고를 새 로고(잎 모양 녹색 마크 + 소문자 워드마크 `itmoss`)로 바꾼다.** 원본: `docs/renewal/brand/itmoss-logo-source.png` (842×203, 배경이 불투명한 거의 흰색 #FEFEFC, 마크 #257833, 글자 #151F1D).

- 새 항목 **F36** (core, F01 뒤): `scripts/make-logo.sh`(ImageMagick)로 배경 제거·변환 → `public/images/brand/`
  | 파일 | 용도 |
  | :--- | :--- |
  | `logo-on-dark.webp` | 다크 그래파이트 위 (헤더·푸터 기본) — 워드마크를 밝은 색(`--color-paper` 계열)으로, 마크는 녹색 유지 |
  | `logo-on-light.webp` | 밝은 배경 위 (원색) — 우주데브리스 밝은 섹션 등 |
  | `logo-mark.webp` | 마크만 |
  | `favicon-32.png` · `apple-touch-icon.png`(180) | 파비콘 |
  | `manifest.json` | 파일별 width·height (`<img>` 에 지정) |
- **F03** 수정: 헤더·푸터 로고 = `logo-on-dark.webp`, 파비콘 교체, 옛 `logo-itmoss.png` 참조 금지(must_not), 토큰에 `--color-leaf: #257833` 추가. 의존 F01·F35·F36.
- 캔버스 헤더의 텍스트 로고(`ITMOSS`, Plex Mono)는 이미지 로고로 대체한다. 본문에서 회사 이름은 "아이티모스" / "ITMOSS" 그대로 쓴다.
- 접근성: 로고 `<img alt="아이티모스 itmoss">`, 홈 링크로 감싼다. 로고는 WCAG 대비 기준 예외지만 다크 배경에서 워드마크가 읽혀야 하므로 밝게 바꾼다.
- 리스크: 원본이 저해상도 PNG 라 2배 이상 키우면 흐려진다 → 표시 높이 28~40px. **SVG 또는 고해상도 원본이 있으면 교체**(미결정 12).
- 미결정 13: 로고 녹색(#257833)과 사이트 강조색 시그널 오렌지(#FF6A2B)를 같이 쓸지. 기본안: 녹색은 로고에만, 강조색은 오렌지 유지.
- 헤드리스 세션 허용 목록에 `magick` · `bash scripts/make-logo.sh` · dev 확인용 `curl -sf http://localhost:*` · `pkill -f astro dev` 추가.

## 변경 2026-10-13 (8)
사용자 결정: **홈페이지에 회사 주소를 넣지 않는다. 국문(한국어)이 기본이다.**

- 주소: 푸터·연락 섹션·JSON-LD(`address`)·개인정보처리방침 어디에도 주소(캔버스의 "경기도 의정부" 포함)를 쓰지 않는다. 푸터는 회사명 + © 만. 문의는 메일 링크로.
- 언어: 모든 페이지 `<html lang="ko">`, `og:locale` `ko_KR`. 화면 문구는 한국어 문장이 기본이고, 영문은 고유명사(JVL, itmoss 로고 등)만. 옛 다국어 컴포넌트 `src/components/i18n/T.astro`(기본 렌더가 영문)와 `data-en` 속성은 삭제한다. 영문 페이지는 이전과 같이 다음 단계.
- 이미 끝난 F02(copy.md 푸터 줄)·F03(BaseLayout 푸터)에 주소가 들어가 있어 정리 항목 **F37** 을 추가했다 (의존 F05·F15 — 옛 홈·about·contact 가 T.astro 를 쓰므로 그 교체 뒤). F05~ 이후 항목은 처음부터 주소·영문 기본 문구를 넣지 않는다.

## 변경 2026-10-13 (9)
사용자 결정: **기존 `/about`(itmoss.com/about) 내용을 새 홈에 포함한다. "만드는 사람들"에서 Wilson(AI Collaborator)은 뺀다.** 미결정 3(팀 소개 섹션 두지 않음)을 이 절이 대체한다 — 팀 소개는 Jaster 1명으로 둔다.

- 섹션 순서 계약 변경: 히어로 → 두 엔진 → 우주데브리스 → 해픽 → 소식·걸어온 길(`#record`) → **회사 소개(`#about`)** → 연락(`#contact`). 내비: 우주데브리스 · 해픽 · 소식 · **회사** · 연락.
- `#about` 내용 (원문 `src/pages/about.astro` 의 국문 필드):
  - 철학: "오직 소비자를 위한 서비스, 그 의미있는 기술", 이끼처럼 깔리는 '디지털 토양', 기술은 보이지 않는 조력자.
  - 공존의 5원칙: 디지털 황무지의 토양 · 아래에서 받치는 존재(Bottom-up) · 노이즈를 걸러내다 · 잠그지 않는다(Lock-in 거부) · 이끼처럼 조용히. 영문 배지는 한국어 문장으로 바꾸고, "새로운 시대의 주체" 같은 상투어는 문구 원칙대로 고친다.
  - 만드는 사람들: **Jaster** (Founder · Designer, LinkedIn `https://www.linkedin.com/in/jaster1838`) + 대표 이력(20년, 포렌식 석사는 여기서만). Wilson·AI Collaborator·로봇 아이콘 없음.
- 새 항목: **F38** 카피(`copy.md ## 회사 소개`) → **F39** 섹션 `src/components/home/About.astro`.
- 수정: **F15** `/about` 리다이렉트 대상 `/#record` → `/#about`, F39 뒤로(5원칙 이미지를 쓰면 F39 가 webp 로 변환한 뒤 원본 PNG 삭제). **F11** 대표 이력은 F39 로 옮김. **F30** e2e 는 F39 뒤.
- 대표 흐름 1(심사자·멘토)의 마지막 "대표 이력"은 `#about` 의 만드는 사람들이다.

## 변경 2026-10-13 (10)
- 순서: 사용자 요청으로 이미지(F16 → F18)를 core 레인 맨 앞으로. 방법은 F07·F11·F13 의 depends_on 에 F18 추가 (순서용 선행, 기능 의존 아님).
  F18 이 보류되면 이 셋도 막히므로, 그때는 F18 을 빼서 원래 선행(F05)으로 되돌린다.

## 변경 2026-10-13 (11)
- 사용자 요청: `make dev` 를 다시 시작해도 에러가 없어야 한다 → **F40** (core, 선행 없음).
  - 검사: `scripts/dev-smoke.sh` — astro dev 를 포트 4331 로 띄움(사용자의 4321·Playwright 4330 과 겹치지 않게) → `/`, `/privacy/`, `/preview/canvas/` 200 → 서버 로그에 에러 줄 없음 → 종료. 재시작을 재현하려고 2회 연속.
  - 경계: 로그 수준을 낮추거나(`logLevel silent/error`, `--silent`) 에러 출력을 버리는 식으로 통과시키지 않는다.

## 변경 2026-10-13 (12)
- 사용자 요청: "#haepick 은 해픽 브랜드 이미지를 찾아 넣고, 어두울 필요 없이 밝게" → **F41** (core, 선행 F10·F18).
  - 테마: 기존 "다크 + #uzudebris 만 밝게" 기본을 바꿔 **#haepick 도 밝은 섹션**. 바로 위 #uzudebris(paper)와 붙으므로 다른 밝은 면이나 경계로 구분. 색은 tokens.css 토큰만.
  - 이미지: 생성 컷 `renewal/haepick-phone.webp` 대신 App Store 공개 자료(조회 API `itunes.apple.com/lookup?id=6748489765&country=kr` — 앱 아이콘 artworkUrl512, 스크린샷 screenshotUrls)를 받아 `public/images/haepick/*.webp` 로 자체 호스팅. 출처는 `public/images/haepick/sources.json`. mzstatic 핫링크 금지.
  - F10 인식 박스 좌표는 생성 이미지 기준이었으므로 새 스크린샷에 맞춰 다시 잡거나 뺀다.
  - 실제 화면 사용 허락(우당네트웍)은 여전히 F19 사람 확인 항목 — push(배포) 전에 확인.

## 변경 2026-10-13 (13)
- 히어로 h1·홈 `<title>`·og:title: "영상을 만드는 기술로, 영상을 지킵니다" → **"영상 해킹에 맞서는 단 하나의 솔루션, 우주데브리스"** (사용자 결정, 커밋 반영). copy.md 갱신.
  - "단 하나의" 는 근거 없는 최상급 표현이라 brief 의 과장 금지·표시광고법과 부딪칠 수 있음을 알렸고, 사용자가 유지로 결정. **F28 컴플라이언스 확인 때 이 문구를 함께 본다.**
  - 이후 항목은 이 h1 을 되돌리지 않는다. 회사 소개용 description·JSON-LD 의 "영상을 만드는 기술로 영상을 지키는 비전 AI" 는 회사 설명이라 그대로 둔다.

## 변경 2026-10-14
- F26 경계 조정(사용자 승인): 기존 must_not 은 `api[_-]?key` 등 **이름**에도 걸려, 설계상 `OPENAI_API_KEY` 를 읽어야 하는 gen_images.py 때문에 항상 exit 0(통과 불가)였다.
  → 키 **값** 패턴(`sk-…20자+`, `AKIA…`)이 src·public·scripts 에 있거나 `.env` 가 git 에 추적되면 위반으로 바꿈. unhold.

## 변경 2026-10-14 (2)
- 사용자 요청: "디자인에 우주 지구본" → 위치 **히어로**, 방식 **3D WebGL** (사용자 선택) → **F42** (core, 선행 F05·F07·F18).
  - 히어로의 생성 이미지 슬롯(RenewalImage hero, 16:7)을 `src/components/home/HeroGlobe.astro` 의 `<canvas data-globe>` 로 교체. 히어로 생성 이미지 `hero.webp` 는 쓰지 않게 됨(F19 판정 대상에서 빠짐).
  - 예산: 첫 화면 JS ≤ 50KB(jsbudget)와 CSP(외부 스크립트 금지)를 지키려고 번들되는 경량 WebGL 라이브러리(권장 `cobe`)만. three.js·CDN 금지(must_not).
  - 성능·접근성: 고정 비율 상자(CLS 0), 첫 페인트 뒤 초기화, DPR ≤ 2, 화면 밖·탭 숨김 시 정지, reduced-motion 이면 정지 장면, WebGL 미지원은 정적 대체. 장식이므로 aria-hidden.
  - 연출: 점 지구 자전 + 궤도 파편 중 하나만 signal 오렌지 = "발견" (우주데브리스 은유). 색은 토큰만.

## 변경 2026-10-16
- 사용자 요청: "해픽 소개는 https://haepick.ai/ko 의 촬영하는 부분을 참고" → **F43** (core, 선행 F41).
  - 참고 원본: haepick.ai/ko 섹션 3 "촬영해!픽 — 이 화장품, 나한테 맞을까? 궁금한 화장품을 찍으면 제품 정보를 분석하고 내 피부에 맞는지 확인해드립니다". 그림 `landing/ko/s3-obj.webp` (움직이는 webp 42프레임: 파란 휴대폰 + 스캔 틀 속 세럼병 + 스캔선).
  - 그림은 `public/images/haepick/capture.webp` 로 자체 호스팅, 동작 줄이기면 첫 프레임 `capture-still.webp` (`<picture>` media 분기). 출처 sources.json.
  - 4단계는 F41 에서 지적된 "스크린샷과 안 맞음"을 풀도록 촬영 흐름(찍기 → 제품 인식 → 분석 → 내 피부 적합도)으로 다시 쓴다.
  - 해픽 공식 자산 사용 허락은 F19(우당네트웍)에 포함.

## 변경 2026-10-16 (2)
- 사용자 결정 문구(이후 항목이 바꾸지 않는다, F43 포함): #haepick h2 = **"스캔 한 번에, 나만의 성분 확인."**, 리드 = "아이티모스의 JVL 비전 엔진이 상용 앱 「해픽」과 함께하고 있습니다. 제품을 스캔하면 바로 인식하고, 성분을 읽어 내 피부 기준으로 분석해 줍니다." · 엔진 라벨 "01 · 온디바이스 비전 AI" / "02 · 영상 보안 AI", 02 제목 "영상 해킹 엔진" · 히어로 리드·"협업 문의" 버튼 제거(사용자 직접 수정). copy.md 반영.
- "유일한 영상해킹 솔루션"(엔진 02 쓰는 곳)·"단 하나의 솔루션"(히어로)은 근거 없는 최상급 — F28 에서 함께 확인.

## 변경 2026-10-16 (3)
- 사용자 요청: "스크롤하는 단계도 이미지나 아이콘이 있어야" → **F44** (core, 선행 F43 — 해픽 단계가 F43 에서 촬영 흐름으로 바뀐 뒤).
  - 대상: #haepick `li[data-stage]` 4개 + #uzudebris `li[data-step]` 3개 (스크롤로 지나가는 단계 전부, 두 섹션 통일).
  - 방식: 인라인 SVG 아이콘 컴포넌트 `src/components/icons/*.astro` (stroke=currentColor, aria-hidden). 단계 점등과 함께 아이콘도 켜짐(transform/opacity, reduced-motion 정지). JS 추가 없음. 아이콘 폰트·CDN 금지.
- 사용자 결정(2026-10-16): 만드는 사람들의 Jaster **이력 목록(Watcha·Spoon·Bithumb Live·해픽 출시·사이버포렌식 석사) 제거**. 이름·역할·한 줄·LinkedIn 은 유지. 이후 항목이 다시 넣지 않는다. (포렌식 석사 언급도 이로써 사이트에서 빠짐)
- 사용자 결정(2026-10-16): Jaster 역할 = **"대표 / 영상해커 / 식물키우는개발자"**.
- 사용자 결정(2026-10-16): Jaster 한 줄 소개("영상 스트리밍과 트랜스코딩을 20년…") **삭제**. 만드는 사람들 = 이름·역할·LinkedIn 만.

## 변경 2026-10-16 (4)
- 사용자 요청: "전체 디자인을 AI 티 안 나게 보정, 이미지를 image2(gpt-image-2)로 더 퀄리티 있게, 지구가 들어간 이미지 필요".
- **F45 이미지 재생성** (선행 F18·F39·F41): image_prompts.json guard 를 사진/에디토리얼 톤으로(실제 렌즈·자연광·질감, 플라스틱 광택·네온·보라 그라데이션·글로우 금지). 슬롯: uzudebris-dashboard 재생성, uzu-flow-register/predict/match/notify, principle-1~5(옛 Gemini 5원칙 그림 대체), **uzudebris-earth 신규**(우주에서 본 지구 + 궤도 파편, 하나만 오렌지 — #uzudebris 머리 키비주얼). hero·haepick-phone·bg 는 안 씀. 30장 한도 안, 슬롯당 최대 2회.
  - 지구 이미지 위치는 기본값으로 #uzudebris 머리(히어로는 F42 3D 지구본). 다른 자리를 원하면 바꾼다.
- **F46 디자인 보정** (선행 F42·F43·F44·F45 — 마지막에): 390/768/1280 캡처 점검 → docs/renewal/reviews/design-polish.md 표 10행+. 반복 카드·가운데 정렬 남발·의미 없는 그라데이션/글로우·과한 라운드·3열 템플릿·상투어·간격 리듬·타이포 위계·상태(hover/focus/active) 점검. 사용자 확정 문구는 유지(check 가 확인), 이모지·상투어(seamless·혁신적인·차세대 등)는 must_not.

### 2026-10-16 히어로 지구본 보정 (사용자 직접 요청, 루프 밖)
- 지구본 점마다 실사 영상 썸네일을 빼곡히(110개, 피보나치 분포) 겹친다 — 스프라이트 한 장 `public/images/renewal/globe-clips.webp`(6×4, 슬롯 globe-clips, gpt-image-2 1장 · 누적 13/30). 발견 1개만 signal 테두리·검출 모서리·타임코드. 위치는 heroglobe.js 가 cobe 투영식을 그대로 계산.
- 히어로 h1 의 "우주데브리스" 한 단어만 무지개 빛 흐름(`.hero__rainbow`, 토큰 `--rainbow-1..6`). reduced-motion 이면 정지.

# itmoss-site

itmoss.com 홈페이지. Astro 4 + Tailwind + MDX, 정적 빌드(`dist/`)를 GitHub Pages 로 내보낸다.

## 로컬 실행

Node.js 20 기준 (Actions 빌드와 같은 버전).

```bash
npm ci            # 또는 make install
npm run dev       # 또는 make dev → http://localhost:4321
```

빌드 결과 확인:

```bash
npm run build     # dist/ 생성
npm run preview   # dist/ 를 로컬에서 서빙
```

- `/preview/canvas` 는 dev 전용 시안 페이지다. prod 빌드에서는 `/` 로 리다이렉트만 남는다.
- 문의 메일 주소는 `src/config/site.js` 의 `CONTACT_EMAIL` 한 곳에서 바꾼다.

## 이미지 생성

홈 이미지는 `scripts/gen_images.py` 가 OpenAI 이미지 API 로 만든다 (stdlib 만 사용).

```bash
make images                 # 전체 슬롯
make images SLOTS=hero      # 한 슬롯만 다시
make images DRY=1           # 키·네트워크 없이 계획만 출력
```

- 키: 루트 `.env` 에 `OPENAI_API_KEY=...` (커밋하지 않는다). 키가 없으면 아무것도 만들지 않고 정상 종료하고, 화면은 같은 비율의 빈 프레임으로 돈다.
- 선택 환경 변수: `OPENAI_IMAGE_MODEL` (기본 `gpt-image-2`), `OPENAI_IMAGE_QUALITY` (기본 `high`).
- 슬롯·프롬프트: `scripts/image_prompts.json`. 컷에는 글자·로고·실제 얼굴을 넣지 않는다 — 문구는 DOM 이 얹는다.
- 결과: `public/images/renewal/*.webp` (장당 300KB 이하, `cwebp` 가 있으면 줄인다) + `manifest.json`. 컴포넌트는 매니페스트의 width/height 를 쓴다.
- 예산: 누적 30장. 매니페스트의 `generated_total` 이 30 에 닿으면 생성을 거부한다.

로고는 `bash scripts/make-logo.sh` (ImageMagick 필요) 로 배경을 지워 `public/images/brand/` 에 만든다.

## 검사

`scripts/check-site.mjs` (node 내장만):

```bash
node scripts/check-site.mjs all          # build → copy → colors → images → links → jsbudget
node scripts/check-site.mjs --self-test  # 각 검사가 위반을 실제로 잡는지 확인
```

| 명령 | 실패 조건 |
| :--- | :--- |
| `build` | `npm run build` 실패 또는 출력에 `[WARN]`·`error` |
| `copy [경로…]` | 화면에 나가는 텍스트(본문·alt·title·aria-label·meta content)에 금지어 |
| `colors` | `src/components`, `src/layouts`, `src/pages/*.astro` 에 hex·rgb()·hsl() 직접 사용 (`src/styles/tokens.css` 만 예외) |
| `images` | `<img>` 에 width·height 없음, webp/avif 아님, 300KB 초과 |
| `links` | `href="#x"` 대상 id 없음, uzudebris.com·App Store·Google Play 링크 누락 |
| `jsbudget` | 첫 화면이 불러오는 `dist/_astro/*.js` 합계 50KB 초과 |

`make check` 는 Node·npm·Astro 설치 여부만 본다.

## 배포

GitHub Pages. `.github/workflows/deploy.yml` 이 **`develop` 브랜치에 push 될 때마다** `npm ci && npm run build` 후 `dist/` 를 배포한다 (Actions 탭에서 수동 실행도 가능).

- **develop push = 곧바로 itmoss.com 배포.** 작업 중인 변경을 push 하기 전에 `node scripts/check-site.mjs all` 을 통과시킨다.
- 도메인: `public/CNAME` (itmoss.com), base 는 `/`.
- 롤백: 문제 커밋을 `git revert` 해서 develop 에 다시 push.

## 구조

- `src/pages/index.astro` — 홈. 섹션은 `src/components/home/*.astro`
- `src/pages/privacy.astro` — 개인정보 처리방침
- `src/pages/notes/*.mdx` — 노트
- `src/layouts/BaseLayout.astro` — 공통 레이아웃
- `src/styles/tokens.css` — 색 토큰 (색 값은 여기에만)
- `src/config/site.js` — 사이트 설정 (문의 메일 등)
- `loops/` — 작업 루프 기록 (`python3 scripts/loop.py status`)

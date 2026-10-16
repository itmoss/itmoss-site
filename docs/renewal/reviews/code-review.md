# 코드 리뷰 — 보안·개인정보 (F26)

- 날짜: 2026-10-16 · 방법: engineering:code-review 관점으로 `src/`·`public/`·`scripts/` 와 빌드 결과 `dist/**/*.html` 점검
- 범위(design.md 변경 2026-10-13 (5)): CSP meta(GA4 호스트) · 외부 링크 rel · 이미지 최적화 · 키 노출

## 1. CSP meta (`src/layouts/BaseLayout.astro`)

| 지시어 | 값 | 판정 |
| :--- | :--- | :--- |
| script-src | `'self' https://www.googletagmanager.com` | OK — `'unsafe-inline'`·`'unsafe-eval'`·`*` 없음 |
| connect-src | `'self'` + `*.google-analytics.com` · `*.analytics.google.com` · `*.googletagmanager.com` | OK — 계약 그대로 (구독 제외로 stibee 없음) |
| img-src | `'self' data:` + GA 두 호스트 | OK |
| style-src | `'self' 'unsafe-inline' https://fonts.googleapis.com` | 계약 그대로 (Astro scoped style 때문에 필요) |
| font-src · form-action · frame-src · base-uri · object-src | gstatic · `'self'` · `'none'` · `'self'` · `'none'` | OK |

- `dist/` 의 `<script>`: JSON-LD(데이터 블록) · gtag.js(외부, 허용 호스트) · `/scripts/gtag-init.js` · 번들 모듈(`/_astro/*.js`) 뿐. **인라인 실행 스크립트 0, `on*=` 인라인 핸들러 0.**
- `referrer` meta `strict-origin-when-cross-origin` 있음.
- `frame-ancestors` 는 meta 로 안 되므로 없음(계약대로). 클릭재킹 방지 헤더는 GitHub Pages 에서 못 넣는다 — 참고만.
- `/preview/canvas/` 는 dev 전용, prod 빌드는 `/` 리다이렉트만 낸다 (캔버스 HTML 이 배포되지 않음).

## 2. 외부 링크 rel

| 링크 | 위치 | 조치 |
| :--- | :--- | :--- |
| gbsa.or.kr (새 창) | `src/components/home/News.astro` | **고침** — `rel="noopener"` → `rel="noopener noreferrer"` (사전 점검 지적) |
| LinkedIn (새 창) | `About.astro` | 이미 `noopener noreferrer` |
| GA 차단 부가기능 (새 창) | `privacy.astro` | 이미 `noopener noreferrer` |
| uzudebris.com · App Store · Google Play (같은 창) | `CaseUzudebris.astro` · 해픽 | `target` 없음 → 탭 탈취 위험 없음. 리퍼러는 meta 정책으로 origin 만 나감 — 그대로 둠 |

## 3. 이미지

- `node scripts/check-site.mjs images` 통과 — 모든 `<img>` 에 width·height, webp/avif, 300KB 이하.
- 매니페스트(`public/images/renewal/manifest.json`)에는 프롬프트·모델명만 있고 키·개인정보 없음.

## 4. 키·비밀 노출

- `src`·`public`·`scripts` 에 키 값 패턴(`sk-…`·`AKIA…`) 없음 (F26 must_not).
- `scripts/gen_images.py` 는 키를 루트 `.env` 의 `OPENAI_API_KEY` 에서 읽기만 한다(이름만 코드에 있음). `.env`·`.env.*` 는 `.gitignore` 에 있고 추적되지 않음.
- 프런트에 들어가는 식별자는 GA 측정 ID(`G-FZK5GDSNNR`, 공개값)와 연락 메일뿐 — 비밀 아님.

## 5. 개인정보

- 수집 경로는 GA4 뿐(구독 폼 제외). 처리방침(`/privacy/`)에 GA 쿠키·목적·거부 방법 고지 있음 — 법적 판단은 F27·F28.
- 폼·쿠키 직접 설정·로컬 스토리지 사용 없음.

## 참고 (지적 아님)

- GA4 에서 Google 신호(광고 기능)를 켜면 `*.g.doubleclick.net` 요청이 CSP 에 막힌다. 지금은 켜지 않은 전제 — 켜려면 계약(CSP) 변경이 필요하다.

남은 보안·개인정보 지적: 0

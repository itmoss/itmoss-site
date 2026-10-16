# 접근성 리뷰 (F25) — WCAG 2.1 AA

- 일자: 2026-10-16
- 범위: `/` · `/privacy/` · `/notes/` · `/404.html` (빌드 결과, astro preview :4330), 뷰포트 390×844 · 1280×800
- 방법: `design:accessibility-review` 체크리스트(대비·키보드·터치 44px·스크린리더) + `accessibility` 스킬(WCAG 2.2 코드 검토, 판정은 AA)
- 자동 검사: `tests/e2e/a11y.spec.mjs` — axe(`wcag2a` `wcag2aa` `wcag21a` `wcag21aa`, 규칙 제외 없음), 터치 타깃 ≥ 44px, 첫 Tab 포커스 표시
  - 대비 검사는 `prefers-reduced-motion: reduce` + 끝까지 스크롤한 뒤(스크롤 연출이 다 펼쳐진 상태) 돈다.

## 발견과 조치

| # | 기준 | 위치 | 문제 | 조치 | 상태 |
| :- | :- | :- | :- | :- | :- |
| 1 | 2.5.5/2.5.8 터치 타깃(사이트 기준 44px) | 헤더 내비 `소식`·`회사`·`연락` | 두 글자 링크 폭 24–28px (높이는 44) | `.site-nav a` 에 `min-width: var(--tap-min)` + 가운데 정렬 (`BaseLayout.astro`) | 해결 |
| 2 | 2.5.3 이름 안의 레이블 | 연락 섹션 `.contact__mail` | `aria-label` "아이티모스에 메일 보내기 (주소)" 가 보이는 글자(주소)로 시작하지 않아 음성 제어로 부르기 어려움 | `aria-label` 을 "주소 로 아이티모스에 메일 보내기" 로 — 보이는 글자로 시작 (`Contact.astro`) | 해결 |
| 3 | 1.4.3 대비 | `/notes/` 목록 | 예전 밝은 테마 잔재: `.card`(흰 바탕) 위에 상속된 paper 글자, `--muted`(#64748b) on ink ≈ 3.9:1 | 다크 토큰(`--color-muted` · `--color-signal` · `--color-line`)으로 다시 씀, `.card`·옛 변수 제거 (`notes/index.astro`) | 해결 |

## 수동 점검 (자동 검사가 못 보는 것)

| 항목 | 결과 |
| :- | :- |
| 키보드 | 첫 Tab = "본문 바로가기"(`.skip-link`, 포커스 시 화면에 나타남) → 로고 → 내비. 모든 컨트롤이 실제 `<a>`/`<button>`. 포커스 링 `:focus-visible` 2px signal(밝은 섹션은 ink) |
| 스크린리더 | `<html lang>`(ko), 랜드마크 header/nav(aria-label "주 메뉴")/main/footer, 섹션마다 `aria-labelledby` h2, 로고 `alt="아이티모스 itmoss"`, 아이콘 SVG·지구 캔버스 `aria-hidden`. 흐름 다이어그램은 이제 SVG 가 아닌 이미지(alt 있음, axe image-alt 통과) |
| 대비 | 본문·보조 문단은 `--color-paper`/`--color-muted`(다크), `--color-muted-on-paper`(밝은 바탕). `--color-faint` 는 본문에 쓰지 않음 → 토큰 조정 불필요. 밝은 바탕 위 오렌지 글자는 `--color-signal-ink` |
| 모션 | `prefers-reduced-motion` 이면 스크롤 연출·지구 자전·화살표 이동 정지, `scroll-behavior: auto` |
| 390px | 가로 스크롤 없음 (`layout.spec.mjs` 와 함께 통과) |
| 리플로우·확대 | 단위 rem/clamp, 고정 높이 텍스트 상자 없음 |

## 결과

- `npx playwright test` 40/40 통과 (a11y 12 포함, mobile·desktop)

AA 위반: 0

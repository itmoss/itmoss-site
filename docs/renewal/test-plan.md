# 리뉴얼 테스트 계획 (e2e 레인)

> 기준: `loops/modu/design.md` 의 서비스 간 계약(페이지·앵커, 소식 데이터, 구독 폼, 보안 meta, 테스트). e2e 는 **검증만** 한다 — 실패 원인 수정은 core 항목으로 넘긴다.

## 1. 피라미드

| 층 | 도구 | 무엇을 | 위치 |
| :--- | :--- | :--- | :--- |
| 정적 검사 | `node scripts/check-site.mjs all` | 빌드 경고·금지어·색 하드코딩·이미지 규격·앵커/필수 링크·JS 예산 | core (F23·F24) |
| 단위 | `node --test tests/unit/` | 순수 함수(구독 검증 등 — 구독은 현재 `[제외 · 나중에]`) | core |
| 브라우저 e2e | Playwright (`playwright.config.mjs`) | 실제 렌더링 결과: 레이아웃·링크·소식 순서·연출·접근성 | e2e (F30~F33) |
| 품질 예산 | `scripts/lighthouse.sh` | 모바일 Perf ≥ 85 · A11y ≥ 95 · CLS ≤ 0.1 | e2e (F34) |

정적 사이트이고 서버 로직이 없으므로 통합 테스트 층은 두지 않는다. 화면 결과는 빌드 산출물(`dist`)을 `astro preview` 로 띄워 확인한다 — dev 서버가 아닌 실제 배포물과 같은 HTML 을 본다.

## 2. 실행

```
npx playwright install chromium        # 최초 1회
npx playwright test                    # 전체
npx playwright test tests/e2e/news.spec.mjs
```

- webServer: `npm run build && npx astro preview --port 4330`, baseURL `http://localhost:4330` (dev 4321·dev-smoke 4331·Lighthouse 4329 와 겹치지 않음). 로컬에서는 이미 떠 있는 서버를 재사용한다.
- 프로젝트: `mobile`(390×844) · `desktop`(1280×800), Chromium.
- 외부 요청(GA·Google Fonts)은 `tests/e2e/helpers.mjs` 의 `offline()` 이 끊는다 — 결과가 네트워크·분석 수집에 기대지 않게, 테스트가 GA 에 기록을 남기지 않게.
- `forbidOnly: true`. `test.skip` · `test.fixme` · `.only(` 는 쓰지 않는다 (F30 경계 조건).

## 3. 스펙과 기준

### layout.spec.mjs — 390px 가로 스크롤 없음
| 대상 | 기준 |
| :--- | :--- |
| `/`, `/privacy/` | 끝까지 스크롤해 연출을 다 펼친 뒤 `documentElement.scrollWidth`·`body.scrollWidth` ≤ 390 |
| 같은 페이지 | `overflow-x: hidden/clip` 조상이 없는 보이는 요소 중 화면 밖(좌·우)으로 나간 것 0 — `body{overflow-x:hidden}` 같은 가림으로 통과하는 것을 막는다 |
| `/` | 섹션 `#top → #engines → #uzudebris → #haepick → #record → #contact` 가 하나씩, 이 순서로 |

### links.spec.mjs — 내부 앵커 · 외부 링크
| 대상 | 기준 |
| :--- | :--- |
| `/` 의 `a[href^="#"]` | 대상 id 가 모두 존재 |
| 내비 | `#uzudebris` `#haepick` `#record` `#contact` 포함, 누르면 URL 해시가 바뀌고 섹션이 화면 안 |
| `/privacy/` 내비 | 모두 `/#id` 형식이고 그 id 가 홈에 있음 |
| `/privacy/` | 홈에서 링크가 있고 200, 본문에 "개인정보" |
| 옛 경로 | `/about` → `/#about`, `/contact` → `/#contact` (meta refresh, astro.config `redirects`) |
| 외부 링크 | uzudebris.com · apps.apple.com · play.google.com · www.gbsa.or.kr 가 있음, 전부 `https://`, `target=_blank` 이면 `rel` 에 noopener·noreferrer |
| 메일 | `mailto:…@itmoss.com` |

### news.spec.mjs — 소식 순서
| 대상 | 기준 |
| :--- | :--- |
| `src/data/news.json` | GBSA 항목이 모두의 창업 항목보다 앞 |
| `#record .news__card` | 개수·제목이 news.json 과 같은 순서, GBSA 카드가 모두의 창업 카드보다 앞 |
| 카드 | `날짜 · 태그` 표기, `href` 있으면 그 링크(없으면 링크 없음), `logo` 있으면 그 이미지 |
| `#top` | "모두의 창업" 문구 없음 (히어로에 소식 넣지 않음) |

### 뒤 항목 (같은 설정 위에 추가)
- `motion.spec.mjs` (F32): `prefers-reduced-motion: reduce` 에서 `data-reveal`·`data-step` 이 모두 보임, JS 비활성에서도 내용 보임, scroll 핸들러 없음.
- `a11y.spec.mjs` (F33): `@axe-core/playwright`, wcag2a/2aa 위반 0 — `/`, `/privacy/`.
- `subscribe.spec.mjs` (F31): 구독이 `[제외 · 나중에]` 라 보류. 다시 할 때 route 가로채기로 엔드포인트 대체(실제 스티비로 보내지 않음).
- Lighthouse (F34): `scripts/lighthouse.sh`, preview :4329.

## 4. 실패 처리
- e2e 가 실패하면 테스트를 느슨하게 고치지 않는다. 앱 쪽 원인이면 core 항목으로 넘기고(`loop.py add`), 계약 자체가 틀렸으면 멈추고 사람에게 묻는다.
- 실패 산출물: `test-results/`(trace, gitignore).

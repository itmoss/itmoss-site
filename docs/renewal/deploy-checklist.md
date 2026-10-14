# 배포 전 점검표 — 홈페이지 리뉴얼 (modu)

> **배포는 사람이 한다.** 이 문서는 점검 목록일 뿐이고, 여기 적힌 push·머지·revert 를 자동 세션은 실행하지 않는다.
> 작업은 `develop` 에서 바로 했다 (design.md 변경 2026-10-13 (4)). 따라서 **`develop` push = 즉시 itmoss.com 배포**다.

## 배포 경로

```
로컬 develop ──push──▶ origin/develop ──▶ GitHub Actions (.github/workflows/deploy.yml)
                                          build: npm ci → npm run build → dist/ 업로드
                                          deploy: actions/deploy-pages@v4
                                       ──▶ GitHub Pages (itmoss.com, CNAME, base "/")
```

- 트리거: `develop` push, 또는 Actions 탭 수동 실행(`workflow_dispatch`).
- Node 20, `npm ci` — `package-lock.json` 이 커밋돼 있어야 한다.
- 동시 실행: `concurrency: pages`, 진행 중 배포는 취소하지 않는다(앞 배포가 끝난 뒤 다음 배포).

## 1. push 전 — 사람 확인 항목 (막힘 여부)

| 확인 | 근거 | 막히면 |
| :--- | :--- | :--- |
| [ ] F19: 해픽 실제 스크린샷 사용 허락(우당네트웍)·생성 이미지 최종 선택 | design.md (12) "push(배포) 전에 확인" | 허락 전이면 해픽 이미지를 빼거나 생성 이미지로 두고 배포 |
| [ ] F28: 컴플라이언스 결과 확인 + 문구 최종 승인 | `docs/renewal/reviews/compliance.md` | 승인 전 배포 금지 |
| [ ] 히어로 "단 하나의 솔루션" 문구 유지 여부 (표시광고법) | design.md (13), F28 | F28 결정대로 |
| [ ] 개인정보처리방침 시행일(`/privacy/`, 현재 2026-10-15)이 실제 배포일과 같음 | F14 notes | `src/pages/privacy.astro` 시행일 수정 후 커밋 |
| [ ] GA4 보존기간·처리방침 보강 사항 반영 여부 | compliance.md, F28 | F28 결정대로 |
| [ ] 부분 배포 여부 결정 (미완 항목 F15·F24~F26·F30~F34·F37~F41 이 남아 있으면 그 상태가 그대로 나간다) | design.md 미결정 11 | 전부 끝날 때까지 push 보류 |

## 2. push 전 — 로컬 검사

```bash
git status                                   # 미커밋 변경 없음 (loops/ 제외)
git log origin/develop..develop --oneline    # 나갈 커밋 목록 확인
npm ci
node scripts/check-site.mjs all              # build → copy → colors → images → links → jsbudget
npm run preview                              # http://localhost:4321 에서 눈으로 확인
```

- [ ] `check-site.mjs all` 통과 (빌드 경고·금지어·하드코딩 색·이미지 규격·앵커·JS 50KB)
- [ ] `dist/CNAME` 이 있고 내용이 `itmoss.com` 한 줄 (`public/CNAME` 이 복사됨)
- [ ] `/preview/canvas/` 가 prod 빌드에서 `/` 리다이렉트만 낸다 (시안 문구가 산출물에 없음 — F35)
- [ ] `/about`·`/contact` 리다이렉트, `/notes/*` 유지, `dist/sitemap-index.xml` 생성 (F15 완료 후)
- [ ] 390px·1280px 에서 가로 스크롤 없음, 주요 섹션·내비 앵커 동작
- [ ] 페이지 어디에도 회사 주소 없음, `<html lang="ko">` (F37 완료 후)
- [ ] CSP meta: `script-src` 에 `'unsafe-inline'`·`'unsafe-eval'`·`*` 없음, GA4 호스트만 추가 (F03·F26)
- [ ] 저장소·`dist/` 에 비밀 키 없음 (`OPENAI_API_KEY` 등은 `.env` 로만, `.gitignore` 확인)

## 3. GitHub Pages 설정 (저장소 Settings → Pages)

- [ ] Source: **GitHub Actions** (브랜치 배포 아님)
- [ ] Custom domain: `itmoss.com` — DNS check 통과 표시
- [ ] **Enforce HTTPS 체크됨** — CSP·GA4·혼합 콘텐츠 방지의 전제. 인증서 발급 전이면 체크가 비활성이니 발급을 기다린다
- [ ] `http://itmoss.com` → `https://itmoss.com` 301 확인 (`curl -sI http://itmoss.com`)
- [ ] `www.itmoss.com` 을 쓰면 DNS CNAME 이 `<계정>.github.io` 를 가리키고 apex 로 리다이렉트되는지
- [ ] Environments → `github-pages` 의 배포 브랜치 규칙이 `develop` 을 허용

> 참고: Actions 배포에서는 저장소 설정의 Custom domain 이 기준이고 `CNAME` 파일은 보조다. 루트 `CNAME` 과 `public/CNAME` 둘 다 `itmoss.com` 이다 — 도메인을 바꿀 때는 설정과 두 파일을 같이 바꾼다.

## 4. 배포 (머지 순서)

작업 브랜치 없이 develop 에서 작업했으므로 "머지"는 곧 develop push 다.

1. 위 1~3 모두 체크.
2. 롤백 기준점을 남긴다: `git tag pre-renewal-$(date +%Y%m%d) origin/develop` (현재 배포본의 커밋).
3. `git push origin develop` (태그도 남기려면 `git push origin --tags`).
4. Actions 탭에서 `Deploy to GitHub Pages` 의 build → deploy 가 모두 초록인지 확인 (보통 2~3분).
5. 실패하면 사이트는 **직전 배포본이 그대로 유지**된다 — 로그를 보고 고친 커밋을 다시 push.

> 나중에 별도 작업 브랜치를 쓰게 되면 순서는: 브랜치에서 검사 통과 → develop 으로 머지(`--no-ff`, 머지 커밋 하나로) → push. 머지 커밋 하나가 롤백 단위가 된다.

## 5. 배포 직후 확인 (프로덕션)

- [ ] `https://itmoss.com/` 200, 히어로 제목·우주데브리스·해픽·소식·회사·연락 섹션 표시
- [ ] 자물쇠(HTTPS) 정상, 콘솔에 CSP 위반·혼합 콘텐츠 경고 없음
- [ ] `/privacy/` 200, 시행일·문의 메일 링크
- [ ] `/about`·`/contact` → `/#about`·`/#contact` 이동, `/notes/` 글 열림
- [ ] 외부 링크: uzudebris.com · App Store · Google Play 열림
- [ ] GA4 실시간 보고서에 방문 1건 잡힘
- [ ] 모바일 실기기 1대에서 스크롤·내비 확인
- [ ] 캐시 때문에 옛 화면이 보이면 강력 새로고침 (Pages CDN 은 최대 10분 캐시)

## 6. 롤백

문제가 보이면 먼저 되돌리고 원인은 나중에 본다.

| 상황 | 방법 |
| :--- | :--- |
| 리뉴얼 전체를 되돌림 | `git revert --no-edit <pre-renewal 태그>..HEAD` → `git push origin develop` (이력 보존, force push 금지) |
| 특정 커밋만 문제 | `git revert <커밋>` → `git push origin develop` |
| 빌드는 됐는데 Pages 만 이상 | Actions 탭에서 직전 성공 실행을 **Re-run** (같은 커밋을 다시 배포) |
| HTTPS·도메인 문제 | Settings → Pages 에서 Custom domain 을 지웠다가 다시 넣어 인증서 재발급, DNS 확인 |

- revert 도 push 하면 곧바로 배포된다 — 4번의 Actions 확인을 똑같이 한다.
- `git push --force` 로 develop 을 되감지 않는다 (다른 작업 이력·자동 반복 상태가 깨진다).
- 롤백 후 `loops/modu/progress.md` 에 한 줄 남긴다 (언제·무엇을·왜).

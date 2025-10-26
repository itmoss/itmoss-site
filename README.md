# ITMOSS Quicksite (Astro + Tailwind + MDX)

## Quick start
```bash
npm i
npm run dev
```

## Build & Preview
```bash
npm run build
npm run preview
```

## Deploy (Cloudflare Pages)
1. 새 GitHub 리포에 푸시
2. Cloudflare Pages에서 프로젝트 연결
3. Build command: `npm run build`
   Output dir: `dist`
4. 도메인 CNAME 연결

## 구조
- `src/pages/index.astro` : 랜딩
- `src/pages/notes/*.mdx` : 노트
- `src/pages/about.astro`, `contact.astro`
- `src/layouts/BaseLayout.astro` : 공통 레이아웃

## 커스터마이즈 팁
- 색상: `src/styles/global.css` 의 CSS 변수 변경
- 프로젝트 카드: `index.astro`의 `projects` 배열 수정
- 노트: `src/pages/notes/*.mdx` 파일 추가

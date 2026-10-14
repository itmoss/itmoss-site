import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: true }), mdx(), sitemap()],
  site: 'https://itmoss.com',
  // 옛 페이지는 한 페이지 섹션으로 보낸다 (정적 빌드라 meta refresh 로 나간다).
  redirects: {
    '/about': '/#about',
    '/contact': '/#contact'
  },
  // CSP 가 script-src 'self' 라 인라인 스크립트는 막힌다 → 작은 스크립트도 /_astro/*.js 파일로 낸다.
  vite: { build: { assetsInlineLimit: 0 } }
});

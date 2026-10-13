import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: true }), mdx(), sitemap()],
  site: 'https://itmoss.com',
  // CSP 가 script-src 'self' 라 인라인 스크립트는 막힌다 → 작은 스크립트도 /_astro/*.js 파일로 낸다.
  vite: { build: { assetsInlineLimit: 0 } }
});

import { test, expect } from '@playwright/test';
import { offline, scrollThrough } from './helpers.mjs';

const PAGES = ['/', '/privacy/'];

test.describe('390px 모바일 — 가로 스크롤 없음', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of PAGES) {
    test(`${path} 문서 폭이 화면 폭을 넘지 않는다`, async ({ page }) => {
      await offline(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await scrollThrough(page);

      const { viewport, doc, body } = await page.evaluate(() => ({
        viewport: window.innerWidth,
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
      }));
      expect(doc, 'documentElement.scrollWidth').toBeLessThanOrEqual(viewport);
      expect(body, 'body.scrollWidth').toBeLessThanOrEqual(viewport);

      // overflow:hidden 으로 가려진 경우도 잡는다 — 화면 밖으로 나간 보이는 요소의 목록.
      const offenders = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
          if (el.closest('.visually-hidden, .skip-link, [aria-hidden="true"]')) continue;
          // 장식용 클리핑 컨테이너 안은 사용자가 스크롤할 수 없으므로 제외
          let clipped = false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'hidden' || ox === 'clip') { clipped = true; break; }
          }
          if (clipped) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > w + 1 || r.left < -1) {
            out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
          }
        }
        return out.slice(0, 10);
      });
      expect(offenders, '화면 밖으로 나간 요소').toEqual([]);
    });
  }

  test('/ 의 섹션이 계약된 순서로 모두 있다', async ({ page }) => {
    await offline(page);
    await page.goto('/');
    const ids = ['top', 'engines', 'uzudebris', 'haepick', 'record', 'about', 'contact'];
    const tops = [];
    for (const id of ids) {
      const el = page.locator(`#${id}`);
      await expect(el, `#${id}`).toHaveCount(1);
      tops.push(await el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY));
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });
});

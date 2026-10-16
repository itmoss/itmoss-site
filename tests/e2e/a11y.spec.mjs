import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { offline, scrollThrough } from './helpers.mjs';

// WCAG 2.1 AA 자동 점검(axe) + 터치 타깃·키보드. 결과 기록: docs/renewal/reviews/accessibility.md
const PAGES = ['/', '/privacy/', '/notes/', '/404.html'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function summarize(violations) {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const path of PAGES) {
  test(`${path} axe wcag2a/2aa 위반 없음`, async ({ page }) => {
    await offline(page);
    // 스크롤 연출 도중의 반투명 상태가 대비 검사를 흐리지 않게 정지 장면으로 본다.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await scrollThrough(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(summarize(violations)).toEqual([]);
  });
}

test('/ 의 링크·버튼 터치 타깃이 44px 이상', async ({ page }) => {
  await offline(page);
  await page.goto('/');
  await scrollThrough(page);
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // 본문 문장 안의 인라인 링크는 WCAG 2.5.5(AAA)/2.5.8 예외 — 블록·독립 컨트롤만 잰다.
      const inline = cs.display === 'inline' && el.closest('p, li, dd, td, figcaption');
      if (inline) continue;
      // 화면 밖으로 숨겼다 포커스 때 드러나는 건너뛰기 링크는 포커스 상태로 따로 본다.
      if (el.classList.contains('skip-link')) continue;
      if (r.width < 44 || r.height < 44) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
        out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  expect(small).toEqual([]);
});

test('/ 키보드: Tab 첫 이동이 보이는 포커스로 간다', async ({ page }) => {
  await offline(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight,
      ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'
    };
  });
  expect(focus).not.toBeNull();
  expect(focus.visible).toBe(true);
  expect(focus.ring).toBe(true);
});

import { test, expect } from '@playwright/test';
import { offline } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await offline(page);
});

test('내부 앵커(href="#x")는 모두 같은 페이지의 id 를 가리킨다', async ({ page }) => {
  await page.goto('/');
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h !== '#' && !document.getElementById(decodeURIComponent(h.slice(1))))
  );
  expect(missing).toEqual([]);
});

test('내비 링크가 계약된 섹션으로 간다', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('nav.site-nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const h of ['#uzudebris', '#haepick', '#record', '#contact']) {
    expect(hrefs, `내비에 ${h}`).toContain(h);
  }
});

test('내비 링크를 누르면 해당 섹션이 화면에 들어온다', async ({ page }) => {
  await page.goto('/');
  for (const id of ['uzudebris', 'record', 'contact']) {
    const link = page.locator(`nav.site-nav a[href="#${id}"]`);
    if (!(await link.isVisible())) continue; // 좁은 화면에서 내비를 숨기는 경우 — 앵커 존재는 위에서 검사
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
});

test('/privacy/ 에서 홈 앵커는 /#x 로 나가고 대상이 홈에 있다', async ({ page }) => {
  await page.goto('/privacy/');
  const hrefs = await page.locator('nav.site-nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h).toMatch(/^\/#[\w-]+$/);
  await page.goto('/');
  for (const h of hrefs) await expect(page.locator(h.slice(1)), h).toHaveCount(1);
});

test('개인정보처리방침 링크가 열린다', async ({ page }) => {
  await page.goto('/');
  const privacy = page.locator('a[href="/privacy/"]');
  expect(await privacy.count()).toBeGreaterThan(0);
  const res = await page.request.get('/privacy/');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('개인정보');
});

// 정적 빌드의 redirects 는 site(https://itmoss.com) 절대 주소로 meta refresh 를 낸다 → 따라가지 않고 대상만 확인.
test('옛 경로는 홈 섹션으로 보낸다 (/about, /contact)', async ({ page }) => {
  await page.goto('/');
  for (const [from, to] of [['/about/', '/#about'], ['/contact/', '/#contact']]) {
    const res = await page.request.get(from);
    expect(res.status(), from).toBe(200);
    const html = await res.text();
    const m = html.match(/http-equiv="refresh"\s+content="0;\s*url=([^"]+)"/i);
    expect(m, `${from} meta refresh`).not.toBeNull();
    const target = new URL(m[1], 'https://itmoss.com');
    expect(target.pathname + target.hash, from).toBe(to);
    await expect(page.locator(target.hash), `${to} 대상`).toHaveCount(1);
  }
});

test('외부 링크: 필수 대상이 있고 https 이며 새 창 링크는 noopener noreferrer', async ({ page }) => {
  await page.goto('/');
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => ({
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      rel: (a.getAttribute('rel') || '').split(/\s+/)
    }))
  );
  const external = links.filter((l) => /^(https?:)?\/\//.test(l.href));

  for (const host of ['uzudebris.com', 'apps.apple.com', 'play.google.com', 'www.gbsa.or.kr']) {
    expect(external.some((l) => new URL(l.href, 'https://x').hostname === host), `${host} 링크`).toBe(true);
  }
  for (const l of external) {
    expect(l.href, 'http 평문 링크 금지').toMatch(/^https:\/\//);
    if (l.target === '_blank') {
      expect(l.rel, `${l.href} rel`).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
  }

  const mail = links.filter((l) => l.href.startsWith('mailto:'));
  expect(mail.length).toBeGreaterThan(0);
  for (const m of mail) expect(m.href).toMatch(/^mailto:[^@\s]+@itmoss\.com$/);
});

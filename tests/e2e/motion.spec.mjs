import { test, expect } from '@playwright/test';
import { scrollThrough } from './helpers.mjs';

// 스크롤 연출 계약 (loops/modu/design.md "스크롤 연출 마크업 계약"):
// 동작 줄이기면 애니메이션 없음·모두 보임, 기본 모드에서도 끝까지 내려도 에러·가로 넘침이 없다.

// 외부 요청(GA·Google Fonts)은 빈 응답으로 막는다 — abort 하면 브라우저가 콘솔 에러를 찍어 검사를 흐린다.
async function stubExternal(page) {
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  );
}

// 기본 모드는 html { scroll-behavior: smooth } 라 scrollTo 가 애니메이션된다 — 단계마다 즉시 이동해 끝까지 내린다.
async function scrollToEnd(page) {
  await page.evaluate(async () => {
    const go = (top) => window.scrollTo({ top, behavior: 'instant' });
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      go(y);
      await new Promise((r) => setTimeout(r, 30));
    }
    go(document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 200));
  });
}

const FX_TARGETS = '[data-reveal], [data-step-group] > [data-step], [data-scene] [data-stage], [data-scene] [data-box], [data-step] .step-icon__lit';

test.describe('동작 줄이기(reducedMotion=reduce)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('/ 모든 섹션 본문이 보이고 애니메이션이 없다', async ({ page }) => {
    await stubExternal(page);
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await page.waitForLoadState('load');

    // 연출 클래스가 붙지 않는다 → 숨김 초기 상태 자체가 없다
    const cls = await page.evaluate(() => document.documentElement.className);
    expect(cls).not.toMatch(/\bfx-(css|io)\b/);

    // 맨 위(스크롤 전)에서 이미 연출 대상이 전부 opacity 1·transform 없음
    const fx = await page.evaluate((sel) => {
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        out.push({
          tag: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`,
          opacity: cs.opacity,
          transform: cs.transform,
          animation: cs.animationName
        });
      }
      return out;
    }, FX_TARGETS);
    expect(fx.length, '연출 대상 수').toBeGreaterThan(5);
    for (const f of fx) {
      expect(f.opacity, `${f.tag} opacity`).toBe('1');
      expect(f.transform, `${f.tag} transform`).toBe('none');
      expect(f.animation, `${f.tag} animation`).toBe('none');
    }

    // 각 섹션의 본문(제목·문단·목록·그림)은 조상까지 곱한 불투명도가 1
    const hidden = await page.evaluate(() => {
      const out = [];
      const sections = document.querySelectorAll('main section[id]');
      for (const sec of sections) {
        for (const el of sec.querySelectorAll('h2, h3, p, li, figure')) {
          if (el.closest('[aria-hidden="true"], .visually-hidden')) continue;
          let op = 1;
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            op *= parseFloat(getComputedStyle(n).opacity);
          }
          if (op < 0.999) out.push(`#${sec.id} ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${op})`);
        }
      }
      return { count: sections.length, out: out.slice(0, 10) };
    });
    expect(hidden.count, '섹션 수').toBeGreaterThanOrEqual(6);
    expect(hidden.out, '흐리거나 숨은 본문').toEqual([]);

    // 끝까지 내려도 돌고 있는 애니메이션·전환이 없다
    await scrollThrough(page);
    const running = await page.evaluate(() =>
      document.getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => `${a.constructor.name} ${a.animationName || a.transitionProperty || ''} on ${a.effect?.target?.tagName?.toLowerCase()}.${[...(a.effect?.target?.classList || [])].join('.')}`)
    );
    expect(running, '돌고 있는 애니메이션').toEqual([]);
  });
});

test.describe('기본 모드', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('/ 끝까지 스크롤해도 콘솔 에러가 없고 가로로 넘치지 않는다', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await stubExternal(page);
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await page.waitForLoadState('load');

    // 연출이 실제로 켜졌다 (CSS scroll-driven 또는 IntersectionObserver 폴백)
    await expect(page.locator('html')).toHaveClass(/\bfx-(css|io)\b/);

    await scrollToEnd(page);

    const { viewport, doc, body, y, max } = await page.evaluate(() => ({
      viewport: window.innerWidth,
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      y: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight
    }));
    expect(y, '끝까지 내려갔다').toBeGreaterThanOrEqual(max - 2);
    expect(doc, 'documentElement.scrollWidth').toBeLessThanOrEqual(viewport);
    expect(body, 'body.scrollWidth').toBeLessThanOrEqual(viewport);

    // 다시 맨 위로 올라와도 에러 없음
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(100);
    expect(errors, '콘솔·페이지 에러').toEqual([]);
  });
});

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { offline } from './helpers.mjs';

const news = JSON.parse(readFileSync(new URL('../../src/data/news.json', import.meta.url), 'utf8'));

test.beforeEach(async ({ page }) => {
  await offline(page);
  await page.goto('/');
});

test('news.json 은 GBSA 가 먼저, 모두의 창업이 다음이다', () => {
  const gbsa = news.findIndex((n) => n.title.includes('GBSA'));
  const modu = news.findIndex((n) => n.title.includes('모두의 창업'));
  expect(gbsa).toBeGreaterThanOrEqual(0);
  expect(modu).toBeGreaterThan(gbsa);
});

test('#record 소식 카드가 news.json 순서 그대로 나온다', async ({ page }) => {
  const cards = page.locator('#record .news__card');
  await expect(cards).toHaveCount(news.length);
  const titles = await cards.locator('.news__title').allTextContents();
  expect(titles.map((t) => t.trim())).toEqual(news.map((n) => n.title));

  const texts = await cards.allTextContents();
  const gbsa = texts.findIndex((t) => t.includes('GBSA'));
  const modu = texts.findIndex((t) => t.includes('모두의 창업'));
  expect(gbsa, 'GBSA 카드').toBeGreaterThanOrEqual(0);
  expect(modu, '모두의 창업 카드').toBeGreaterThan(gbsa);
});

test('카드마다 날짜·태그가 있고 href 가 있으면 그 링크가 붙는다', async ({ page }) => {
  const cards = page.locator('#record .news__card');
  for (let i = 0; i < news.length; i++) {
    const card = cards.nth(i);
    await expect(card.locator('.news__meta')).toHaveText(`${news[i].date} · ${news[i].tag}`);
    const link = card.locator('a.news__link');
    if (news[i].href) {
      await expect(link).toHaveAttribute('href', news[i].href);
    } else {
      await expect(link).toHaveCount(0);
    }
    if (news[i].logo) {
      await expect(card.locator('img')).toHaveAttribute('src', news[i].logo);
    }
  }
});

test('히어로(#top)에는 모두의 창업 소식을 넣지 않는다', async ({ page }) => {
  await expect(page.locator('#top')).not.toContainText('모두의 창업');
});

// 공통: 외부 요청(GA·Google Fonts)은 끊는다 — 테스트가 네트워크·분석 수집에 기대지 않게.
export async function offline(page) {
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
}

// 스크롤 연출(data-reveal)이 다 펼쳐지도록 끝까지 내렸다가 맨 위로 돌아온다.
export async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 100));
  });
}

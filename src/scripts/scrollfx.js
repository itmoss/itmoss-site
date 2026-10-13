// 스크롤 연출 진입점 — 스타일은 src/styles/scroll.css.
// animation-timeline 을 지원하면 html.fx-css 만 붙이고 끝(CSS 가 전부 한다).
// 미지원이면 html.fx-io 를 붙이고 IntersectionObserver 로 .is-in 을 준다.
// 동작 줄이기·IntersectionObserver 없음이면 아무 클래스도 붙이지 않는다 → 숨김 없음, 모두 보임.
// scroll 이벤트·rAF 는 쓰지 않는다.

const TARGETS = '[data-reveal], [data-step-group], [data-scene] [data-stage]';

function init() {
  const root = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (window.CSS && CSS.supports('animation-timeline: view()')) {
    root.classList.add('fx-css');
    return;
  }
  if (!('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -15% 0px', threshold: 0.15 },
  );
  // 장면 단계는 화면 가운데 띠에 있을 때만 점등 (벗어나면 다시 흐려짐)
  const stageIo = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-in', entry.isIntersecting);
    },
    { rootMargin: '-40% 0px -40% 0px' },
  );

  for (const el of document.querySelectorAll(TARGETS)) {
    (el.hasAttribute('data-stage') ? stageIo : io).observe(el);
  }
  root.classList.add('fx-io');
}

init();

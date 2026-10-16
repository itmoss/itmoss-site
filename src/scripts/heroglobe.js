// 히어로 지구본 (src/components/home/HeroGlobe.astro). cobe 는 첫 페인트 뒤에 불러온다 — LCP 는 h1.
// 색은 tokens.css 변수를 읽어 쓴다. 화면 밖·탭 숨김이면 그리기를 멈춘다.
// prefers-reduced-motion 이면 회전 없이 한 장면만 그린다. WebGL 이 없으면 정적 SVG 를 그대로 둔다.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

// 궤도 파편 [위도, 경도]. 마지막 하나만 signal = "발견".
const DEBRIS = [
  [52, -20], [18, 40], [-12, 95], [34, 150], [-40, -140],
  [8, -75], [-28, 20], [62, 110], [-55, 60], [24, -160],
  [44, 70], [-6, -30],
];
const FOUND = [37.5, 127];

function tokenRgb(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/./g, '$&$&') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function init() {
  const box = document.querySelector('[data-globe-box]');
  const canvas = box?.querySelector('canvas[data-globe]');
  if (!canvas || !hasWebGL()) return;

  const { default: createGlobe } = await import('cobe');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => Math.max(1, Math.round(canvas.clientWidth * dpr));
  const signal = tokenRgb('--color-signal');
  const muted = tokenRgb('--color-muted');

  let phi = 4.1; // 처음엔 한반도 쪽 "발견" 점이 보이게
  let globe;
  try {
    globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size(),
      height: size(),
      phi,
      theta: 0.28,
      dark: 1,
      diffuse: 1.1,
      mapSamples: 14000,
      mapBrightness: 3.2,
      mapBaseBrightness: 0,
      baseColor: tokenRgb('--color-faint'),
      markerColor: muted,
      glowColor: tokenRgb('--color-line'),
      markerElevation: 0.14,
      markers: [
        ...DEBRIS.map((location) => ({ location, size: 0.025, color: muted })),
        { location: FOUND, size: 0.07, color: signal },
      ],
    });
  } catch {
    return; // 컨텍스트 생성 실패 → 정적 SVG 유지
  }

  let visible = true;
  let raf = 0;
  const running = () => visible && !document.hidden && !reduce.matches;

  function frame() {
    raf = 0;
    phi += 0.0025;
    globe.update({ phi });
    if (running()) raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (running() && !raf) raf = requestAnimationFrame(frame);
    else if (!running() && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  // 정지 장면도 지도 텍스처가 들어온 뒤 다시 그린다
  const still = () => globe.update({ phi });
  setTimeout(still, 300);
  setTimeout(still, 1200);

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  }).observe(box);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
  new ResizeObserver(() => {
    globe.update({ width: size(), height: size() });
    if (!raf) still();
  }).observe(canvas);

  box.classList.add('is-live');
  sync();
}

// 첫 페인트 뒤에 시작
requestAnimationFrame(() => setTimeout(init, 0));

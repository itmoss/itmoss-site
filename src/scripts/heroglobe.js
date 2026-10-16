// 히어로 지구본 (src/components/home/HeroGlobe.astro). cobe 는 첫 페인트 뒤에 불러온다 — LCP 는 h1.
// 색은 tokens.css 변수를 읽어 쓴다. 화면 밖·탭 숨김이면 그리기를 멈춘다.
// prefers-reduced-motion 이면 회전 없이 한 장면만 그린다. WebGL 이 없으면 정적 SVG 를 그대로 둔다.
// 점마다 작은 영상 프레임(재생 표시·진행 막대)을 겹쳐 "지구 곳곳의 영상"으로 읽히게 한다.
// 위치는 cobe 2.0.1 의 마커 투영식과 같은 식으로 직접 계산한다 (CSS anchor 미지원 브라우저 대비).

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

const ELEVATION = 0.14;

// cobe 의 U()·O() 와 같은 식. offset 0 · scale 1 · 정사각 캔버스 기준.
function project([lat, lng], phi, theta) {
  const la = (lat * Math.PI) / 180;
  const ln = (lng * Math.PI) / 180 - Math.PI;
  const r = 0.8 + ELEVATION;
  const x = -Math.cos(la) * Math.cos(ln) * r;
  const y = Math.sin(la) * r;
  const z = Math.cos(la) * Math.sin(ln) * r;
  const ct = Math.cos(theta), st = Math.sin(theta), cp = Math.cos(phi), sp = Math.sin(phi);
  const px = cp * x + sp * z;
  const py = sp * st * x + ct * y - cp * st * z;
  const pz = -sp * ct * x + st * y + cp * ct * z;
  return { x: (px + 1) / 2, y: (-py + 1) / 2, z: pz, visible: pz >= 0 || px * px + py * py >= 0.64 };
}

function makeClips(layer) {
  const clip = (found, i) => {
    const el = document.createElement('span');
    el.className = found ? 'clip clip--found' : 'clip';
    // 진행 막대 길이·시작점을 점마다 다르게 — 각자 다른 영상이 재생 중인 느낌
    el.style.setProperty('--dur', `${found ? 9 : 5 + ((i * 37) % 7)}s`);
    el.style.setProperty('--delay', `-${(i * 1.7) % 6}s`);
    el.innerHTML = found
      ? '<span class="clip__play"></span><span class="clip__tc">00:37</span><span class="clip__bar"><i></i></span>'
      : '<span class="clip__play"></span><span class="clip__bar"><i></i></span>';
    layer.append(el);
    return el;
  };
  return [...DEBRIS.map((loc, i) => ({ loc, el: clip(false, i) })), { loc: FOUND, el: clip(true, DEBRIS.length) }];
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
  const theta = 0.28;
  let globe;
  try {
    globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size(),
      height: size(),
      phi,
      theta,
      dark: 1,
      diffuse: 1.1,
      mapSamples: 14000,
      mapBrightness: 3.2,
      mapBaseBrightness: 0,
      baseColor: tokenRgb('--color-faint'),
      markerColor: muted,
      glowColor: tokenRgb('--color-line'),
      markerElevation: ELEVATION,
      markers: [
        ...DEBRIS.map((location) => ({ location, size: 0.012, color: muted })),
        { location: FOUND, size: 0.03, color: signal },
      ],
    });
  } catch {
    return; // 컨텍스트 생성 실패 → 정적 SVG 유지
  }

  const layer = box.querySelector('[data-globe-clips]');
  const clips = layer ? makeClips(layer) : [];
  let boxSize = box.clientWidth;
  function place() {
    for (const c of clips) {
      const p = project(c.loc, phi, theta);
      const s = 0.7 + 0.3 * Math.max(0, p.z);
      c.el.style.transform = `translate(${p.x * boxSize}px, ${p.y * boxSize}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      c.el.classList.toggle('is-back', !p.visible);
    }
  }

  let visible = true;
  let raf = 0;
  const running = () => visible && !document.hidden && !reduce.matches;

  function frame() {
    raf = 0;
    phi += 0.0025;
    globe.update({ phi });
    place();
    if (running()) raf = requestAnimationFrame(frame);
  }
  function sync() {
    box.classList.toggle('is-paused', !running());
    if (running() && !raf) raf = requestAnimationFrame(frame);
    else if (!running() && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  // 정지 장면도 지도 텍스처가 들어온 뒤 다시 그린다
  const still = () => {
    globe.update({ phi });
    place();
  };
  setTimeout(still, 300);
  setTimeout(still, 1200);

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  }).observe(box);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
  new ResizeObserver(() => {
    boxSize = box.clientWidth;
    globe.update({ width: size(), height: size() });
    if (!raf) still();
  }).observe(canvas);

  place();
  box.classList.add('is-live');
  sync();
}

// 첫 페인트 뒤에 시작
requestAnimationFrame(() => setTimeout(init, 0));

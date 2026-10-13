#!/usr/bin/env node
// 사이트 검사 (node 내장만). 계약: loops/modu/design.md "검사 스크립트".
//   node scripts/check-site.mjs build | copy [경로…] | colors | images | links | jsbudget | all | --self-test
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 화면에 나가면 안 되는 말 (대소문자 무시). 문구 원칙: design.md "문구 원칙".
export const BANNED = [
  'blockchain', '블록체인', 'kaia', 'avalanche', 'legal-tech',
  '99%', '100%', '혁신', '새로운 미래', '엔지니어링합니다', '완벽한',
  '실시간 보호', '법적 증거', '삭제 대행', '1-click', '90% 절감',
  'zero-image', 'valuation calculator', '가짜입니다',
];
const IMG_EXT = /\.(webp|avif)$/i;
const IMG_MAX = 300 * 1024;
const JS_MAX = 50 * 1024;
const REQUIRED_HOSTS = ['uzudebris.com', 'apps.apple.com', 'play.google.com'];

// ── 공통 ──────────────────────────────────────────────
function walk(dir, keep) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, keep));
    else if (keep(p)) out.push(p);
  }
  return out.sort();
}

const rel = (root, p) => path.relative(root, p) || p;

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);

// 화면에 나가는 글자: <script>·<style>·주석을 뺀 본문 + alt·title·aria-label·meta content.
export function visibleText(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  const extra = [];
  for (const t of body.match(/<[a-z][^>]*>/gi) ?? []) {
    const a = attrs(t.replace(/^<[a-z0-9-]+/i, ''));
    for (const k of ['alt', 'title', 'aria-label']) if (a[k]) extra.push(a[k]);
    if (/^<meta\b/i.test(t) && a.content) extra.push(a.content);
  }
  const spaced = body.replace(/<[^>]*>/g, ' ');
  const joined = body.replace(/<[^>]*>/g, '');
  return [spaced, joined, ...extra].map((s) => decode(s).replace(/\s+/g, ' ')).join('\n');
}

export function bannedIn(text) {
  const low = text.toLowerCase();
  return BANNED.filter((w) => low.includes(w.toLowerCase()));
}

// ── 검사 (위반 문자열 배열을 돌려준다) ────────────────
export function checkCopy(root, targets = []) {
  let files;
  if (targets.length) {
    files = targets.flatMap((t) => {
      const p = path.resolve(t);
      if (!fs.existsSync(p)) return [p];
      return fs.statSync(p).isDirectory() ? walk(p, () => true) : [p];
    });
  } else {
    files = walk(path.join(root, 'dist'), (p) => /\.(html|txt|xml)$/i.test(p));
    if (!files.length) return ['dist/ 에 html·txt·xml 이 없다 — 먼저 build'];
  }
  const out = [];
  for (const f of files) {
    if (!fs.existsSync(f)) { out.push(`${f}: 파일 없음`); continue; }
    const raw = fs.readFileSync(f, 'utf8');
    const text = /\.(html?|xml|astro|svg)$/i.test(f) ? visibleText(raw) : raw;
    for (const w of bannedIn(text)) out.push(`${rel(root, f)}: 금지어 "${w}"`);
  }
  return out;
}

const HEX = /(?<![\w&#-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![\w-])/gi;
const FUNC = /\b(?:rgba?|hsla?)\s*\(/gi;

export function checkColors(root) {
  const src = path.join(root, 'src');
  const files = [
    ...walk(path.join(src, 'components'), () => true),
    ...walk(path.join(src, 'layouts'), () => true),
    ...(fs.existsSync(path.join(src, 'pages'))
      ? fs.readdirSync(path.join(src, 'pages')).filter((n) => n.endsWith('.astro')).map((n) => path.join(src, 'pages', n))
      : []),
  ].filter((f) => path.resolve(f) !== path.join(src, 'styles', 'tokens.css'));
  const out = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // href·id 같은 앵커 값(#add 등)은 색이 아니다
      const l = line.replace(/\b(?:href|id|for|aria-[a-z]+|xlink:href)\s*=\s*(["'])[^"']*\1/gi, '');
      for (const m of [...l.matchAll(HEX), ...l.matchAll(FUNC)]) {
        out.push(`${rel(root, f)}:${i + 1}: 색 직접 사용 "${m[0].trim()}" — tokens.css 변수로`);
      }
    });
  }
  return out;
}

function distHtml(root) {
  return walk(path.join(root, 'dist'), (p) => p.endsWith('.html'));
}

export function checkImages(root) {
  const dist = path.join(root, 'dist');
  const pages = distHtml(root);
  if (!pages.length) return ['dist/ 에 html 이 없다 — 먼저 build'];
  const out = [];
  for (const f of pages) {
    for (const t of tags(fs.readFileSync(f, 'utf8'), 'img')) {
      const a = attrs(t.replace(/^<img/i, ''));
      const src = a.src ?? '';
      const where = `${rel(root, f)}: <img src="${src}">`;
      if (!a.width || !a.height) out.push(`${where} width·height 없음`);
      const clean = src.split(/[?#]/)[0];
      if (!IMG_EXT.test(clean)) out.push(`${where} webp/avif 아님`);
      if (!clean || /^(?:[a-z]+:)?\/\//i.test(clean) || clean.startsWith('data:')) continue;
      const file = clean.startsWith('/') ? path.join(dist, decodeURI(clean)) : path.resolve(path.dirname(f), decodeURI(clean));
      if (!fs.existsSync(file)) out.push(`${where} 파일 없음`);
      else if (fs.statSync(file).size > IMG_MAX) out.push(`${where} ${Math.round(fs.statSync(file).size / 1024)}KB > 300KB`);
    }
  }
  return out;
}

export function checkLinks(root) {
  const pages = distHtml(root);
  if (!pages.length) return ['dist/ 에 html 이 없다 — 먼저 build'];
  const out = [];
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8');
    const ids = new Set([...html.matchAll(/\sid\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]));
    for (const t of tags(html, 'a')) {
      const href = attrs(t.replace(/^<a/i, '')).href;
      if (href && href.startsWith('#') && href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) {
        out.push(`${rel(root, f)}: href="${href}" 대상 id 없음`);
      }
    }
  }
  const index = path.join(root, 'dist', 'index.html');
  const hrefs = fs.existsSync(index)
    ? tags(fs.readFileSync(index, 'utf8'), 'a').map((t) => attrs(t.replace(/^<a/i, '')).href ?? '')
    : [];
  for (const host of REQUIRED_HOSTS) {
    const re = new RegExp(`^https?://(?:[\\w-]+\\.)*${host.replace(/\./g, '\\.')}(?:[/?#]|$)`, 'i');
    if (!hrefs.some((h) => re.test(h))) out.push(`dist/index.html: ${host} 링크 없음`);
  }
  return out;
}

export function checkJsBudget(root) {
  const dist = path.join(root, 'dist');
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) return ['dist/index.html 없음 — 먼저 build'];
  const seen = new Set();
  const queue = [...fs.readFileSync(index, 'utf8').matchAll(/\/_astro\/[^"'`\s)]+?\.js/g)].map((m) => m[0]);
  const out = [];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const file = path.join(dist, url);
    if (!fs.existsSync(file)) { out.push(`${url}: 파일 없음`); continue; }
    // 정적 import 만 따라간다 (동적 import 는 첫 화면이 아님)
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js)["']/g)) {
      queue.push(path.posix.join(path.posix.dirname(url), m[1]));
    }
  }
  const total = [...seen].reduce((n, u) => n + (fs.existsSync(path.join(dist, u)) ? fs.statSync(path.join(dist, u)).size : 0), 0);
  if (total > JS_MAX) out.push(`index.html JS ${(total / 1024).toFixed(1)}KB > 50KB (${[...seen].join(', ')})`);
  return out;
}

export function checkBuild(root) {
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const out = [];
  if (r.error) out.push(`npm run build 실행 실패: ${r.error.message}`);
  else if (r.status !== 0) out.push(`npm run build 종료코드 ${r.status}`);
  for (const line of log.split('\n')) {
    if (/\[WARN\]|\berror\b/i.test(line)) out.push(`build 출력: ${line.trim()}`);
  }
  if (out.length) process.stderr.write(log.slice(-4000));
  return out;
}

const CHECKS = {
  build: checkBuild,
  copy: checkCopy,
  colors: checkColors,
  images: checkImages,
  links: checkLinks,
  jsbudget: checkJsBudget,
};

function report(name, problems) {
  if (!problems.length) { console.log(`✓ ${name}`); return true; }
  console.log(`✗ ${name} — ${problems.length}건`);
  for (const p of problems) console.log(`  ${p}`);
  return false;
}

// ── 자체 시험: 픽스처로 각 검사가 위반을 실제로 잡는지 ──
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-site-'));
  const put = (root, p, body) => {
    const f = path.join(root, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  };
  const results = [];
  const expect = (label, got, want) => {
    const ok = want ? got.length > 0 : got.length === 0;
    results.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${want ? '위반을 못 잡음' : `오탐: ${got.join(' | ')}`}`}`);
  };
  const site = (name) => path.join(tmp, name);
  const links = REQUIRED_HOSTS.map((h) => `<a href="https://${h}/x">${h}</a>`).join('');
  const page = (body, head = '') =>
    `<!doctype html><html><head><meta name="description" content="영상을 지키는 비전 AI">${head}` +
    `<style>.w{width:100%}@keyframes a{100%{opacity:1}}</style>` +
    `<script>const s = "blockchain 99%";</script></head><body id="top">${body}${links}</body></html>`;

  try {
    // copy — 깨끗한 페이지는 통과 (style·script 속 100%·blockchain 은 화면 글자가 아니다)
    const clean = site('clean');
    put(clean, 'dist/index.html', page('<h1>영상을 지킵니다</h1><a href="#top">위로</a>'));
    put(clean, 'dist/sitemap.xml', '<urlset><url><loc>https://itmoss.com/</loc></url></urlset>');
    put(clean, 'dist/llms.txt', '아이티모스는 영상 지문 대조 엔진을 만든다.');
    expect('copy: 깨끗한 dist 통과', checkCopy(clean), false);

    // copy — 금지어마다 본문·속성·meta 에서 잡는다
    for (const [i, w] of BANNED.entries()) {
      const where = [
        (x) => page(`<p>우리는 ${x} 입니다</p>`),
        (x) => page(`<img alt="${x}" src="/a.webp" width="1" height="1">`),
        (x) => page('<p>본문</p>', `<meta property="og:title" content="${x}">`),
        (x) => page(`<button aria-label="${x.toUpperCase()}">x</button>`),
      ][i % 4];
      const r = site(`copy-${i}`);
      put(r, 'dist/index.html', where(w));
      expect(`copy: "${w}" 잡음`, checkCopy(r), true);
    }
    const split = site('copy-split');
    put(split, 'dist/index.html', page('<p>새로운\n  <b>미래</b>, 엔지니어링<em>합니다</em>, 99&#37;</p>'));
    expect('copy: 태그·줄바꿈·엔티티로 쪼갠 금지어 잡음', checkCopy(split).filter((p) => /새로운 미래|엔지니어링합니다|99%/.test(p)).length === 3 ? ['ok'] : [], true);
    const txt = site('copy-txt');
    put(txt, 'dist/llms.txt', 'Kaia 위에 해시를 남깁니다');
    expect('copy: txt 의 금지어 잡음', checkCopy(txt), true);
    put(txt, 'extra/note.html', '<p>블록체인</p>');
    expect('copy: 경로 인자로 준 파일 검사', checkCopy(txt, [path.join(txt, 'extra')]), true);

    // colors
    const col = site('colors');
    put(col, 'src/styles/tokens.css', ':root{--color-ink:#101214;--x:rgb(1 2 3)}');
    put(col, 'src/components/home/Hero.astro', '<a href="#add" id="fade">x</a><div style="color: var(--color-paper)"></div>');
    put(col, 'src/pages/preview/canvas.astro', '<div style="color:#FF6A2B"></div>');
    expect('colors: tokens.css·앵커·preview 는 통과', checkColors(col), false);
    for (const [p, body] of [
      ['src/components/home/Engines.astro', '<style>.a{color:#FF6A2B}</style>'],
      ['src/components/home/Engines.astro', '<style>.a{background: #fff}</style>'],
      ['src/layouts/BaseLayout.astro', '<div style="color: rgba(0,0,0,.5)"></div>'],
      ['src/pages/index.astro', '<style>.a{color:hsl(20 100% 50%)}</style>'],
    ]) {
      const r = site(`colors-${p.replace(/\W/g, '')}-${body.length}`);
      put(r, p, body);
      expect(`colors: ${p} 의 "${body.match(/#\w+|\w+\(/)[0]}" 잡음`, checkColors(r), true);
    }

    // images
    const img = site('images');
    put(img, 'dist/index.html', page('<img src="/images/a.webp" width="10" height="10" alt="">'));
    put(img, 'dist/images/a.webp', Buffer.alloc(1000));
    expect('images: webp·크기 지정·300KB 이하 통과', checkImages(img), false);
    for (const [label, tag, size] of [
      ['width 없는 img', '<img src="/images/b.webp" height="10" alt="">', 1000],
      ['height 없는 img', '<img src="/images/b.webp" width="10" alt="">', 1000],
      ['png img', '<img src="/images/b.png" width="10" height="10" alt="">', 1000],
      ['300KB 넘는 img', '<img src="/images/b.webp" width="10" height="10" alt="">', IMG_MAX + 1],
    ]) {
      const r = site(`images-${label.replace(/\W/g, '')}-${size}`);
      put(r, 'dist/index.html', page(tag));
      put(r, `dist/${tag.match(/src="\/([^"]+)"/)[1]}`, Buffer.alloc(size));
      expect(`images: ${label} 잡음`, checkImages(r), true);
    }

    // links
    expect('links: 앵커 대상·필수 외부 링크 있으면 통과', checkLinks(clean), false);
    const lk = site('links-anchor');
    put(lk, 'dist/index.html', page('<a href="#contact">연락</a>'));
    expect('links: 대상 없는 #contact 잡음', checkLinks(lk), true);
    const lk2 = site('links-host');
    put(lk2, 'dist/index.html', page('').replace(/<a href="https:\/\/play\.google\.com[^<]*<\/a>/, ''));
    expect('links: play.google.com 링크 없음 잡음', checkLinks(lk2), true);

    // jsbudget
    const js = site('js');
    put(js, 'dist/index.html', page('', '<script type="module" src="/_astro/a.js"></script>'));
    put(js, 'dist/_astro/a.js', 'import"./b.js";' + 'x'.repeat(1000));
    put(js, 'dist/_astro/b.js', 'y'.repeat(1000));
    expect('jsbudget: 50KB 이하 통과', checkJsBudget(js), false);
    put(js, 'dist/_astro/b.js', 'y'.repeat(JS_MAX));
    expect('jsbudget: 정적 import 포함 50KB 초과 잡음', checkJsBudget(js), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(failed ? `self-test 실패 ${failed}/${results.length}` : `self-test 통과 ${results.length}건`);
  return failed === 0;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === '--self-test') return selfTest() ? 0 : 1;
  if (cmd === 'all') {
    let ok = true;
    for (const name of ['build', 'copy', 'colors', 'images', 'links', 'jsbudget']) {
      ok = report(name, CHECKS[name](ROOT)) && ok;
      if (!ok && name === 'build') break;
    }
    return ok ? 0 : 1;
  }
  if (!CHECKS[cmd]) {
    console.error('사용법: node scripts/check-site.mjs build | copy [경로…] | colors | images | links | jsbudget | all | --self-test');
    return 2;
  }
  return report(cmd, CHECKS[cmd](ROOT, rest)) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

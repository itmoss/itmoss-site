// 해픽 브랜드 이미지 받기 — App Store 조회 API 의 앱 아이콘·스크린샷을 webp 로 바꿔 public/images/haepick/ 에 둔다.
// mzstatic 핫링크 대신 자체 호스팅. 출처 URL·받은 날짜는 같은 폴더 sources.json.
//   node scripts/fetch-haepick.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const LOOKUP = 'https://itunes.apple.com/lookup?id=6748489765&country=kr';
const OUT = path.join(process.cwd(), 'public/images/haepick');
const MAX = 300 * 1024;
// 스크린샷 썸네일 접미사(320x480bb.jpg)를 키워 고해상도로 받는다
const SHOT_SIZE = '900x0w.jpg';

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function save(url, file) {
  const img = await get(url);
  let quality = 82;
  let out;
  do {
    out = await sharp(img).webp({ quality }).toBuffer();
    quality -= 8;
  } while (out.length > MAX && quality > 30);
  if (out.length > MAX) throw new Error(`${file}: ${Math.round(out.length / 1024)}KB > 300KB`);
  fs.writeFileSync(path.join(OUT, file), out);
  const { width, height } = await sharp(out).metadata();
  console.log(`${file} ${width}x${height} ${Math.round(out.length / 1024)}KB`);
  return { file, url, width, height };
}

const app = (await (await fetch(LOOKUP)).json()).results?.[0];
if (!app) throw new Error('조회 결과 없음');
fs.mkdirSync(OUT, { recursive: true });

const files = [await save(app.artworkUrl512, 'icon.webp')];
for (const [i, u] of app.screenshotUrls.entries()) {
  files.push(await save(u.replace(/\/[^/]+$/, `/${SHOT_SIZE}`), `screen-${i + 1}.webp`));
}

const sources = {
  lookup: LOOKUP,
  app: app.trackName,
  seller: app.sellerName,
  fetched: new Date().toISOString().slice(0, 10),
  files,
};
fs.writeFileSync(path.join(OUT, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');

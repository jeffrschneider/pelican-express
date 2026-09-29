// Deterministic frame-by-frame export of the ride (software WebGL, no GPU needed).
// usage: node render.mjs <startFrame> <endFrameExclusive> [fps=30] [outDir=frames]
// e.g.  2 workers:  node render.mjs 0 1365 30 frames &  node render.mjs 1365 2730 30 frames &
// env: VW / VH set the video size (default 1280x720)
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [A, B] = [Number(process.argv[2]), Number(process.argv[3])];
const FPS = Number(process.argv[4] || 30), OUT = process.argv[5] || 'frames';
const W = Number(process.env.VW || 1280), H = Number(process.env.VH || 720);
const ROOT = HERE;
const src = fs.readFileSync(path.join(HERE, '../../index.html'), 'utf8')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', '/three/build/three.module.js')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', '/three/examples/jsm/');
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/pelican.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(src); }
  const f = path.join(ROOT, 'node_modules', u);
  if (u.startsWith('/three/') && fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'text/javascript' }); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404); res.end('nf');
});
await new Promise((r) => server.listen(0, r));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${server.address().port}/pelican.html?manual`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__pelican', { timeout: 150000 });
fs.mkdirSync(OUT, { recursive: true });
const dt = 1 / FPS, warm = Math.min(A, Math.round(4 * FPS));
// run the smoothed camera up from `warm` frames earlier so any chunk matches a from-zero render
await page.evaluate(({ from, A, dt }) => { const P = window.__pelican; for (let i = from; i < A; i++) P.step(i * dt, dt, i === from); }, { from: A - warm, A, dt });
const t0 = Date.now();
for (let i = A; i < B; i++) {
  await page.evaluate(({ t, dt, snap }) => window.__pelican.frame(t, dt, snap), { t: i * dt, dt, snap: i === 0 });
  const buf = await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
  fs.writeFileSync(path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`), buf);
  if ((i - A) % 25 === 24 || i === B - 1) console.log(`worker ${A}-${B}: ${i - A + 1}/${B - A} frames, ${((Date.now() - t0) / (i - A + 1) / 1000).toFixed(2)} s/frame`);
}
await browser.close(); server.close();

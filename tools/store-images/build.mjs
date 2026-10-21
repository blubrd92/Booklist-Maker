#!/usr/bin/env node
/**
 * Build the Booklister Helper store images (promo tiles + screenshots)
 * into dist/store-images/.
 *
 * Run with: npm run build:store
 *
 * NOTHING ON THE SITE OR IN THE EXTENSION NEEDS THIS. The images are
 * uploaded by hand to the Chrome Web Store, Edge Add-ons and Firefox
 * Add-ons listings; this rebuilds them when the popup or the app changes
 * enough that the listing misrepresents it. Output goes to dist/
 * (gitignored), the same place the extension zips land.
 *
 * Like tools/og-image it is NOT dependency-free: it drives a real
 * browser and fetches fonts over the network. Same deliberate choice,
 * same install line, kept out of package.json:
 *
 *   npm install --no-save playwright-core
 *   npx playwright install chromium     # or set PLAYWRIGHT_CHROMIUM
 *
 * Optional: `npm install --no-save @fortawesome/fontawesome-free@6.4.0`
 * serves the app's icons locally instead of from cdnjs, for sandboxes
 * where cdnjs is blocked (the app's buttons render iconless otherwise).
 *
 * What is real and what is not:
 *   - The popup is the shipped extension/popup/ code, unmodified. Only
 *     the webextension polyfill is swapped for a stub that answers its
 *     browser.* calls with sample data. Inter stands in for the system
 *     UI font it asks for, which Linux doesn't have.
 *   - The Booklister screenshot is the real app after a real Quick Add
 *     paste of the exact TSV shape content.js emits.
 *   - The catalog pages, titles and cover art are invented; see the
 *     header of templates.mjs for why.
 *
 * Each image is rendered at 2x and downscaled, then written as a 24-bit
 * RGB PNG (no alpha channel): browser canvases always encode RGBA, so
 * the PNG is assembled here with node:zlib.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, extname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { BOOKS, PALETTE, displayName, drawCovers, storeImages } from './templates.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'dist', 'store-images');
const PORT = 8732;
const SCALE = 2;
const LIST_SIZE = 13;   // how many titles the popup picks ("First 13")

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif',
};

function curl(url, binary) {
  // curl rather than fetch: it honours HTTPS_PROXY without extra wiring.
  return execFileSync('curl', [
    '-sS', '--fail', '--max-time', '45',
    '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    url,
  ], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Google Fonts CSS -> latin @font-face blocks with the woff2 inlined. */
function inlineFonts(families) {
  const css = curl(`https://fonts.googleapis.com/css2?family=${families}&display=swap`, false);
  const out = [];
  for (const [, subset, block] of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[\s\S]*?\})/g)) {
    if (subset !== 'latin') continue;
    const url = block.match(/url\((https:\/\/[^)]+)\)/)[1];
    out.push(block
      .replace(/url\(https:\/\/[^)]+\)/, `url(data:font/woff2;base64,${curl(url, true).toString('base64')})`)
      .replace(/\s*unicode-range:[^;]+;/, ''));
  }
  if (!out.length) throw new Error(`no latin font faces resolved for ${families}`);
  return out.join('\n');
}

function serveRepo() {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(REPO_ROOT, rel);
    if (!file.startsWith(REPO_ROOT) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise(ok => server.listen(PORT, '127.0.0.1', () => ok(server)));
}

/* ---- minimal RGB PNG encoder ------------------------------------- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** RGBA pixels (opaque) -> 8-bit RGB PNG. */
function encodeRgbPng(rgba, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);           // filter byte 0 (None) per row
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = row + 1 + x * 3;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;                 // 8-bit, truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error(
      '\nplaywright-core is not installed. It is intentionally not a\n' +
      'devDependency, so install it just for this run:\n\n' +
      '  npm install --no-save playwright-core\n' +
      '  npx playwright install chromium\n');
    process.exit(1);
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM
    || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

  let faDir = null;
  try {
    faDir = dirname(createRequire(import.meta.url).resolve('@fortawesome/fontawesome-free/package.json'));
  } catch { /* optional; fall back to cdnjs */ }

  const fonts = inlineFonts('Inter:wght@400;500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400');
  // Georgia (the default title font) is missing on Linux; Gelasio is its
  // metric-compatible twin, so the app lays out exactly as on a desktop.
  // Calibri, the other default, already resolves to Carlito there.
  const georgia = inlineFonts('Gelasio:ital,wght@0,400;0,700;1,400')
    .replace(/font-family:\s*'Gelasio'/g, "font-family: 'Georgia'");
  console.log('  fonts:   inlined');

  const server = await serveRepo();
  const browser = await chromium.launch({ executablePath });
  const base = `http://127.0.0.1:${PORT}`;
  const asDataUrl = (buf) => 'data:image/png;base64,' + buf.toString('base64');

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE });

    // ---- 1. cover art --------------------------------------------------
    const scratch = await ctx.newPage();
    await scratch.setContent('<html><body></body></html>');
    const covers = await scratch.evaluate(drawCovers, PALETTE);
    await scratch.close();
    const bibs = BOOKS.map(([title, subTitle, author, callNumber], i) => ({
      bibId: 'b' + i, title, subTitle, author: displayName(author), callNumber, coverUrl: covers[i],
    }));

    // ---- 2. the real popup, three ways ----------------------------------
    async function capturePopup(mode, setup) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 440, height: 700 });
      // popup.js routes on the tab URL, so the stub hands it one that
      // matches the page type. These URLs are never shown.
      const url = mode === 'list' ? 'https://example.bibliocommons.com/v2/list/display/1/2'
        : mode === 'record' ? 'https://example.bibliocommons.com/v2/record/S1C1'
          : 'https://example.org/';
      await page.route('**/vendor/browser-polyfill.min.js', r => r.fulfill({
        contentType: 'text/javascript',
        body: `window.browser = (() => {
          const BIBS = ${JSON.stringify(bibs)};
          return {
            tabs: {
              query: async () => [{ id: 1, url: ${JSON.stringify(url)} }],
              sendMessage: async (_id, msg) =>
                msg.type === 'list-page-bibs' ? { ok: true, bibs: BIBS }
                : msg.type === 'record-page-brief' ? { ok: true, brief: BIBS[1] } : {},
            },
            storage: {
              sync: { get: async () => ({ preferredBranch: 'Central', accumulateMode: true }), set: async () => {} },
              local: { get: async () => ({ accumulatedRows: new Array(7).fill('') }), set: async () => {} },
              onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({}) },
          };
        })();`,
      }));
      await page.addInitScript((css) => {
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style');
          s.textContent = css + '\nbody { font-family: Inter, sans-serif !important; -webkit-font-smoothing: antialiased; }';
          document.head.appendChild(s);
        });
      }, fonts);
      await page.goto(`${base}/extension/popup/popup.html`);
      await page.evaluate(() => document.fonts.ready);
      if (setup) await setup(page);
      await page.waitForTimeout(400);
      const buf = await (await page.$('body')).screenshot();
      await page.close();
      return asDataUrl(buf);
    }
    const shots = {
      popupList: await capturePopup('list', p => p.click(`.first-n-btn[data-n="${LIST_SIZE}"]`)),
      popupRecord: await capturePopup('record'),
      popupSettings: await capturePopup('settings', p => p.click('.tab[data-tab="settings"]')),
    };
    console.log('  popup:   list, record and settings captured');

    // ---- 3. the real app, after a real Quick Add paste ------------------
    // CDN libs the capture doesn't need: stub them so a blocked CDN can't
    // kill init() partway (same stubs as tools/og-image).
    await ctx.addInitScript(() => {
      if (!window.Sortable) window.Sortable = function () {};
      if (!window.QRCode) {
        window.QRCode = function () { this.clear = () => {}; this.makeCode = () => {}; };
        window.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
      }
      if (!window.jspdf) window.jspdf = { jsPDF: function () {} };
      if (!window.html2canvas) window.html2canvas = () => Promise.resolve(document.createElement('canvas'));
    });
    const app = await ctx.newPage();
    const appErrors = [];
    app.on('pageerror', e => appErrors.push(String(e)));
    if (faDir) {
      // Serve Font Awesome from node_modules and drop the SRI attribute so
      // the local copy is accepted.
      await app.route('**/index.html', async (r) => {
        const res = await r.fetch();
        const html = (await res.text()).replace(/(font-awesome[^"]*all\.min\.css")\s+integrity="[^"]*"/, '$1');
        r.fulfill({ response: res, body: html });
      });
      await app.route('https://cdnjs.cloudflare.com/**', (r) => {
        const m = new URL(r.request().url()).pathname.match(/font-awesome\/[\d.]+\/(css|webfonts)\/(.+)$/);
        return m ? r.fulfill({ path: join(faDir, m[1], m[2]), headers: { 'Access-Control-Allow-Origin': '*' } }) : r.continue();
      });
    }
    await app.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
      });
    }, georgia);
    await app.goto(`${base}/index.html`, { waitUntil: 'load' });
    await app.waitForTimeout(1000);

    // Exactly what content.js copies: title, author as catalogued, call
    // number, cover data URL.
    const tsv = bibs.slice(0, LIST_SIZE).map((b, i) => [
      b.subTitle ? `${b.title}: ${b.subTitle}` : b.title, BOOKS[i][2], b.callNumber, b.coverUrl,
    ].join('\t')).join('\n');
    await app.click('#quickAddBtn');
    await app.click('#quick-add-tab-multi');
    await app.fill('#quick-add-multi-text', tsv);
    await app.click('#quick-add-submit-btn');
    await app.waitForTimeout(1000);
    const missing = await app.evaluate((titles) => {
      const text = document.getElementById('preview-area').textContent;
      return titles.filter(t => !text.includes(t));
    }, BOOKS.slice(0, LIST_SIZE).map(b => b[0]));
    if (missing.length) throw new Error(`Quick Add did not place: ${missing.join(', ')}`);

    // The cover and list name are the user's next steps, not the
    // extension's; filled in so the pages don't read as half-built.
    await app.fill('#list-name-input', 'Fall Fiction');
    await app.evaluate(async () => {
      // The cover textarea sits in a closed tab, so set it directly; the
      // input event is what the app listens for.
      const t = document.getElementById('cover-title-input');
      t.value = 'Fall Fiction\nStaff Picks';
      t.dispatchEvent(new window.Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      await BooklistApp.generateCoverCollage();
      await new Promise(r => setTimeout(r, 1500));
      ['folio-container', 'notification', 'zoom-controls'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.getElementById('print-page-2').scrollIntoView({ block: 'start' });
    });
    await app.waitForTimeout(500);
    if (appErrors.length) throw new Error('app threw: ' + appErrors[0]);
    shots.app = asDataUrl(await app.screenshot());

    await app.evaluate(() => {
      document.getElementById('preview-area').classList.add('print-mode');
      document.getElementById('print-page-1').scrollIntoView({ block: 'center' });
    });
    await app.waitForTimeout(500);
    shots.panelCover = asDataUrl(await (await app.$('#front-cover-panel')).screenshot());
    console.log(`  app:     ${LIST_SIZE} titles pasted, cover generated${faDir ? '' : ' (icons from cdnjs)'}`);

    // ---- 4. render each image -----------------------------------------
    const iconSvg = readFileSync(join(REPO_ROOT, 'extension', 'icons', 'icon.svg'), 'utf8')
      .replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
    const images = storeImages({ shots, covers, fonts, iconSvg });
    mkdirSync(OUT_DIR, { recursive: true });

    for (const [name, { w, h, html }] of Object.entries(images)) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(
        `<!doctype html><html><body style="width:${w}px;height:${h}px;position:relative">${html}</body></html>`,
        { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const big = await page.screenshot();   // w*SCALE x h*SCALE
      // Downscale in the browser (no image library), hand back raw RGBA.
      const b64 = await page.evaluate(async ({ src, w, h }) => {
        const img = new Image();
        await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = src; });
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, 0, 0, w, h);
        const px = x.getImageData(0, 0, w, h).data;
        let s = '';
        for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode(...px.subarray(i, i + 0x8000));
        return window.btoa(s);
      }, { src: asDataUrl(big), w, h });
      await page.close();
      const png = encodeRgbPng(Buffer.from(b64, 'base64'), w, h);
      writeFileSync(join(OUT_DIR, name), png);
      console.log(`  wrote    dist/store-images/${name}  ${(png.length / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error('\nbuild failed:', err.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Rebuild assets/img/og-image.jpg, the 1200x630 social share card that
 * every page's og:image / twitter:image points at.
 *
 * Run with: npm run build:og
 *
 * NOTHING ON THE SITE NEEDS THIS. The card is a static asset, already
 * committed and served. This is a run-it-when-you-need-it utility in the
 * same slot as extension/build-zips.mjs: use it when the brand, the
 * headline, or the app's own page layout changes enough that the shipped
 * card misrepresents the product.
 *
 * Unlike build-zips.mjs it is NOT dependency-free. It drives a real
 * browser, so it needs playwright-core plus a Chromium binary, and it
 * fetches fonts over the network. Those are deliberately kept OUT of
 * package.json devDependencies so a clean checkout, CI, and the
 * SessionStart `npm install` never pay for a tool used once a year:
 *
 *   npm install --no-save playwright-core
 *   npx playwright install chromium     # or set PLAYWRIGHT_CHROMIUM
 *
 * Why it drives the app instead of drawing a mockup: the two page images
 * on the card have to BE the product. An earlier hand-drawn version got
 * the collage wrong (flush edge-to-edge tiles, when drawLayoutClassic
 * actually lays covers out at a 0.75 aspect with 12%/8% gutters on
 * white), and a later one showed the bare collage canvas with none of
 * the page margin the PDF gives it. So: build a state, push it through
 * BooklistApp.applyState, generate the collage, then screenshot whole
 * panels with print-mode applied. What lands on the card is what lands
 * in the PDF.
 *
 * The twelve cover images are abstract by design. Real titles would mean
 * fabricating jacket art for real books, and a card that reads as a
 * genuine catalog record is not something that should circulate.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..', '..');
const OUT = join(REPO_ROOT, 'assets', 'img', 'og-image.jpg');
const PORT = 8731;

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;      // render at 2x and downscale; keeps type crisp
const QUALITY = 0.94;

/* Invented titles for a plausible Staff Picks display. Nothing real. */
const BOOKS = [
  ['The Salt Harvest', 'Mira Delacroix', 'FIC DELACROIX', 'A fishing town on a shrinking coast learns that the tide taking their livelihood is also returning what it swallowed a century ago.'],
  ['Nightjar', 'Owen Petrakis', 'FIC PETRAKIS', 'A rural veterinarian starts hearing a bird that no field guide lists, and following the sound costs her far more than a season.'],
  ['The Cartographer of Ash', 'Beatriz Lindqvist', 'FIC LINDQVIST', 'Sent to map a valley after the fire, a surveyor finds the residents have redrawn it themselves, and disagree with her lines.'],
  ['Small Hours', 'Ada Nwosu', 'FIC NWOSU', 'Six linked stories set between midnight and dawn in a city hospital, where the night shift keeps its own kind of time.'],
  ['The Weight of Bees', 'Tomas Halloran', '638.1 HALLORAN', 'A beekeeper chronicles a decade of losses and stubborn recoveries, and what forty hives taught him about paying attention.'],
  ['Riverwork', 'Simone Achebe', 'FIC ACHEBE', 'Three generations of a family that built bridges, and the crossing none of them could finish.'],
  ['A Field Guide to Leaving', 'Ruth Okonkwo', '910.4 OKONKWO', 'Part travelogue, part reckoning: an essayist revisits every place she once fled and asks what she was running from.'],
  ['The Lantern Rooms', 'Yusuf Bergstrom', 'FIC BERGSTROM', 'A translator inherits a house whose previous owner left instructions in four languages, none of them entirely honest.'],
  ['Understory', 'Clara Mbeki', '577.3 MBEKI', 'What happens beneath a forest floor, told by an ecologist who spent eleven years listening to roots negotiate.'],
  ['The Quiet Machinery', 'Anton Reyes', 'FIC REYES', 'In a factory town where the plant never closed, a maintenance worker discovers the line has been running empty for months.'],
  ['Winter Count', 'Hana Lindgren', 'FIC LINDGREN', 'A translator of Arctic oral histories confronts the year her own family stopped keeping records.'],
  ['The Borrowed Coast', 'Femi Aturu', 'FIC ATURU', 'Two siblings return to the rented beach house of their childhood to settle an estate and an older argument.'],
];

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' +
  '&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

function curl(url, binary) {
  // curl rather than fetch: it honours HTTPS_PROXY without extra wiring,
  // and build-zips.mjs already shells out for `zip`.
  return execFileSync('curl', [
    '-sS', '--fail', '--max-time', '45',
    '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    url,
  ], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Google Fonts CSS -> @font-face blocks with the woff2 bytes inlined. */
function inlineFonts() {
  const css = curl(FONT_CSS_URL, false);
  const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[\s\S]*?\})/g)];
  const out = [];
  for (const [, subset, block] of blocks) {
    if (subset !== 'latin') continue;          // the card is English-only
    const url = block.match(/url\((https:\/\/[^)]+)\)/)[1];
    const b64 = curl(url, true).toString('base64');
    out.push(block
      .replace(/url\(https:\/\/[^)]+\)/, `url(data:font/woff2;base64,${b64})`)
      .replace(/\s*unicode-range:[^;]+;/, ''));
  }
  if (!out.length) throw new Error('no latin font faces resolved from Google Fonts');
  console.log(`  fonts:   ${out.length} latin faces inlined`);
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

  const fontFaces = inlineFonts();
  const server = await serveRepo();
  const browser = await chromium.launch({ executablePath });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      deviceScaleFactor: SCALE,
    });

    /* CDN libs are often unreachable offline/sandboxed, and a throwing
       `new Sortable` kills init() partway with symptoms that look like
       real bugs. Stub before any page script runs. */
    await ctx.addInitScript(() => {
      if (!window.Sortable) window.Sortable = function () {};
      if (!window.QRCode) {
        window.QRCode = function () { this.clear = () => {}; this.makeCode = () => {}; };
        window.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
      }
      if (!window.jspdf) window.jspdf = { jsPDF: function () {} };
      if (!window.html2canvas) window.html2canvas = () => Promise.resolve(document.createElement('canvas'));
    });

    // ---- 1. drive the real app -------------------------------------
    const app = await ctx.newPage();
    const appErrors = [];
    app.on('pageerror', e => appErrors.push(String(e)));
    await app.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await app.waitForTimeout(700);

    const entries = await app.evaluate(async (BOOKS) => {
      /* Abstract cover art, drawn at the 0.75 aspect drawLayoutClassic
         expects. Three motifs, cycled, in a muted print-like palette. */
      const P = [
        ['#3f4d8a', '#2b3663', '#e7eaf7'], ['#8c5a3c', '#6a4029', '#f6e7d8'],
        ['#3f6b63', '#2b4c46', '#dcefe9'], ['#7a3f4e', '#5b2c38', '#f7dfe4'],
        ['#5c6bc0', '#41509c', '#eceffb'], ['#6d6a3f', '#4e4c2c', '#f0eeda'],
        ['#37474f', '#25323a', '#dde4e8'], ['#93704a', '#6e5233', '#f8ecdc'],
        ['#4a5b8f', '#34436d', '#e4e8f5'], ['#5f4470', '#442e51', '#ece2f2'],
        ['#356070', '#234550', '#dbecf3'], ['#8a4a3c', '#673529', '#f7e2da'],
      ];
      const covers = P.map(([bg, dark, ink], i) => {
        const c = document.createElement('canvas');
        c.width = 600; c.height = 800;
        const x = c.getContext('2d');
        x.fillStyle = bg; x.fillRect(0, 0, 600, 800);
        x.fillStyle = dark; x.fillRect(0, 0, 26, 800);
        const style = i % 3;
        if (style === 0) {
          x.fillStyle = ink; x.fillRect(96, 120, 380, 28); x.fillRect(96, 176, 250, 28);
          x.fillStyle = dark; x.fillRect(96, 632, 176, 16);
        } else if (style === 1) {
          x.strokeStyle = ink; x.lineWidth = 7; x.strokeRect(104, 168, 428, 302);
          x.fillStyle = ink; x.fillRect(104, 540, 300, 30);
          x.fillStyle = dark; x.fillRect(104, 606, 168, 20);
        } else {
          x.fillStyle = dark; x.fillRect(0, 300, 600, 72); x.fillRect(96, 470, 200, 18);
          x.fillStyle = ink; x.fillRect(96, 524, 372, 30); x.fillRect(96, 578, 230, 26);
        }
        return c.toDataURL('image/jpeg', 0.88);
      });

      /* tour.js carries a known-good state literal; reuse it as the
         schema template so every field applyState reads is present. */
      const src = await (await fetch('assets/js/tour.js')).text();
      const start = src.indexOf('const TOUR_SAMPLE_STATE = {')
        + 'const TOUR_SAMPLE_STATE = '.length;
      let depth = 0, end = start;
      for (let i = start; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
      }
      const state = (0, eval)('(' + src.slice(start, end) + ')');

      const blanks = state.books.filter(b => b.isBlank);
      state.books = BOOKS.map(([title, author, callNumber, description], i) => ({
        key: 'og-' + i, isBlank: false, title, author, callNumber,
        authorDisplay: `By ${author} - ${callNumber}`,
        description, cover_ids: [], currentCoverIndex: 0,
        customCoverData: covers[i], includeInCollage: true,
      })).concat(blanks);

      Object.assign(state.meta, { listName: 'Staff Picks' });
      Object.assign(state.ui, {
        coverTitle: 'Staff Picks\nCentral Library',
        coverLineTexts: ['Staff Picks', 'Central Library', ''],
        collageLayout: 'classic', titleBarPosition: 'classic',
        collageCoverCount: 12, showQr: false, showBranding: false,
      });

      BooklistApp.applyState(state, { silent: true });
      await new Promise(r => setTimeout(r, 500));
      await BooklistApp.generateCoverCollage();
      await new Promise(r => setTimeout(r, 1200));

      const img = document.querySelector('#front-cover-uploader img');
      if (!img || !img.src || img.src.length < 5000) throw new Error('collage was not generated');
      return document.querySelectorAll('#inside-left-panel .list-item').length;
    }, BOOKS);

    if (appErrors.length) throw new Error('app threw: ' + appErrors[0]);
    console.log(`  app:     collage generated, ${entries} entries on the inside panel`);

    /* print-mode is the class exportPdf applies: no editor chrome, and
       the panels carry the page margins the PDF has. Capture whole
       panels, never the bare collage canvas. */
    await app.evaluate(() => {
      document.getElementById('preview-area').classList.add('print-mode');
      ['zoom-controls', 'folio-container', 'notification'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';   // overlays bleed into element shots
      });
    });
    await app.waitForTimeout(500);

    const grab = async (pageId, panelId) => {
      await app.evaluate(id => document.getElementById(id)
        ?.scrollIntoView({ block: 'center' }), pageId);
      await app.waitForTimeout(300);
      const buf = await (await app.$(panelId)).screenshot();
      return 'data:image/png;base64,' + buf.toString('base64');
    };
    const coverSrc = await grab('print-page-1', '#front-cover-panel');
    const insideSrc = await grab('print-page-2', '#inside-left-panel');
    console.log('  panels:  front cover + inside captured in print-mode');

    // ---- 2. compose the card ---------------------------------------
    // Strip HTML comments first: card.html documents these token names in
    // a header comment, and those mentions come BEFORE the real ones, so
    // a plain .replace() substitutes into the comment and leaves the img
    // src attributes untouched. Function replacements also stop `$&` and
    // friends being interpreted inside the substituted data URLs.
    const template = readFileSync(join(TOOL_DIR, 'card.html'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '');
    const html = [
      ['__FONT_FACES__', fontFaces],
      ['__COVER_SRC__', coverSrc],
      ['__INSIDE_SRC__', insideSrc],
    ].reduce((acc, [token, value]) => {
      if (!acc.includes(token)) throw new Error(`card.html is missing ${token}`);
      return acc.replaceAll(token, () => value);
    }, template);

    const card = await ctx.newPage();
    await card.setViewportSize({ width: WIDTH, height: HEIGHT });
    await card.setContent(html, { waitUntil: 'load' });
    await card.evaluate(() => document.fonts.ready);
    await card.waitForTimeout(300);
    const shot = await card.screenshot();   // WIDTH*SCALE x HEIGHT*SCALE

    // ---- 3. downscale and encode -----------------------------------
    // Done in the browser so the tool needs no image library.
    const jpeg = await card.evaluate(async ({ png, w, h, q }) => {
      const img = new Image();
      await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = png; });
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', q);
    }, { png: 'data:image/png;base64,' + shot.toString('base64'), w: WIDTH, h: HEIGHT, q: QUALITY });

    const bytes = Buffer.from(jpeg.split(',')[1], 'base64');
    writeFileSync(OUT, bytes);
    console.log(`\n  wrote assets/img/og-image.jpg  ${WIDTH}x${HEIGHT}  ${(bytes.length / 1024).toFixed(1)} KB`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => { console.error('\nbuild failed:', err.message); process.exit(1); });

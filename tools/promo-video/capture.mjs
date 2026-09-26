/**
 * Films the real Booklister tool for the promo video.
 *
 * Every screen of the app that appears in the video comes from here: the
 * public tool (index.html) served from this checkout, driven in headless
 * Chromium through the same clicks and keystrokes a person would use.
 * After each change of state it saves a screenshot and the on-screen
 * rectangle of every control the video points at, so the cursor, the
 * zooms and the callouts in scene.html land on real controls. Nothing on
 * these screens is redrawn by hand.
 *
 * What is stubbed, and why:
 * - The CDN libraries (Sortable, jsPDF, html2canvas, QRCode, Font Awesome)
 *   are served from npm copies of the same versions, and the HTML's
 *   integrity attributes are dropped on the way through, because npm's
 *   bytes are not guaranteed to match cdnjs's pinned hashes. The pages on
 *   disk are untouched.
 * - Open Library search answers with the invented titles, and every
 *   cover request is answered with their abstract art. No real book, and
 *   no real jacket, appears in the video.
 * - placehold.co (the empty-slot placeholder) is drawn locally.
 */

import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { URL } from 'node:url';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};
const CDN = {
  'Sortable.min.js': 'sortablejs/Sortable.min.js',
  'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js',
  'html2canvas.min.js': 'html2canvas/dist/html2canvas.min.js',
  'qrcode.min.js': 'qrcodejs/qrcode.min.js',
  'all.min.css': '@fortawesome/fontawesome-free/css/all.min.css',
};

export const VIEWPORT = { width: 1280, height: 756, dpr: 2 };

function serveRepo(root, port) {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
    let body = readFileSync(file);
    if (extname(file) === '.html') body = Buffer.from(body.toString().replace(/\s(integrity|crossorigin)="[^"]*"/g, ''));
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

function cdnBody(root, name) {
  const file = join(root, 'node_modules', CDN[name]);
  if (!existsSync(file)) {
    throw new Error(`missing ${CDN[name]}; run: npm install --no-save sortablejs@1.15.0 jspdf@2.5.1 html2canvas@1.4.1 qrcodejs@1.0.0 @fortawesome/fontawesome-free@6.4.0`);
  }
  let body = readFileSync(file);
  if (name === 'all.min.css') {
    const dir = join(root, 'node_modules/@fortawesome/fontawesome-free/webfonts');
    body = Buffer.from(body.toString().replace(/url\(\.\.\/webfonts\/([\w-]+)\.(woff2|ttf)\)/g, (m, f, ext) => (ext === 'woff2'
      ? `url(data:font/woff2;base64,${readFileSync(join(dir, f + '.woff2')).toString('base64')})`
      : 'url(about:invalid)')));
  }
  return body;
}

function placeholderSvg(u) {
  const m = u.pathname.match(/(\d+)x(\d+)/);
  const w = m ? +m[1] : 300, h = m ? +m[2] : 450;
  const seg = u.pathname.split('/');
  const bg = (seg[2] || 'e2e8f0').replace(/\.\w+$/, ''), fg = (seg[3] || '718096').replace(/\.\w+$/, '');
  const text = (u.searchParams.get('text') || `${w}×${h}`).replace(/\+/g, ' ');
  const lines = text.split(/\\n|\n/);
  const fs = Math.round(Math.min(w / 10, h / 8));
  const tspans = lines.map((l, i) => `<tspan x="50%" dy="${i ? 1.2 : -(lines.length - 1) * 0.6}em">${l}</tspan>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#${bg}"/>`
    + `<text x="50%" y="50%" font-family="sans-serif" font-size="${fs}" fill="#${fg}" text-anchor="middle" dominant-baseline="middle">${tspans}</text></svg>`;
}

/**
 * @param browser  a launched Playwright browser
 * @param opts.root      repo root
 * @param opts.outDir    where shots are written
 * @param opts.books     [{t, a, c, d}] the invented titles
 * @param opts.covers    Buffer[] JPEG cover art, same order as books
 * @param opts.logo      PNG Buffer, an invented library's branding image
 * @param opts.search    indexes into books returned by the search
 * @param opts.pasted    indexes into books pasted into Quick Add
 * @param opts.log       progress logger
 */
export async function captureApp(browser, opts) {
  const { root, outDir, books, covers, search, pasted, logo } = opts;
  const log = opts.log || (() => {});
  readdirSync(outDir).filter((f) => /^(shot-.*\.jpg|print-page-\d\.png|collage-fail\.png)$/.test(f)).forEach((f) => rmSync(join(outDir, f)));
  const port = 8741;
  const server = await serveRepo(root, port);
  const ctx = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    const cors = { 'access-control-allow-origin': '*' };
    if (u.hostname === '127.0.0.1') return route.continue();
    if (u.hostname === 'cdnjs.cloudflare.com') {
      const name = u.pathname.split('/').pop();
      if (CDN[name]) return route.fulfill({ body: cdnBody(root, name), contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', headers: cors });
    }
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return route.continue();
    if (u.hostname === 'placehold.co') return route.fulfill({ body: placeholderSvg(u), contentType: 'image/svg+xml', headers: cors });
    if (u.hostname === 'openlibrary.org' && u.pathname === '/search.json') {
      const docs = search.map((bi) => ({ key: `/works/OLDEMO${bi}W`, title: books[bi].t, author_name: [books[bi].a], cover_i: 900000 + bi }));
      return route.fulfill({ body: JSON.stringify({ numFound: docs.length, docs }), contentType: 'application/json', headers: cors });
    }
    if (u.hostname === 'openlibrary.org') return route.fulfill({ body: JSON.stringify({ entries: [], size: 0 }), contentType: 'application/json', headers: cors });
    const cov = u.hostname === 'covers.openlibrary.org' ? u.pathname.match(/\/(\d+)-/) : u.hostname === 'catalog.example.org' ? u.pathname.match(/\/(\d+)\.jpg/) : null;
    if (cov) return route.fulfill({ body: covers[(+cov[1]) % 1000], contentType: 'image/jpeg', headers: cors });
    return route.fulfill({ status: 404, body: '' });
  });

  // scrollIntoView scrolls every ancestor, including the app's fixed
  // layout boxes (overflow: hidden), which slides the whole tool up and
  // opens an empty band above the footer. Reveal things by scrolling only
  // their real scroll panel, then put any other ancestor back at zero.
  await ctx.addInitScript(() => {
    window.__reveal = (el, block, offset) => {
      el.scrollIntoView({ block: block || 'center', behavior: 'instant' });
      for (let p = el.parentElement; p; p = p.parentElement) {
        const oy = window.getComputedStyle(p).overflowY;
        if (p.scrollTop && oy !== 'auto' && oy !== 'scroll') p.scrollTop = 0;
        if (offset && (oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) { p.scrollTop += offset; offset = 0; }
      }
      window.scrollTo(0, 0);
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shots = [];
  const wait = (ms) => page.waitForTimeout(ms);
  const rect = (sel, nth = 0) => page.evaluate(([s, n]) => {
    const el = typeof s === 'string' ? document.querySelectorAll(s)[n] : null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
  }, [sel, nth]);
  async function shot(id, targets) {
    await page.evaluate(() => document.fonts.ready);
    // Playwright's own clicks auto-scroll to reach their target and can
    // nudge the same fixed layout boxes; settle them before every frame.
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach((el) => {
        if (!el.scrollTop) return;
        const oy = window.getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') el.scrollTop = 0;
      });
      window.scrollTo(0, 0);
    });
    const file = `shot-${String(shots.length).padStart(3, '0')}-${id}.jpg`;
    await page.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 90 });
    const rects = {};
    for (const [name, sel] of Object.entries(targets || {})) {
      rects[name] = Array.isArray(sel) ? await rect(sel[0], sel[1]) : await rect(sel);
    }
    shots.push({ id, file, rects });
    log(`  shot ${shots.length - 1} ${id}`);
  }
  async function typeWithShots(sel, text, id, every, targets) {
    await page.click(sel);
    for (let i = 0; i < text.length; i++) {
      await page.keyboard.type(text[i] === '\n' ? '' : text[i]);
      if (text[i] === '\n') await page.keyboard.press('Enter');
      if ((i + 1) % every === 0 || i === text.length - 1) { await wait(40); await shot(`${id}-${i + 1}`, targets); }
    }
  }
  // Before a click: bring the control into view the way a person would,
  // then film the frame the click happens on, with the control's rect.
  async function pre(id, sel, nth = 0, targets) {
    await page.evaluate(([q, n]) => {
      const el = document.querySelectorAll(q)[n];
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 20) window.__reveal(el, 'center');
    }, [sel, nth]);
    await wait(200);
    await shot(id, Object.assign({}, targets || {}, { target: [sel, nth] }));
    return shots[shots.length - 1].rects.target;
  }
  const clickRect = (r) => page.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2);
  const coverSrc = () => page.evaluate(() => document.querySelector('#front-cover-uploader img')?.src.slice(-80) || '');
  async function waitForCollage(prev) {
    for (let i = 0; i < 80; i++) {
      await wait(150);
      const s = await coverSrc();
      if (s && s !== prev && s.length > 40) { await wait(250); return; }
    }
    const why = await page.evaluate(() => ({
      note: document.getElementById('notification')?.innerText,
      imgs: [...document.querySelectorAll('.list-item img')].map((i) => `${i.complete}/${i.naturalWidth}:${i.src.slice(0, 50)}`),
    }));
    await page.screenshot({ path: join(outDir, 'collage-fail.png') });
    throw new Error('collage did not regenerate: ' + JSON.stringify(why));
  }
  const scrollTo = (id, block = 'start') => page.evaluate(([i, b]) => window.__reveal(document.getElementById(i), b), [id, block]);
  const item = (n) => ['#print-page-2 .list-item, #print-page-1 .list-item', n];

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => { BooklistApp.fitToWidth(); });
  await wait(300);
  await scrollTo('print-page-2');
  await wait(300);
  const common = { search: '#keywordInput', searchBtn: '#fetchButton', quickAdd: '#quickAddBtn', page2: '#print-page-2', side: '.sidebar' };

  // ---- Search -----------------------------------------------------
  await shot('start', common);
  await typeWithShots('#keywordInput', 'the sea', 'type', 1, common);
  await page.click('#fetchButton');
  await wait(1500);
  const addSel = '.add-to-list-button';
  const resTargets = Object.assign({}, common, { add0: [addSel, 0], add1: [addSel, 1], add2: [addSel, 2], results: '#results' });
  await shot('results', resTargets);
  // The cards are tall; scroll the results the way a person would.
  await page.evaluate((s) => window.__reveal(document.querySelectorAll(s)[0], 'center'), addSel);
  await wait(250);
  await shot('results-scrolled', resTargets);
  for (let i = 0; i < 3; i++) {
    const r = await pre(`pre-add-${i}`, addSel, i, resTargets);
    await clickRect(r);
    await wait(700);
    await shot(`added-${i}`, Object.assign({}, resTargets, { slot: item(i) }));
  }
  // ---- Quick Add --------------------------------------------------
  await page.click('#quickAddBtn');
  await wait(500);
  const qa = { modal: '#quick-add-modal .modal-content, #quick-add-modal', textarea: '#quick-add-multi-text', submit: '#quick-add-submit-btn' };
  await shot('qa-open', qa);
  const tsv = pasted.map((bi) => {
    const b = books[bi];
    const [first, ...rest] = b.a.split(' ');
    return [b.t, `${rest.join(' ')}, ${first}`, b.c, `https://catalog.example.org/covers/${bi}.jpg`].join('\t');
  }).join('\n');
  await page.fill('#quick-add-multi-text', tsv);
  await wait(300);
  await page.evaluate(() => { document.getElementById('quick-add-multi-text').scrollTop = 0; });
  await shot('qa-pasted', qa);
  await page.click('#quick-add-submit-btn');
  await wait(1500);
  await scrollTo('print-page-2');
  await wait(400);
  await shot('qa-done', Object.assign({}, common, { item0: item(0), item5: item(5) }));

  // ---- Editing a title's text --------------------------------------
  const it = (n, sub) => [`#print-page-2 .list-item`, n, sub];
  const subRect = ([s, n, sub]) => page.evaluate(([a, b, c]) => {
    const li = document.querySelectorAll(a)[b];
    const el = c ? li?.querySelector(c) : li;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  }, [s, n, sub]);
  async function shotSub(id, subs) {
    await shot(id);
    const last = shots[shots.length - 1];
    for (const [name, spec] of Object.entries(subs)) last.rects[name] = await subRect(spec);
  }
  const editSubs = {
    desc0: it(0, '.description-field'), author0: it(0, '.author-field'), title0: it(0, '.title-field'),
    cover0: it(0, 'img'), star2: it(2, '.star-button'), rail2: it(2, '.list-item-controls'),
    handle0: it(0, '.drag-handle'), entry0: it(0, '.list-item-details, .item-details'), item0: it(0, ''),
  };
  await page.hover('#print-page-2 .list-item >> nth=0');
  await wait(300);
  await shotSub('hover0', editSubs);
  const author0 = await subRect(it(0, '.author-field'));
  // click at the end of the author line, where "[Call #]" is
  await page.mouse.click(author0[0] + author0[2] - 6, author0[1] + author0[3] / 2);
  await wait(200);
  for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
  await shotSub('call-cleared', editSubs);
  const call0 = books[search[0]].c;
  for (let i = 0; i < call0.length; i++) {
    await page.keyboard.type(call0[i]);
    if (i % 3 === 2 || i === call0.length - 1) { await wait(30); await shotSub(`call-${i}`, editSubs); }
  }
  const desc0 = await subRect(it(0, '.description-field'));
  await page.mouse.click(desc0[0] + 30, desc0[1] + desc0[3] / 2);
  await wait(250);
  await shotSub('desc-focus', editSubs);
  const d0 = books[search[0]].d;
  for (let i = 0; i < d0.length; i++) {
    await page.keyboard.type(d0[i]);
    if (i % 9 === 8 || i === d0.length - 1) { await wait(20); await shotSub(`desc-${i}`, editSubs); }
  }
  // Later: the rest of the blurbs and call numbers, typed the same way.
  await page.mouse.click(5, VIEWPORT.height - 5);
  await page.evaluate(({ fills }) => {
    // Written through the same fields a person types into: set the text,
    // then fire the input and blur the app listens for.
    const byTitle = {};
    document.querySelectorAll('.list-item').forEach((li) => { byTitle[li.querySelector('.title-field')?.innerText.trim()] = li; });
    fills.forEach(({ t, a, c, d, fixCall }) => {
      const li = byTitle[t];
      if (!li) return;
      const put = (el, text) => {
        el.dispatchEvent(new window.Event('focus'));
        el.innerText = text;
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
        el.dispatchEvent(new window.Event('blur'));
      };
      if (fixCall) put(li.querySelector('.author-field'), `By ${a} - ${c}`);
      put(li.querySelector('.description-field'), d);
    });
  }, { fills: [...search.slice(1).map((bi) => Object.assign({ fixCall: true }, books[bi])), ...pasted.map((bi) => books[bi])] });
  await wait(600);
  await scrollTo('print-page-2');
  await wait(300);
  await page.mouse.move(5, VIEWPORT.height - 5);
  await shotSub('filled', editSubs);

  // ---- Stars --------------------------------------------------------
  await page.hover('#print-page-2 .list-item >> nth=2');
  await wait(300);
  await shotSub('star-hover', editSubs);
  const star2 = await subRect(it(2, '.star-button'));
  await page.mouse.click(star2[0] + star2[2] / 2, star2[1] + star2[3] / 2);
  await wait(400);
  await shotSub('star-off', editSubs);
  await page.mouse.click(star2[0] + star2[2] / 2, star2[1] + star2[3] / 2);
  await wait(400);
  await shotSub('star-on', editSubs);
  await page.mouse.move(5, VIEWPORT.height - 5);

  // ---- Front cover ------------------------------------------------
  await page.click('[aria-controls="tab-front-cover"]');
  await wait(300);
  await scrollTo('print-page-1');
  await wait(300);
  const fc = {
    tab: '[aria-controls="tab-front-cover"]', text: '#cover-title-input', create: '#generate-cover-button', cover: '#front-cover-panel',
    classic: '.layout-option[data-layout="classic"]', honeycomb: '.layout-option[data-layout="honeycomb"]',
    staggered: '.layout-option[data-layout="staggered"]', tilted: '.layout-option[data-layout="tilted"]',
  };
  await shot('fc-tab', fc);
  await typeWithShots('#cover-title-input', 'Staff Picks\nRainy Day Reads', 'fc-type', 4, fc);
  let prev = await coverSrc();
  await clickRect(await pre('pre-create', '#generate-cover-button', 0, fc));
  await waitForCollage(prev);
  await shot('fc-classic', fc);
  for (const layout of ['tilted', 'staggered', 'honeycomb']) {
    prev = await coverSrc();
    await clickRect(await pre(`pre-${layout}`, `.layout-option[data-layout="${layout}"]`, 0, fc));
    await waitForCollage(prev);
    await shot(`fc-${layout}`, fc);
  }

  // ---- Header style -----------------------------------------------
  const lineTrig = '.line-style-group .custom-font-dropdown-trigger';
  const st = Object.assign({}, fc, {
    font2: [lineTrig, 1], bg: '#cover-title-bg-color', bgPal: ['.color-palette-trigger', 0], grad: '#cover-title-gradient-toggle',
    stylebox: '#cover-title-style-group, .cover-style-section', lineGroup: ['.line-style-group', 1],
  });
  await page.evaluate(() => {
    const g = document.querySelectorAll('.line-style-group')[1];
    window.__reveal(g, 'start', -60);
  });
  await wait(300);
  await shot('st-scrolled', st);
  await page.locator(lineTrig).nth(1).click();
  await wait(300);
  const option = page.locator('.custom-font-dropdown-list:visible >> text="Playfair Display"').first();
  await option.scrollIntoViewIfNeeded();
  await wait(200);
  await shot('st-fontlist', Object.assign({}, st, { option: '.custom-font-dropdown-list [data-value*="Playfair"], .custom-font-dropdown-list .selected' }));
  const optRect = await option.boundingBox();
  shots[shots.length - 1].rects.option = [optRect.x, optRect.y, optRect.width, optRect.height];
  prev = await coverSrc();
  await option.click();
  await waitForCollage(prev);
  await shot('st-font', st);
  // background color, through the palette popover
  const bgWrap = await page.evaluate(() => {
    const w = document.getElementById('cover-title-bg-color').closest('.color-palette-wrap');
    const t = w.querySelector('.color-palette-trigger');
    const r = t.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  });
  await page.mouse.click(bgWrap[0] + bgWrap[2] / 2, bgWrap[1] + bgWrap[3] / 2);
  await wait(300);
  const swatches = await page.evaluate(() => [...document.querySelectorAll('.color-palette-popover.open [style*="background"], .color-palette-popover.open button')]
    .map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, window.getComputedStyle(el).backgroundColor]; }).filter((s) => s[2] > 6 && s[2] < 40));
  await shot('st-palette', Object.assign({}, st, { bgTrig: '.color-palette-popover.open' }));
  shots[shots.length - 1].rects.bgTrigger = bgWrap;
  // pick a plum-ish swatch if there is one, else the fifth
  const pick = swatches.find((s) => /rgb\((9\d|1[0-2]\d), (4\d|5\d|6\d), (1[0-4]\d)\)/.test(s[4])) || swatches[Math.min(5, swatches.length - 1)];
  shots[shots.length - 1].rects.swatch = pick.slice(0, 4);
  prev = await coverSrc();
  await page.mouse.click(pick[0] + pick[2] / 2, pick[1] + pick[3] / 2);
  await waitForCollage(prev);
  await page.mouse.click(5, VIEWPORT.height - 5);
  await wait(200);
  await shot('st-color', st);
  prev = await coverSrc();
  await clickRect(await pre('pre-gradient', '#cover-title-gradient-toggle', 0, st));
  await waitForCollage(prev).catch(() => {});
  await shot('st-gradient', st);

  // ---- Back cover: QR code ----------------------------------------
  await page.click('[aria-controls="tab-back-cover"]');
  await wait(300);
  const bc = { tab: '[aria-controls="tab-back-cover"]', url: '#qr-url-input', update: '#generate-qr-button', qr: '#qr-code-area, .qr-code-uploader', back: '#back-cover-panel', blurb: '#qr-code-text' };
  await shot('bc-tab', bc);
  // The blurb first: once it has text, its long instructional
  // placeholder is gone and the close-up of the QR code reads cleanly.
  await clickRect(await pre('pre-blurb', '#qr-code-text', 0, bc));
  await wait(200);
  const blurb = 'Scan to find these titles in our catalog!';
  for (let i = 0; i < blurb.length; i++) {
    await page.keyboard.type(blurb[i]);
    if (i % 7 === 6 || i === blurb.length - 1) { await wait(20); await shot(`blurb-${i}`, bc); }
  }
  await page.mouse.click(5, VIEWPORT.height - 5);
  await wait(300);
  await typeWithShots('#qr-url-input', 'https://booklister.org', 'bc-url', 3, bc);
  await page.click('#generate-qr-button');
  await wait(700);
  await page.mouse.click(5, VIEWPORT.height - 5);
  await wait(200);
  await shot('bc-qr', bc);
  // A library logo, through the real branding uploader.
  await pre('pre-logo', '#branding-uploader', 0, Object.assign({}, bc, { branding: '#branding-uploader' }));
  // The uploader's own file input: the same change event and handler a
  // person picking a file fires.
  await page.setInputFiles('#branding-uploader input[type="file"]', { name: 'library-logo.png', mimeType: 'image/png', buffer: logo });
  await page.waitForFunction(() => {
    const im = document.querySelector('#branding-uploader img');
    return im && im.dataset.isPlaceholder !== 'true' && im.naturalWidth > 10;
  }, null, { timeout: 15000 }).catch(async (e) => {
    const st = await page.evaluate(() => { const im = document.querySelector('#branding-uploader img'); return [im.dataset.isPlaceholder, im.naturalWidth, im.src.slice(0, 40), document.getElementById('notification')?.innerText]; });
    throw new Error('logo did not load: ' + JSON.stringify(st) + ' ' + e.message);
  });
  await wait(500);
  await page.mouse.click(5, VIEWPORT.height - 5);
  await wait(200);
  await shot('bc-logo', Object.assign({}, bc, { branding: '#branding-uploader' }));
  await page.hover('#export-pdf-button');
  await wait(200);
  await shot('export-hover', { pdf: '#export-pdf-button' });

  // ---- The printed pages, as the PDF renders them -------------------
  // The app's header and footer are fixed bars; at this zoom a page is
  // taller than the space between them, and an element screenshot would
  // pick them up as dark bands along the page's edges. Hide them while
  // the pages are photographed.
  await page.evaluate(() => {
    document.getElementById('preview-area').classList.add('print-mode');
    ['zoom-controls', 'folio-container', 'notification'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.app-header, .site-footer').forEach((el) => { el.style.visibility = 'hidden'; });
  });
  await wait(500);
  const print = {};
  for (const id of ['print-page-1', 'print-page-2']) {
    await scrollTo(id, 'center');
    await wait(300);
    const file = `${id}.png`;
    await (await page.$(`#${id}`)).screenshot({ path: join(outDir, file) });
    print[id] = file;
  }
  // ---- The guided tour, one click away --------------------------------
  await page.evaluate(() => {
    document.getElementById('preview-area').classList.remove('print-mode');
    ['zoom-controls'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    document.querySelectorAll('.app-header, .site-footer').forEach((el) => { el.style.visibility = ''; });
    window.__reveal(document.getElementById('print-page-1'), 'start');
  });
  await wait(400);
  await page.mouse.move(640, 500);
  const tourBtn = await pre('tour-pre', '#tour-button', 0);
  await clickRect(tourBtn);
  await wait(700);
  await page.mouse.move(tourBtn[0] + 60, tourBtn[1] + 200);
  await wait(200);
  await shot('tour-picker', { modal: '.tour-modal', button: '#tour-button', card: ['.tour-section-card', 0] });
  if (errors.length) log('  app errors: ' + errors.join(' | '));
  const manifest = { viewport: VIEWPORT, shots, print };
  writeFileSync(join(outDir, 'shots.json'), JSON.stringify(manifest, null, 1));
  await ctx.close();
  server.close();
  return manifest;
}

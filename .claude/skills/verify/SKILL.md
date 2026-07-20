---
name: verify
description: Drive the Booklister app in headless Chromium to verify changes at the real surface (no build step; static HTML/JS).
---

# Verifying Booklister changes

No build step. Serve the repo root and drive it with Playwright.

## Launch

```bash
python3 -m http.server 8321 &          # serve repo root
# playwright-core (not full playwright) + the preinstalled browser:
npm install playwright-core            # in a scratch dir, not the repo
```

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

## Gotcha: CDN scripts are blocked in the sandbox

Sortable, jsPDF, html2canvas, QRCode load from CDNs that the remote
sandbox can't reach. `new Sortable(...)` then throws mid-`init()` in
app.js and **everything wired after it silently never runs** (including
late-init registrations like Folio's context provider). Symptoms look
like real bugs but aren't. Stub the globals before page scripts run:

```js
await context.addInitScript(() => {
  if (!window.Sortable) window.Sortable = function () {};
  if (!window.QRCode) {
    window.QRCode = function () { this.clear = () => {}; this.makeCode = () => {}; };
    window.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  }
  if (!window.jspdf) window.jspdf = { jsPDF: function () {} };
  if (!window.html2canvas) window.html2canvas = () => Promise.resolve(document.createElement('canvas'));
});
```

`net::ERR_TUNNEL_CONNECTION_FAILED` console errors for CDN/Google Fonts
requests are environment noise, not app failures.

## Flows worth driving

- **Add titles without network**: Quick Add → Spreadsheet tab
  (`#quickAddBtn`, `#quick-add-multi-text`, `#quick-add-submit-btn`)
  with TSV rows; a `data:image/gif;base64,...` 4th column gives books
  valid covers, and the first 12 auto-star. Open Library search needs
  network — avoid it here.
- **Folio**: hidden by default (fresh profile). `#folio-toggle` in the
  header shows him; `#folio` is the SVG. To pre-show him:
  `localStorage.setItem('folio-hidden','false')` then reload.
  Petting = `page.mouse.move` back and forth (~±70px, 4 sweeps) over
  the SVG's bounding box.
- **Star buttons** (`.star-button`) are hover-revealed; count starred
  via `.star-button.active`, and click via `el.click()` in
  `page.evaluate` (Playwright's actionability check times out on them).
- **Reduced motion**: `browser.newContext({ reducedMotion: 'reduce' })`,
  then assert `getComputedStyle(...).animationName === 'none'`.

## Lint/test (CI's job, not verification)

`npm run lint` + `npm run test` — both must pass before committing, per
CLAUDE.md.

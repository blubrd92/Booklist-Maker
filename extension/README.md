# Booklister Helper (browser extension)

A small browser extension that captures a book record from a BiblioCommons library catalog page and copies it as a tab-separated row, ready to paste into [Booklister](https://booklister.org)'s Quick Add → Spreadsheet tab.

**Supported sites**: BiblioCommons-powered library catalogs only (`*.bibliocommons.com`). This covers most North American public-library consortiums (MARINet, Sonoma County Library, San Mateo County, Pima County, etc.) but does not work with Aspen Discovery, Vega, Polaris LEAP, Encore, Sierra OPAC, or other non-BiblioCommons platforms.

**What it does**, in three workflows:

### Single book

1. Open a BiblioCommons book record (URL contains `/v2/record/`).
2. Click the Booklister Helper toolbar icon.
3. The extension reads title, subtitle, author, and per-branch call number, plus fetches the cover image bytes.
4. A single TSV row is copied to your clipboard. Paste into Booklister's Quick Add → Spreadsheet tab.

### Curated list with per-book selection

1. Open any BiblioCommons list page (URL contains `/v2/list/`), e.g. staff picks or themed reading lists.
2. Click the toolbar icon. A popup opens showing every book on the list with a checkbox, cover thumbnail, title, author, and call number.
3. Pick the books you want. All books are checked by default. Use the **All / First 13 / None** buttons at the top of the popup for quick presets, or check/uncheck individual rows.
4. Click **Capture N books**. The popup closes and the extension captures the selected books, fetching their per-branch call numbers and covers in parallel. Takes ~5-10 seconds for 13 books.
5. A multi-row TSV is copied to your clipboard. Paste into Booklister's Quick Add → Spreadsheet tab.

> **Why a popup with selection?** Most curated BiblioCommons lists run 20-50+ books, but a Booklister booklist has 13-15 slots. Pre-selecting the right subset on the BiblioCommons side saves you from picking and trimming inside Booklister later.

### Accumulate mode (running list of single-book picks)

1. Turn on **Accumulate single-book captures into a running list** in the extension's options page.
2. Browse to book #1, click the toolbar icon → toast says "Added (1 book in list)", toolbar badge reads "1".
3. Browse to book #2, click → "Added (2 books in list)", badge reads "2".
4. Continue until you have enough. The clipboard always holds the latest accumulated TSV.
5. Paste into Booklister's Quick Add → Spreadsheet whenever ready.
6. Right-click the toolbar icon → **Clear accumulated list** to start over (or use the button on the options page).

In all three modes, the cover is embedded as a base64 `data:image/...` URL so saved booklists stay self-contained, and they keep working even if the cover provider's URL changes or expires.

The icon flashes a green ✓ on success or a red badge if something went wrong.

> **Right-click on the page**: a **Capture for Booklister** item appears in the page's right-click menu when you're on a BiblioCommons book record or list page. It runs the same capture as clicking the toolbar icon (and tries to open the selection popup on list pages). The menu item is hidden on every other site, so it doesn't clutter your right-click menu when you're outside BiblioCommons.

> **Note on the clipboard contents**: because each cover is embedded as base64 image bytes, the TSV will be a long-looking string of dense text (~30-80 KB per book). That's normal; just paste and submit. Booklister parses it transparently and renders the covers from those bytes.

## Install (development)

1. Clone the [Booklist-Maker repo](https://github.com/blubrd92/Booklist-Maker).
2. Open Chrome (or any Chromium-based browser like Edge or Brave) and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle at top right).
4. Click **Load unpacked** and select the `extension/` folder from the cloned repo.
5. The Booklister Helper icon appears in your toolbar.

For Firefox: go to `about:debugging` → **This Firefox** → **Load Temporary Add-on**, then pick the `manifest.json` file inside `extension/`.

## Configuration

Open settings from either the toolbar icon's right-click menu (**Settings**) or the gear button in the list-page selection popup. Both open a small standalone settings window; changes auto-save, so just close the window when you're done.

Two settings:

- **Preferred branch** (optional): a substring of your branch name as it appears in BiblioCommons' Availability table (or the branch code, like `SR`). When set, the extension picks that branch's call number when a book has multiple branches with different call numbers. Leave blank to use BiblioCommons' own "local branch" detection, which works automatically when you're signed in to your library account or browsing from your library's IP range. Applied to single-record captures, list-page captures, and every book in an accumulated list.

- **Accumulate single-book captures into a running list** (default off): when on, single-book captures append to a list rather than overwriting the clipboard. The toolbar badge shows the running count. List-page captures (clicking on a `/v2/list/` URL) are independent of this; they always copy the entire list to the clipboard fresh.

## How the call number gets picked

When a book has multiple physical copies across branches with different call numbers (very common in consortium catalogs), the extension chooses one in this order:

1. If you set a **Preferred branch**, items whose branch name (or code) matches it.
2. Otherwise, items where BiblioCommons marks `local: true` (it figures this out from your login or IP).
3. Otherwise, all items.
4. Within the chosen subset, prefer items currently AVAILABLE over checked-out / on-hold ones.
5. Take the first remaining item's call number.

If the availability API can't be reached for any reason, the extension falls back to the first call number listed in the page's main metadata block.

## What it does NOT collect or transmit

The extension makes two network calls per capture, both to public-facing services your library's catalog already uses:

1. `/v2/libraries/{library}/bibs/{bib}/availability` on `gateway.bibliocommons.com`, the same request your catalog page itself makes when you click "Availability by location."
2. The cover image at `https://www.syndetics.com/...` (or whichever cover provider your library uses), the same image your catalog page embeds in the title's record.

Both calls go directly from your browser to those services. Nothing is sent to Booklister or to any server I control.

There is no analytics. No tracking. The TSV row goes from the page directly to your clipboard, in the browser, locally.

## Privacy posture

- `host_permissions` are limited to `*.bibliocommons.com`, `gateway.bibliocommons.com`, and `*.syndetics.com`. The extension cannot read any other site.
- The content script only runs on URLs matching `*://*.bibliocommons.com/v2/record/*` and `*://*.bibliocommons.com/v2/list/*` (BiblioCommons book record + curated list pages).
- `chrome.storage.sync` keys: `preferredBranch` (your typed substring) and `accumulateMode` (boolean). These follow you across Chrome installs if you're signed into Chrome.
- `chrome.storage.local` key: `accumulatedRows` (the array of staged TSV rows when accumulate mode is on). Local-only because each row can carry an embedded cover (~30-80 KB) and the per-item sync quota is 8 KB.
- The cover-image fetch goes through the extension's service worker (which has `host_permissions` for Syndetics) so it can read the image bytes regardless of CORS, and it does not use your cookies (`credentials: 'omit'`), so no authenticated identity leaks to the cover provider.
- No remote-loaded code. The extension ships as a fixed bundle of static JS files.

## Known limitations

- **BiblioCommons-only**, on purpose. Adding adapters for other catalog systems would be a separate extension or a separate adapter file.
- **Search results pages** (`/search?...`) are not supported. Search results don't carry per-book call numbers in the page state, so capture quality would be much worse than the record / list flows. Use single-record or list-page capture instead.
- **Manual install**, no Chrome Web Store / Firefox Add-ons listing yet. Once the v1 stabilizes I'll publish it.
- **Brittle to BiblioCommons redesigns.** They run a single SaaS codebase, so this is rare in practice (~1-2 times a year), but selectors / API shapes may need a refresh occasionally.

## License

ISC, same as the parent Booklister project.

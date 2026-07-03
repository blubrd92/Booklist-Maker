# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Please read carefully.

## Project Overview

Booklister (repo name: Booklist-Maker) is a web-based application for creating, customizing, and exporting printable booklists. It targets libraries creating professional book displays with cover art, customizable typography, QR codes, and branding. Deployed at https://booklister.org.

**Naming note (intentional mismatch)**: The user-facing brand is "Booklister" (in the browser tab title, header logo, content pages, canonical URLs, and meta tags). Internal code identifiers (`BooklistApp` namespace, `book-utils.js`, repo name `Booklist-Maker`, npm package `booklist-maker`, CSS class names, comments) still use "Booklist Maker" or "booklist". These were intentionally left unchanged during the rebrand to avoid breaking references, and should stay as-is unless a full code-wide rename is the task. When writing user-facing strings (page copy, titles, notifications, meta tags) use "Booklister". When referencing code identifiers, keep "BooklistApp" etc.

**Terminology note (titles, not books)**: Booklister can be used for any catalogued title, not just books — DVDs, audiobooks, magazines, music, and so on. User-facing copy should prefer "title(s)" over "book(s)" wherever it reads naturally (e.g. the Quick Add tabs are "Single title" / "Multiple titles"; the extension says "Capture N titles"). This is a forward-looking convention for new and updated copy. It is **not** a mandate to rename the internal `book` data structure, the `myBooklist` array, `createBlankBook`, the `.booklist` file format, the `book-*` CSS classes, or any other code identifier — those are stable and stay. "Booklist" (the thing you make) and "Booklister" (the brand) also stay. The line: generic references to a catalogued item become "title" in user-facing strings; the product name, the file format, the brand, and all code identifiers do not.

**Tech Stack**: Vanilla HTML5/CSS3/JavaScript (ES6+), no build process. Dev tooling: ESLint + Vitest (via npm).

## Running the Application

No build process. Open `index.html` directly in a browser, or use a local server:
```bash
python -m http.server 8000
```

## Development Commands

```bash
npm run lint        # ESLint on assets/js/
npm run test        # Vitest (one-shot)
npm run test:watch  # Vitest (watch mode)
```

Lint and test should both pass before committing changes to JavaScript files.

## Architecture

### File Structure
```
index.html                      Main tool UI, single page (semantic HTML5, ARIA)
about.html                      Static "about" content page
for-libraries.html              Static branded-instance info content page
extension.html                  Booklister Helper content page (the footer's
                                "Helper" link): what the extension does, store
                                links (Chrome Web Store / Firefox Add-ons /
                                Edge Add-ons), install + usage guide
contact.html                    Static contact content page
privacy.html                    Privacy policy content page (CalOPPA-oriented)
terms.html                      Terms of service content page (covers public tool,
                                branded library instances, the Magic button AI
                                feature, and the standard set of boilerplate
                                clauses; California governing law)
CNAME                           Custom domain (booklister.org)
sitemap.xml                     Static sitemap of the 7 user-facing pages,
                                referenced from robots.txt and submitted to
                                Google Search Console. Update when adding or
                                removing a content page.
robots.txt                      Allow-all crawl directive plus the Sitemap:
                                reference. Per-domain; only governs
                                booklister.org. The admin subdomain controls
                                indexing via its own meta noindex tag.
firestore.rules                 Firestore security rules (deployed manually via
                                Firebase console; this file is the source of truth)
assets/
  css/
    styles.css                  Main UI + content page styles, CSS variables
    folio.css                   Folio cat mascot animations and styling
    tour.css                    Guided tour modal and spotlight styling
    auth.css                    Login modal styles for gated library instances
    preview-helper.css          Cloudflare Pages preview mode-picker chip styles
  js/
    config.js                   CONFIG constants (loaded first as global)
    book-utils.js               BookUtils shared pure functions (loaded second)
    app.js                      Core application logic (IIFE, ~8900 lines)
    folio.js                    Animated cat mascot companion
    tour.js                     Guided tour system
    preview-helper.js           IIFE. Cloudflare Pages preview-only mode-picker
                                chip. Self-gates on `*.pages.dev` hosts; on
                                every other host the IIFE returns immediately.
                                Renders a small fixed top-right chip that
                                shows the current mode (public or
                                ?library=<id>) and lets you switch with one
                                click. Fetches the public-branded library list
                                via Firestore REST (no SDK, no auth) — see
                                "Constraints worth protecting" for the
                                documented invariant exception.
    firebase-init.js            ES module. Host-gated Firebase App/Auth/Firestore
                                initialization for branded library subdomains.
                                No-op on the public tool.
    library-config.js           ES module. Reads libraries-public/<id> then
                                libraries/<id> from Firestore and dispatches
                                'library-config-ready' / 'library-config-needs-auth' /
                                'library-config-failed' events to drive the UI.
    auth.js                     ES module. Handles the login modal on gated
                                library instances, error-code mapping, password
                                reset, and the header sign-out button.
  img/
    branding-default.png        Legacy default branding image. Dead code today
                                (not referenced by the admin UI or tool on public
                                instances), kept on disk for backward compatibility
                                with pre-existing drafts that still reference it.
    libraries/<id>/logo.png     Per-library branding images. Each branded library's
                                Firestore doc points at its path here.
admin/                          Separate admin console app served at
                                admin.booklister.org. Same repo, isolated codebase.
  index.html                    Admin console entry point
  admin.css                     Admin console styles (scoped, no bleed)
  admin.js                      Admin console ES module: Google + email sign-in,
                                libraries CRUD, memberships management, invite-by-
                                email flow, promote/demote buttons
extension/                      Browser extension (Manifest V3) — captures book
                                records from BiblioCommons library catalogs and
                                copies them as TSV for paste into Booklister's
                                Quick Add Spreadsheet tab. Standalone codebase;
                                shares nothing with the main tool except brand.
                                All extension code calls the `browser.*` API via
                                the vendored webextension-polyfill (Firefox has
                                it natively; the polyfill shims Chromium).
  manifest.json                 MV3 manifest, host_permissions scoped to
                                *.bibliocommons.com + gateway.bibliocommons.com
                                + *.syndetics.com + *.hoopladigital.com (the
                                last two are cover providers). Two
                                content_scripts.matches: /v2/record/* (single
                                book) + /v2/list/* (lists). Declares an
                                always-on action.default_popup, the contextMenus
                                permission, a Firefox browser_specific_settings
                                block, and BOTH background.service_worker
                                (Chromium) and background.scripts (Firefox) —
                                see build-zips.mjs for why.
  content.js                    Runs on record + list pages. Handles four
                                message types from the popup/background:
                                'capture' (single record, honors accumulate
                                mode), 'capture-selected-bibs' (list capture for
                                the popup's checked subset), 'list-page-bibs'
                                and 'record-page-brief' (shallow metadata reads
                                the popup uses to render its Capture tab; no
                                fetches). Reads the SSR JSON state blob
                                (different shape per page type), fetches the
                                holdings API + cover bytes per book in parallel,
                                builds TSV row(s), writes to clipboard. If the
                                clipboard write fails (tab unfocused), stashes
                                the TSV and shows a persistent click-to-copy
                                recovery toast.
  background.js                 Service worker (Chromium) / background page
                                (Firefox). Three small jobs: the
                                fetch-image-as-data-url proxy (cover fetches
                                need host_permissions to bypass CORS), the
                                persistent toolbar badge with the accumulated
                                list count (refreshed on storage.onChanged), and
                                two right-click context menu items — "Clear
                                accumulated list" (on the toolbar action) and
                                "Capture for Booklister" (on the page, scoped
                                via documentUrlPatterns to bibliocommons record
                                + list URLs; just opens the popup).
  popup/popup.html|.js          Always-on popup (action.default_popup) with two
                                tabs. Capture tab is context-aware: on a
                                /v2/record/ page it shows a one-title preview +
                                capture button; on a /v2/list/ page it renders
                                checkbox rows with All / First N / None presets
                                and dispatches the selection via
                                'capture-selected-bibs'; anywhere else it shows
                                guidance. Settings tab: preferred-branch
                                substring, accumulate-mode toggle, clear-list
                                button (auto-saved; this replaced the old
                                options page). Saved keys: preferredBranch +
                                accumulateMode in browser.storage.sync;
                                accumulatedRows in browser.storage.local
                                (covers can exceed sync's per-item 8 KB quota).
  vendor/browser-polyfill.min.js  Vendored webextension-polyfill (MPL 2.0).
  icons/                        Toolbar + store icons (16/48/128).
  build-zips.mjs                Per-browser packager (node, `npm run
                                package:extension`): emits a Firefox zip (both
                                background keys) and a Chromium zip (strips
                                background.scripts — Edge's MV3 validator
                                rejects it; Firefox AMO requires it) to dist/.
  README.md                     Usage, settings, privacy posture, store links.
  STORE_LISTING.md              Store listing copy + per-version release notes
                                (every manifest version bump needs an entry).
tests/
  setup.js                      Loads config.js + book-utils.js into jsdom via eval
  book-utils.test.js            Unit tests for all BookUtils functions
  config.test.js                Unit tests for CONFIG constants
  create-blank-book.test.js     Unit tests for the createBlankBook factory
eslint.config.js                Four blocks: ES2022 sourceType "script" for the
                                IIFE files, ES2022 sourceType "module" for the
                                Firebase/admin module files, sourceType "script"
                                with the `browser` global for the extension/
                                files (vendor/ ignored), and a Node module block
                                for extension/build-zips.mjs
vitest.config.js                jsdom environment
```

### Script Load Order (in index.html)

Two phases. The first is the legacy IIFE stack that handles the tool itself. The second is a small set of ES modules that add Firebase + branded library support without touching the tool's internals.

**Phase 1 — Inline head scripts (synchronous, run before first paint):**
1. Admin subdomain redirect. If `window.location.hostname === 'admin.booklister.org'`, redirects to `/admin/` before anything else loads. The main tool never starts initializing on the admin subdomain.
2. Branded-host detection. Sets `.awaiting-library-config` on `<html>` synchronously so the tool stays hidden until `applyLibraryConfig()` removes the class, preventing a flash of the unbranded UI on gated subdomains. Mirrors `firebase-init.js`'s PUBLIC_HOSTS list. Cloudflare Pages preview hosts (`*.pages.dev`) are also accepted as public so non-production deploys render the public tool, not the library login modal — keep the two checks in sync if you change either. The `?library=<id>` override is accepted on `*.pages.dev` previews in addition to localhost, so branded-instance flows (login, drafter, branding) can be tested from a preview URL like `your-branch.<project>.pages.dev/?library=sanrafael`. Without the param, previews render the public tool with no Firebase requests, identical to production.

**Phase 2 — Blocking regular scripts (execute in order, synchronously):**
1. CDN libraries: Sortable, jsPDF, html2canvas, QRCode, Font Awesome, Google Fonts
2. `config.js` → exposes `CONFIG` globally
3. `book-utils.js` → exposes `BookUtils` globally (depends on CONFIG)
4. `app.js` → exposes `BooklistApp` IIFE. Attaches `DOMContentLoaded` listener that calls `init()`. Also attaches `window.addEventListener('library-config-ready', ...)` synchronously at IIFE top level so the listener is in place before any ES module can dispatch.
5. `folio.js` → exposes `window.folio` API
6. `tour.js` → exposes `window.startTour()` / `window.startTourSection()`
7. `preview-helper.js` → IIFE, no public API. On `*.pages.dev` hosts only, injects the preview mode-picker chip. On every other host the IIFE returns at line 1 — zero DOM, zero network.

**Phase 3 — Deferred module scripts (execute after HTML parsing completes, in order):**
1. `assets/js/firebase-init.js` → checks hostname. On the public tool it exports nulls and returns without touching the Firebase SDK. On branded hosts it dynamically imports Firebase App/Auth/Firestore from gstatic.com and exposes `window.firebaseAuth` / `window.firebaseDb`.
2. `assets/js/auth.js` → listed before library-config.js so its `'library-config-needs-auth'` / `'library-config-ready'` / `'library-config-failed'` listeners attach synchronously before any dispatch can fire. Handles the login modal and sign-out button.
3. `assets/js/library-config.js` → reads `libraries-public/<id>` then (if needed) `libraries/<id>` from Firestore and dispatches the events that drive `auth.js` and `app.js`.

The public tool never loads Firebase SDK code into the network tab. Only branded subdomains (and localhost with `?library=<id>`) fetch gstatic.

### Module Pattern

Two layers coexist:

**Tool layer** (config.js, book-utils.js, app.js, folio.js, tour.js, preview-helper.js): IIFEs exposing globals. No ES6 imports. No build step. This is the original architecture and should be preserved; adding new JS files to this layer adds load-order dependencies in `index.html`.

```javascript
const BooklistApp = (function() {
  'use strict';
  // Private state: myBooklist[], extraCollageCovers[], DOM element refs
  // Private functions for all business logic
  // Public API:
  return { init, showNotification, getAiDescription, updateBackCoverVisibility,
           resetZoom, enterTourMode, exitTourMode, applyState, generateCoverCollage };
})();
```

`openTab(evt, tabName)` is a separate global function (required by HTML `onclick` attributes).

**Firebase/admin layer** (firebase-init.js, auth.js, library-config.js, admin/admin.js): ES modules with `import`/`export` and dynamic `import()` for CDN-hosted Firebase SDK. These files intentionally use ES modules because the Firebase modular v9+ SDK is import-only and because the admin console is a separate app. They communicate with the IIFE tool layer exclusively via `window.*` globals (`window.LIBRARY_CONFIG`, `window.LIBRARY_REQUIRES_AUTH`, `window.firebaseAuth`) and custom events dispatched on `window`.

`eslint.config.js` has two blocks, one per layer:
- `sourceType: "script"` for all files under `assets/js/` (the IIFE layer)
- `sourceType: "module"` override for `assets/js/firebase-init.js`, `assets/js/library-config.js`, `assets/js/auth.js`, and `admin/admin.js`

Do NOT merge the two layers. Don't import from `assets/js/app.js` in a module file, and don't use `import` syntax inside the IIFE files. They're deliberately separated.

### Key Configuration (config.js)
All constants live in the `CONFIG` object:
- **Layout**: `TOTAL_SLOTS` (15), `SLOTS_PER_INSIDE_PANEL` (5), cover dimensions
- **Dynamic max books**: `MAX_BOOKS_FULL` (15), `MAX_BOOKS_ONE_ELEMENT` (14), `MAX_BOOKS_BOTH_ELEMENTS` (13)
- **Collage**: `MIN_COVERS_FOR_COLLAGE` (12), `MAX_COVERS_FOR_COLLAGE` (20), grid config
- **PDF export**: 600 DPI, 6.25x canvas scale (600/96), 11"x8.5" output
- **QR code**: `QR_SIZE_PX` (900) — renders at 600 DPI equivalent, CSS constrains display to 144px
- **APIs**: Open Library search + covers endpoints
- **Fonts**: Array of 45 font objects `{ value, label }` (single source of truth for all dropdowns)
- **Timing**: `AUTOSAVE_DEBOUNCE_MS` (400), `NOTIFICATION_DURATION_MS` (3000)
- **Placeholders**: Cover URLs, text defaults, colors

### Shared Utilities (book-utils.js)
Pure functions that eliminate duplicated logic. All are tested:
- `BookUtils.hasValidCover(book)` - Checks for non-placeholder cover (custom or Open Library)
- `BookUtils.getStarredBooks(booklist)` - Filters `!isBlank && includeInCollage`
- `BookUtils.getStarredBooksWithCovers(booklist)` - Starred books with valid covers
- `BookUtils.isAtCoverLimit(booklist, extras, max)` - Whether cover count >= limit
- `BookUtils.countTotalCovers(booklist, extras, modeOrCount)` - Total valid covers. Accepts either a legacy boolean (true=20, false=12) or a numeric count (12/16/20)
- `BookUtils.getRequiredCovers(modeOrCount)` - Returns 12, 16, or 20 based on the input. Accepts a boolean (legacy) or a numeric value from `CONFIG.COLLAGE_COVER_COUNTS`. Anything else falls back to 12
- `BookUtils.getCoverUrl(coverId, size)` - Builds Open Library cover URL
- `BookUtils.getBookCoverUrl(book, size)` - Best cover URL: custom > Open Library > placeholder
- `BookUtils.hasEnoughCoversForCollage(booklist, extras, modeOrCount)` - Collage readiness check; accepts the same legacy-or-numeric input as the helpers above
- `BookUtils.flipAuthorName(name)` - Flips "Last, First" → "First Last" only when the name has exactly one comma. Multi-comma strings stay as-is to avoid mangling multi-author or suffix cases. Used by the Quick Add submit handler.
- `BookUtils.toTitleCase(str)` - Converts a string to English-style Title Case. Capitalizes first/last words plus all major words; lowercases articles, conjunctions, and short prepositions when not first/last. Preserves all-uppercase tokens of length 2+ as acronyms. Capitalizes the first letter of each hyphen-separated segment so a compound like `Word-Word` stays `Word-Word` instead of collapsing to `Word-word` (BiblioCommons enters hyphenated titles this way). Also capitalizes the first word of a subtitle (the word immediately after a token ending in `:`, `?`, or `!`) per Chicago/AP style — without this, a minor word at the start of a subtitle (`A Novel`, `Of Two Cities`, `With Love`) would get lowercased by the minor-word rule. Used by the Quick Add submit handler when the Title Case toggle is on.
- `BookUtils.parseQuickAddTsv(rawText, options)` - Parses tab-separated rows pasted from a spreadsheet (Google Sheets, Excel, Numbers) — or from the Booklister Helper browser extension — into `{ rows, headerSkipped, truncated, truncatedAt }`. Each row is `{ title, author, callNumber, coverUrl }`. Auto-detects an optional header row (case-insensitive token match on `title|book title|name` / `author|authors|by` / `call number|callnumber|call no|call#` / `cover|cover url|image|image url`). Normalizes U+00A0 to regular space (Numbers sometimes inserts NBSP in cells). Filters whitespace-only lines but preserves leading-empty cells (so `\tJoe Smith\tFIC` becomes `{ title: '', author: 'Joe Smith', callNumber: 'FIC', coverUrl: '' }`). The optional 4th `coverUrl` column accepts `http:` / `https:` URLs and `data:image/*` URLs (the format the Booklister Helper extension emits — base64-encoded image bytes so saved booklists stay self-contained); other schemes (`data:text/html`, `javascript:`, `file:`, malformed strings) become empty string for safety. Plain spreadsheet pastes with 3 columns are unaffected (every row gets `coverUrl: ''`). Honors an `options.maxRows` cap and reports `truncated`. Returns `null` for non-string / empty / whitespace-only input.
- `BookUtils.removeQuickAddRows(rawText, rowIndices, headerSkipped)` - Rebuilds a Quick Add paste with the given parsed-row indices removed. Used by the Spreadsheet tab's partial-success path to trim the just-added rows out of the textarea, leaving overflow/skipped/truncated rows in place for fixing and resubmitting. `rowIndices` are indices into `parseQuickAddTsv(rawText).rows` (data-relative; the header line, when present, is preserved). Line filtering is guaranteed to align with the parser's because `String.prototype.trim` already treats NBSP as whitespace — see the comment on the function before changing either side's line-splitting.
- `BookUtils.isDraftStateEffectivelyEmpty(state)` - Whether a parsed draft (the shape produced by `serializeState`) is "effectively empty" — equivalent to a fresh page load with no user content. Used by `restoreDraftLocalIfPresent` to suppress the "Draft restored from this browser." toast when there's nothing meaningful to advertise. Returns true if every content surface is empty: all books are blank placeholders with no user-typed description or author text (or no books), `extraCollageCovers` is empty, no `images.frontCover` / `images.branding` / `images.customQr`, no `ui.qrCodeText` / `qrCodeUrl` / `coverTitle` / `coverLineTexts` content, and `meta.listName` is empty or the default-fallback string `'booklist'` (case-insensitive). The `images.branding` check is skipped when `images.brandingIsLibraryDefault` is true — on branded instances `applyLibraryConfig` auto-applies the library logo on every load, so the logo is not user content and must not, by itself, trip the toast. A user-uploaded branding image (flag false/absent) still counts. Intentionally does NOT check style customizations, layout / collage settings, or visibility toggles — those are treated as "settings, not content." **This function is coupled to `serializeState`'s schema**: when adding a new "content" field to the saved state, extend this function so the toast keeps firing for drafts that contain only the new field. See the cross-file dependency table.

### Data Structures

**Book object** (entries in `myBooklist` array):
```javascript
{
  key: string,                    // Open Library key or generated ID
  title: string,
  author: string,
  description: string,
  cover_ids: number[],            // Open Library cover IDs
  currentCoverIndex: number,      // Which cover_id is selected
  customCoverData: string|null,   // Base64 data URL for uploaded covers
  includeInCollage: boolean,      // "Starred" for front cover collage
  isBlank: boolean                // Empty placeholder slot
}
```

**Extra collage cover** (entries in `extraCollageCovers` array, extended mode only):
```javascript
{
  id: string,           // 'extra-{uuid}'
  coverData: string     // Base64 data URL
}
```

### State Management
- `myBooklist` array: all book objects (max 13-15 depending on UI toggles)
- `extraCollageCovers` array: additional covers for extended mode (up to 8)
- `MAX_BOOKS`: dynamically adjusted based on QR code and branding toggles
- **IndexedDB autosave**: debounced via `saveDraftLocal()`, restored by `restoreDraftLocalIfPresent()`. Full state stored in IndexedDB under `'draft'` key (no localStorage size limits). A lightweight `'has-draft'` flag in localStorage enables sync checks. Autosave is suppressed by guard flags during undo/redo restore (`_isRestoring`), the tour (`_tourActive`), reset (`_resetting`), and the startup window between `init()` and the async draft restore completing (`_initialRestorePending` — without it, the blank init render's debounced save could land before the IndexedDB draft read on a slow start and overwrite the saved draft).
- **Load-file safety**: the `.booklist` Load handler snapshots the current state, applies the file, and only THEN calls `clearUndoHistory()` (which wipes the whole IndexedDB image store, draft included). A file that throws mid-`applyState` is rolled back to the snapshot. Loading is also blocked mid-tour, since the store wipe would destroy the `'tour-backup'` key.
- **File export/import**: `.booklist` JSON files via `serializeState()` / `applyState()`
- **Dirty tracking**: `isDirtyLocal` (crash guard), `hasUnsavedFile` (download guard with unsaved indicator on save button)
- `beforeunload` warning when there are unsaved local changes
- **Tour backup**: IndexedDB `'tour-backup'` key holds pre-tour state during guided tour; recovered on startup if page was refreshed mid-tour

### Image Compression
Uploaded images are compressed on capture to reduce `.booklist` file size:
- **Book covers**: downscaled to max 1600px, JPEG 0.92 (`compressImage()`)
- **Front cover uploads**: max 4800px, JPEG 0.92
- **Branding uploads**: max 3000px, JPEG 0.92
- **Extra cover uploads**: max 1600px, JPEG 0.92
- **Auto-generated collage**: rendered at 3000x4800 (600 DPI), stored as JPEG 0.92 (was PNG)
- All thresholds are at or above the maximum rendered size at 600 DPI — no loss in print quality

### External Dependencies (CDN)
- **Sortable.js** - Drag-and-drop reordering (books + extra covers)
- **jsPDF + html2canvas** - PDF generation (6.25x canvas scale for 600 DPI print quality)
- **QRCode.js** - QR code generation
- **Font Awesome 6.4.0** - Icons
- **Google Fonts** - 45 typography options (41 webfonts preloaded via hidden divs + 4 system fonts)
- **Firebase SDK v10.14.1** (`gstatic.com/firebasejs`) - App, Auth, Firestore. Loaded via `import()` inside ES module files, ONLY on branded library subdomains and on the admin console. Never loaded on the public tool at booklister.org.

### External APIs
- **Open Library API** - Book search and cover images (no auth required). Default search backend for the public tool and any branded library that doesn't specify its own catalog integration.
- **Google Apps Script** - AI-powered book descriptions (URL hardcoded in `app.js`). Called by the Magic button on each book.
- **Firebase (Google Cloud)** - Authentication (email/password on gated library instances, Google sign-in on the admin console) + Firestore (library configs, memberships, admin allowlist). Branded instances only; public tool is Firebase-free.

## Key Functional Areas

1. **Search**: `getBooks()` queries Open Library; supports keyword, title, author, ISBN, subject, publisher filters
2. **Quick Add**: A two-tab modal alternative to Open Library search. Opens via the "Quick Add" button below the Search button. Both tabs share the schema and field set used by search-add (title, author, callNumber, authorDisplay), so books from any path are indistinguishable once in the list. Both tabs run author through `BookUtils.flipAuthorName` ("Last, First" → "First Last" on single-comma names) and titles through `BookUtils.toTitleCase` when the per-tab Title Case toggle is on (independent toggles per tab, both default-on, both reset on each modal open). Both tabs go through `pushUndo('add-book')` so undo/redo works the same as search-add.
   - **Single book** tab: 3 inputs (Title required, Author required, Call Number optional). Wired through `<form id="quick-add-form">` so Enter in any input submits via `submitQuickAdd()`. The footer's submit button is disabled until both required fields have content.
   - **Spreadsheet** tab: a textarea where the user pastes tab-separated rows from any spreadsheet app. Parsed by `BookUtils.parseQuickAddTsv`. `submitQuickAddMulti()` validates, applies title case + name flip per row, and fills as many blank slots as fit. Plain Enter inserts a newline (TSV pastes are inherently multi-line); Cmd/Ctrl+Enter submits. The Spreadsheet pane lives **outside** `<form id="quick-add-form">` so its keystrokes don't accidentally trigger the Single submit handler. Single `pushUndo('add-book')` per batch, single Folio celebrate, single render and save. Auto-star uses a running counter so the first 12 added in a batch get starred (matches search-add's per-call behavior across N consecutive adds). No description auto-draft per row — would hammer the Apps Script endpoint, and the books have no covers anyway. Partial success (overflow rows or skipped invalid rows) keeps the modal open with an info notification and **auto-trims the added rows out of the textarea** via `BookUtils.removeQuickAddRows` — what remains is exactly the rows that still need attention (overflow, fixable skipped rows, anything past the truncation cap), so the user can adjust and resubmit without re-pasting and can't accidentally re-add what already went in. Full success closes the modal with a success notification. Soft cap of `CONFIG.QUICK_ADD_MAX_PASTE_ROWS` (500) on the parser; truncation is reported in the notification. Native `<textarea>` strips formatting on paste, so no extra paste handler. v2 ideas: optional CSV mode with explicit user opt-in.
3. **Book Management**: Add/delete/edit entries, drag-and-drop reorder, star books for collage, cover carousel for alternate editions
4. **Cover Collage**: `generateCoverCollage()` renders starred books in 4 user-facing layouts (`data-layout` values in `index.html`'s layout picker): **Classic**, **Masonry**, **Staggered**, **Tilted**. Title bar with 5 position options. **Internally there are 5 draw functions**, because the Classic layout has two visual variants gated on the "Show shelves" toggle: `drawLayoutClassic` (no shelves) and `drawLayoutBookshelf` (Classic geometry with horizontal shelves drawn behind the books). Plus `drawLayoutMasonry`, `drawLayoutStaggered`, and `drawLayoutTilted`. The dispatch in `generateCoverCollage()` switches on `selectedLayout`, with the `classic` case branching on `showShelvesToggle` to pick between Classic and Bookshelf. So "Bookshelf" is not a separate user-facing layout — it is the Classic layout with shelves on.
5. **PDF Export**: `exportPdf()` pipeline: html2canvas captures at 6.25x scale, jsPDF outputs 11"x8.5" at 600 DPI. Awaits `waitForFonts()` and `waitForImagesDecoded()` before capture to guard against empty branding/cover captures from in-flight image loads.
6. **Styling**: Per-element font/size/weight/color/line-spacing controls for title, author, description. Cover header text always lives in the single textarea (`#cover-title-input`); the "Style each line separately" toggle (`#cover-advanced-toggle`, id kept for code compat) only swaps the style panel between shared styling and per-line styling. In per-line mode, the 3 `.line-style-group` blocks map onto the textarea's non-empty lines (trimmed, blanks dropped, via `BookUtils.splitCoverLines`): the first 3 lines get individual styles, lines 4+ inherit Line 3's style (a hint appears in the panel), groups for missing lines are hidden (group 1 always shows), and `updateCoverLineStyleGroups()` keeps group labels quoting each line's text. Serialization: `ui.coverTextModel: 'unified'` marks new-format states; `ui.coverLineTexts` is still written as a DERIVED compat field (first 3 non-empty lines) and is only READ for legacy states (`coverAdvancedMode` true + no `coverTextModel` marker → `applyState` joins the legacy line texts into the textarea). The legacy migration also re-pairs per-line styles with their text via `BookUtils.compactLegacyCoverLineStyles`: the old UI let text sit in line input 2/3 with earlier inputs blank, and joining drops the blanks, so the saved `styles.coverTitle.lines` entries are reordered to follow their text (applied through a shallow-patched copy — `applyState` must never mutate its `loaded` argument, which undo/redo snapshots reuse). Known accepted tradeoffs: (a) a legacy advanced-mode state's never-rendered simple-mode `coverTitle` text is superseded by the migrated line texts; (b) covers with 4+ lines degrade to 3 lines if a `.booklist` file is round-tripped through an OLD deployed version (its schema caps at 3).
7. **Looks (cover style presets)**: curated cover-styling bundles in `CONFIG.LOOKS` (schema documented at the constant). Surfaced two ways in the Front Cover tab, placed AFTER the Cover Header Text group (writing the header is the natural first step; looks restyle it): a 3-chip featured strip (`#looks-strip`, order rotates by month via `BookUtils.pickFeaturedLooks` — seasonal looks first, then year-round, then off-season filler) and a gallery modal (`#looks-modal`, opened by `#browse-looks-button`). Applying with an effectively-empty cover text field injects the look's `sampleText` into the textarea as an editable starting point (inside the same undo snapshot), so applying on a fresh tool always produces visible feedback. A look is a **stamp, not a theme**: `applyLook()` patches only the cover slice (styles.coverTitle's colors/gradient/simple/lines plus ui's coverAdvancedMode/collageLayout/showShelves/titleBarPosition, and tilt fields only for tilted looks — margins/padding and book-block text styles are untouched) onto `serializeState()` output and reapplies it through `applyState`, then regenerates the cover if one exists. One `pushUndo('apply-look')` entry; nothing tracks which look is active; no new serialized state. Gallery cards are **real miniature covers**: `renderLookCoverCanvas` runs the actual layout draw functions (`drawLayoutClassic`/`Bookshelf`/`Masonry`/`Staggered`/`Tilted`) at full 3000x4800 on a per-build scratch canvas with 12 cached sample-cover Images (`getLookSampleCoverImages` — real `Image` elements, because the layout functions read `naturalWidth`), then downscales to a portrait thumbnail. Cards fill progressively (one per rAF, cancelled via `_looksBuildSeq` on close/reopen) so the modal opens instantly. Preview text is the user's own cover text when present (rung 2 of the preview ladder) or the look's `sampleText` otherwise (rung 1); `buildLookTitleStyles` is the preview twin of `getCoverTitleStyles` (production-default bar margins) and their output shapes must stay in sync. Disabled during the tour (`_tourActive` guard in applyLook).
8. **QR/Branding**: QR code generation from URL (900px for 600 DPI), custom branding image upload, both toggleable. Front cover and branding uploaders have delete buttons (`.cover-delete-btn`, `.branding-delete-btn`) hidden in print mode. **On the public tool the branding uploader ships blank** (no default image, no "Use Default" button). On branded instances, `applyLibraryConfig()` populates the branding from the library's config, and the "Use Default" button becomes a fallback that reloads the library's logo. **Custom QR upload (optional override):** the QR canvas is wrapped in a `<label class="custom-uploader qr-code-uploader">` so users can drop in their own image (compressed at `CONFIG.QR_SIZE_PX = 900` to match the auto-generated QR's pixel density). When set, a sibling `<img id="qr-code-custom-img">` overlays the auto-generated QR and the URL input + Update button are disabled (and greyed via `body.has-custom-qr`) — the URL value is preserved, so clicking the `.qr-delete-btn` restores the auto-generated QR immediately without retyping. State serializes as `images.customQr` and goes through the same `_extractImages` / `_resolveImageRef` IndexedDB pipeline as `frontCover` / `branding`. **QR blurb placeholder** (`#qr-code-text`) is the only contenteditable in the codebase that uses a CSS `::before` pseudo-element instead of `setupPlaceholderField`'s soft-text approach. The visual placeholder text comes from `CONFIG.PLACEHOLDERS.qrText` written into a CSS custom property (`--qr-placeholder-text`) at init, and is shown via `#qr-code-text.is-empty:not(:focus)::before` toggled by the `updateQrEmptyState()` helper based on `innerText.trim() === ''`. The `:not(:focus)` gate hides the placeholder while the field is focused — matches the clear-on-focus behavior of the other placeholder fields in the app for UX consistency. The `::before` is `position: absolute; inset: 4px;` so it overlays the editable area instead of stacking as a flex sibling, and `updateQrEmptyState()` also scrubs any stray `<br>` Chrome/Safari leaves behind on delete-all (with caret restored to position 0 when the field is focused) so the editable area doesn't bloat with empty lines. `_currentQrText` (module-level mirror) remains the source of truth for serialization since `innerText` returns `''` on `display:none` elements when "Show QR Code" is off. Print-mode CSS (`.print-mode #qr-code-text.is-empty:not(:focus)::before { content: none; }`) suppresses the pseudo-element so an unedited QR blurb does not leak into the PDF. The book title / author / description fields still use the original `setupPlaceholderField` soft-text approach because their placeholder strings are short, obvious sentinels (e.g. `[Enter Title]`) that don't read like real content even if the swap-on-focus state machine briefly desyncs.
9. **AI Descriptions (the Magic button)**: "Magic button" on each book calls Google Apps Script with title+author, receives generated description. **Per the policy declared in `terms.html`, this feature is gated to specific branded library instances and is enabled by explicit per-library decision by the developer; it is not available on the free public tool and is not enabled by default on a branded instance.** The gating is wired in code: the button only renders when `window.LIBRARY_CONFIG` exists and `LIBRARY_CONFIG.disableAutodrafter` isn't set (see the library doc schema for `disableAutodrafter` and `requireSourceText`). The drafter's request parameters live in `CONFIG.DRAFTER_DEFAULTS` (word targets, temperature, draft count, retries); an easter-egg modal on Ctrl+Alt+D / Cmd+Option+D (branded instances only) can override individual values for the current session. Note the Apps Script URL itself is hardcoded in `app.js` and is callable by anyone who reads the source — the client-side gating controls UI exposure, not endpoint access.
10. **Branded library auth (gated instances only)**: Login modal, email/password sign-in with visibility toggle, password reset via email. See the Firebase Integration section below for the full flow.

## Collage Cover Count (12 / 16 / 20)

Supports three collage cover counts: 12 (standard), 16 (4×4), and 20 (extended). Selected via a 3-way radio group in the Front Cover settings section. The set of allowed values lives in `CONFIG.COLLAGE_COVER_COUNTS`.

### Cover Flow
- Covers 1-12: From starred books in the main booklist
- Covers 13-15: Auto-filled from starred books with covers (non-removable in extras grid; only visible in 16/20-count modes when the booklist has 13+ starred entries)
- Covers 16-20: Added via search modal or upload in the extras grid (removable, reorderable). 16-count mode shows 4 extras slots, 20-count shows 8

### Key Functions
- `getCollageCoverCount()` - Reads the active count from the radio group; returns 12 if missing
- `setCollageCoverCount(count, isRestoring)` - Applies a new count, shows/hides the extras section, auto-stars books up to the cap, trims user-added extras when downgrading, and triggers auto-regeneration. Replaces the older `toggleExtendedCollageMode`
- `setCollageCoverCountUI(count)` - Updates the radio buttons without firing change events (used during state restore and reset)
- `getMaxExtraCovers()` - Derived: returns `count - 12` (so 0 / 4 / 8)
- `renderExtraCoversGrid()` - Renders `getMaxExtraCovers()` slots (from-list + added + empty)
- `searchExtraCovers()` / `openExtraCoverSearchModal()` - Modal search for additional covers
- `addExtraCover(coverData, preferredSlot)` / `removeExtraCover(index)` - Manage extra covers
- `loadImageAsDataUrl(url)` - Converts remote URLs to base64 so they persist in the IndexedDB draft

### Dynamic Grid Sizing
- Classic / Bookshelf: 12=3×4, 16=4×4, 20=4×5
- Staggered: 12=4 rows, 16=4 rows, 20=5 rows
- Masonry: 12=5 cols, 16=5 cols, 20=6 cols
- Tilted: 16-count routes through the existing 20-count `getImageForCell` patterns. The function wraps the final index with `% totalImages` so 20-count row groups (which can resolve to indices up to 19) wrap cleanly when there are only 16 books. If 16-count Tilted ever needs its own hand-tuned pattern, add a `totalImages === 16` branch alongside the existing `<= 12` and `else` blocks
- Layout drawing functions still iterate `images[imageIndex++]` (Classic, Bookshelf) or use `step % imageCount` cycling (Masonry, Staggered) — the loops are count-agnostic; only the grid dimension ternaries change per count

### State Persistence
- `serializeState()` writes `ui.collageCoverCount: 12 | 16 | 20`
- `applyState()` reads `ui.collageCoverCount` first, falls back to the legacy boolean `ui.extendedCollageMode` (true → 20, false → 12), then clamps to a value in `CONFIG.COLLAGE_COVER_COUNTS`. Old `.booklist` files round-trip cleanly

### UI Components
- `input[name="collage-cover-count"]` - 3-way radio group in the Front Cover settings section. CSS class `collage-cover-count-group` for the segmented-control styling
- `#extra-covers-section` - Section that holds the dynamic extras grid; visibility is gated on `count > 12`
- `#extra-covers-max` - Span inside the extras hint that displays the current max (4 in 16-mode, 8 in 20-mode)
- `#extra-covers-label` - Span in the extras header that shows "Additional Covers (Covers 13-N)" with N from the current mode
- Extra Cover Search Modal - Search form with results grid and "Add to Collage" buttons

## Folio (Cat Mascot)

Animated SVG cat companion with state-based animations and contextual quips.

- **Hidden by default, on purpose**: first-time visitors do NOT see Folio. The toggle reads `localStorage.getItem('folio-hidden') === 'false'`, so an absent key means hidden — he's opt-in via the show/hide toggle, and only visitors who explicitly turned him on get him on later loads. Don't "fix" this to default-shown; see the INTENTIONAL comment in `folio.js`'s `initToggle()`.
- **No first-paint flash**: the container ships WITH `.folio-hidden` in `index.html`, and `initToggle()` REMOVES it for opted-in visitors (it used to add it for everyone else, which flashed the cat between first paint and DOMContentLoaded). Keep that polarity if you touch either side. The tour's force-show/restore in `tour.js` operates on the same class and is unaffected.
- **Greeting rules**: the greeting plays in exactly two places — on page load when Folio is already toggled on (app.js gates its `page-load` / `draft-restored` celebrate on the same localStorage convention), and at the moment the user toggles him on (`initToggle`'s click handler fires the `'toggled-on'` greeting quip). No invisible greetings.
- **States**: idle, greeting, searching, excited, evaluating, sleeping, worried
- **Micro-reactions**: nod, perk, wince, watch (eye tracking), yawn, startle, satisfied
- **Quip system**: Triggered quips for specific events (e.g., 'book-added', 'pdf-exported') + ambient shuffle-bag pool (prevents repeats)
- **Guard system**: `folio.guard(duration)` suppresses setState/react to prevent cascade during state restoration
- **API**: `window.folio.setState()`, `.react()`, `.showBubble()`, `.clickFolio()`, `.guard()`

## Tour System

Guided tour with 6 sections (30 steps total): Getting Started, Search & Add, Your Booklist, Covers & Collage, Customize & Style, Export & Finish.

- Section picker modal at start, or launch specific section
- Spotlight overlay highlighting target elements
- Folio narrates each step with contextual animation states
- `prepare()` hooks auto-open tabs, scroll, and click buttons for demos
- Demo search auto-runs a Discworld search
- **Tour state isolation**: `BooklistApp.enterTourMode()` (async) saves the user's full state (books, settings, undo history) to IndexedDB under the `'tour-backup'` key, then resets to blank. `exitTourMode()` (async) restores everything. Crash recovery via `recoverTourBackupIfPresent()` on startup.
- **Progressive sample list**: The tour loads a sample Terry Pratchett booklist (`TOUR_SAMPLE_STATE` embedded in tour.js, ~12 KB, no base64 images) and builds it up section by section — books at section 3, collage at section 4, QR/styling at section 5.
- **Undo/autosave suppressed**: `_tourActive` flag makes `pushUndo()` and `debouncedSave()` no-ops during the tour so tour actions don't pollute user state.
- **API**: `window.tour.open()` (opens section picker modal)

## Firebase Integration (branded library instances)

The public tool at `booklister.org` has no accounts, no sign-in, no Firebase code. This is a hard invariant: the tool works exactly as it did before Firebase was added, and nothing from the Firebase layer touches the public user's experience.

On branded library subdomains (`sonoma.booklister.org`, etc.) and on localhost with a `?library=<id>` override, the Firebase layer activates. **Unknown hostnames fail closed**: any host that isn't in `PUBLIC_HOSTS` and isn't a `*.pages.dev` preview (a LAN IP, a fork's mirror domain) is treated as a branded instance — Firebase loads and the tool sits behind the login flow with a library ID derived from the first hostname label, rather than silently serving the public tool. This is intentional; to test the public tool, use localhost or a preview deploy. The flow:

1. Inline head script adds `.awaiting-library-config` to `<html>` synchronously, hiding the body via `visibility: hidden`. This prevents a flash of the unbranded tool before the library config loads.
2. `firebase-init.js` runs as a deferred module. If the hostname is in `PUBLIC_HOSTS`, returns immediately with null exports. Otherwise dynamically imports Firebase App/Auth/Firestore from `gstatic.com`, initializes them, and sets `window.firebaseAuth` / `window.firebaseDb`.
3. `auth.js` attaches listeners for `'library-config-needs-auth'`, `'library-config-ready'`, and `'library-config-failed'` synchronously at the top of its module. Also wires the sign-out button in the header.
4. `library-config.js` derives the `libraryId` from the hostname subdomain (or `?library=` param), tries `libraries-public/<id>` first. If that doc exists it's a public branded instance: dispatches `'library-config-ready'` with the config and the tool unlocks. If that doc doesn't exist (the read succeeds with `exists() === false`) — or the read throws `permission-denied` — it's treated as a gated instance: sets `LIBRARY_REQUIRES_AUTH = true`, subscribes to `onAuthStateChanged`, and either dispatches `'library-config-needs-auth'` (no persisted session) or reads `libraries/<id>` immediately (session exists). Any OTHER throw from the `libraries-public` read (`unavailable`, network failure) dispatches `'library-config-failed'` instead — a public branded instance hitting a transport blip must show an error, not a login modal no credentials can satisfy.
5. `auth.js` responds to `'library-config-needs-auth'` by revealing the `#auth-modal`. On successful sign-in, `library-config.js`'s `onAuthStateChanged` handler reads `libraries/<id>` and dispatches `'library-config-ready'`.
6. `app.js`'s `applyLibraryConfig()` hook (registered at IIFE top level) picks up `'library-config-ready'` and applies the config: document title, header credit, branding image. Removes the `.awaiting-library-config` class to reveal the tool.

If any step fails (permission denied, missing doc, network error), `library-config.js` dispatches `'library-config-failed'`. `auth.js` catches it, re-opens the modal with a contextual error message (mapping `permission-denied` → "Signed in, but this account is not authorized for this library"), and the tool stays hidden so the user can't interact with an unconfigured state.

**Login modal is non-dismissable in library-admin mode**: on `admin.booklister.org`, a signed-in library admin sees their restricted view as a modal that can't be closed via Escape or click-outside. The only way out is the sign-out button in the header, which is rendered at `z-index: 1100` (above the modal overlay at 1000) specifically so it's always reachable.

## Admin Console (`admin.booklister.org`)

A separate app at `/admin/` in the same repo, served at `admin.booklister.org` via a GitHub Pages custom domain + DNS CNAME. Not accessible from the main tool; not linked from the public site. Super-admin workflow.

**Access model:**
- **Super-admin**: user with a doc at `admins/<uid>`. Signs in with Google. Full CRUD on libraries and memberships, can see all libraries.
- **Library admin**: user whose `memberships/<uid>` doc has `role: "admin"`. Signs in with email + password (their existing library credentials). Restricted view showing ONLY their library's staff list.
- **Everyone else**: Access-denied screen.

**Initial super-admin bootstrap is manual**: go to Firebase console, create an `admins` collection, add a doc with the super-admin's Firebase Auth UID as the doc ID. This is the ONLY manual Firestore write in the whole system; everything else happens through the admin UI.

**Key admin features:**
- Libraries CRUD: list (with "no library admins" warning badge on gated libraries that currently have zero library admins), create, edit (library ID is immutable after creation; type is changed via the dedicated Convert button, not the disabled radios), delete. **Delete cascades**: the library doc AND every memberships doc with that libraryId are removed in writeBatch chunks (the delete modal shows the membership count). Without the cascade, orphaned memberships kept rule-level power under the dead ID and recreating the same library ID instantly restored all old staff access. Firebase Auth accounts are not deleted (client SDK limitation), but without a membership they have no access.
- Convert library type (super-admin only): a "Convert to public/gated" button in the library edit modal moves the doc between `libraries-public` and `libraries` atomically via a Firestore `writeBatch`. Memberships are kept intact (dormant on public, active on gated) so a public→gated→public round trip doesn't lose the staff list. Library admins don't see the convert button, and the Firestore rules already restrict writes to both collections to super-admins regardless.
- Memberships management per library: list staff with email + UID + role badge, invite new staff by email (creates Firebase Auth user via a secondary Firebase app instance so the admin's session isn't disrupted, then sends a password reset email as the invite), remove staff, promote to library admin, demote to staff
- Move staff to another library (super-admin only): "Move" button on each staff row updates `memberships/<uid>` in place — sets `libraryId` to the chosen target library and forces `role: 'staff'`. Sidesteps the email-already-in-use trap that would block a remove + re-invite workflow (removing a membership doesn't delete the Firebase Auth account, so the email is still held). Demoting on move is intentional: super-admin can re-promote in the new library if needed.
- Long staff list UX: the staff list shows counts in the heading (`Staff with access (2 admins, 47 staff)`), a `Library admins` / `Staff` group separator between the two role groups, and a client-side filter input that appears once the list grows past `MEMBERSHIPS_FILTER_THRESHOLD` (6 rows). Filter matches against email + UID, case-insensitive, and a "Showing X of Y" status updates as you type. Group separators auto-hide when their group has no visible rows after filtering. The "Send invite" form is `position: sticky; bottom: 0` inside the modal scroll area so the primary action is always one click away even at the bottom of a long list. Add/remove/move/promote actions preserve `scrollTop` and the active filter value across the re-render so the user keeps their place. `closeLibraryModal()` clears the list + filter so reopening the modal for a different library starts fresh.
- Type-to-confirm on destructive actions (applies to both super-admins and library admins): both the **Delete library** and **Remove staff** flows require the user to retype an identifier before the danger button enables. Delete library asks for the library ID; Remove staff asks for the email (or UID for legacy memberships missing the email field). Match is case-insensitive (the point is to catch wrong-row clicks, not police capitalization). Defense in depth: `handleDeleteConfirm` and `handleRemoveStaffConfirm` re-check the typed value before issuing the Firestore write. The Remove staff modal also shows a "left with no library admins" warning (toggled in `openRemoveStaffModal` via the `admin-remove-staff-last-admin` element) when the row being removed is the library's only admin, matching the soft last-admin guard on Demote and Move. Less destructive actions are reversible transformations, not deletions, so they use lighter gates instead of type-to-confirm: **Demote** and **Move** each fire a native `confirm()` (Demote on click in `demoteToStaff`; Move on the modal's confirm button in `handleMoveStaffConfirm`, after a target is picked), and the message escalates with a "left with no library admins" warning when the action would drop the library to zero admins. **Convert** keeps its own modal with an inline warning. (Zero-admin libraries are allowed, not blocked — that state only raises the soft "no library admins" badge in the libraries table, so the last-admin warning baked into the Demote, Move, and Remove staff confirms is the main guard against orphaning a library by accident.)
- Library-admin restricted mode: when a library admin signs in, `body.admin-mode-library` is set and CSS hides the library config form, the close button, the footer save/cancel buttons, and the libraries table. Only the memberships section remains.

**Invite flow (how new staff accounts are created)**: `handleAddMembership` in `admin/admin.js` does three things in sequence:
1. `createAuthUserViaSecondaryApp(email, randomPassword)` — initializes a secondary Firebase App instance, creates the user there, signs out of the secondary instance, and deletes the secondary app. The primary admin's session is untouched.
2. `setDoc(memberships/<new-uid>, { libraryId, role: 'staff', email })` — the email is cached here as a display label because the client SDK can't look up other users' emails by UID.
3. `sendPasswordResetEmail(auth, email)` — the invite email. The new user clicks the link, sets their own password, and can sign in at the library's URL. The admin never knows or communicates any password.

Partial failures are handled individually: if step 1 succeeds but step 2 fails, the orphan UID is reported to the admin so they can clean it up via the Firebase Auth console. If step 3 fails, the user + membership are in place and the admin tells the user to click "Forgot password?" on the library sign-in modal.

**What the admin console cannot do (session-1 constraint limits)**:
- Cannot delete Firebase Auth users (client SDK limitation; requires Admin SDK which requires Cloud Functions)
- Cannot change another user's email or password directly
- Cannot look up a user's UID by email
- Cannot embed Firebase Storage, Cloud Functions, or any Firebase service beyond Auth and Firestore

These limitations are documented in the privacy policy as "manual processes" where relevant.

## Firestore Data Model

Four collections, all at the root level. Schema is intentionally narrow.

### `admins/{uid}`
Marker doc per super-admin. Document ID is the user's Firebase Auth UID. The doc can be empty (no fields required). Existence of the doc grants full read/write to all collections via the `isAdmin()` helper in `firestore.rules`. Created manually in the Firebase console during initial bootstrap; no client writes allowed by the rules.

### `libraries-public/{libraryId}`
Public branded library configs (like `sanrafael`). Readable by anyone without auth. Writable only by super-admins. Loaded by `library-config.js` as the first try on any branded instance; if found, the instance is "public branded" and no login is required.

Document shape (current; intentionally minimal):
```
{
  displayName: "San Rafael Public Library",
  brandingImagePath: "assets/img/libraries/sanrafael/logo.png",
  autoDraftDescriptionsDefault: true,  // optional; defaults to true if missing
  disableAutodrafter: false,           // optional; defaults to false if missing
  requireSourceText: false             // optional; defaults to false if missing
}
```

**`autoDraftDescriptionsDefault`** controls the starting state of the Search-tab "Auto-draft descriptions on add" toggle for this library's staff. When `true` (or missing, for backward compatibility with libraries that predate the setting), the tool auto-drafts a description each time a book is added from search. When `false`, book-add leaves the blank description placeholder and staff write their own. Individual staff can still flip the toggle in their own browser (preference is stored in localStorage under `booklister.autoDraftDescriptions`); this field is just the per-library default they see on first use, before they've touched the toggle themselves. The wand button on individual books is unaffected by this setting.

**`disableAutodrafter`** turns the AI drafter off entirely for this library: the Magic button isn't rendered on books, the auto-draft-on-add toggle is hidden, and `shouldAutoFetchDescription()` always returns false. This is the per-library gating mechanism behind the ToS language that the Magic button is enabled "by explicit per-library decision."

**`requireSourceText`** keeps the Magic button but changes its behavior: every click opens the paste-a-source-text modal (the drafter condenses the pasted summary) instead of searching on title + author, and auto-draft-on-add is disabled. For libraries that want AI-assisted phrasing but not AI-sourced facts. (Without this flag, Shift+click / Cmd+click on the Magic button opens the same modal as a power-user shortcut.)

### `libraries/{libraryId}`
Gated branded library configs (like `sonoma`). Readable only by members of that library (via the memberships check) OR by super-admins. Writable only by super-admins. Loaded by `library-config.js` after successful sign-in.

Same shape as `libraries-public` docs. The existence of a doc in `libraries` but not `libraries-public` is what makes a library "gated."

### `memberships/{uid}`
One doc per staff member, document ID is the user's Firebase Auth UID. Links a user to a single library and optionally a role.

Document shape:
```
{
  libraryId: "sonoma",      // required, string
  role: "staff" | "admin",  // optional, defaults to "staff"
  email: "alice@sonoma.org" // optional, cached display label
}
```

Read rules: own doc, super-admin, or library admin of the same libraryId. Write rules: super-admin unconditionally; library admin can create/update/delete STAFF rows in their own library (cannot promote to admin, cannot change libraryId, cannot demote another admin).

**Field whitelist** is enforced by `validMembershipFields()` in `firestore.rules`: only `libraryId`, `role`, and `email` are allowed. Random extra fields are rejected. `email` must be a string of at most 320 characters (it's displayed as the staff row's label in the admin console and matched by the type-to-confirm Remove flow, so it can't be allowed to hold arbitrary types or megabyte strings).

**Single-library-per-user constraint**: each user has exactly one memberships doc (keyed by UID). To grant access to two libraries, you currently need two separate Firebase Auth accounts. This is a deliberate starting constraint (see "Forward-Looking Notes" below).

## Browser Extension (`extension/`)

Manifest V3 browser extension ("Booklister Helper") that captures book records from BiblioCommons library catalog pages and copies them as TSV rows to the clipboard, ready for paste into Booklister's Quick Add → Spreadsheet tab. Lives at `extension/`; ships separately from the main tool. Published on the Chrome Web Store, Firefox Add-ons, and Microsoft Edge Add-ons (links on `extension.html`); load-unpacked for development.

**Hard scope**: BiblioCommons-powered catalogs only (`*.bibliocommons.com`). The extension makes no attempt to be a generic catalog-scraper. Other catalog systems (Aspen Discovery, Vega, Polaris LEAP, Encore, Sierra, etc.) are out of scope — adding them would be a separate extension or a separate adapter file.

**Cross-browser layer**: all extension code calls the promise-based `browser.*` API namespace via the vendored [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) at `extension/vendor/browser-polyfill.min.js` (MPL 2.0). Firefox has `browser.*` natively; the polyfill shims Chromium. Do not write `chrome.*` calls or pass trailing callbacks to `browser.*` APIs — the polyfill enforces promise signatures and throws on extra callback arguments (this silently broke context-menu setup once; see `ensureContextMenu` in background.js). The canonical manifest declares BOTH `background.service_worker` (Chromium) and `background.scripts` (Firefox); `build-zips.mjs` (`npm run package:extension`) emits a per-browser zip pair to `dist/` — Firefox keeps both keys (AMO requires the pairing), Chromium drops `scripts` (Edge's MV3 validator rejects it).

**Three capture modes** (single, list-page, accumulate). The toolbar icon always opens the popup (`action.default_popup`); the popup's **Capture tab is context-aware**, re-reading the active tab's URL each time it opens. On a `/v2/record/` page it shows a one-title preview (via the `'record-page-brief'` message) and a "Capture this title" button → one TSV row to clipboard. On a `/v2/list/` URL it shows every book on the list with a checkbox + cover thumbnail + title / author / call number; the user picks which books to capture (typically 13-15 from a 20-50+ book curated list) and clicks **Capture N titles** — the per-book holdings + cover fetches run in parallel via `Promise.all` for the chosen subset. Anywhere else it shows guidance. Accumulate mode is an opt-in setting (off by default) that changes single-record behavior: each capture appends a row to `browser.storage.local.accumulatedRows` and copies the entire accumulated TSV to the clipboard, so users can browse 13 books one at a time and paste them all at once. The toolbar badge shows the running count when accumulate is on. List-page capture operates independently of accumulate — it always copies the selected books to the clipboard fresh, never touches `accumulatedRows`. A right-click context menu item ("Clear accumulated list", `contexts: ['action']`) and a button on the popup's Settings tab reset the running list.

**File layout**:

- `manifest.json` — MV3, `host_permissions` scoped to `*.bibliocommons.com` + `gateway.bibliocommons.com` + `*.syndetics.com` + `*.hoopladigital.com` (the last two are cover-image providers). Two `content_scripts.matches` entries: `*://*.bibliocommons.com/v2/record/*` (single book records) and `*://*.bibliocommons.com/v2/list/*` (curated list pages); both load the polyfill before `content.js`. Permissions: `storage` + `contextMenus` only. Declares `action.default_popup` (always-on), a `browser_specific_settings.gecko` block (Firefox id, min version 140, `data_collection_permissions: none`), and the dual background keys described above.
- `content.js` — runs on both page types. Wires a `browser.runtime.onMessage` listener that dispatches four message types: `'capture'` (record-page capture → `handleSingleCapture`, with accumulate-mode appending if enabled), `'record-page-brief'` (popup asks for the record's title/author/cover to render its preview; synchronous, no fetches), `'list-page-bibs'` (popup asks for the page's bib list to render selection UI; synchronous shallow briefs, no fetches), and `'capture-selected-bibs'` (popup → after user selection; runs `handleListCapture(bibIdFilter)` fire-and-forget since the popup window is already closed). All capture paths share the `captureOneBibToTsvRow(libraryDomain, brief, preferredBranch)` helper which fires holdings + cover fetches in parallel for one book. Brief extraction is split into two normalizers (`extractRecordBrief` for `state.entities.catalogBibs[<bibId>]`, `extractListBibs` for `state.list.bibsByMetadataId` + `state.list.items`) since the two SSR shapes are different — list-page bibs have direct `imageUrl` / `callNumber` / `authors[]` fields rather than the record page's nested `brief.coverImage` / `fields[].items[]` / `creators[].fullName` structure. Also owns the clipboard-recovery path: if the clipboard write fails (usually because the tab lost focus mid-capture), the TSV is stashed in `browser.storage.local` and a persistent click-to-copy toast retries the write under a real user gesture.
- `background.js` — service worker (Chromium) / background page (Firefox). Three jobs: hosts the `'fetch-image-as-data-url'` proxy used for cover fetches (CORS bypass via host_permissions); maintains the persistent toolbar badge by subscribing to `browser.storage.onChanged` and recomputing badge text from `accumulateMode` (sync) + `accumulatedRows.length` (local); registers the two context menu items — "Clear accumulated list" (`contexts: ['action']`) and "Capture for Booklister" (page context, scoped via `documentUrlPatterns`, just calls `browser.action.openPopup()`).
- `popup/popup.html` + `popup.js` — the always-on popup, two tabs. **Capture tab**: context-aware per the modes above; list mode renders one row per book (checkbox + cover thumbnail loaded directly from the cover provider URL via `<img src>` — no SW proxy needed since `<img>` doesn't require CORS for display), with All / First N (13/14/15) / None presets, default all-selected, and the capture button disabled at 0 selected. On click, sends `'capture-selected-bibs'` with the selected `bibId`s and immediately calls `window.close()` — the actual capture pipeline runs in the content script (5-10s for 13 books) and the user sees progress via the in-page toast on the BiblioCommons tab. **Settings tab** (replaced the old options page): preferred-branch text input, accumulate-mode checkbox, clear-list button; auto-saved on change. Saved keys: `preferredBranch` and `accumulateMode` in `browser.storage.sync`; `accumulatedRows` (string[] of TSV row strings) in `browser.storage.local` because each row can carry an embedded cover (~30-80 KB) and sync's per-item quota is 8 KB.
- `build-zips.mjs`, `README.md`, `STORE_LISTING.md` — packaging + store metadata; see the cross-file dependency table for the version-bump coupling.

**Why the holdings fetch lives in the content script, not the service worker**: BiblioCommons' gateway API (`https://gateway.bibliocommons.com/v2/libraries/<lib>/bibs/<bibId>/availability`) responds with `access-control-allow-origin: https://<lib>.bibliocommons.com`. A `fetch` from the service worker carries the `chrome-extension://<id>` origin and gets CORS-rejected. The content script inherits the page's origin, so its fetch is accepted. This is the architectural reason `content.js` does the heavy lifting and `background.js` stays thin.

**Call-number selection logic** (in `content.js`'s `pickItem`):

1. If user set a `preferredBranch`, filter items whose `branchName` CONTAINS it or whose `branchCode` EQUALS it (both case-insensitive; codes are short, so substring-matching them would over-match).
2. Otherwise filter to items where the API marks `local: true` (BiblioCommons' own "this is your branch" signal, derived from logged-in account / IP).
3. If either filter yields nothing, fall through to all items.
4. Within the candidate list, prefer `availability.statusType === 'AVAILABLE'` over unavailable, then take the first.
5. If the holdings API call fails entirely, fall back to the SSR state's `CALLCLASS / CALLNO_LOCAL[0]`.

**TSV output format**: `title<TAB>author<TAB>callNumber<TAB>coverDataUrl\n`. Title combines `brief.title` + `: ` + `brief.subTitle` when subtitle is present (so the post-colon word triggers Booklister's subtitle-capitalization rule). Author goes through `cleanAuthor()` which strips trailing lifetime-date suffixes (`"Styron, William, 1925-2006"` → `"Styron, William"`) so Booklister's `flipAuthorName` does the right thing on add. The 4th column is a `data:image/jpeg;base64,...` URL — the extension's service worker fetches the cover URL (`brief.coverImage.large`, served from Syndetics or Hoopla), reads the bytes via `arrayBuffer()`, and base64-encodes them with a per-byte `String.fromCharCode` loop + `btoa` (a loop, not a spread — spreading a large byte array would risk a stack overflow). Embedding the bytes (rather than passing a hotlinked URL) means PDF export at 600 DPI never depends on the cover provider returning CORS headers, and saved `.booklist` files stay self-contained even if the cover URL expires or changes. Cost is ~30-80 KB of base64 per cover, comparable to what Booklister stores via its own `compressImage` helper. Empty 4th column when the bib has no `coverImage` block or the fetch fails (graceful fallback to placeholder cover). Embedded tabs / newlines in any field are collapsed to spaces.

**Why the cover fetch lives in `background.js`, not `content.js`**: cover providers like Syndetics don't return CORS headers for `fetch` requests, so a content-script fetch from the BiblioCommons page origin would be CORS-blocked. The service worker's `fetch` is granted privileged access by the extension's `host_permissions` (`*://*.syndetics.com/*`, `*://*.hoopladigital.com/*`) — it can read response bodies regardless of CORS. Content script asks via `browser.runtime.sendMessage({type: 'fetch-image-as-data-url', url})` and gets back `{ok: true, dataUrl}` or an error reason. Service workers in MV3 don't have `FileReader`, so the blob → base64 conversion uses the manual loop described above.

**Privacy posture**: zero analytics, no remote-loaded code, no data sent anywhere outside the user's browser. The only network call is the same Availability-by-location request the BiblioCommons page itself makes when the user clicks that button. Documented in `extension/README.md`.

**Dependency on BiblioCommons internals**: the extension reads a private Redux state shape and a private gateway API. Both are stable across the consortiums I tested (MARINet + Sonoma County, both running `nerf07 9.35.x`) but BiblioCommons can change them on a release. Maintenance pattern: when something breaks, fetch a new bib page + a new availability response, diff against the test fixtures, update selectors / paths.

**What it does NOT do (and the reasons)**:

- No capture from search results pages (`/search?...`). Search results don't carry per-title call numbers in the page state, so capture quality would be much worse than the record / list flows.
- No automatic open of "Availability by location" overlay. We bypass that entirely by calling the API directly.
- No write back to Booklister. The TSV-to-clipboard handoff means the main tool stays Firebase-free and unmodified by the extension. Eventually a postMessage path could be added, but it's not worth the cross-cutting complexity for v1.
- No support for browsers other than Chromium-based + Firefox. Safari needs Xcode-based packaging; deferred until there's demonstrated demand.

**Planned (v2): sort control on the list-capture popup**

Not built yet; fully speced here so it can be picked up later. Adds a per-capture **Sort** control to the popup's Capture tab list view (the checkbox rows shown on a `/v2/list/` page) so staff can order a curated list before capturing it. The default and the "I don't want to reorder" choice are the same option.

- **Sort drives the captured output order, not just the popup display.** This is the only change outside the popup. `handleListCapture(bibIdFilter)` in `content.js` currently *ignores* the order of `bibIdFilter` and emits rows in the curator's page order (`bibs.filter((b) => want.has(b.bibId))`, with a comment that intentionally chose page order). For the sort to reach the pasted Booklister list, the popup sends bib IDs in the chosen order and `handleListCapture` must emit rows **in `bibIdFilter`'s order** when a filter is present (`bibIdFilter.map((id) => byId.get(id)).filter(Boolean)`). The no-filter path (the context-menu "Capture for Booklister" → `handleCapture()` → `handleListCapture()`) stays page-order. The popup becomes the single source of order truth.
- **Options (ascending only for v1):** *List order* (default; curator's order = no reorder) · *Title* · *Author (last name)* · *Call number*. Descending and publication-year are explicit non-goals for v1.
- **Title:** case-insensitive, and **ignore leading articles** ("The", "A", "An") so a title files under its first significant word, the way a catalog does.
- **Author:** sort by the **first listed author's last name** (the brief already carries only the first author, already `cleanAuthor`-normalized to "Last, First"). Use the text before the first comma as the last-name key (mirrors the single-comma heuristic Booklister uses in `flipAuthorName`). Titles with no author (the `NO_AUTHOR_PLACEHOLDER`) sort to the bottom.
- **Call number:** sort the catalog's **listed** call number — the brief's `fallbackCallNumber` (SSR `bib.callNumber`), NOT the final holdings-API call number the capture later resolves via `pickItem`. The two can differ occasionally; firing holdings lookups for all 20-50 books just to sort would defeat the shallow-brief design, so the approximation is accepted and documented. Ordering rule (kept deliberately simple): **letter-led call numbers first, then number-led** (so fiction / `FIC` / LC group ahead of Dewey), case-insensitive; within the number group use a **numeric-aware** compare so `92` precedes `808.83` (a plain string sort gets multi-digit Dewey backwards, and Dewey is the common scheme here). Empty / missing call numbers sort to the bottom.
- **UI:** a labeled `Sort:` **dropdown** (`<select>`) above the list — chosen over a button row because the popup is narrow and the `All / First N / None` preset row already uses the width, and because a sort is a persistent selected *mode* (a dropdown shows it at a glance) rather than the one-shot *actions* those preset buttons represent. **Resets to *List order* on every popup open** for v1 (not persisted to `browser.storage`). Selection survives a re-sort for free, since `selected` is a bib-ID `Set` (order-independent). The **First 13/14/15** presets operate on the **current sort order** (first N alphabetically, etc.), slicing the ordered list rather than the raw page list.
- **Scope:** list-page capture only. Single-record capture and the one-at-a-time accumulate flow are unaffected.
- **Housekeeping when built (required by the version-coupling rule):** bump `manifest.json` `version`, add a matching `STORE_LISTING.md` release-notes entry, and update `extension/README.md` to describe the sort control.

## Static Content Pages

Six plain HTML pages live at the repo root alongside `index.html`:

- **`about.html`** — first-person page explaining the tool, why it was built, and the Folio mascot
- **`for-libraries.html`** — branded-instance info page: what a branded instance looks like, catalog integrations, expectations, and winding-down process
- **`extension.html`** — the Booklister Helper page (the footer's "Helper" link): what the extension does, live store links (Chrome Web Store / Firefox Add-ons / Edge Add-ons), and the usage guide
- **`contact.html`** — minimal contact page with mailto link and response-time expectations
- **`privacy.html`** — privacy policy with CalOPPA-compliant disclosures: effective date, Do Not Track section, third-party collection disclosure, review/correct/delete process. Voice matches the other content pages. No em dashes (preference). If the policy text ever changes, update both "Effective" and "Last updated" dates at the top of the page.
- **`terms.html`** — terms of service. Covers four scopes: the free public tool, branded library instances (accounts, data ownership, suspension, 60-day discontinuation notice), the Magic button AI feature (custom-instance-only, at developer's discretion, disable-at-any-time for cost or any other reason), and standard boilerplate (no warranties, limitation of liability, indemnification, California governing law). Same voice as `privacy.html`. Bump the "Effective" and "Last updated" dates at the top whenever the text changes. **If a feature change makes any clause inaccurate (e.g. cloud booklist storage gets added, AI provider changes, governing law moves), update both `terms.html` and the matching section of `privacy.html` in the same commit.**

**Shared structure**: All six reuse the same `.app-header` (with logo as an anchor link back to `index.html`), CSS variables, and `.site-footer` nav. They opt into a flex-column body layout via `<body class="content-page">`. Header and footer are natural flex items (NOT position: sticky or position: fixed anymore — earlier revisions used sticky/fixed to work around scroll issues; the current architecture uses internal scrolling on `.content-main` instead, which cleanly confines the scrollbar to the area between the header and footer).

**Content page scroll model**: The body inherits `height: 100vh; overflow: hidden` from the base body rule. `.content-main` has `flex: 1; min-height: 0; overflow-y: auto` which makes it the scroll container. The `min-height: 0` is the flexbox incantation required to let a flex child shrink below its content's natural height so overflow kicks in. Without it, the scrollbar never appears. If you ever touch `.content-main` layout, preserve `min-height: 0`.

**Site-wide footer nav**: A 32px dark slate footer at the bottom of every page (including `index.html`) contains the shared nav: Home · About · For Libraries · Helper · Privacy · Terms · Contact. The tool page's `app-container` height is `calc(100vh - 52px - 32px)` to make room for this footer. Folio and the zoom controls are positioned `bottom: 32px` to sit above it. The footer is hidden in `print-mode` so it doesn't leak into PDF exports (which html2canvas captures from `#print-page-1`/`#print-page-2` directly anyway).

**Content page CSS**: A dedicated block in `styles.css` labeled `CONTENT PAGES` defines `.content-main`, `.content-article` typography (EB Garamond `h1`, Inter body), `.content-effective-date` (the italic muted subtitle below h1 on privacy.html), and the anchor variant `.app-header a.logo`. All other styles are reused from the tool.

**Typography accent**: Content page `<h1>` uses EB Garamond serif to match the existing header-credit font, giving content pages a slightly literary feel while the tool body stays Inter.

**Meta tags**: Each content page and `index.html` include `<link rel="canonical">`, Open Graph, and Twitter card tags. Canonical URLs all point at `https://booklister.org/...`.

## Code Patterns

- **IIFE encapsulation** for all modules (no ES6 imports in browser code)
- **Event-driven** with `addEventListener` throughout (except `openTab` which uses HTML `onclick`)
- **Debounced functions** for performance: `debouncedSave` (400ms), `debouncedCoverRegen` (350ms)
- **Direct DOM manipulation** (no virtual DOM or framework)
- **Canvas-based rendering** for precise PDF/collage output
- **Custom font dropdowns** with live preview styling and native-select-style type-ahead (typing while the list is open jumps the highlight to the matching font; buffer resets after `CONFIG.FONT_TYPEAHEAD_RESET_MS`)
- **Content-editable fields** with paste sanitization (`handlePastePlainText`)
- **Two-tier save system**: IndexedDB autosave for crash recovery + `.booklist` download for explicit saves

## Testing

Tests use **Vitest** with **jsdom** environment. The test setup (`tests/setup.js`) loads `config.js` and `book-utils.js` into the global scope via indirect `eval` to match the browser's global loading pattern.

Three test files cover the pure / DOM-light surfaces of the codebase:

- `tests/book-utils.test.js` — every function in `BookUtils` (cover validation, starred-book filtering, cover counting, URL builders, `flipAuthorName`, `toTitleCase`, `parseQuickAddTsv`, etc.)
- `tests/config.test.js` — invariants on the `CONFIG` object (constants exist, layout math adds up, font list is well-formed, etc.)
- `tests/create-blank-book.test.js` — the `createBlankBook` factory's shape and defaults

Roughly ~215 test cases total across the three files. Exact counts drift as utilities are added; check `npm run test` output rather than relying on a number cached here.

`app.js` is not tested directly due to its heavy DOM dependency and IIFE encapsulation. The strategy is to push as much logic as possible out of `app.js` and into `book-utils.js` (or `config.js` for constants) where it can be tested in isolation.

To add new utility functions, put them in `book-utils.js` and add corresponding tests in `tests/book-utils.test.js`. To add a new constant, put it in `config.js` and add a check to `tests/config.test.js`.

## Rules for Modifying This Codebase

This project uses IIFEs with globals — there are no ES6 imports to signal cross-file dependencies. Read this section carefully before making changes.

### Always Check Before Writing

- **Before adding a utility function**, check `book-utils.js` — it may already exist. `BookUtils` has functions for cover validation, starred book filtering, cover counting, URL building, and collage readiness checks.
- **Before adding or using a constant**, check `config.js` — it may already be in `CONFIG`. Layout dimensions, cover limits, timing values, API URLs, placeholder URLs, and font lists all live there.
- **Before adding inline logic in `app.js`**, consider whether it belongs in `book-utils.js` as a shared, testable function instead.
- **Before writing a new function**, search `app.js` for existing functions that do the same thing. At ~8900 lines, it's easy to miss what's already there.

### Never Hardcode These Values

The following values have constants in `CONFIG` — always use the constant, never the raw number or string:

| Value | Use Instead | Why |
|-------|-------------|-----|
| `12` (min covers for collage) | `CONFIG.MIN_COVERS_FOR_COLLAGE` | The collage-count comparisons in the layout functions now use the constant. Don't reintroduce raw `12`s for this meaning. (Raw `16`s remain by design — there's no constant for the middle count — and grid-math literals like "4 per row" are not cover counts.) |
| `20` (max covers for collage) | `CONFIG.MAX_COVERS_FOR_COLLAGE` | Same issue — use the constant. |
| `15` (total book slots) | `CONFIG.TOTAL_SLOTS` | |
| `5` (slots per inside panel) | `CONFIG.SLOTS_PER_INSIDE_PANEL` | |
| `'placehold.co'` string checks | Check if `BookUtils.hasValidCover()` or a similar function covers your case | Placeholder detection is scattered — prefer using BookUtils. |
| `'https://openlibrary.org/...'` | `CONFIG.OPEN_LIBRARY_SEARCH_URL` / `CONFIG.OPEN_LIBRARY_COVERS_URL` | |
| Transparent 1x1 GIF data URL | `CONFIG.TRANSPARENT_GIF` | |
| Placeholder text like `'[Enter Title]'` | `CONFIG.PLACEHOLDERS.title`, `.author`, etc. | |

### Known Tech Debt (Do Not Make Worse)

These patterns exist in the codebase but should not be replicated:

1. **Hardcoded collage counts in layout functions** — cleaned up: the `coverCount`/`totalImages`/`imageCount` comparisons in the Classic/Bookshelf/Staggered/Masonry/Tilted layout functions use `CONFIG.MIN_COVERS_FOR_COLLAGE` / `CONFIG.MAX_COVERS_FOR_COLLAGE`. Raw `16` literals remain (no constant exists for the middle count), and grid-geometry numbers (rows/columns per group) are intentionally literal. Don't add new raw `12`/`20` cover-count comparisons.
2. **Inline `placehold.co` checks** — The pattern `.includes('placehold.co')` appears in both `book-utils.js` and `app.js`. Prefer using `BookUtils.hasValidCover(book)` when checking book objects.
3. **Folio state timeout pattern** — The pattern `setTimeout(() => folio.setState('excited', ...), 300); setTimeout(() => folio.setState('idle'), 4000);` is copy-pasted ~10 times in app.js. If adding a new folio reaction, follow the existing pattern but be aware this is a duplication hotspot.
4. **`MAX_EXTRA_COVERS` no longer exists.** It used to be a local `const = 8` in app.js. The replacement is the `getMaxExtraCovers()` helper, which returns `getCollageCoverCount() - CONFIG.MIN_COVERS_FOR_COLLAGE` (so 0 / 4 / 8 depending on the active mode). If you need this value elsewhere, call the helper.
5. **Font list duplication** — `admin/admin.js` used to carry its own copy of the FONTS array but no longer does (per-library font defaults were removed from the schema). If font choices come back per-library, don't re-duplicate; figure out a way to share `config.js`'s FONTS array with the admin module.
6. **Legacy `branding-default.png`** — still on disk at `assets/img/branding-default.png` but no longer referenced by any current code path. Kept for backward compatibility with pre-existing IndexedDB drafts or saved `.booklist` files that point at it. Can be deleted once you're confident nobody has a stale draft.

### Known CSS Pitfalls (Specificity + `[hidden]`)

There's a trap that has bitten this codebase three times and will keep biting if you don't know it.

**The trap**: the `hidden` HTML attribute implicitly applies `display: none` via the user agent stylesheet, but user agent styles have the lowest possible specificity. Any CSS rule that sets `display` to a value other than `none` on the same element will override the `[hidden]` attribute. In practice this means an element can have `hidden = true` set in the DOM but still be visible on the page because a normal CSS rule is winning.

This happens most easily with id-level selectors, because ids beat class+attribute combinations in specificity.

**Examples that were bugs in this codebase:**
- `#admin-signin { display: flex }` overrode `.admin-section[hidden] { display: none }` because `1,0,0` beats `0,2,0`. The sign-in section stayed visible after successful sign-in.
- `.admin-header-user { display: flex }` overrode the `[hidden]` attribute because class rules win over user-agent styles. The signed-in email + sign-out button stayed visible after sign-out.

**How to avoid it when writing new rules:**
- Prefer scoping display rules with `:not([hidden])`: `#admin-signin:not([hidden]) { display: flex }`. The selector only matches when the element isn't hidden, so when `hidden` is set, the rule doesn't apply and `[hidden]`'s implicit `display: none` takes effect.
- OR explicitly pair every id-level display rule with a matching `[hidden]` override: `#admin-signin[hidden] { display: none }`. Equivalent to the above, slightly more verbose.
- OR use a class rule with explicit `[hidden]` support like the existing `.admin-section { ... }` plus `.admin-section[hidden] { display: none }` pattern, where the `[hidden]` variant has higher specificity than the base class rule.

**If you're debugging an element that won't hide**: check `getComputedStyle(el).display` and work backwards. If it's not `none` despite `el.hidden === true`, there's a rule elsewhere winning on specificity.

### CSS classes that trigger JS behavior, not just styling

A second class of recurring trap: some CSS class names in this codebase look like pure styling hooks but are also queried by JS that mutates the matching elements. Reusing the class for visual consistency on a new control silently opts that control into the JS behavior too.

**The repeat offender**: `.font-select`. The `populateFontSelects()` function in `app.js` queries every element with this class and **overwrites its options** with the FONTS list. If you add a `<select class="font-select">` for the styling and let the page populate it, your hardcoded `<option>` elements get replaced with font names at startup. The bug presents as a dropdown that should show (e.g.) "Top to bottom / Left to right" but shows "Arial / Calibri / Cambria" instead.

**Examples that were bugs in this codebase:**
- `#title-bar-position` (cover collage title bar) — used `.font-select` for styling, had to be added to the `:not()` allowlist.
- `#tilt-offset-direction` (tilted layout offset) — same trap, same fix.
- `#cover-title-gradient-direction` (gradient direction added in 2026) — same trap, same fix.

**How to avoid it:**
- Before reusing `.font-select` on a new control, check `populateFontSelects()` in `app.js` (search for the function name). If your select isn't a font picker, **add its `id` to the `:not(...)` allowlist in the selector** alongside the existing exclusions. The allowlist is the project's documented escape hatch.
- The function carries an inline GOTCHA comment that lists the existing exclusions. Add yours and update the comment.
- Same principle applies to any future class that JS auto-processes by selector. If you find yourself writing a function like `document.querySelectorAll('.foo').forEach(...)` that mutates content, leave a comment at the function explaining what the class triggers, so the next person doesn't reach for it as "just styling."

**If you're debugging a select whose options aren't what the HTML says**: check whether something in `app.js` is querying the class at startup and rewriting `.innerHTML`. The font-select case is the one that's bitten the codebase repeatedly, but the pattern can recur with any class-driven population.

### Adding a font: grep CSS for the name first

There's a third pitfall in the same family: CSS `font-family` cascades that name a font hopefully (as the first entry, before the real fallbacks) sit dormant for as long as that font isn't loaded — and then activate the moment something else in the codebase loads the font. This bit the project once with Inter:

- Multiple stylesheets had `font-family: 'Inter', -apple-system, "Segoe UI", ...` for body/UI text. Inter wasn't loaded from Google Fonts and isn't preinstalled on Mac/Windows/Linux, so every browser fell through to the OS UI font. That OS font was the actual rendered look of every UI label in the tool.
- When Inter was added to `CONFIG.FONTS` and to the Google Fonts URL in `index.html`, the browser started actually loading it. The moment it loaded, every `'Inter', ...` cascade resolved to the real webfont and UI labels (checkboxes, buttons, dropdowns) silently changed font.

**How to avoid it when adding a new font**:
1. Before adding a new font name to `CONFIG.FONTS` and the Google Fonts URL, grep ALL stylesheets for the font name: `grep -rn "'<FontName>'\|\"<FontName>\"" assets/css/ admin/`. The IDE quote variants matter — single and double quotes are both legal in CSS font-family.
2. If matches come back, inspect each one. If the font name appears as the first entry in a `font-family` cascade where every later entry is a generic / system font, that's a "hopeful" reference that will activate when you load the font. Decide consciously: do you want the new font there, or do you want to remove the name from the cascade so the surface keeps falling through to the OS font like before?
3. The five surfaces with this exposure today: `assets/css/styles.css` (body), `assets/css/auth.css` (login modal), `assets/css/preview-helper.css` (preview chip, two rules), `admin/admin.css` (admin body). All have been cleaned of the leftover `'Inter'` entry, but the same trap applies to any future font name that lands in a `font-family` chain.

This is the same shape of trap as the `[hidden]` specificity bug and the `.font-select` auto-population bug: dormant code in one file activates because of a change in another file.

### Soft placeholders on contenteditable fight the browser's native undo

A fourth recurring trap, distinct from the CSS-cascade family above: any pattern that mutates a contenteditable's content on focus/blur to display a placeholder will eventually fight the browser's native contenteditable undo stack. The browser maintains its own undo stack on every contenteditable, separate from this app's `pushUndo` system, and that stack records the focus-time placeholder-clear as a normal DOM mutation. Press `Ctrl+Z` enough times mid-edit and the browser will eventually unwind the focus clear, dropping the placeholder string back into the field while the user is still focused — and because the focus handler doesn't re-fire (focus already happened), the inline `style.color` set by the JS state machine doesn't get re-applied, so the placeholder ends up visible in the user's normal text color and the cursor stays positioned in or around it. The user perceives this as "the placeholder is editable" and can type into it. The pattern is otherwise invisible in normal use, which is why it took a while to track down. Two related symptoms in the same family of bugs:

- The visual `style.color` toggle and the placeholder string sentinel can drift out of sync any time native undo touches the field, because color is not part of the contenteditable's text-content history.
- Sentinel detection by string equality on `innerText.trim()` is fragile: a paste that doesn't EXACTLY match `CONFIG.PLACEHOLDERS.foo` (smart quotes, normalized whitespace, line breaks, autocorrect) will fail the match and the field will stay in a half-state.

`#qr-code-text` migrated off the soft-text approach to a CSS `::before` pseudo-element gated on a `.is-empty` class (see the QR/Branding bullet under "Key Functional Areas" and the `updateQrEmptyState()` helper in app.js). The placeholder is no longer DOM content of the contenteditable, so the browser's native undo can't restore it mid-edit, and `style.color` is no longer in the loop. The book title / author / description fields kept the soft-text approach (`setupPlaceholderField`) because their placeholder strings are short and obviously synthetic — even if the state machine briefly desyncs, no user is going to type into `[Enter Title]` thinking it's a real prompt. The QR blurb placeholder is two sentences of instructional prose that reads like real content, which is what made the desync a real UX bug there specifically.

**How to avoid it for new contenteditable fields**:

- If the placeholder is short and obviously synthetic (`[Something]` style), `setupPlaceholderField` is fine — the failure mode exists but won't confuse users.
- If the placeholder is a sentence or longer, or anything a user could plausibly mistake for editable content, copy the QR pattern: empty the contenteditable in HTML, render the placeholder via `::before` content, toggle a class on input based on `innerText.trim() === ''`, and add `.print-mode #foo.is-empty::before { content: none; }` so the placeholder doesn't leak into PDF exports.
- Either way, if your contenteditable lives inside a flex container, position the `::before` absolutely (`position: absolute; inset: 4px;` or whatever matches the padding) so it overlays the editable area instead of stacking as a sibling flex item — otherwise the cursor parks below the placeholder after delete-all and you end up adding empty `<br>`s on Enter.

### Firebase + Admin console rules

1. **Do NOT initialize Firebase on the public tool.** `firebase-init.js` has a hostname check at the top. Adding Firebase code elsewhere (in app.js, book-utils.js, etc.) would load Firebase SDK on booklister.org, violating the session-1 public-tool invariant. If you need Firebase state in the main tool, go through `window.LIBRARY_CONFIG` or the custom events, not direct SDK access.
2. **Do NOT break the IIFE/module layer separation.** app.js is IIFE; firebase-init.js, library-config.js, auth.js, and admin/admin.js are ES modules. Don't `import` from the IIFE files and don't add IIFE syntax to the module files.
3. **Do NOT widen Firestore rules without thinking through the access model.** The rules enforce a specific access story: super-admin has global access, library admins have scoped access to their library's memberships, staff can only read their own membership and their library's config. Widening any of these has security implications.
4. **The admin console is a separate app.** Code in `admin/` should not depend on anything in `assets/js/` (and vice versa). The two apps share the same Firestore project but nothing else. The admin console's sign-in flow is completely separate from the main tool's branded-library sign-in flow.
5. **Single-library-per-user is enforced by the data model** (memberships doc keyed by UID with a single libraryId field), not just by the rules. If you ever need multi-library support for a user, the schema changes from `libraryId: string` to `libraryIds: string[]` and the rule checks change from equality to `in`. Non-trivial but contained.

### Cross-File Dependencies

When editing one file, check these related files:

| If you change... | Also check... |
|-------------------|---------------|
| `config.js` constants | `book-utils.js` (uses CONFIG directly), `app.js` (uses CONFIG everywhere) |
| `book-utils.js` functions | `app.js` (calls BookUtils), `tests/book-utils.test.js` (must update tests) |
| Book object shape (fields) | `book-utils.js`, `app.js` serialization (`serializeState`/`applyState`), `app.js` `createBlankBook()` |
| Collage cover count logic | `book-utils.js` counting functions, `app.js` layout drawing functions, `app.js` extended collage mode functions |
| Font list | `config.js` FONTS array only — all dropdowns read from this single source. Removing/renaming a font also breaks any `CONFIG.LOOKS` entry that references it (tests/config.test.js enforces the link) |
| `CONFIG.LOOKS` catalog | `tests/config.test.js` (structure suite: fonts must exist in FONTS, layouts/positions/colors validated), `app.js` applyLook/buildLookTitleStyles (consume the schema), `BookUtils.pickFeaturedLooks` (reads `months`). A look's `coverTitle.simple`/`lines` shapes mirror `serializeState()`'s `styles.coverTitle` — if that schema changes, looks change with it |
| `getCoverTitleStyles()` output shape in `app.js` | `buildLookTitleStyles()` in `app.js` — the looks-preview twin that must produce the same field names for `drawTitleBarAt` |
| CSS class names or IDs | `app.js` (DOM queries), `tour.js` (spotlight targets), `styles.css` |
| Folio states or reactions | `folio.js` (definitions), `app.js` (triggers), `tour.js` (tour narration) |
| BooklistApp public API | `tour.js` (calls `enterTourMode`, `exitTourMode`, `applyState`, `generateCoverCollage`, `updateBackCoverVisibility`, `resetZoom`) |
| Tour sample state (`TOUR_SAMPLE_STATE`) | `tour.js` (embedded constant), must match `serializeState()` schema in `app.js` |
| `serializeState()` schema in `app.js` (saved state shape) | `applyState()` in `app.js` (must read every new field), `BookUtils.isDraftStateEffectivelyEmpty` in `book-utils.js` if the new field is user "content" (otherwise the draft-restored toast will silently suppress for drafts that contain only the new field), `tests/book-utils.test.js` (extend the `emptyState` helper + add a "returns false when X is set" case), `TOUR_SAMPLE_STATE` in `tour.js` |
| Firestore rules (`firestore.rules`) | `admin/admin.js` (writes it depends on), `library-config.js` (reads it depends on), `app.js` (the auth state driver in the library-config-ready handler). After editing rules, **manually deploy them** via the Firebase console (there's no CLI in this project) and run the Rules Playground on the "reference" cases before clicking Publish. |
| Library doc schema (`libraries/<id>` or `libraries-public/<id>`) | `admin/admin.js` (form + openLibraryModal + handleLibraryFormSubmit), `app.js` `applyLibraryConfig()`, `library-config.js` (if the schema has new fields the loader should handle). |
| Memberships doc schema | `admin/admin.js` (handleAddMembership, loadMemberships), `firestore.rules` `validMembershipFields()`, any new fields need to be added to the key whitelist. |
| Admin console auth state | `admin/admin.js` `resolveUserRole()` is the single source of truth for "super-admin | library-admin | none". If you add new roles, start there. |
| `extension/manifest.json` `version` | `extension/STORE_LISTING.md` "Release notes" section. Every version bump needs a matching new entry there; the stores ask for "what's new" text on each upload and STORE_LISTING.md is where that copy lives. Bumping without updating leaves you scrambling at submission time. |
| `extension/manifest.json` `background` block | `extension/build-zips.mjs` (the per-browser packager that strips `background.scripts` from the Chromium variant). If the background shape changes, eyeball that the strip still does the right thing. The script reads the canonical manifest and emits two zips to `dist/` via `npm run package:extension`: Firefox keeps both background keys, Chromium drops `scripts`. Edge's MV3 validator rejects `background.scripts`; Firefox AMO requires it; Chrome accepts either form. |

### Adding New Code

- **New constants** go in `config.js` inside the `CONFIG` object.
- **New pure/shared logic** goes in `book-utils.js` inside the `BookUtils` object, with tests in `tests/book-utils.test.js`.
- **New DOM/UI logic for the main tool** goes in `app.js` inside the main IIFE.
- **New Firebase-layer logic** goes in one of the ES module files (`firebase-init.js`, `library-config.js`, `auth.js`) depending on scope. Do not import Firebase SDK into `app.js` directly.
- **New admin console logic** goes in `admin/admin.js`. Don't couple admin code to main-tool code; the two apps share Firestore but nothing else.
- **Do not create new JS files in `assets/js/` without good reason** — the IIFE globals pattern means every new file adds a load-order dependency in `index.html`. The Firebase/admin ES module files are the intentional exception and should stay isolated to their own purpose.
- **Run `npm run lint` and `npm run test`** before committing. Both must pass.

## Forward-Looking Notes

These are features that aren't built yet but the current architecture is meant to accommodate. Capturing them here so future-you (or Claude) knows how the groundwork was intended to grow.

### Cloud booklist storage

The architecture is prepared for per-user cloud-saved booklists with library-wide sharing and folder organization. Concretely:
- Firebase Auth + the memberships collection already provide the identity fabric (user → library).
- The existing `serializeState()` / `applyState()` functions already produce a JSON-serializable state the same shape you'd save to Firestore.
- The existing `_extractImages()` / `_restoreImages()` pattern in `app.js` already separates image bytes from the state JSON, which is the split you'd need between Firestore (metadata) and Firebase Storage (image files).
- Firestore rules already enforce library-scoped access.

**What would need to change when the feature is built:**
- **Lift the "no Firebase Storage" session-1 constraint**. Image bytes won't fit in a Firestore document (1 MB limit per doc). Storage is the natural fit. The constraint was a starting-point decision, not a permanent architectural choice.
- Add a `libraries/<libraryId>/booklists/<booklistId>` subcollection for booklist metadata (name, folder string, ownerUid, createdAt, updatedAt, serialized state without image bytes, array of image refs).
- Extend `firestore.rules` with rules for the new subcollection: read by any library member, write by the owner or library admins.
- Build UI in the main tool: browse-library-booklists modal, save-to-cloud dialog, folder picker, progress indicators for Storage uploads. Additive, not replacing the existing file Load/Save workflow.

**Product decisions still pending:**
- Concurrent editing (last-write-wins vs soft lock vs CRDT)
- Ownership on staff removal (delete / transfer / leave orphaned)
- Per-library storage quotas
- Cross-library sharing (currently rules are strictly within-library)

### ILS / library catalog integration

Per-library catalog integration to replace or supplement Open Library search, getting title + author + cover + call number + description from a library's own ILS. Splits into two cases by ILS capability:

**Easy case: ILS with an open search API + CORS.** The tool calls the library's endpoint directly from the browser. Supported by extending `libraries/<id>` with a `catalog` object:
```
libraries/sonoma {
  displayName, brandingImagePath,
  catalog: {
    type: "bibliocommons" | "aspen" | "custom",
    searchEndpoint: "https://catalog.sonoma.org/api/v1/search"
  }
}
```
`getBooks()` in `app.js` checks `LIBRARY_CONFIG.catalog` and dispatches to the right adapter. Each adapter is ~50 lines that knows one ILS's response format. Book renderers already accommodate optional fields like `callNumber` if present.

**Hard case: ILS with authentication, no CORS, or legacy protocols (SIP2, Z39.50).** The browser can't talk to these directly. Needs a proxy layer. Options, in order of preference for this project:

1. **Google Apps Script** (already used for the Magic description feature). Free, same operational pattern you already run. Store per-library ILS credentials in `PropertiesService.getScriptProperties()` keyed by libraryId, never in Firestore. Cold-start latency of 1-3 seconds on first hit after idle is the main downside. Recommended for starting out.
2. **Cloud Functions**. Lifts the session-1 "no Cloud Functions" constraint. Faster cold starts, better tooling, but adds a billing surface. Reserve for when Apps Script's quotas or latency become a real problem.
3. **A separate tiny service** on Cloudflare Workers / Deno Deploy / Fly.io. Keeps the Firebase-specific constraints intact but adds a new operational surface.

**Credentials security**: ILS API keys should NEVER live in Firestore, because library staff can read `libraries/<id>`. Keys live in whichever proxy you pick (Apps Script PropertiesService, Cloud Function environment variables, etc.), not on the client.

**Manual enrichment fallback**: for libraries whose ILS can't be integrated for any of the reasons above, keep the Open Library-based search and let library staff hand-edit call numbers and descriptions on each book entry. Lower automation, zero infrastructure requirement.

### Multi-library users

Currently each user can belong to exactly one library (memberships doc keyed by UID with a single `libraryId` field). If a staff member works at two branches that each have a Booklister instance, they need two separate accounts.

To support multi-library users later: change the memberships schema from `libraryId: string` to `libraryIds: string[]`, update `firestore.rules` to use `request.auth.uid in` checks against the array instead of equality, update the admin UI to let super-admins add/remove libraryIds from a user's memberships. Non-trivial migration but contained to the memberships collection + a few rules + a few admin UI lines.

### Per-library admin delegation beyond staff roster

Currently library admins can only manage their library's memberships. They cannot edit the library's display name, branding path, or any other config — those are super-admin-only. If libraries ever ask to self-manage branding changes (e.g., "we got a new logo, let us update it ourselves"), this expands. Implementation path: extend the library-admin UI to include (some of) the library config fields, update Firestore rules to allow library-admin writes to specific fields (rules can do partial-field update validation, it's verbose but possible), build a "changes go into effect on next load" model so the admin can preview before committing.

Not urgent at the current scale.

### Constraints worth protecting going forward

These are the architectural invariants that have earned their keep. Breaking any of them should be a deliberate decision, not a side effect of another change.

1. **The public tool at `booklister.org` stays unauthenticated and Firebase-free.** No Firebase SDK ever loaded, no accounts, no sign-in, no network traffic to gstatic or firebasestore on the public domain. Everything about the public tool stays in the browser. Cloudflare Pages preview hosts (`*.pages.dev`) fall under the same rule with **one documented exception**: `preview-helper.js` makes a single Firestore REST call (no SDK, no auth, just a `fetch` to `firestore.googleapis.com/v1/projects/.../documents/libraries-public`) to populate the preview mode-picker chip's library dropdown with a live list. This violation was deliberate, made because the alternative (a hardcoded library list maintained by hand in the chip's source) goes stale every time a public-branded library is added or renamed, and the freshness was judged worth one cheap REST call **on previews only**. The call is gated by the chip's `endsWith('.pages.dev')` self-check at the top of the IIFE, so production booklister.org still makes zero Firebase requests. If a future change needs to extend this — e.g., reading another public collection from previews — document it here and keep the production-host check at the top of the gating module.
2. **The tool state is serializable through `serializeState()` / `applyState()`.** Any new storage backend (IndexedDB, file, cloud, whatever) goes through this same pair of functions. Don't couple new features to IndexedDB directly.
3. **IIFE layer and ES module layer stay separated.** Main tool is IIFE + globals. Firebase layer and admin console are ES modules. No cross-imports. Communication via `window.*` globals and custom events.
4. **Firestore rules are the security boundary.** The admin UI enforces the same access model client-side for UX purposes (buttons are hidden when you can't perform the action), but the rules are what actually protect data. Never weaken rules based on "the UI prevents this anyway."
5. **Manual deployment of Firestore rules.** `firestore.rules` is the source of truth in the repo; to deploy it, copy the contents into Firebase Console → Firestore → Rules → Publish. There is no CLI. This is intentional (session-1 constraint: no build step, no tooling). After any rules change, verify via the Rules Playground on the reference cases before clicking Publish.

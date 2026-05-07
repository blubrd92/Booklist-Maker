# Booklister

A web-based tool for libraries to create, customize, and export printable booklists. Drag-and-drop reordering, automatic cover collages, QR code linking, custom branding, and 600 DPI PDF export — all in pure HTML, CSS, and JavaScript with no build step.

Live at **[booklister.org](https://booklister.org)**.

> The repo name and internal code identifiers still say "Booklist Maker" / `booklist-maker`. The user-facing brand is "Booklister"; internal names were left unchanged during the rebrand to avoid breaking references. Both names refer to the same project.

## Features

- **Search & add books** from Open Library by keyword, title, author, ISBN, subject, or publisher
- **Quick Add** — paste a tab-separated list of titles, authors, and call numbers from Google Sheets / Excel / Numbers, or enter books one at a time with title-case correction and "Last, First" → "First Last" name flipping
- **Per-book editing** — title, author, description, cover (carousel of alternate editions or upload your own), call number
- **AI-drafted descriptions** via the magic-wand button on each book
- **Cover collage** — auto-generated front cover from 12, 16, or 20 starred books, in four layouts (Classic, Bookshelf, Staggered, Tilted) with a customizable title bar
- **Typography** — 25 font choices with per-element font, size, weight, italic, color, line-spacing, and alignment controls
- **QR code** — generated from any URL, or replaced with a custom uploaded image
- **Custom branding** — upload a library logo to appear on the back cover
- **High-quality PDF export** — 11"×8.5" landscape at 600 DPI, ready for trifold printing
- **Local-first** — autosaves to IndexedDB; full state can also be exported to a `.booklist` file and re-loaded later
- **Guided tour** — a built-in walkthrough narrated by an animated cat mascot named Folio
- **Branded library instances** — opt-in subdomains with sign-in, persistent per-library defaults, and an admin console for staff management

## Quick start

No build process. Open `index.html` in a browser, or serve the directory:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Development

```bash
npm install         # install ESLint + Vitest
npm run lint        # ESLint on assets/js/
npm run test        # Vitest one-shot
npm run test:watch  # Vitest watch mode
```

Both lint and tests should pass before committing JavaScript changes.

## Project structure

```
index.html                  Main tool UI
about.html
for-libraries.html
contact.html
privacy.html                Static content pages
assets/
  css/                      Stylesheets
  js/
    config.js               CONFIG constants
    book-utils.js           Pure utility functions (fully tested)
    app.js                  Main IIFE — UI logic
    folio.js                Animated cat mascot
    tour.js                 Guided tour system
    firebase-init.js        ES module — host-gated Firebase init
    library-config.js       ES module — branded library config loader
    auth.js                 ES module — login modal for gated instances
    preview-helper.js       Cloudflare Pages preview-only mode-picker chip
admin/                      Separate admin console app at admin.booklister.org
tests/                      Vitest suites for BookUtils + CONFIG
firestore.rules             Firestore security rules (deployed manually)
CLAUDE.md                   Detailed architecture + contribution guide
```

## Tech stack

- **Frontend**: vanilla HTML5 / CSS3 / JavaScript (ES6+), no framework, no bundler
- **PDF generation**: html2canvas + jsPDF
- **Drag-and-drop**: Sortable.js
- **QR codes**: QRCode.js
- **Search**: Open Library API
- **AI descriptions**: a small Google Apps Script endpoint
- **Tooling**: ESLint, Vitest (jsdom environment)
- **Branded instances only**: Firebase Auth + Firestore, loaded dynamically — never on the public tool

## Deployment

The public tool is deployed via GitHub Pages at the apex of `booklister.org` (see `CNAME` at the repo root). Each push to `main` updates the live site. Cloudflare Pages also builds preview deployments for branches; a small mode-picker chip appears on `*.pages.dev` URLs to make it easy to test branded-library flows from a preview.

The admin console at `admin.booklister.org` lives in `admin/` and is a separate app served at a sibling custom-domain target. Firestore security rules in `firestore.rules` are the source of truth and must be **manually copied** to the Firebase Console after editing — there is no CLI in this project.

## Contributing

Please read [CLAUDE.md](./CLAUDE.md) before making changes. It documents:

- The intentional IIFE-vs-ES-module separation between the tool layer and the Firebase / admin layer
- The two-tier save system (IndexedDB autosave + `.booklist` file export) and the `serializeState` / `applyState` pair that drives both
- Hard invariants — for example, the public tool at `booklister.org` stays Firebase-free
- Recurring CSS pitfalls (`[hidden]` specificity, JS-querying-by-class, font-cascade traps, soft-placeholder vs native-undo)
- A cross-file dependency map for common edits
- Forward-looking design notes for cloud booklist storage, ILS integration, and multi-library users

## License

ISC.

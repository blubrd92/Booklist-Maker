# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Booklist Maker is a web-based application for creating, customizing, and exporting printable booklists. It targets libraries creating professional book displays with cover art, customizable typography, QR codes, and branding.

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
index.html                      Single-page UI (semantic HTML5, ARIA)
assets/
  css/
    styles.css                  Main UI styles, CSS variables, responsive layout
    folio.css                   Folio cat mascot animations and styling
    tour.css                    Guided tour modal and spotlight styling
  js/
    config.js                   CONFIG constants (loaded first as global)
    book-utils.js               BookUtils shared pure functions (loaded second)
    app.js                      Core application logic (IIFE, ~5200 lines)
    folio.js                    Animated cat mascot companion
    tour.js                     Guided tour system
  img/
    branding-default.png        Default library branding image
tests/
  setup.js                      Loads config.js + book-utils.js into jsdom via eval
  book-utils.test.js            Unit tests for all BookUtils functions
eslint.config.js                ES2022, sourceType "script", browser+CDN globals
vitest.config.js                jsdom environment
```

### Script Load Order (in index.html)
CDN libraries load first (Sortable, jsPDF, html2canvas, QRCode, Font Awesome, Google Fonts), then:
1. `config.js` &rarr; exposes `CONFIG` globally
2. `book-utils.js` &rarr; exposes `BookUtils` globally (depends on CONFIG)
3. `app.js` &rarr; exposes `BooklistApp` + global `openTab()`, calls `init()` on DOMContentLoaded
4. `folio.js` &rarr; exposes `window.folio` API
5. `tour.js` &rarr; exposes `window.startTour()` / `window.startTourSection()`

### Module Pattern
All JS files use IIFEs. No ES6 imports in browser code (intentional: no build step). The main application:

```javascript
const BooklistApp = (function() {
  'use strict';
  // Private state: myBooklist[], extraCollageCovers[], DOM element refs
  // Private functions for all business logic
  // Public API:
  return { init, showNotification, getAiDescription };
})();
```

`openTab(evt, tabName)` is a separate global function (required by HTML `onclick` attributes).

### Key Configuration (config.js)
All constants live in the `CONFIG` object:
- **Layout**: `TOTAL_SLOTS` (15), `SLOTS_PER_INSIDE_PANEL` (5), cover dimensions
- **Dynamic max books**: `MAX_BOOKS_FULL` (15), `MAX_BOOKS_ONE_ELEMENT` (14), `MAX_BOOKS_BOTH_ELEMENTS` (13)
- **Collage**: `MIN_COVERS_FOR_COLLAGE` (12), `MAX_COVERS_FOR_COLLAGE` (20), grid config
- **PDF export**: 300 DPI, 3x canvas scale, 11"x8.5" output
- **APIs**: Open Library search + covers endpoints
- **Fonts**: Array of 25 font objects `{ value, label }` (single source of truth for all dropdowns)
- **Timing**: `AUTOSAVE_DEBOUNCE_MS` (400), `NOTIFICATION_DURATION_MS` (3000)
- **Placeholders**: Cover URLs, text defaults, colors

### Shared Utilities (book-utils.js)
Pure functions that eliminate duplicated logic. All are tested:
- `BookUtils.hasValidCover(book)` - Checks for non-placeholder cover (custom or Open Library)
- `BookUtils.getStarredBooks(booklist)` - Filters `!isBlank && includeInCollage`
- `BookUtils.getStarredBooksWithCovers(booklist)` - Starred books with valid covers
- `BookUtils.isAtCoverLimit(booklist, extras, max)` - Whether cover count >= limit
- `BookUtils.countTotalCovers(booklist, extras, extendedMode)` - Total valid covers
- `BookUtils.getRequiredCovers(extendedMode)` - Returns 12 (standard) or 20 (extended)
- `BookUtils.getCoverUrl(coverId, size)` - Builds Open Library cover URL
- `BookUtils.getBookCoverUrl(book, size)` - Best cover URL: custom > Open Library > placeholder
- `BookUtils.hasEnoughCoversForCollage(booklist, extras, extendedMode)` - Collage readiness check

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
- **localStorage autosave**: debounced via `saveDraftLocal()`, restored by `restoreDraftLocalIfPresent()`
- **File export/import**: `.booklist` JSON files via `serializeState()` / `applyState()`
- **Dirty tracking**: `isDirtyLocal` (crash guard), `hasUnsavedFile` (download guard with unsaved indicator on save button)
- `beforeunload` warning when there are unsaved local changes

### External Dependencies (CDN)
- **Sortable.js** - Drag-and-drop reordering (books + extra covers)
- **jsPDF + html2canvas** - PDF generation (3x canvas scale for print quality)
- **QRCode.js** - QR code generation
- **Font Awesome 6.4.0** - Icons
- **Google Fonts** - 25 typography options (preloaded via hidden divs)

### External APIs
- **Open Library API** - Book search and cover images (no auth required)
- **Google Apps Script** - AI-powered book descriptions (URL hardcoded in app.js)

## Key Functional Areas

1. **Search**: `getBooks()` queries Open Library; supports keyword, title, author, ISBN, subject, publisher filters
2. **Book Management**: Add/delete/edit entries, drag-and-drop reorder, star books for collage, cover carousel for alternate editions
3. **Cover Collage**: `generateCoverCollage()` renders starred books in 4 layouts: Classic, Masonry (Bookshelf), Staggered, Tilted. Title bar with 5 position options.
4. **PDF Export**: `exportPdf()` pipeline: html2canvas captures at 3x scale, jsPDF outputs 11"x8.5" at 300 DPI
5. **Styling**: Per-element font/size/weight/color/line-spacing controls for title, author, description. Cover header has simple (unified) and advanced (per-line) modes.
6. **QR/Branding**: QR code generation from URL, custom branding image upload, both toggleable
7. **AI Descriptions**: "Magic button" on each book calls Google Apps Script with title+author, receives generated description

## Extended Collage Mode

Supports 20-cover collages instead of the standard 12.

### Cover Flow
- Covers 1-12: From starred books in the main booklist
- Covers 13-15: Auto-filled from starred books with covers (non-removable in extra grid)
- Covers 16-20: Added via search modal or upload (removable, reorderable)

### Key Functions
- `toggleExtendedCollageMode(enabled, isRestoring)` - Switches between 12/20 cover modes
- `renderExtraCoversGrid()` - Renders 8 extra cover slots (from-list + added + empty)
- `searchExtraCovers()` / `openExtraCoverSearchModal()` - Modal search for additional covers
- `addExtraCover(coverData, preferredSlot)` / `removeExtraCover(index)` - Manage extra covers
- `handleExtraCoverUpload()` - Upload custom image for an extra cover slot
- `loadImageAsDataUrl(url)` - Converts remote URLs to base64 for localStorage persistence

### Dynamic Grid Sizing
- 12 covers: 3x4 grid layout
- 20 covers: 4x5 grid layout
- Layout drawing functions dynamically calculate rows/columns based on cover count

### UI Components
- `#extended-collage-toggle` - Checkbox in Cover Layout settings
- `#extra-covers-section` - Hidden section showing 8 extra cover slots
- Extra Cover Search Modal - Search form with results grid and "Add to Collage" buttons

## Folio (Cat Mascot)

Animated SVG cat companion with state-based animations and contextual quips.

- **States**: idle, greeting, searching, excited, evaluating, sleeping, worried
- **Micro-reactions**: nod, perk, wince, watch (eye tracking), yawn, startle, satisfied
- **Quip system**: Triggered quips for specific events (e.g., 'book-added', 'pdf-exported') + ambient shuffle-bag pool (prevents repeats)
- **Guard system**: `folio.guard(duration)` suppresses setState/react to prevent cascade during state restoration
- **API**: `window.folio.setState()`, `.react()`, `.showBubble()`, `.clickFolio()`, `.guard()`

## Tour System

Guided tour with 6 sections: Getting Started, Search & Add, Your Booklist, Covers & Collage, Customize & Style, Export & Finish.

- Section picker modal at start, or launch specific section
- Spotlight overlay highlighting target elements
- Folio narrates each step with contextual animation states
- `prepare()` hooks auto-open tabs, scroll, and click buttons for demos
- Demo search auto-runs a Discworld search and adds a book
- **API**: `window.startTour()`, `window.startTourSection(sectionName)`

## Code Patterns

- **IIFE encapsulation** for all modules (no ES6 imports in browser code)
- **Event-driven** with `addEventListener` throughout (except `openTab` which uses HTML `onclick`)
- **Debounced functions** for performance: `debouncedSave` (400ms), `debouncedCoverRegen` (350ms)
- **Direct DOM manipulation** (no virtual DOM or framework)
- **Canvas-based rendering** for precise PDF/collage output
- **Custom font dropdowns** with live preview styling
- **Content-editable fields** with paste sanitization (`handlePastePlainText`)
- **Two-tier save system**: localStorage for crash recovery + `.booklist` download for explicit saves

## Testing

Tests use **Vitest** with **jsdom** environment. The test setup (`tests/setup.js`) loads `config.js` and `book-utils.js` into the global scope via indirect `eval` to match the browser's global loading pattern.

Currently only `BookUtils` has unit tests (31 test cases across all 9 functions). `app.js` is not tested due to its heavy DOM dependency and IIFE encapsulation.

To add new utility functions, put them in `book-utils.js` and add corresponding tests in `tests/book-utils.test.js`.

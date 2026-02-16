# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Booklist Maker is a web-based application for creating, customizing, and exporting printable booklists. It targets libraries creating professional book displays with cover art, customizable typography, QR codes, and branding.

**Tech Stack**: Vanilla HTML5/CSS3/JavaScript (ES6+). Dev tooling: ESLint + Vitest (via npm).

**Branch Note**: The `claude-code-trial` branch adds Extended Collage Mode (20 covers vs standard 12).

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

## Architecture

### File Structure
- `index.html` - Single-page UI markup with semantic HTML5 and ARIA accessibility
- `assets/css/styles.css` - All styling, organized by component with CSS variables
- `assets/js/config.js` - `CONFIG` constants (extracted, loaded first)
- `assets/js/book-utils.js` - `BookUtils` shared utility functions (pure, testable)
- `assets/js/app.js` - Core application logic (IIFE, uses CONFIG + BookUtils globals)
- `assets/js/folio.js` - Animated cat mascot companion
- `assets/js/tour.js` - Guided tour system
- `assets/img/branding-default.png` - Default library branding image
- `tests/book-utils.test.js` - Unit tests for BookUtils

### Module Pattern
The application uses an IIFE (Immediately Invoked Function Expression) encapsulated in `BooklistApp`:

```javascript
const BooklistApp = (function() {
  'use strict';
  // Private state: myBooklist array, extraCollageCovers array, DOM element references
  // Private functions for all business logic
  // Public API: init(), showNotification(), getAiDescription()
  return { init, showNotification, getAiDescription };
})();
```

### Key Configuration
All constants are in the `CONFIG` object in `config.js` (loaded as a global before app.js):
- Layout: `TOTAL_SLOTS`, `SLOTS_PER_INSIDE_PANEL`, cover dimensions
- Collage: `MIN_COVERS_FOR_COLLAGE` (12), `MAX_COVERS_FOR_COLLAGE` (20)
- PDF export: 300 DPI, 3x canvas scale, 11"x8.5" output
- APIs: Open Library endpoints, Google Apps Script for AI descriptions
- Timing: autosave debounce, notification duration

### Shared Utilities (BookUtils)
Pure functions in `book-utils.js` eliminate duplicated logic across app.js:
- `BookUtils.hasValidCover(book)` - Checks if a book has a non-placeholder cover
- `BookUtils.getStarredBooks(booklist)` - Filters non-blank, starred books
- `BookUtils.getStarredBooksWithCovers(booklist)` - Starred books with valid covers
- `BookUtils.isAtCoverLimit(booklist, extras, max)` - Checks cover count limit
- `BookUtils.countTotalCovers(booklist, extras, extendedMode)` - Total valid covers
- `BookUtils.getCoverUrl(coverId, size)` - Builds Open Library cover URL
- `BookUtils.getBookCoverUrl(book, size)` - Best cover URL for a book
- `BookUtils.hasEnoughCoversForCollage(booklist, extras, extendedMode)` - Collage readiness

### State Management
- `myBooklist` array holds all book objects with metadata
- `extraCollageCovers` array holds additional covers for extended mode (base64 data URLs with UUIDs)
- `MAX_BOOKS` dynamic limit (13-15) based on UI toggles
- LocalStorage autosave via `saveDraftLocal()` / `restoreDraftLocalIfPresent()`
- JSON export/import for `.booklist` files via `serializeState()` / `applyState()`

### External Dependencies (CDN)
- Sortable.js - Drag-and-drop reordering (books + extra covers)
- jsPDF + html2canvas - PDF generation
- QRCode.js - QR code generation
- Font Awesome - Icons
- Google Fonts - Typography options

### External APIs
- **Open Library API** - Book search and cover images (no auth required)
- **Google Apps Script** - AI-powered book descriptions (custom integration)

## Key Functional Areas

1. **Search**: `getBooks()` fetches from Open Library; advanced filters for title, author, ISBN, subject, publisher
2. **Book Management**: Create/delete/edit entries, drag-and-drop reorder, star books for collage
3. **Cover Generation**: `generateCoverCollage()` renders starred books in Classic/Staggered/Tilted layouts
4. **PDF Export**: `exportPdf()` uses html2canvas + jsPDF with 3x scaling for print quality
5. **Styling**: Per-element font selection (20+ fonts), sizes, weights, colors, line spacing
6. **QR/Branding**: QR code generation, custom branding image upload

## Extended Collage Mode (claude-code-trial branch)

This branch adds support for 20-cover collages instead of the standard 12.

### Cover Flow
- Covers 1-12: From starred books in the main list
- Covers 13-15: From starred books with covers (auto-filled, non-removable in extra grid)
- Covers 16-20: Added via search modal (removable, reorderable)

### Key Functions
- `toggleExtendedCollageMode(enabled, isRestoring)` - Switches between 12/20 cover modes
- `renderExtraCoversGrid()` - Renders 8 extra cover slots (from-list + added + empty)
- `searchExtraCovers()` - Modal search for additional covers
- `addExtraCover(coverData, preferredSlot)` / `removeExtraCover(index)` - Manage extra covers
- `loadImageAsDataUrl(url)` - Converts remote URLs to base64 for storage

### Dynamic Grid Sizing
- 12 covers: 3×4 grid layout
- 20 covers: 4×5 grid layout
- Layout functions (`drawLayoutClassic`, `drawLayoutBookshelf`) dynamically calculate rows/columns

### Data Structure
```javascript
extraCollageCovers = [
  { id: 'extra-{uuid}', coverData: 'data:image/jpeg;base64,...' },
  // ...up to 8 entries
]
```

### UI Components
- `#extended-collage-toggle` - Checkbox to enable 20-cover mode
- `#extra-covers-section` - Hidden section showing 8 extra cover slots
- Extra Cover Search Modal - Search form with results grid and "Add to Collage" buttons

## Code Patterns

- Event-driven with `addEventListener` throughout
- Debounced functions for performance (`debouncedSave`, `debouncedCoverRegen`)
- Direct DOM manipulation (no virtual DOM)
- Tab system via global `openTab()` function
- Canvas-based rendering for precise PDF control
- Custom font dropdowns with live preview styling

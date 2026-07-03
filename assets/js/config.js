/**
 * Booklister - Configuration
 * All application constants in one place.
 */
(function() {
  'use strict';

  const CONFIG = {
    // Layout
    TOTAL_SLOTS: 15,
    SLOTS_PER_INSIDE_PANEL: 5,
    BACK_COVER_START_INDEX: 10,

    // Dynamic max books based on UI toggles
    MAX_BOOKS_FULL: 15,
    MAX_BOOKS_ONE_ELEMENT: 14,
    MAX_BOOKS_BOTH_ELEMENTS: 13,

    // Cover dimensions (pixels at screen resolution)
    COVER_THUMB_WIDTH: 110,
    COVER_THUMB_HEIGHT: 132,
    FRONT_COVER_WIDTH: 480,
    FRONT_COVER_HEIGHT: 768,

    // Collage generation
    MIN_COVERS_FOR_COLLAGE: 12,
    MAX_COVERS_FOR_COLLAGE: 20,
    COLLAGE_COVER_COUNTS: [12, 16, 20],
    // Collage canvas geometry in inches (rendered at PDF_DPI, so
    // 5x8in = 3000x4800px). Shared by createCollageCanvas and the
    // Looks gallery bar previews so both render at identical width.
    COLLAGE_WIDTH_IN: 5,
    COLLAGE_HEIGHT_IN: 8,
    COLLAGE_GRID_COLS: 3,
    COLLAGE_TOP_ROW_COUNT: 3,
    COLLAGE_BOTTOM_ROWS: 3,

    // QR Code
    QR_SIZE_PX: 900,
    QR_ERROR_CORRECTION: 'H',

    // PDF Export
    PDF_DPI: 600,
    PDF_CANVAS_SCALE: 600 / 96, // True 600 DPI (6.25x scale at 96 DPI base)
    PDF_WIDTH_IN: 11,
    PDF_HEIGHT_IN: 8.5,

    // Branding area
    BRANDING_WIDTH: 480,
    BRANDING_HEIGHT: 144,

    // Timing
    NOTIFICATION_DURATION_MS: 3000,
    NOTIFICATION_DURATION_SUCCESS_MS: 1500,
    // Max notifications held while the tool is hidden (auth modal /
    // awaiting library config) before the oldest are dropped.
    MAX_DEFERRED_NOTIFICATIONS: 10,
    AUTOSAVE_DEBOUNCE_MS: 400,
    PDF_RENDER_DELAY_MS: 300,
    // Font dropdown type-ahead: pause longer than this and the typed
    // buffer resets, so the next keystroke starts a fresh match.
    FONT_TYPEAHEAD_RESET_MS: 800,

    // Quick Add — soft cap on rows the Spreadsheet tab will accept in a
    // single paste. Anything beyond this is sliced off and the user is
    // told via the success notification. Guards against accidental
    // whole-file pastes; a typical booklist holds 12–15 books anyway.
    QUICK_ADD_MAX_PASTE_ROWS: 500,

    // Search
    SEARCH_RESULTS_PER_PAGE: 20,

    // API
    OPEN_LIBRARY_SEARCH_URL: 'https://openlibrary.org/search.json',
    OPEN_LIBRARY_COVERS_URL: 'https://covers.openlibrary.org/b/id/',
    OPEN_LIBRARY_EDITIONS_LIMIT: 100,

    // Placeholders
    PLACEHOLDER_COVER_URL: 'https://placehold.co/110x132/EAEAEA/333333?text=Upload%20Cover',
    PLACEHOLDER_NO_COVER_URL: 'https://placehold.co/110x132/EAEAEA/333333?text=No%20Cover',
    PLACEHOLDER_QR_URL: 'https://placehold.co/900x900/EAEAEA/333333?text=QR+Code',
    PLACEHOLDER_COLLAGE_COVER_URL: 'https://placehold.co/300x450/EAEAEA/333333?text=No%20Cover',

    // Text placeholders
    PLACEHOLDERS: {
      title: '[Enter Title]',
      author: '[Enter Author]',
      callNumber: '[Call #]',
      description: '[Enter a brief description here...]',
      authorWithCall: '[Enter Author] - [Call #]',
      qrText: "Enter your blurb here. To link to an online list (like Bibliocommons), open the Back Cover tab and paste the URL in the 'QR Code URL' field, then click Update. You can also click the QR code square to upload your own image. Remember to test the code with your phone!",
    },

    // Transparent 1x1 GIF (used to clear image elements while keeping placeholder text visible)
    TRANSPARENT_GIF: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',

    // QR uploader empty-state placeholder. Static PNG matching the
    // pre-custom-QR-feature placehold.co rendering pixel-for-pixel,
    // shipped locally so we don't depend on placehold.co at runtime.
    QR_PLACEHOLDER_IMG: 'assets/img/qr-placeholder.png',

    // Colors
    PLACEHOLDER_COLOR: '#757575',

    // Available fonts (single source of truth for all font dropdowns)
    FONTS: [
      { value: "'Abril Fatface', serif", label: 'Abril Fatface' },
      { value: "'Alfa Slab One', system-ui", label: 'Alfa Slab One' },
      { value: "'Amatic SC', cursive", label: 'Amatic SC' },
      { value: "'Anton', sans-serif", label: 'Anton' },
      { value: "'Arvo', serif", label: 'Arvo' },
      { value: "'Bangers', system-ui", label: 'Bangers' },
      { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
      { value: "'Bitter', serif", label: 'Bitter' },
      { value: "'Bungee', system-ui", label: 'Bungee' },
      { value: "'Calibri', sans-serif", label: 'Calibri' },
      { value: "'Caveat', cursive", label: 'Caveat' },
      { value: "'Cinzel', serif", label: 'Cinzel' },
      { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond' },
      { value: "'Courier Prime', monospace", label: 'Courier Prime' },
      { value: "'Creepster', system-ui", label: 'Creepster' },
      { value: "'Crimson Text', serif", label: 'Crimson Text' },
      { value: "'Dancing Script', cursive", label: 'Dancing Script' },
      { value: "'EB Garamond', serif", label: 'EB Garamond' },
      { value: "'Fredoka', sans-serif", label: 'Fredoka' },
      { value: "'Georgia', serif", label: 'Georgia' },
      { value: "'Helvetica', sans-serif", label: 'Helvetica' },
      { value: "'Inter', sans-serif", label: 'Inter' },
      { value: "'Josefin Sans', sans-serif", label: 'Josefin Sans' },
      { value: "'Lato', sans-serif", label: 'Lato' },
      { value: "'Libre Baskerville', serif", label: 'Libre Baskerville' },
      { value: "'Lobster', cursive", label: 'Lobster' },
      { value: "'Lora', serif", label: 'Lora' },
      { value: "'Luckiest Guy', system-ui", label: 'Luckiest Guy' },
      { value: "'Merriweather', serif", label: 'Merriweather' },
      { value: "'Montserrat', sans-serif", label: 'Montserrat' },
      { value: "'Nunito', sans-serif", label: 'Nunito' },
      { value: "'Open Sans', sans-serif", label: 'Open Sans' },
      { value: "'Oswald', sans-serif", label: 'Oswald' },
      { value: "'Pacifico', cursive", label: 'Pacifico' },
      { value: "'Permanent Marker', cursive", label: 'Permanent Marker' },
      { value: "'Playfair Display', serif", label: 'Playfair Display' },
      { value: "'Poppins', sans-serif", label: 'Poppins' },
      { value: "'Quicksand', sans-serif", label: 'Quicksand' },
      { value: "'Raleway', sans-serif", label: 'Raleway' },
      { value: "'Roboto', sans-serif", label: 'Roboto' },
      { value: "'Roboto Slab', serif", label: 'Roboto Slab' },
      { value: "'Source Sans 3', sans-serif", label: 'Source Sans 3' },
      { value: "'Special Elite', monospace", label: 'Special Elite' },
      { value: "'Staatliches', system-ui", label: 'Staatliches' },
      { value: "'Times New Roman', serif", label: 'Times New Roman' },
    ],

    // Looks: curated cover-style presets ("stamps", not themes — applying
    // one sets values and walks away; nothing tracks which look is active).
    // Each look patches ONLY cover styling: styles.coverTitle fields plus
    // the layout-related ui fields listed in its `ui` block. Book-block
    // text styles, books, images, and the user's cover text are never
    // touched by a look.
    //
    // Field notes:
    // - months: 1-12 values during which the look is FEATURED in the
    //   Front Cover tab's 3-chip strip. [] = year-round filler. The full
    //   gallery always shows every look; months only affect strip order.
    // - sampleText: shown in gallery bar previews when the user has no
    //   cover text of their own (rung 1 of the preview ladder).
    // - chip: [start, end] gradient for the strip chip's swatch.
    // - palette: placeholder-cover colors for the gallery card's layout
    //   impression (CSS blocks arranged per collageLayout).
    // - coverTitle.simple / .lines: same field shapes serializeState
    //   writes to styles.coverTitle — fonts MUST be `value` strings that
    //   exist in CONFIG.FONTS (enforced by tests/config.test.js). Both
    //   are always defined so toggling "Style each line separately"
    //   after applying lands on sensible values either way;
    //   ui.coverAdvancedMode decides which one renders. `lines` holds 2
    //   entries (headline + subline); applyLook pads to the serialized
    //   3-line schema by repeating the last entry, so lines 3+ inherit
    //   the subline style. bgColor2/bgGradientDirection may be omitted
    //   when bgGradient is false (consumers default them).
    // - ui.tilt* fields: only present on tilted looks; non-tilted looks
    //   leave the user's tilt preferences alone.
    LOOKS_STRIP_COUNT: 3,
    LOOKS: [
      {
        id: 'classic-literary',
        name: 'Classic Literary',
        description: 'Classic layout · shelves · cream on slate',
        months: [],
        sampleText: 'Staff Picks\nOur Favorite Reads',
        chip: ['#1a202c', '#f6e9d4'],
        palette: ['#8a6d4f', '#4f6b8a', '#7a4f52', '#5d7a5a'],
        ui: { coverAdvancedMode: true, collageLayout: 'classic', showShelves: true, titleBarPosition: 'classic' },
        coverTitle: {
          bgColor: '#1a202c', bgGradient: false,
          simple: { font: "'Playfair Display', serif", sizePt: 36, color: '#f6e9d4', bold: true, italic: false },
          lines: [
            { font: "'Playfair Display', serif", sizePt: 40, color: '#f6e9d4', bold: true, italic: false, spacingPt: 0 },
            { font: "'EB Garamond', serif", sizePt: 22, color: '#e2d5bb', bold: false, italic: true, spacingPt: 6 },
          ],
        },
      },
      {
        id: 'summer-reading',
        name: 'Summer Reading',
        description: 'Staggered layout · gradient bar, bottom',
        months: [5, 6, 7, 8],
        sampleText: 'Summer Reading\nPoolside Page-Turners',
        chip: ['#ed8936', '#ed64a6'],
        palette: ['#f6ad55', '#4fd1c5', '#ed64a6', '#63b3ed'],
        ui: { coverAdvancedMode: true, collageLayout: 'staggered', showShelves: false, titleBarPosition: 'bottom' },
        coverTitle: {
          bgColor: '#ed8936', bgGradient: true, bgColor2: '#ed64a6', bgGradientDirection: 'to-right',
          simple: { font: "'Pacifico', cursive", sizePt: 36, color: '#FFFFFF', bold: false, italic: false },
          lines: [
            { font: "'Pacifico', cursive", sizePt: 40, color: '#FFFFFF', bold: false, italic: false, spacingPt: 0 },
            { font: "'Quicksand', sans-serif", sizePt: 20, color: '#fff7ed', bold: true, italic: false, spacingPt: 6 },
          ],
        },
      },
      {
        id: 'spooky-season',
        name: 'Spooky Season',
        description: 'Tilted layout · orange on black',
        months: [10],
        sampleText: 'Spine Chillers\nHaunting Reads',
        chip: ['#0d0d0f', '#dd6b20'],
        palette: ['#2d2d33', '#44337a', '#1f2833', '#3c2f2f'],
        ui: {
          coverAdvancedMode: true, collageLayout: 'tilted', showShelves: false, titleBarPosition: 'top',
          tiltDegree: -25, tiltOffsetDirection: 'vertical', tiltCoverSizePct: 100,
        },
        coverTitle: {
          bgColor: '#0d0d0f', bgGradient: false,
          simple: { font: "'Creepster', system-ui", sizePt: 40, color: '#ff8c00', bold: false, italic: false },
          lines: [
            { font: "'Creepster', system-ui", sizePt: 44, color: '#ff8c00', bold: false, italic: false, spacingPt: 0 },
            { font: "'Special Elite', monospace", sizePt: 18, color: '#a0aec0', bold: false, italic: false, spacingPt: 8 },
          ],
        },
      },
      {
        id: 'kids-corner',
        name: 'Kids Corner',
        description: 'Masonry layout · primary brights',
        months: [],
        sampleText: 'Kids Corner\nRead With Me',
        chip: ['#4299e1', '#ecc94b'],
        palette: ['#f56565', '#48bb78', '#4299e1', '#ecc94b'],
        ui: { coverAdvancedMode: true, collageLayout: 'masonry', showShelves: false, titleBarPosition: 'classic' },
        coverTitle: {
          bgColor: '#4299e1', bgGradient: false,
          simple: { font: "'Luckiest Guy', system-ui", sizePt: 36, color: '#FFFFFF', bold: false, italic: false },
          lines: [
            { font: "'Luckiest Guy', system-ui", sizePt: 40, color: '#FFFFFF', bold: false, italic: false, spacingPt: 0 },
            { font: "'Fredoka', sans-serif", sizePt: 20, color: '#ebf8ff', bold: true, italic: false, spacingPt: 6 },
          ],
        },
      },
      {
        id: 'modern-minimal',
        name: 'Modern Minimal',
        description: 'Masonry layout · white bar, tracked caps',
        months: [],
        sampleText: 'New & Notable\nThis Month’s Titles',
        chip: ['#f0f1f3', '#1a202c'],
        palette: ['#a0aec0', '#718096', '#cbd5e0', '#4a5568'],
        ui: { coverAdvancedMode: false, collageLayout: 'masonry', showShelves: false, titleBarPosition: 'classic' },
        coverTitle: {
          bgColor: '#FFFFFF', bgGradient: false,
          simple: { font: "'Bebas Neue', sans-serif", sizePt: 38, color: '#1a202c', bold: false, italic: false },
          lines: [
            { font: "'Bebas Neue', sans-serif", sizePt: 38, color: '#1a202c', bold: false, italic: false, spacingPt: 0 },
            { font: "'Inter', sans-serif", sizePt: 16, color: '#718096', bold: false, italic: false, spacingPt: 6 },
          ],
        },
      },
      {
        id: 'elegant-script',
        name: 'Elegant Script',
        description: 'Classic layout · rosewood bar, bottom',
        months: [],
        sampleText: 'Evening Reads\nStories to Savor',
        chip: ['#7a4f52', '#f7e8d3'],
        palette: ['#b08ea2', '#d4b483', '#8ea2b0', '#c9a9a6'],
        ui: { coverAdvancedMode: true, collageLayout: 'classic', showShelves: false, titleBarPosition: 'bottom' },
        coverTitle: {
          bgColor: '#7a4f52', bgGradient: false,
          simple: { font: "'Dancing Script', cursive", sizePt: 40, color: '#f7e8d3', bold: false, italic: false },
          lines: [
            { font: "'Dancing Script', cursive", sizePt: 44, color: '#f7e8d3', bold: false, italic: false, spacingPt: 0 },
            { font: "'Cormorant Garamond', serif", sizePt: 20, color: '#ead9c2', bold: false, italic: true, spacingPt: 4 },
          ],
        },
      },
      {
        id: 'winter-holidays',
        name: 'Winter Holidays',
        description: 'Classic layout · shelves · gold on pine',
        months: [12, 1],
        sampleText: 'Winter Warmers\nCozy Season Reads',
        chip: ['#1a4731', '#f6e9c9'],
        palette: ['#22543d', '#742a2a', '#b7791f', '#2a4365'],
        ui: { coverAdvancedMode: true, collageLayout: 'classic', showShelves: true, titleBarPosition: 'classic' },
        coverTitle: {
          bgColor: '#1a4731', bgGradient: false,
          simple: { font: "'Cinzel', serif", sizePt: 34, color: '#f6e9c9', bold: true, italic: false },
          lines: [
            { font: "'Cinzel', serif", sizePt: 38, color: '#f6e9c9', bold: true, italic: false, spacingPt: 0 },
            { font: "'EB Garamond', serif", sizePt: 20, color: '#d9c9a3', bold: false, italic: true, spacingPt: 6 },
          ],
        },
      },
      {
        id: 'comic-pop',
        name: 'Comic Pop',
        description: 'Tilted layout · black on comic yellow',
        months: [],
        sampleText: 'Graphic Novels\nPow! Bam! Read!',
        chip: ['#ffd60a', '#1a202c'],
        palette: ['#f56565', '#4299e1', '#ffd60a', '#9f7aea'],
        ui: {
          coverAdvancedMode: true, collageLayout: 'tilted', showShelves: false, titleBarPosition: 'top',
          tiltDegree: -15, tiltOffsetDirection: 'vertical', tiltCoverSizePct: 100,
        },
        coverTitle: {
          bgColor: '#ffd60a', bgGradient: false,
          simple: { font: "'Bangers', system-ui", sizePt: 38, color: '#1a202c', bold: false, italic: false },
          lines: [
            { font: "'Bangers', system-ui", sizePt: 42, color: '#1a202c', bold: false, italic: false, spacingPt: 0 },
            { font: "'Anton', sans-serif", sizePt: 18, color: '#1a202c', bold: false, italic: false, spacingPt: 6 },
          ],
        },
      },
      {
        id: 'scholarly',
        name: 'Scholarly',
        description: 'Classic layout · navy on paper, top',
        months: [],
        sampleText: 'History & Ideas\nNonfiction Highlights',
        chip: ['#f7f5f0', '#1a365d'],
        palette: ['#4a5568', '#8a6d4f', '#2a4365', '#718096'],
        ui: { coverAdvancedMode: false, collageLayout: 'classic', showShelves: false, titleBarPosition: 'top' },
        coverTitle: {
          bgColor: '#f7f5f0', bgGradient: false,
          simple: { font: "'Libre Baskerville', serif", sizePt: 30, color: '#1a365d', bold: false, italic: false },
          lines: [
            { font: "'Libre Baskerville', serif", sizePt: 32, color: '#1a365d', bold: false, italic: false, spacingPt: 0 },
            { font: "'Crimson Text', serif", sizePt: 18, color: '#4a5568', bold: false, italic: true, spacingPt: 5 },
          ],
        },
      },
    ],

    // AI drafter configuration sent to the Apps Script with every
    // request. Values here override the script's defaults for
    // production calls (the script's CONFIG only applies to direct
    // GET diagnostic requests that bypass the tool). The easter egg
    // modal (Ctrl+Alt+D / Cmd+Option+D) can override individual values for a
    // single session. Whatever is sent only takes effect if the
    // Apps Script's ALLOWED whitelist includes the field.
    //
    // Length: deliberately split across tool and script.
    //   TARGET_WORDS_{MIN,MAX} (here) — what the writer is told to
    //     aim for. LLMs follow word targets reliably; they can't
    //     count chars. Owned by the tool so it's tunable via the
    //     modal and shippable via a client push.
    //   MIN_CHARS / MAX_CHARS / LENGTH_TOLERANCE (Apps Script only)
    //     — the server-side acceptance contract. Owned by the Apps
    //     Script so the precision band can be tuned there without
    //     needing a matching client change. Not sent from here.
    DRAFTER_DEFAULTS: {
      TARGET_WORDS_MIN: 42,
      TARGET_WORDS_MAX: 47,
      TEMPERATURE: 0.6,
      DRAFT_COUNT: 3,
      MAX_RETRIES: 2,
    },
  };

  // Expose globally
  globalThis.CONFIG = CONFIG;
})();

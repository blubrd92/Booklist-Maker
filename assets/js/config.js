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
    AUTOSAVE_DEBOUNCE_MS: 400,
    PDF_RENDER_DELAY_MS: 300,

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
      qrText: "Enter your blurb here. To link to an online list (like Bibliocommons), go to Settings > Back Cover and paste the URL in the 'QR Code URL' field and click update. Remember to test the code with your phone!",
    },

    // Transparent 1x1 GIF (used to clear image elements while keeping placeholder text visible)
    TRANSPARENT_GIF: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',

    // Colors
    PLACEHOLDER_COLOR: '#757575',

    // Available fonts (single source of truth for all font dropdowns)
    FONTS: [
      { value: "'Anton', sans-serif", label: 'Anton' },
      { value: "'Arvo', serif", label: 'Arvo' },
      { value: "'Bangers', system-ui", label: 'Bangers' },
      { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
      { value: "'Bungee', system-ui", label: 'Bungee' },
      { value: "'Calibri', sans-serif", label: 'Calibri' },
      { value: "'Cinzel', serif", label: 'Cinzel' },
      { value: "'Crimson Text', serif", label: 'Crimson Text' },
      { value: "'EB Garamond', serif", label: 'EB Garamond' },
      { value: "'Georgia', serif", label: 'Georgia' },
      { value: "'Helvetica', sans-serif", label: 'Helvetica' },
      { value: "'Lato', sans-serif", label: 'Lato' },
      { value: "'Libre Baskerville', serif", label: 'Libre Baskerville' },
      { value: "'Merriweather', serif", label: 'Merriweather' },
      { value: "'Montserrat', sans-serif", label: 'Montserrat' },
      { value: "'Open Sans', sans-serif", label: 'Open Sans' },
      { value: "'Oswald', sans-serif", label: 'Oswald' },
      { value: "'Playfair Display', serif", label: 'Playfair Display' },
      { value: "'Poppins', sans-serif", label: 'Poppins' },
      { value: "'Raleway', sans-serif", label: 'Raleway' },
      { value: "'Roboto', sans-serif", label: 'Roboto' },
      { value: "'Roboto Slab', serif", label: 'Roboto Slab' },
      { value: "'Source Sans 3', sans-serif", label: 'Source Sans 3' },
      { value: "'Staatliches', system-ui", label: 'Staatliches' },
      { value: "'Times New Roman', serif", label: 'Times New Roman' },
    ],

    // AI drafter configuration sent to the Apps Script with every
    // request. The script treats these as the single source of truth;
    // it only falls back to its own internal CONFIG for direct GET
    // diagnostic calls. The easter egg modal (Ctrl+Shift+D) can
    // override individual values for a single session.
    // Whatever is sent only takes effect if the Apps Script's ALLOWED
    // whitelist includes the field.
    //
    // Two length-related concerns, deliberately decoupled:
    //   TARGET_WORDS_{MIN,MAX} — what the writer is told to aim for.
    //     LLMs follow word targets reliably; they can't count chars.
    //     This is the user-facing knob (exposed in the modal).
    //   MIN_CHARS / MAX_CHARS / LENGTH_TOLERANCE — the server-side
    //     acceptance contract. The Apps Script validates in chars and
    //     triggers a word-based revision pass if outside the band.
    //     Not exposed in the modal (internal precision knob).
    DRAFTER_DEFAULTS: {
      TARGET_WORDS_MIN: 45,
      TARGET_WORDS_MAX: 50,
      MIN_CHARS: 275,
      MAX_CHARS: 285,
      LENGTH_TOLERANCE: 10,
      TEMPERATURE: 0.6,
      DRAFT_COUNT: 2,
      MAX_RETRIES: 2,
    },
  };

  // Expose globally
  globalThis.CONFIG = CONFIG;
})();

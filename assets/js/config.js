/**
 * Booklist Maker - Configuration
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
    COLLAGE_GRID_COLS: 3,
    COLLAGE_TOP_ROW_COUNT: 3,
    COLLAGE_BOTTOM_ROWS: 3,

    // QR Code
    QR_SIZE_PX: 144,
    QR_ERROR_CORRECTION: 'H',

    // PDF Export
    PDF_DPI: 300,
    PDF_CANVAS_SCALE: 3,
    PDF_WIDTH_IN: 11,
    PDF_HEIGHT_IN: 8.5,

    // Branding area
    BRANDING_WIDTH: 480,
    BRANDING_HEIGHT: 144,

    // Timing
    NOTIFICATION_DURATION_MS: 3000,
    AUTOSAVE_DEBOUNCE_MS: 400,
    PDF_RENDER_DELAY_MS: 100,

    // API
    OPEN_LIBRARY_SEARCH_URL: 'https://openlibrary.org/search.json',
    OPEN_LIBRARY_COVERS_URL: 'https://covers.openlibrary.org/b/id/',
    OPEN_LIBRARY_EDITIONS_LIMIT: 100,

    // Placeholders
    PLACEHOLDER_COVER_URL: 'https://placehold.co/110x132/EAEAEA/333333?text=Upload%20Cover',
    PLACEHOLDER_NO_COVER_URL: 'https://placehold.co/110x132/EAEAEA/333333?text=No%20Cover',
    PLACEHOLDER_QR_URL: 'https://placehold.co/144x144/EAEAEA/333333?text=QR+Code',
    PLACEHOLDER_COLLAGE_COVER_URL: 'https://placehold.co/300x450/EAEAEA/333333?text=No%20Cover',

    // Text placeholders
    PLACEHOLDERS: {
      title: '[Enter Title]',
      author: '[Enter Author]',
      callNumber: '[Call #]',
      description: '[Enter a brief description here...]',
      authorWithCall: '[Enter Author] - [Call #]',
      qrText: "Enter your blurb here. To link to an online list (like Bibliocommons), go to Settings > Back Cover and paste the URL in the\n'QR Code URL' field and click update. Remember to test the code with your phone!",
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
  };

  // Expose globally
  globalThis.CONFIG = CONFIG;
})();

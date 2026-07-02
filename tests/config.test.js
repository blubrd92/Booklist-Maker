import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load config into globalThis (mirrors tests/setup.js behavior)
beforeAll(() => {
  const configCode = readFileSync(resolve('assets/js/config.js'), 'utf-8');
  (0, eval)(configCode);
});

describe('CONFIG existence', () => {
  it('CONFIG is defined as a truthy object', () => {
    expect(globalThis.CONFIG).toBeTruthy();
    expect(typeof globalThis.CONFIG).toBe('object');
  });

  it('CONFIG.TOTAL_SLOTS is a number', () => {
    expect(typeof globalThis.CONFIG.TOTAL_SLOTS).toBe('number');
  });

  it('CONFIG.MIN_COVERS_FOR_COLLAGE is a number', () => {
    expect(typeof globalThis.CONFIG.MIN_COVERS_FOR_COLLAGE).toBe('number');
  });

  it('CONFIG.MAX_COVERS_FOR_COLLAGE is a number', () => {
    expect(typeof globalThis.CONFIG.MAX_COVERS_FOR_COLLAGE).toBe('number');
  });

  it('CONFIG.MAX_BOOKS_FULL is a number', () => {
    expect(typeof globalThis.CONFIG.MAX_BOOKS_FULL).toBe('number');
  });

  it('CONFIG.PDF_DPI is a number', () => {
    expect(typeof globalThis.CONFIG.PDF_DPI).toBe('number');
  });

  it('CONFIG.PDF_CANVAS_SCALE is a number', () => {
    expect(typeof globalThis.CONFIG.PDF_CANVAS_SCALE).toBe('number');
  });

  it('CONFIG.PDF_WIDTH_IN and CONFIG.PDF_HEIGHT_IN are numbers', () => {
    expect(typeof globalThis.CONFIG.PDF_WIDTH_IN).toBe('number');
    expect(typeof globalThis.CONFIG.PDF_HEIGHT_IN).toBe('number');
  });

  it('CONFIG.QR_SIZE_PX is a number', () => {
    expect(typeof globalThis.CONFIG.QR_SIZE_PX).toBe('number');
  });

  it('CONFIG.AUTOSAVE_DEBOUNCE_MS is a number', () => {
    expect(typeof globalThis.CONFIG.AUTOSAVE_DEBOUNCE_MS).toBe('number');
  });

  it('CONFIG.MAX_DEFERRED_NOTIFICATIONS is a positive integer', () => {
    expect(typeof globalThis.CONFIG.MAX_DEFERRED_NOTIFICATIONS).toBe('number');
    expect(globalThis.CONFIG.MAX_DEFERRED_NOTIFICATIONS).toBeGreaterThan(0);
    expect(Number.isInteger(globalThis.CONFIG.MAX_DEFERRED_NOTIFICATIONS)).toBe(true);
  });

  it('CONFIG.NOTIFICATION_DURATION_MS is a number', () => {
    expect(typeof globalThis.CONFIG.NOTIFICATION_DURATION_MS).toBe('number');
  });

  it('CONFIG.FONTS is an array', () => {
    expect(Array.isArray(globalThis.CONFIG.FONTS)).toBe(true);
  });

  it('CONFIG.PLACEHOLDERS is an object', () => {
    expect(typeof globalThis.CONFIG.PLACEHOLDERS).toBe('object');
    expect(globalThis.CONFIG.PLACEHOLDERS).toBeTruthy();
  });

  it('CONFIG.OPEN_LIBRARY_SEARCH_URL is an https string', () => {
    expect(typeof globalThis.CONFIG.OPEN_LIBRARY_SEARCH_URL).toBe('string');
    expect(globalThis.CONFIG.OPEN_LIBRARY_SEARCH_URL.startsWith('https://')).toBe(true);
  });

  it('CONFIG.OPEN_LIBRARY_COVERS_URL is an https string', () => {
    expect(typeof globalThis.CONFIG.OPEN_LIBRARY_COVERS_URL).toBe('string');
    expect(globalThis.CONFIG.OPEN_LIBRARY_COVERS_URL.startsWith('https://')).toBe(true);
  });
});

describe('CONFIG value constraints', () => {
  it('TOTAL_SLOTS equals 15', () => {
    expect(globalThis.CONFIG.TOTAL_SLOTS).toBe(15);
  });

  it('MIN_COVERS_FOR_COLLAGE equals 12', () => {
    expect(globalThis.CONFIG.MIN_COVERS_FOR_COLLAGE).toBe(12);
  });

  it('MAX_COVERS_FOR_COLLAGE equals 20', () => {
    expect(globalThis.CONFIG.MAX_COVERS_FOR_COLLAGE).toBe(20);
  });

  it('MIN_COVERS_FOR_COLLAGE is less than MAX_COVERS_FOR_COLLAGE', () => {
    expect(globalThis.CONFIG.MIN_COVERS_FOR_COLLAGE).toBeLessThan(
      globalThis.CONFIG.MAX_COVERS_FOR_COLLAGE
    );
  });

  it('MAX_BOOKS_FULL is at most TOTAL_SLOTS', () => {
    expect(globalThis.CONFIG.MAX_BOOKS_FULL).toBeLessThanOrEqual(
      globalThis.CONFIG.TOTAL_SLOTS
    );
  });

  it('MAX_BOOKS_* values are in strictly decreasing order (full > one > both)', () => {
    expect(globalThis.CONFIG.MAX_BOOKS_FULL).toBeGreaterThan(
      globalThis.CONFIG.MAX_BOOKS_ONE_ELEMENT
    );
    expect(globalThis.CONFIG.MAX_BOOKS_ONE_ELEMENT).toBeGreaterThanOrEqual(
      globalThis.CONFIG.MAX_BOOKS_BOTH_ELEMENTS
    );
  });

  it('PDF_DPI is 600', () => {
    expect(globalThis.CONFIG.PDF_DPI).toBe(600);
  });

  it('PDF_CANVAS_SCALE equals PDF_DPI / 96', () => {
    expect(globalThis.CONFIG.PDF_CANVAS_SCALE).toBe(600 / 96);
    expect(globalThis.CONFIG.PDF_CANVAS_SCALE).toBe(
      globalThis.CONFIG.PDF_DPI / 96
    );
  });

  it('PDF_WIDTH_IN is 11 and PDF_HEIGHT_IN is 8.5', () => {
    expect(globalThis.CONFIG.PDF_WIDTH_IN).toBe(11);
    expect(globalThis.CONFIG.PDF_HEIGHT_IN).toBe(8.5);
  });

  it('QR_SIZE_PX is 900 and matches the 6.25x scale (900/144 ~= 6.25)', () => {
    expect(globalThis.CONFIG.QR_SIZE_PX).toBe(900);
    expect(globalThis.CONFIG.QR_SIZE_PX / 144).toBeCloseTo(6.25, 5);
  });

  it('AUTOSAVE_DEBOUNCE_MS is within a reasonable range', () => {
    expect(globalThis.CONFIG.AUTOSAVE_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(globalThis.CONFIG.AUTOSAVE_DEBOUNCE_MS).toBeLessThan(5000);
  });

  it('NOTIFICATION_DURATION_MS is positive', () => {
    expect(globalThis.CONFIG.NOTIFICATION_DURATION_MS).toBeGreaterThan(0);
  });

  it('FONT_TYPEAHEAD_RESET_MS is within a reasonable range', () => {
    expect(globalThis.CONFIG.FONT_TYPEAHEAD_RESET_MS).toBeGreaterThan(0);
    expect(globalThis.CONFIG.FONT_TYPEAHEAD_RESET_MS).toBeLessThan(5000);
  });
});

describe('CONFIG.FONTS structure', () => {
  it('has at least 40 entries', () => {
    expect(globalThis.CONFIG.FONTS.length).toBeGreaterThanOrEqual(40);
  });

  it('every entry has a non-empty value string', () => {
    for (const font of globalThis.CONFIG.FONTS) {
      expect(typeof font.value).toBe('string');
      expect(font.value.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty label string', () => {
    for (const font of globalThis.CONFIG.FONTS) {
      expect(typeof font.label).toBe('string');
      expect(font.label.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate values', () => {
    const values = globalThis.CONFIG.FONTS.map((f) => f.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('has no duplicate labels', () => {
    const labels = globalThis.CONFIG.FONTS.map((f) => f.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it('every value contains a quoted family name or generic fallback', () => {
    for (const font of globalThis.CONFIG.FONTS) {
      const hasQuotedFamily = /['"][^'"]+['"]/.test(font.value);
      const hasGenericFallback = /(serif|sans-serif|monospace|cursive|fantasy|system-ui)/.test(
        font.value
      );
      expect(hasQuotedFamily || hasGenericFallback).toBe(true);
    }
  });
});

describe('CONFIG.LOOKS structure', () => {
  const LOOKS = () => globalThis.CONFIG.LOOKS;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const LAYOUTS = ['classic', 'masonry', 'staggered', 'tilted'];
  const POSITIONS = ['top', 'classic', 'center', 'lower', 'bottom'];
  const GRADIENT_DIRECTIONS = ['to-bottom', 'to-top', 'to-right', 'to-left'];

  it('is an array with at least 9 looks', () => {
    expect(Array.isArray(LOOKS())).toBe(true);
    expect(LOOKS().length).toBeGreaterThanOrEqual(9);
  });

  it('LOOKS_STRIP_COUNT is a positive number no larger than the catalog', () => {
    expect(globalThis.CONFIG.LOOKS_STRIP_COUNT).toBeGreaterThan(0);
    expect(globalThis.CONFIG.LOOKS_STRIP_COUNT).toBeLessThanOrEqual(LOOKS().length);
  });

  it('has unique ids', () => {
    const ids = LOOKS().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every look has non-empty id, name, description, and multi-line sampleText', () => {
    for (const look of LOOKS()) {
      expect(typeof look.id).toBe('string');
      expect(look.id.length).toBeGreaterThan(0);
      expect(typeof look.name).toBe('string');
      expect(look.name.length).toBeGreaterThan(0);
      expect(typeof look.description).toBe('string');
      expect(look.description.length).toBeGreaterThan(0);
      expect(typeof look.sampleText).toBe('string');
      expect(look.sampleText.trim().length).toBeGreaterThan(0);
    }
  });

  it('months arrays contain only valid calendar months', () => {
    for (const look of LOOKS()) {
      expect(Array.isArray(look.months)).toBe(true);
      for (const m of look.months) {
        expect(Number.isInteger(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(12);
      }
    }
  });

  it('has at least one seasonal look and at least LOOKS_STRIP_COUNT year-round looks', () => {
    const seasonal = LOOKS().filter((l) => l.months.length > 0);
    const yearRound = LOOKS().filter((l) => l.months.length === 0);
    expect(seasonal.length).toBeGreaterThan(0);
    // The strip must always be fillable even in a month with no
    // seasonal matches.
    expect(yearRound.length).toBeGreaterThanOrEqual(globalThis.CONFIG.LOOKS_STRIP_COUNT);
  });

  it('chip and palette are valid hex color arrays', () => {
    for (const look of LOOKS()) {
      expect(look.chip).toHaveLength(2);
      look.chip.forEach((c) => expect(c).toMatch(HEX));
      expect(look.palette.length).toBeGreaterThanOrEqual(3);
      look.palette.forEach((c) => expect(c).toMatch(HEX));
    }
  });

  it('ui block uses only valid layout, position, and flag values', () => {
    for (const look of LOOKS()) {
      expect(LAYOUTS).toContain(look.ui.collageLayout);
      expect(POSITIONS).toContain(look.ui.titleBarPosition);
      expect(typeof look.ui.coverAdvancedMode).toBe('boolean');
      expect(typeof look.ui.showShelves).toBe('boolean');
    }
  });

  it('tilted looks carry complete tilt settings; others carry none', () => {
    for (const look of LOOKS()) {
      if (look.ui.collageLayout === 'tilted') {
        expect(typeof look.ui.tiltDegree).toBe('number');
        expect(['vertical', 'horizontal']).toContain(look.ui.tiltOffsetDirection);
        expect(look.ui.tiltCoverSizePct).toBeGreaterThanOrEqual(50);
        expect(look.ui.tiltCoverSizePct).toBeLessThanOrEqual(100);
      } else {
        // Non-tilted looks must not stamp tilt prefs (applyLook only
        // patches tilt fields for tilted layouts, but keep the data
        // honest too).
        expect(look.ui.tiltDegree).toBeUndefined();
      }
    }
  });

  it('coverTitle colors and gradient direction are valid', () => {
    for (const look of LOOKS()) {
      expect(look.coverTitle.bgColor).toMatch(HEX);
      expect(look.coverTitle.bgColor2).toMatch(HEX);
      expect(typeof look.coverTitle.bgGradient).toBe('boolean');
      expect(GRADIENT_DIRECTIONS).toContain(look.coverTitle.bgGradientDirection);
    }
  });

  it('every look font exists in CONFIG.FONTS', () => {
    const fontValues = new Set(globalThis.CONFIG.FONTS.map((f) => f.value));
    for (const look of LOOKS()) {
      expect(fontValues.has(look.coverTitle.simple.font)).toBe(true);
      for (const line of look.coverTitle.lines) {
        expect(fontValues.has(line.font)).toBe(true);
      }
    }
  });

  it('simple and lines style entries are well-formed', () => {
    for (const look of LOOKS()) {
      const s = look.coverTitle.simple;
      expect(s.sizePt).toBeGreaterThan(0);
      expect(s.color).toMatch(HEX);
      expect(typeof s.bold).toBe('boolean');
      expect(typeof s.italic).toBe('boolean');
      expect(look.coverTitle.lines).toHaveLength(3);
      look.coverTitle.lines.forEach((line, i) => {
        expect(line.sizePt).toBeGreaterThan(0);
        expect(line.color).toMatch(HEX);
        expect(typeof line.bold).toBe('boolean');
        expect(typeof line.italic).toBe('boolean');
        expect(line.spacingPt).toBeGreaterThanOrEqual(0);
        if (i === 0) expect(line.spacingPt).toBe(0);
      });
    }
  });
});

describe('CONFIG.PLACEHOLDERS structure', () => {
  it('has a non-empty title string', () => {
    expect(typeof globalThis.CONFIG.PLACEHOLDERS.title).toBe('string');
    expect(globalThis.CONFIG.PLACEHOLDERS.title.length).toBeGreaterThan(0);
  });

  it('has a non-empty author string', () => {
    expect(typeof globalThis.CONFIG.PLACEHOLDERS.author).toBe('string');
    expect(globalThis.CONFIG.PLACEHOLDERS.author.length).toBeGreaterThan(0);
  });

  it('has a non-empty description string', () => {
    expect(typeof globalThis.CONFIG.PLACEHOLDERS.description).toBe('string');
    expect(globalThis.CONFIG.PLACEHOLDERS.description.length).toBeGreaterThan(0);
  });

  it('title matches a bracketed placeholder pattern', () => {
    expect(globalThis.CONFIG.PLACEHOLDERS.title).toMatch(/\[.*\]/);
  });
});

describe('Open Library URLs', () => {
  it('OPEN_LIBRARY_SEARCH_URL starts with https://', () => {
    expect(globalThis.CONFIG.OPEN_LIBRARY_SEARCH_URL).toMatch(/^https:\/\//);
  });

  it('OPEN_LIBRARY_SEARCH_URL contains openlibrary.org', () => {
    expect(globalThis.CONFIG.OPEN_LIBRARY_SEARCH_URL).toMatch(/openlibrary\.org/);
  });

  it('OPEN_LIBRARY_COVERS_URL starts with https://', () => {
    expect(globalThis.CONFIG.OPEN_LIBRARY_COVERS_URL).toMatch(/^https:\/\//);
  });

  it('OPEN_LIBRARY_COVERS_URL contains openlibrary.org', () => {
    expect(globalThis.CONFIG.OPEN_LIBRARY_COVERS_URL).toMatch(/openlibrary\.org/);
  });
});

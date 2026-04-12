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
});

describe('CONFIG.FONTS structure', () => {
  it('has at least 20 entries', () => {
    expect(globalThis.CONFIG.FONTS.length).toBeGreaterThanOrEqual(20);
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

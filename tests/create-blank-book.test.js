import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load config and book-utils into globalThis
beforeAll(() => {
  const configCode = readFileSync(resolve('assets/js/config.js'), 'utf-8');
  (0, eval)(configCode);
  const utilsCode = readFileSync(resolve('assets/js/book-utils.js'), 'utf-8');
  (0, eval)(utilsCode);
});

describe('BookUtils.createBlankBook - structure', () => {
  it('returns an object with all expected fields', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book).toHaveProperty('key');
    expect(book).toHaveProperty('isBlank');
    expect(book).toHaveProperty('title');
    expect(book).toHaveProperty('author');
    expect(book).toHaveProperty('callNumber');
    expect(book).toHaveProperty('authorDisplay');
    expect(book).toHaveProperty('description');
    expect(book).toHaveProperty('cover_i');
    expect(book).toHaveProperty('customCoverData');
    expect(book).toHaveProperty('cover_ids');
    expect(book).toHaveProperty('currentCoverIndex');
    expect(book).toHaveProperty('includeInCollage');
  });

  it('has isBlank set to true', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.isBlank).toBe(true);
  });

  it('has includeInCollage set to false', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.includeInCollage).toBe(false);
  });

  it('has cover_ids as an empty array', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(Array.isArray(book.cover_ids)).toBe(true);
    expect(book.cover_ids).toHaveLength(0);
  });

  it('has currentCoverIndex set to 0', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.currentCoverIndex).toBe(0);
  });

  it('has cover_i set to null', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.cover_i).toBeNull();
  });

  it('uses CONFIG.PLACEHOLDERS for all text fields', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.title).toBe(globalThis.CONFIG.PLACEHOLDERS.title);
    expect(book.author).toBe(globalThis.CONFIG.PLACEHOLDERS.author);
    expect(book.callNumber).toBe(globalThis.CONFIG.PLACEHOLDERS.callNumber);
    expect(book.authorDisplay).toBe(globalThis.CONFIG.PLACEHOLDERS.authorWithCall);
    expect(book.description).toBe(globalThis.CONFIG.PLACEHOLDERS.description);
  });

  it('uses CONFIG.PLACEHOLDER_COVER_URL for customCoverData', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.customCoverData).toBe(globalThis.CONFIG.PLACEHOLDER_COVER_URL);
  });
});

describe('BookUtils.createBlankBook - key uniqueness', () => {
  it('returns different key values on successive calls', () => {
    const a = globalThis.BookUtils.createBlankBook();
    const b = globalThis.BookUtils.createBlankBook();
    expect(a.key).not.toBe(b.key);
  });

  it('produces a key starting with the "blank-" prefix', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(book.key.startsWith('blank-')).toBe(true);
  });

  it('produces a string key', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(typeof book.key).toBe('string');
  });
});

describe('BookUtils.createBlankBook - integration with other BookUtils', () => {
  it('hasValidCover returns false for a blank book (placeholder cover)', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('getStarredBooks excludes blank books', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(globalThis.BookUtils.getStarredBooks([book])).toEqual([]);
  });

  it('getStarredBooksWithCovers excludes blank books', () => {
    const book = globalThis.BookUtils.createBlankBook();
    expect(globalThis.BookUtils.getStarredBooksWithCovers([book])).toEqual([]);
  });
});

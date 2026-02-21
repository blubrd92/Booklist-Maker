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

// Helper: create a minimal book object
function makeBook(overrides = {}) {
  return {
    isBlank: false,
    includeInCollage: true,
    cover_ids: [],
    customCoverData: null,
    currentCoverIndex: 0,
    title: 'Test Book',
    ...overrides,
  };
}

describe('BookUtils.hasValidCover', () => {
  it('returns false for null/undefined', () => {
    expect(globalThis.BookUtils.hasValidCover(null)).toBe(false);
    expect(globalThis.BookUtils.hasValidCover(undefined)).toBe(false);
  });

  it('returns false for book with no covers', () => {
    const book = makeBook({ cover_ids: [], customCoverData: null });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns false for book with placeholder custom cover', () => {
    const book = makeBook({ customCoverData: 'https://placehold.co/110x132' });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns true for book with Open Library cover IDs', () => {
    const book = makeBook({ cover_ids: [12345] });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(true);
  });

  it('returns true for book with valid custom cover data', () => {
    const book = makeBook({ customCoverData: 'data:image/jpeg;base64,abc123' });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(true);
  });

  it('returns true when both Open Library and custom covers exist', () => {
    const book = makeBook({
      cover_ids: [111],
      customCoverData: 'data:image/png;base64,xyz',
    });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(true);
  });
});

describe('BookUtils.getStarredBooks', () => {
  it('returns empty array for empty booklist', () => {
    expect(globalThis.BookUtils.getStarredBooks([])).toEqual([]);
  });

  it('filters out blank books', () => {
    const books = [
      makeBook({ isBlank: true, includeInCollage: true }),
      makeBook({ isBlank: false, includeInCollage: true, title: 'Real' }),
    ];
    const result = globalThis.BookUtils.getStarredBooks(books);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Real');
  });

  it('filters out unstarred books', () => {
    const books = [
      makeBook({ includeInCollage: false, title: 'Unstarred' }),
      makeBook({ includeInCollage: true, title: 'Starred' }),
    ];
    const result = globalThis.BookUtils.getStarredBooks(books);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Starred');
  });
});

describe('BookUtils.getStarredBooksWithCovers', () => {
  it('only returns starred books that have valid covers', () => {
    const books = [
      makeBook({ includeInCollage: true, cover_ids: [1], title: 'Has cover' }),
      makeBook({ includeInCollage: true, cover_ids: [], title: 'No cover' }),
      makeBook({ includeInCollage: false, cover_ids: [2], title: 'Not starred' }),
    ];
    const result = globalThis.BookUtils.getStarredBooksWithCovers(books);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Has cover');
  });
});

describe('BookUtils.isAtCoverLimit', () => {
  it('returns false when under the limit', () => {
    const books = [makeBook(), makeBook()]; // 2 starred
    const extras = [{ coverData: 'data:...' }]; // 1 extra
    expect(globalThis.BookUtils.isAtCoverLimit(books, extras, 20)).toBe(false);
  });

  it('returns true when at the limit', () => {
    const books = Array(18).fill(null).map(() => makeBook());
    const extras = [{ coverData: 'a' }, { coverData: 'b' }];
    expect(globalThis.BookUtils.isAtCoverLimit(books, extras, 20)).toBe(true);
  });

  it('returns true when over the limit', () => {
    const books = Array(20).fill(null).map(() => makeBook());
    const extras = [{ coverData: 'a' }];
    expect(globalThis.BookUtils.isAtCoverLimit(books, extras, 20)).toBe(true);
  });
});

describe('BookUtils.countTotalCovers', () => {
  it('counts only starred books with valid covers', () => {
    const books = [
      makeBook({ cover_ids: [1] }),       // valid
      makeBook({ cover_ids: [] }),         // no cover
      makeBook({ isBlank: true }),         // blank
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, [], false)).toBe(1);
  });

  it('includes extra covers in extended mode', () => {
    const books = [makeBook({ cover_ids: [1] })];
    const extras = [
      { coverData: 'data:image/jpeg;base64,abc' },
      { coverData: 'data:image/jpeg;base64,def' },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, true)).toBe(3);
  });

  it('ignores extra covers when not in extended mode', () => {
    const books = [makeBook({ cover_ids: [1] })];
    const extras = [{ coverData: 'data:image/jpeg;base64,abc' }];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, false)).toBe(1);
  });

  it('ignores placeholder extra covers', () => {
    const books = [makeBook({ cover_ids: [1] })];
    const extras = [{ coverData: 'https://placehold.co/300x450' }];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, true)).toBe(1);
  });
});

describe('BookUtils.getRequiredCovers', () => {
  it('returns MAX_COVERS_FOR_COLLAGE in extended mode', () => {
    expect(globalThis.BookUtils.getRequiredCovers(true)).toBe(20);
  });

  it('returns MIN_COVERS_FOR_COLLAGE in standard mode', () => {
    expect(globalThis.BookUtils.getRequiredCovers(false)).toBe(12);
  });
});

describe('BookUtils.getCoverUrl', () => {
  it('returns placeholder for falsy coverId', () => {
    expect(globalThis.BookUtils.getCoverUrl(null)).toBe(CONFIG.PLACEHOLDER_NO_COVER_URL);
    expect(globalThis.BookUtils.getCoverUrl('')).toBe(CONFIG.PLACEHOLDER_NO_COVER_URL);
  });

  it('returns placeholder for "placehold" coverId', () => {
    expect(globalThis.BookUtils.getCoverUrl('placehold')).toBe(CONFIG.PLACEHOLDER_NO_COVER_URL);
  });

  it('builds medium URL by default', () => {
    expect(globalThis.BookUtils.getCoverUrl(12345)).toBe(
      'https://covers.openlibrary.org/b/id/12345-M.jpg'
    );
  });

  it('builds URL with specified size', () => {
    expect(globalThis.BookUtils.getCoverUrl(12345, 'L')).toBe(
      'https://covers.openlibrary.org/b/id/12345-L.jpg'
    );
    expect(globalThis.BookUtils.getCoverUrl(12345, 'S')).toBe(
      'https://covers.openlibrary.org/b/id/12345-S.jpg'
    );
  });
});

describe('BookUtils.getBookCoverUrl', () => {
  it('prefers custom cover data over Open Library', () => {
    const book = makeBook({
      cover_ids: [999],
      customCoverData: 'data:image/png;base64,custom',
    });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe('data:image/png;base64,custom');
  });

  it('falls back to Open Library cover', () => {
    const book = makeBook({ cover_ids: [42], currentCoverIndex: 0 });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });

  it('returns placeholder when no cover available', () => {
    const book = makeBook({ cover_ids: [], customCoverData: null });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(CONFIG.PLACEHOLDER_COLLAGE_COVER_URL);
  });

  it('ignores placeholder custom cover data', () => {
    const book = makeBook({
      cover_ids: [42],
      customCoverData: 'https://placehold.co/110x132',
    });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });
});

describe('BookUtils.hasEnoughCoversForCollage', () => {
  it('returns true when standard mode has 12+ covers', () => {
    const books = Array(12).fill(null).map(() => makeBook({ cover_ids: [1] }));
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, [], false)).toBe(true);
  });

  it('returns false when standard mode has <12 covers', () => {
    const books = Array(11).fill(null).map(() => makeBook({ cover_ids: [1] }));
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, [], false)).toBe(false);
  });

  it('returns true when extended mode has 20+ covers', () => {
    const books = Array(18).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [
      { coverData: 'data:image/jpeg;base64,a' },
      { coverData: 'data:image/jpeg;base64,b' },
    ];
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, true)).toBe(true);
  });

  it('returns false when extended mode has <20 covers', () => {
    const books = Array(15).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [{ coverData: 'data:image/jpeg;base64,a' }];
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, true)).toBe(false);
  });
});

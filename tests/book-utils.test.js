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
  it('returns MAX_COVERS_FOR_COLLAGE in extended mode (legacy boolean true)', () => {
    expect(globalThis.BookUtils.getRequiredCovers(true)).toBe(20);
  });

  it('returns MIN_COVERS_FOR_COLLAGE in standard mode (legacy boolean false)', () => {
    expect(globalThis.BookUtils.getRequiredCovers(false)).toBe(12);
  });

  it('returns 12 when passed numeric 12', () => {
    expect(globalThis.BookUtils.getRequiredCovers(12)).toBe(12);
  });

  it('returns 16 when passed numeric 16', () => {
    expect(globalThis.BookUtils.getRequiredCovers(16)).toBe(16);
  });

  it('returns 20 when passed numeric 20', () => {
    expect(globalThis.BookUtils.getRequiredCovers(20)).toBe(20);
  });

  it('falls back to MIN_COVERS_FOR_COLLAGE for unknown numeric values', () => {
    expect(globalThis.BookUtils.getRequiredCovers(0)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers(15)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers(99)).toBe(12);
  });

  it('falls back to MIN_COVERS_FOR_COLLAGE for null / undefined / non-numeric', () => {
    expect(globalThis.BookUtils.getRequiredCovers(null)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers(undefined)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers('20')).toBe(12);
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

  it('returns true when 16-count mode has 16+ covers', () => {
    const books = Array(15).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [{ coverData: 'data:image/jpeg;base64,a' }];
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, 16)).toBe(true);
  });

  it('returns false when 16-count mode has <16 covers', () => {
    const books = Array(13).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [{ coverData: 'data:image/jpeg;base64,a' }];
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, 16)).toBe(false);
  });

  it('returns true when 12-count mode has exactly 12 starred books with covers (extras ignored)', () => {
    const books = Array(12).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [{ coverData: 'data:image/jpeg;base64,a' }];
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, 12)).toBe(true);
  });
});

describe('BookUtils.countTotalCovers (numeric mode)', () => {
  it('counts books only when passed numeric 12', () => {
    const books = Array(12).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [
      { coverData: 'data:image/jpeg;base64,a' },
      { coverData: 'data:image/jpeg;base64,b' },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, 12)).toBe(12);
  });

  it('counts books + extras when passed numeric 16', () => {
    const books = Array(13).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [
      { coverData: 'data:image/jpeg;base64,a' },
      { coverData: 'data:image/jpeg;base64,b' },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, 16)).toBe(15);
  });

  it('counts books + extras when passed numeric 20', () => {
    const books = Array(15).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = [
      { coverData: 'data:image/jpeg;base64,a' },
      { coverData: 'data:image/jpeg;base64,b' },
      { coverData: 'data:image/jpeg;base64,c' },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, 20)).toBe(18);
  });
});

// =============================================================================
// EDGE CASE TESTS (added per audit)
// =============================================================================

describe('BookUtils.hasValidCover edge cases', () => {
  it('returns false for empty cover_ids array AND empty-string customCoverData', () => {
    const book = makeBook({ cover_ids: [], customCoverData: '' });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns false when cover_ids is null (nullish array)', () => {
    const book = makeBook({ cover_ids: null, customCoverData: null });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns false for custom cover URL containing PLACEHOLD.CO in uppercase', () => {
    // Placeholder detection is now case-insensitive.
    const book = makeBook({ customCoverData: 'https://PLACEHOLD.CO/110x132' });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns false for whitespace-only customCoverData', () => {
    // Whitespace-only strings are treated the same as empty.
    const book = makeBook({ customCoverData: '   ' });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns false for cover_ids: [0] (no truthy IDs)', () => {
    // hasValidCover now requires at least one truthy cover ID.
    const book = makeBook({ cover_ids: [0] });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(false);
  });

  it('returns true for cover_ids containing at least one truthy ID alongside 0', () => {
    const book = makeBook({ cover_ids: [0, 12345] });
    expect(globalThis.BookUtils.hasValidCover(book)).toBe(true);
  });
});

describe('BookUtils.getStarredBooks edge cases', () => {
  it('returns empty array for empty booklist', () => {
    expect(globalThis.BookUtils.getStarredBooks([])).toEqual([]);
  });

  it('treats missing isBlank (undefined) as not blank', () => {
    const book = { includeInCollage: true, title: 'No isBlank prop' };
    expect(globalThis.BookUtils.getStarredBooks([book])).toHaveLength(1);
  });

  it('treats missing includeInCollage (undefined) as unstarred', () => {
    const book = { isBlank: false, title: 'No starred prop' };
    expect(globalThis.BookUtils.getStarredBooks([book])).toHaveLength(0);
  });

  it('handles mixed truthy/falsy includeInCollage values', () => {
    const books = [
      { isBlank: false, includeInCollage: 1, title: 'truthy 1' },
      { isBlank: false, includeInCollage: 0, title: 'falsy 0' },
      { isBlank: false, includeInCollage: 'yes', title: 'truthy str' },
      { isBlank: false, includeInCollage: '', title: 'falsy str' },
      { isBlank: false, includeInCollage: null, title: 'null' },
      { isBlank: false, includeInCollage: true, title: 'true' },
    ];
    const result = globalThis.BookUtils.getStarredBooks(books);
    expect(result).toHaveLength(3);
    expect(result.map((b) => b.title)).toEqual(['truthy 1', 'truthy str', 'true']);
  });
});

describe('BookUtils.getStarredBooksWithCovers edge cases', () => {
  it('excludes starred books with neither cover_ids nor customCoverData', () => {
    const books = [
      makeBook({ includeInCollage: true, cover_ids: [], customCoverData: null, title: 'bare' }),
    ];
    expect(globalThis.BookUtils.getStarredBooksWithCovers(books)).toEqual([]);
  });

  it('handles mix of starred-with-covers, starred-without, and unstarred-with', () => {
    const books = [
      makeBook({ includeInCollage: true, cover_ids: [1], title: 'A' }),
      makeBook({ includeInCollage: true, cover_ids: [], title: 'B' }),
      makeBook({ includeInCollage: false, cover_ids: [2], title: 'C' }),
      makeBook({ includeInCollage: true, customCoverData: 'data:image/png;base64,xx', title: 'D' }),
      makeBook({ includeInCollage: true, isBlank: true, cover_ids: [3], title: 'E' }),
    ];
    const result = globalThis.BookUtils.getStarredBooksWithCovers(books);
    expect(result.map((b) => b.title)).toEqual(['A', 'D']);
  });
});

describe('BookUtils.isAtCoverLimit edge cases', () => {
  it('returns true exactly at the limit (boundary equality)', () => {
    const books = Array(10).fill(null).map(() => makeBook());
    const extras = [{ coverData: 'a' }, { coverData: 'b' }];
    expect(globalThis.BookUtils.isAtCoverLimit(books, extras, 12)).toBe(true);
  });

  it('returns false one below the limit', () => {
    const books = Array(10).fill(null).map(() => makeBook());
    const extras = [{ coverData: 'a' }];
    expect(globalThis.BookUtils.isAtCoverLimit(books, extras, 12)).toBe(false);
  });

  it('returns true one above the limit', () => {
    const books = Array(11).fill(null).map(() => makeBook());
    const extras = [{ coverData: 'a' }, { coverData: 'b' }];
    expect(globalThis.BookUtils.isAtCoverLimit(books, extras, 12)).toBe(true);
  });

  it('returns false when both arrays empty and max > 0', () => {
    expect(globalThis.BookUtils.isAtCoverLimit([], [], 12)).toBe(false);
  });
});

describe('BookUtils.countTotalCovers edge cases', () => {
  it('does not count starred books that lack a valid cover', () => {
    const books = [
      makeBook({ cover_ids: [1] }),
      makeBook({ cover_ids: [] }),
      makeBook({ cover_ids: [], customCoverData: null }),
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, [], false)).toBe(1);
  });

  it('ignores extras in non-extended mode even when they have valid coverData', () => {
    const books = [makeBook({ cover_ids: [1] })];
    const extras = [
      { coverData: 'data:image/jpeg;base64,abc' },
      { coverData: 'data:image/jpeg;base64,def' },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, false)).toBe(1);
  });

  it('does not count extras whose coverData contains placehold.co (extended mode)', () => {
    const books = [];
    const extras = [
      { coverData: 'https://placehold.co/300x450' },
      { coverData: 'https://placehold.co/110x132/EAEAEA/333333?text=Upload%20Cover' },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, true)).toBe(0);
  });

  it('does not count extras with empty or null coverData (extended mode)', () => {
    const books = [];
    const extras = [
      { coverData: '' },
      { coverData: null },
      { coverData: undefined },
    ];
    expect(globalThis.BookUtils.countTotalCovers(books, extras, true)).toBe(0);
  });
});

describe('BookUtils.getRequiredCovers edge cases', () => {
  // The function now strictly accepts either a boolean (legacy) or a
  // numeric value from CONFIG.COLLAGE_COVER_COUNTS. Anything else falls
  // back to MIN_COVERS_FOR_COLLAGE so a buggy caller can't accidentally
  // request a 20-cover collage by passing junk.
  it('returns MIN for non-boolean truthy values that are not allowed counts', () => {
    expect(globalThis.BookUtils.getRequiredCovers(1)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers('yes')).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers({})).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers([])).toBe(12);
  });

  it('returns MIN for falsy non-boolean values', () => {
    expect(globalThis.BookUtils.getRequiredCovers(0)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers('')).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers(null)).toBe(12);
    expect(globalThis.BookUtils.getRequiredCovers(undefined)).toBe(12);
  });
});

describe('BookUtils.getCoverUrl edge cases', () => {
  it('returns placeholder for coverId === 0 (falsy number, by design)', () => {
    // 0 is falsy so the !coverId branch returns the placeholder.
    // Open Library cover IDs are positive, so this is unlikely in practice.
    expect(globalThis.BookUtils.getCoverUrl(0)).toBe(CONFIG.PLACEHOLDER_NO_COVER_URL);
  });

  it('builds URL when coverId is a numeric string', () => {
    expect(globalThis.BookUtils.getCoverUrl('12345')).toBe(
      'https://covers.openlibrary.org/b/id/12345-M.jpg'
    );
  });

  it('returns placeholder for null coverId', () => {
    expect(globalThis.BookUtils.getCoverUrl(null)).toBe(CONFIG.PLACEHOLDER_NO_COVER_URL);
  });

  it('returns placeholder for undefined coverId', () => {
    expect(globalThis.BookUtils.getCoverUrl(undefined)).toBe(CONFIG.PLACEHOLDER_NO_COVER_URL);
  });

  it('falls back to M for invalid size parameters', () => {
    // Only 'S', 'M', 'L' are valid Open Library cover sizes; anything else
    // defaults to 'M'.
    expect(globalThis.BookUtils.getCoverUrl(12345, 'X')).toBe(
      'https://covers.openlibrary.org/b/id/12345-M.jpg'
    );
    expect(globalThis.BookUtils.getCoverUrl(12345, 's')).toBe(
      'https://covers.openlibrary.org/b/id/12345-M.jpg'
    );
    expect(globalThis.BookUtils.getCoverUrl(12345, null)).toBe(
      'https://covers.openlibrary.org/b/id/12345-M.jpg'
    );
    expect(globalThis.BookUtils.getCoverUrl(12345, 123)).toBe(
      'https://covers.openlibrary.org/b/id/12345-M.jpg'
    );
  });
});

describe('BookUtils.getBookCoverUrl edge cases', () => {
  it('clamps currentCoverIndex beyond cover_ids length to 0', () => {
    // Out-of-range index now falls back to the first cover.
    const book = makeBook({ cover_ids: [42], currentCoverIndex: 5 });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });

  it('clamps negative currentCoverIndex to 0', () => {
    // Negative index now falls back to the first cover.
    const book = makeBook({ cover_ids: [42], currentCoverIndex: -1 });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });

  it('uses index 0 when currentCoverIndex is undefined', () => {
    const book = makeBook({ cover_ids: [42], currentCoverIndex: undefined });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });

  it('falls back to Open Library when custom cover is an uppercase PLACEHOLD.CO URL', () => {
    // Placeholder detection is case-insensitive, so uppercase placeholder URLs
    // are correctly ignored and the Open Library fallback is used.
    const book = makeBook({
      cover_ids: [42],
      customCoverData: 'https://PLACEHOLD.CO/110x132',
    });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });

  it('falls back to Open Library when custom cover is whitespace only', () => {
    const book = makeBook({
      cover_ids: [42],
      customCoverData: '   ',
    });
    expect(globalThis.BookUtils.getBookCoverUrl(book)).toBe(
      'https://covers.openlibrary.org/b/id/42-M.jpg'
    );
  });
});

describe('BookUtils.hasEnoughCoversForCollage edge cases', () => {
  it('standard mode: exactly 12 starred books with covers is enough', () => {
    const books = Array(12).fill(null).map(() => makeBook({ cover_ids: [1] }));
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, [], false)).toBe(true);
  });

  it('standard mode: 11 starred-with-covers + 1 unstarred-with-cover is not enough', () => {
    const books = [
      ...Array(11).fill(null).map(() => makeBook({ cover_ids: [1] })),
      makeBook({ includeInCollage: false, cover_ids: [2] }),
    ];
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, [], false)).toBe(false);
  });

  it('extended mode: exactly 20 covers via 12 starred + 8 extras is enough', () => {
    const books = Array(12).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = Array(8).fill(null).map((_, i) => ({
      coverData: 'data:image/jpeg;base64,extra' + i,
    }));
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, true)).toBe(true);
  });

  it('extended mode: 12 starred + 7 extras (total 19) is not enough', () => {
    const books = Array(12).fill(null).map(() => makeBook({ cover_ids: [1] }));
    const extras = Array(7).fill(null).map((_, i) => ({
      coverData: 'data:image/jpeg;base64,extra' + i,
    }));
    expect(globalThis.BookUtils.hasEnoughCoversForCollage(books, extras, true)).toBe(false);
  });

  it('zero books and zero extras is not enough in standard mode', () => {
    expect(globalThis.BookUtils.hasEnoughCoversForCollage([], [], false)).toBe(false);
  });

  it('zero books and zero extras is not enough in extended mode', () => {
    expect(globalThis.BookUtils.hasEnoughCoversForCollage([], [], true)).toBe(false);
  });
});

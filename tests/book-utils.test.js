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

describe('BookUtils.flipAuthorName', () => {
  it('returns empty string for empty/null input', () => {
    expect(globalThis.BookUtils.flipAuthorName('')).toBe('');
    expect(globalThis.BookUtils.flipAuthorName(null)).toBe('');
    expect(globalThis.BookUtils.flipAuthorName(undefined)).toBe('');
  });

  it('returns the trimmed name unchanged when there is no comma', () => {
    expect(globalThis.BookUtils.flipAuthorName('Terry Pratchett')).toBe('Terry Pratchett');
    expect(globalThis.BookUtils.flipAuthorName('  Madonna  ')).toBe('Madonna');
  });

  it('flips "Last, First" to "First Last" on single comma', () => {
    expect(globalThis.BookUtils.flipAuthorName('Pratchett, Terry')).toBe('Terry Pratchett');
  });

  it('flips multi-word first names / initials', () => {
    expect(globalThis.BookUtils.flipAuthorName('Tolkien, J.R.R.')).toBe('J.R.R. Tolkien');
    expect(globalThis.BookUtils.flipAuthorName('Smith, Mary Jane')).toBe('Mary Jane Smith');
  });

  it('leaves multi-comma names alone (multi-author / suffix ambiguity)', () => {
    expect(globalThis.BookUtils.flipAuthorName('Smith, John, and Doe, Jane')).toBe('Smith, John, and Doe, Jane');
    expect(globalThis.BookUtils.flipAuthorName('Smith, John, Jr.')).toBe('Smith, John, Jr.');
  });

  it('returns trimmed input when one half of the comma is empty', () => {
    expect(globalThis.BookUtils.flipAuthorName(', Terry')).toBe(', Terry');
    expect(globalThis.BookUtils.flipAuthorName('Pratchett,')).toBe('Pratchett,');
  });

  it('trims whitespace inside and around the result', () => {
    expect(globalThis.BookUtils.flipAuthorName('  Pratchett ,  Terry  ')).toBe('Terry Pratchett');
  });
});

describe('BookUtils.toTitleCase', () => {
  it('returns empty string for empty/null input', () => {
    expect(globalThis.BookUtils.toTitleCase('')).toBe('');
    expect(globalThis.BookUtils.toTitleCase(null)).toBe('');
    expect(globalThis.BookUtils.toTitleCase(undefined)).toBe('');
  });

  it('capitalizes the first letter of each major word', () => {
    expect(globalThis.BookUtils.toTitleCase('the great gatsby')).toBe('The Great Gatsby');
    expect(globalThis.BookUtils.toTitleCase('a brief history of time')).toBe('A Brief History of Time');
  });

  it('lowercases minor words when not first or last', () => {
    expect(globalThis.BookUtils.toTitleCase('the lord of the rings')).toBe('The Lord of the Rings');
    expect(globalThis.BookUtils.toTitleCase('to kill a mockingbird')).toBe('To Kill a Mockingbird');
  });

  it('always capitalizes the first and last words even if they are minor', () => {
    expect(globalThis.BookUtils.toTitleCase('a tale of two cities')).toBe('A Tale of Two Cities');
    expect(globalThis.BookUtils.toTitleCase('the cat in the hat')).toBe('The Cat in the Hat');
    // Last word is "the" — must still capitalize.
    expect(globalThis.BookUtils.toTitleCase('what comes after the')).toBe('What Comes After The');
  });

  it('preserves all-uppercase acronyms of length 2+', () => {
    expect(globalThis.BookUtils.toTitleCase('the USA today')).toBe('The USA Today');
    expect(globalThis.BookUtils.toTitleCase('NASA history')).toBe('NASA History');
    // Mixed-case stays normalized.
    expect(globalThis.BookUtils.toTitleCase('the NaSa story')).toBe('The Nasa Story');
  });

  it('lowercases the rest of each word so MEAT does not stay shouting', () => {
    expect(globalThis.BookUtils.toTitleCase('the GREAT gatsby')).toBe('The GREAT Gatsby');
    // GREAT is a length 5+ all-caps token; treated as an acronym and preserved.
  });

  it('handles apostrophes correctly', () => {
    expect(globalThis.BookUtils.toTitleCase("don't stop believing")).toBe("Don't Stop Believing");
  });

  it('preserves whitespace shape', () => {
    // Single internal spaces stay single; we don't collapse them.
    expect(globalThis.BookUtils.toTitleCase('hello  world')).toBe('Hello  World');
  });

  it('handles a single-word title', () => {
    expect(globalThis.BookUtils.toTitleCase('mort')).toBe('Mort');
  });

  it('capitalizes the first word of a subtitle after a colon', () => {
    expect(globalThis.BookUtils.toTitleCase('the great gatsby: a novel'))
      .toBe('The Great Gatsby: A Novel');
    // Minor word "of" right after the colon must still capitalize.
    expect(globalThis.BookUtils.toTitleCase('foo: of mice and men'))
      .toBe('Foo: Of Mice and Men');
  });

  it('also treats ? and ! as subtitle breaks', () => {
    expect(globalThis.BookUtils.toTitleCase('what now? a manifesto'))
      .toBe('What Now? A Manifesto');
    expect(globalThis.BookUtils.toTitleCase('stop! a guide'))
      .toBe('Stop! A Guide');
  });

  it('handles multiple colons, capitalizing each subtitle start', () => {
    expect(globalThis.BookUtils.toTitleCase('book: a tale: of two cities'))
      .toBe('Book: A Tale: Of Two Cities');
  });

  it('capitalizes the word after a hyphen', () => {
    expect(globalThis.BookUtils.toTitleCase('spider-man')).toBe('Spider-Man');
    expect(globalThis.BookUtils.toTitleCase('the well-being guide'))
      .toBe('The Well-Being Guide');
    expect(globalThis.BookUtils.toTitleCase('x-ray vision')).toBe('X-Ray Vision');
  });
});

describe('BookUtils.parseQuickAddTsv', () => {
  const parse = (text, opts) => globalThis.BookUtils.parseQuickAddTsv(text, opts);

  it('returns null for null / undefined / non-string input', () => {
    expect(parse(null)).toBeNull();
    expect(parse(undefined)).toBeNull();
    expect(parse(42)).toBeNull();
    expect(parse(['a', 'b'])).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(parse('')).toBeNull();
    expect(parse('   \n\n  ')).toBeNull();
    // A line containing only tabs trims to empty and counts as no content,
    // even though the tabs technically delimit four cells.
    expect(parse('\t\t\t')).toBeNull();
  });

  it('parses a single row with all three columns', () => {
    const result = parse('Mort\tPratchett, Terry\tPR6066');
    expect(result.rows).toEqual([
      { title: 'Mort', author: 'Pratchett, Terry', callNumber: 'PR6066', coverUrl: '' },
    ]);
    expect(result.headerSkipped).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('parses multiple rows', () => {
    const result = parse('Mort\tPratchett\tPR1\nGuards\tPratchett\tPR2');
    expect(result.rows.length).toBe(2);
    expect(result.rows[1].title).toBe('Guards');
  });

  it('detects header via first cell "Title"', () => {
    const result = parse('Title\tAuthor\tCall #\nMort\tPratchett\tPR1');
    expect(result.headerSkipped).toBe(true);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe('Mort');
  });

  it('detects header via second cell "Author" (e.g. "Book Title", "Author")', () => {
    const result = parse('Book Title\tAuthor\tCall Number\nMort\tPratchett\tPR1');
    expect(result.headerSkipped).toBe(true);
    expect(result.rows[0].title).toBe('Mort');
  });

  it('detects header via third cell "Call Number"', () => {
    const result = parse('Foo\tBar\tCall Number\nMort\tPratchett\tPR1');
    expect(result.headerSkipped).toBe(true);
    expect(result.rows[0].title).toBe('Mort');
  });

  it('header detection is case-insensitive', () => {
    expect(parse('TITLE\tAuthor\tCN\nM\tP\tC').headerSkipped).toBe(true);
    expect(parse('title\tauthor\tcall#\nM\tP\tC').headerSkipped).toBe(true);
    expect(parse('Title\tAUTHOR\tCN\nM\tP\tC').headerSkipped).toBe(true);
  });

  it('header detection trims surrounding whitespace inside cells', () => {
    const result = parse('  Title  \t  Author  \t  Call #  \nMort\tPratchett\tPR1');
    expect(result.headerSkipped).toBe(true);
    expect(result.rows[0].title).toBe('Mort');
  });

  it('documented false positive: a real row whose author is literally "Author" is treated as header', () => {
    // This pins current behavior so a future change to the rule is loud.
    const result = parse('Some Book\tAuthor\tFIC\nReal Row\tSmith\tFIC SMI');
    expect(result.headerSkipped).toBe(true);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe('Real Row');
  });

  it('handles missing call number column (2 cells per row)', () => {
    const result = parse('Mort\tPratchett');
    expect(result.rows[0].callNumber).toBe('');
  });

  it('handles single-cell rows', () => {
    const result = parse('Just a title');
    expect(result.rows[0]).toEqual({ title: 'Just a title', author: '', callNumber: '', coverUrl: '' });
  });

  it('trims leading/trailing whitespace from each cell', () => {
    const result = parse('  Mort  \t  Pratchett  \t  PR1  ');
    expect(result.rows[0]).toEqual({ title: 'Mort', author: 'Pratchett', callNumber: 'PR1', coverUrl: '' });
  });

  it('handles \\r\\n line endings (Windows / Excel paste)', () => {
    const result = parse('Mort\tPratchett\tPR1\r\nGuards\tPratchett\tPR2');
    expect(result.rows.length).toBe(2);
    expect(result.rows[1].title).toBe('Guards');
  });

  it('handles mixed \\n and \\r\\n line endings', () => {
    const result = parse('A\tB\tC\nD\tE\tF\r\nG\tH\tI');
    expect(result.rows.length).toBe(3);
  });

  it('ignores trailing blank lines', () => {
    const result = parse('Mort\tP\tPR1\n\n\n');
    expect(result.rows.length).toBe(1);
  });

  it('ignores leading blank lines (and does not treat them as header source)', () => {
    const result = parse('\n\nMort\tPratchett\tPR1');
    expect(result.headerSkipped).toBe(false);
    expect(result.rows[0].title).toBe('Mort');
  });

  it('ignores cells beyond the first 4 (cell[3] is the optional coverUrl)', () => {
    // "extra" in cell[3] is not an http(s) URL, so coverUrl drops to ''.
    // Cell[4] ("more") is dropped entirely.
    const result = parse('Mort\tPratchett\tPR1\textra\tmore');
    expect(result.rows[0]).toEqual({ title: 'Mort', author: 'Pratchett', callNumber: 'PR1', coverUrl: '' });
  });

  it('normalizes non-breaking space (U+00A0) to regular space', () => {
    // NBSP inside a cell — Numbers (Apple) and some web sources insert these
    const result = parse('Mort the Boy\tPratchett\tPR1');
    expect(result.rows[0].title).toBe('Mort the Boy');
  });

  it('respects maxRows option, marks truncated', () => {
    const result = parse('A\tA\tA\nB\tB\tB\nC\tC\tC\nD\tD\tD', { maxRows: 2 });
    expect(result.rows.length).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.truncatedAt).toBe(2);
  });

  it('does not mark truncated when maxRows is not exceeded', () => {
    const result = parse('A\tA\tA\nB\tB\tB', { maxRows: 10 });
    expect(result.truncated).toBe(false);
  });

  it('treats maxRows: 0 (or any falsy) as no cap', () => {
    const result = parse('A\tA\tA\nB\tB\tB', { maxRows: 0 });
    expect(result.rows.length).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('row with empty title cell is preserved as-is (caller decides to drop)', () => {
    const result = parse('\tJoe Smith\tFIC SMI');
    expect(result.rows[0]).toEqual({ title: '', author: 'Joe Smith', callNumber: 'FIC SMI', coverUrl: '' });
  });

  it('quoted-cell quirk: "Hello\\tWorld"\\tAuthor splits naively (documented limitation)', () => {
    // Spreadsheet TSV doesn't unwrap quotes the way CSV does. This pins
    // current behavior so a future quote-handling change is loud.
    const result = parse('"Hello\tWorld"\tAuthor');
    expect(result.rows[0].title).toBe('"Hello');
    expect(result.rows[0].author).toBe('World"');
    expect(result.rows[0].callNumber).toBe('Author');
  });

  // ---- Optional 4th column: coverUrl (Booklister Helper extension) ----

  it('captures an http URL in the 4th column as coverUrl', () => {
    const result = parse('Mort\tPratchett\tPR1\thttp://example.org/c.jpg');
    expect(result.rows[0].coverUrl).toBe('http://example.org/c.jpg');
  });

  it('captures an https URL in the 4th column as coverUrl', () => {
    const url = 'https://www.syndetics.com/index.aspx?isbn=9780679643524&issn=/LC.JPG&client=mnetp&type=xw12';
    const result = parse(`Darkness\tStyron\tBio Styron\t${url}`);
    expect(result.rows[0].coverUrl).toBe(url);
  });

  it('captures a data:image/* URL in the 4th column as coverUrl', () => {
    // The Booklister Helper extension emits these by default — base64
    // image bytes embedded in the TSV so saved booklists stay self-
    // contained without depending on the cover provider's URLs.
    expect(parse('A\tB\tC\tdata:image/png;base64,iVBOR').rows[0].coverUrl).toBe('data:image/png;base64,iVBOR');
    expect(parse('A\tB\tC\tdata:image/jpeg;base64,/9j/').rows[0].coverUrl).toBe('data:image/jpeg;base64,/9j/');
    expect(parse('A\tB\tC\tdata:image/svg+xml;utf8,<svg/>').rows[0].coverUrl).toBe('data:image/svg+xml;utf8,<svg/>');
  });

  it('drops a 4th-column value that is not http(s) or data:image/*', () => {
    expect(parse('A\tB\tC\tdata:text/html;base64,PHNjcmlwdD4=').rows[0].coverUrl).toBe('');
    expect(parse('A\tB\tC\tdata:application/pdf;base64,JVBE').rows[0].coverUrl).toBe('');
    expect(parse('A\tB\tC\tjavascript:alert(1)').rows[0].coverUrl).toBe('');
    expect(parse('A\tB\tC\tfile:///etc/passwd').rows[0].coverUrl).toBe('');
    expect(parse('A\tB\tC\tnotaurl').rows[0].coverUrl).toBe('');
    expect(parse('A\tB\tC\t').rows[0].coverUrl).toBe('');
  });

  it('coverUrl URL scheme check is case-insensitive', () => {
    expect(parse('A\tB\tC\tHTTP://Example.org/x.jpg').rows[0].coverUrl).toBe('HTTP://Example.org/x.jpg');
    expect(parse('A\tB\tC\tHTTPS://Example.org/x.jpg').rows[0].coverUrl).toBe('HTTPS://Example.org/x.jpg');
  });

  it('trims surrounding whitespace from the coverUrl cell', () => {
    const result = parse('A\tB\tC\t   https://example.org/x.jpg   ');
    expect(result.rows[0].coverUrl).toBe('https://example.org/x.jpg');
  });

  it('detects header via 4th cell "Cover URL"', () => {
    const result = parse('Foo\tBar\tBaz\tCover URL\nMort\tPratchett\tPR1\thttps://e.org/c.jpg');
    expect(result.headerSkipped).toBe(true);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe('Mort');
    expect(result.rows[0].coverUrl).toBe('https://e.org/c.jpg');
  });

  it('detects header via 4th cell "image" and case variants', () => {
    expect(parse('A\tB\tC\tImage\nM\tP\tC\thttps://e.org/x').headerSkipped).toBe(true);
    expect(parse('A\tB\tC\tIMAGE URL\nM\tP\tC\thttps://e.org/x').headerSkipped).toBe(true);
    expect(parse('A\tB\tC\tcover\nM\tP\tC\thttps://e.org/x').headerSkipped).toBe(true);
  });

  it('rows from a plain 3-column paste still have coverUrl: "" (backward-compat)', () => {
    const result = parse('Mort\tPratchett\tPR1\nGuards\tPratchett\tPR2');
    expect(result.rows.every((r) => r.coverUrl === '')).toBe(true);
  });
});

describe('BookUtils.removeQuickAddRows', () => {
  const remove = (text, indices, headerSkipped) =>
    BookUtils.removeQuickAddRows(text, indices, headerSkipped);

  it('removes the given parsed-row indices and keeps the rest', () => {
    const text = 'Mort\tPratchett\nGuards\tPratchett\nJingo\tPratchett';
    expect(remove(text, [0, 2], false)).toBe('Guards\tPratchett');
  });

  it('accepts a Set as well as an array of indices', () => {
    const text = 'A\tB\nC\tD';
    expect(remove(text, new Set([1]), false)).toBe('A\tB');
  });

  it('preserves the header line and treats indices as data-relative when headerSkipped', () => {
    const text = 'Title\tAuthor\nMort\tPratchett\nGuards\tPratchett';
    // Index 0 = "Mort" (the first DATA row), not the header.
    expect(remove(text, [0], true)).toBe('Title\tAuthor\nGuards\tPratchett');
  });

  it('removing no rows keeps every line; removing all data rows leaves only the header', () => {
    const text = 'Title\tAuthor\nMort\tPratchett';
    expect(remove(text, [], true)).toBe(text);
    expect(remove(text, [0], true)).toBe('Title\tAuthor');
    expect(remove('Mort\tPratchett', [0], false)).toBe('');
  });

  it('index alignment matches parseQuickAddTsv across blank and NBSP-only lines', () => {
    // A whitespace-only line and an NBSP-only line are both dropped by
    // the parser before rows are numbered. removeQuickAddRows must drop
    // the same lines so index N means the same row in both functions.
    const text = 'Mort\tPratchett\n   \n\u00A0\u00A0\nGuards\tPratchett\nJingo\tPratchett';
    const parsed = BookUtils.parseQuickAddTsv(text);
    expect(parsed.rows.map((r) => r.title)).toEqual(['Mort', 'Guards', 'Jingo']);
    expect(remove(text, [1], parsed.headerSkipped)).toBe('Mort\tPratchett\nJingo\tPratchett');
  });

  it('handles CRLF line endings', () => {
    const text = 'A\tB\r\nC\tD\r\nE\tF';
    expect(remove(text, [1], false)).toBe('A\tB\nE\tF');
  });

  it('preserves kept lines verbatim (extra cells, internal NBSP)', () => {
    const keptLine = 'Guards\tPratchett\tPR 8\textra\tcells';
    const text = 'Mort\tPratchett\n' + keptLine;
    expect(remove(text, [0], false)).toBe(keptLine);
  });

  it('keeps lines past a truncation cap (indices only cover processed rows)', () => {
    // Simulates maxRows: 2 — only parsed rows 0-1 exist; line 3 was
    // never processed and must survive untouched.
    const text = 'A\tB\nC\tD\nE\tF';
    expect(remove(text, [0, 1], false)).toBe('E\tF');
  });

  it('returns empty string for non-string input', () => {
    expect(remove(null, [0], false)).toBe('');
    expect(remove(undefined, [], false)).toBe('');
    expect(remove(42, [0], false)).toBe('');
  });

  it('tolerates a missing/undefined indices argument', () => {
    expect(remove('A\tB', undefined, false)).toBe('A\tB');
  });
});

describe('BookUtils.splitCoverLines', () => {
  const split = (text) => BookUtils.splitCoverLines(text);

  it('splits a normal multi-line string into its lines', () => {
    expect(split('Summer Reads\nStaff Picks\n2026')).toEqual(['Summer Reads', 'Staff Picks', '2026']);
  });

  it('handles CRLF line endings', () => {
    expect(split('Line One\r\nLine Two')).toEqual(['Line One', 'Line Two']);
  });

  it('drops blank and whitespace-only interior lines', () => {
    expect(split('First\n\nSecond')).toEqual(['First', 'Second']);
    expect(split('First\n   \nSecond')).toEqual(['First', 'Second']);
  });

  it('drops leading and trailing blank lines', () => {
    expect(split('\nFirst\nSecond\n')).toEqual(['First', 'Second']);
    expect(split('\n\nOnly\n\n\n')).toEqual(['Only']);
  });

  it('returns a single-element array for a single line', () => {
    expect(split('Just One Line')).toEqual(['Just One Line']);
  });

  it('trims whitespace from each line', () => {
    expect(split('  padded  \n\ttabbed\t')).toEqual(['padded', 'tabbed']);
  });

  it('returns [] for empty string', () => {
    expect(split('')).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(split('   \n  \n ')).toEqual([]);
  });

  it('returns [] for null, undefined, and non-string input', () => {
    expect(split(null)).toEqual([]);
    expect(split(undefined)).toEqual([]);
    expect(split(42)).toEqual([]);
    expect(split(['a', 'b'])).toEqual([]);
  });
});

describe('BookUtils.compactLegacyCoverLineStyles', () => {
  // Style entries tagged so reordering is visible in assertions.
  const s1 = { font: 'Font A', sizePt: 35 };
  const s2 = { font: 'Font B', sizePt: 25 };
  const s3 = { font: 'Font C', sizePt: 20 };
  const compact = (texts, styles) => BookUtils.compactLegacyCoverLineStyles(texts, styles);

  it('keeps gap-free entries in their original order', () => {
    expect(compact(['One', 'Two', 'Three'], [s1, s2, s3])).toEqual([s1, s2, s3]);
  });

  it('shifts styles up past a blank line 1 so they follow their text', () => {
    expect(compact(['', 'Beach Reads', '2026'], [s1, s2, s3])).toEqual([s2, s3, s1]);
  });

  it('shifts a line-3 style up past a blank line 2', () => {
    expect(compact(['Title', '', 'Subtitle'], [s1, s2, s3])).toEqual([s1, s3, s2]);
  });

  it('treats whitespace-only text as blank', () => {
    expect(compact(['   ', 'Only Line', '\t'], [s1, s2, s3])).toEqual([s2, s1, s3]);
  });

  it('keeps original order when all texts are blank', () => {
    expect(compact(['', '', ''], [s1, s2, s3])).toEqual([s1, s2, s3]);
  });

  it('treats non-string and missing text entries as blank', () => {
    expect(compact([null, 'Text', undefined], [s1, s2, s3])).toEqual([s2, s1, s3]);
    expect(compact(['Text'], [s1, s2, s3])).toEqual([s1, s2, s3]);
    expect(compact(undefined, [s1, s2, s3])).toEqual([s1, s2, s3]);
  });

  it('preserves the styles array length', () => {
    expect(compact(['', 'X', ''], [s1, s2, s3])).toHaveLength(3);
  });

  it('returns non-array lineStyles unchanged', () => {
    expect(compact(['A', 'B'], null)).toBeNull();
    expect(compact(['A', 'B'], undefined)).toBeUndefined();
  });
});

describe('BookUtils.pickFeaturedLooks', () => {
  const L = (id, months) => (months === undefined ? { id } : { id, months });
  const catalog = [
    L('october', [10]),
    L('evergreen-1', []),
    L('summer', [6, 7]),
    L('evergreen-2', []),
    L('december', [12]),
  ];
  const ids = (result) => result.map((l) => l.id);
  const pick = (looks, month, count) => BookUtils.pickFeaturedLooks(looks, month, count);

  it('puts in-season looks first, then year-round, in catalog order', () => {
    expect(ids(pick(catalog, 10, 3))).toEqual(['october', 'evergreen-1', 'evergreen-2']);
    expect(ids(pick(catalog, 6, 3))).toEqual(['summer', 'evergreen-1', 'evergreen-2']);
  });

  it('fills with year-round looks when no look is in season', () => {
    expect(ids(pick(catalog, 3, 3))).toEqual(['evergreen-1', 'evergreen-2', 'october']);
  });

  it('uses out-of-season looks as last-resort filler', () => {
    const small = [L('october', [10]), L('december', [12])];
    expect(ids(pick(small, 3, 2))).toEqual(['october', 'december']);
  });

  it('truncates to count and tolerates count larger than the catalog', () => {
    expect(pick(catalog, 10, 1)).toHaveLength(1);
    expect(pick(catalog, 10, 99)).toHaveLength(catalog.length);
  });

  it('treats a missing months field as year-round', () => {
    expect(ids(pick([L('october', [10]), L('no-months')], 3, 2))).toEqual(['no-months', 'october']);
  });

  it('is deterministic for the same inputs', () => {
    expect(ids(pick(catalog, 7, 3))).toEqual(ids(pick(catalog, 7, 3)));
  });

  it('returns [] for invalid input', () => {
    expect(pick(null, 10, 3)).toEqual([]);
    expect(pick(catalog, 10, 0)).toEqual([]);
    expect(pick(catalog, 10, -1)).toEqual([]);
  });
});

describe('BookUtils.isDraftStateEffectivelyEmpty', () => {
  // A minimal "empty" state matching what serializeState would write
  // for a fresh page load: 15 blank-placeholder books, no extras, no
  // images, no text, default-fallback list name.
  function emptyState(overrides = {}) {
    return {
      schema: 'booklist-v1',
      meta: { listName: 'booklist' },
      books: Array.from({ length: 15 }, () => ({ isBlank: true })),
      extraCollageCovers: [],
      ui: {
        coverTitle: '',
        coverLineTexts: ['', '', ''],
        qrCodeText: '',
        qrCodeUrl: '',
      },
      images: { frontCover: null, branding: null, customQr: null },
      styles: {},
      ...overrides,
    };
  }

  it('returns true for null / undefined', () => {
    expect(BookUtils.isDraftStateEffectivelyEmpty(null)).toBe(true);
    expect(BookUtils.isDraftStateEffectivelyEmpty(undefined)).toBe(true);
  });

  it('returns true for the canonical empty state', () => {
    expect(BookUtils.isDraftStateEffectivelyEmpty(emptyState())).toBe(true);
  });

  it('returns true when books array is missing entirely', () => {
    const s = emptyState();
    delete s.books;
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('returns true when meta is missing entirely', () => {
    const s = emptyState();
    delete s.meta;
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('returns true when listName is the default-fallback "booklist" (any case)', () => {
    expect(BookUtils.isDraftStateEffectivelyEmpty(emptyState({ meta: { listName: 'booklist' } }))).toBe(true);
    expect(BookUtils.isDraftStateEffectivelyEmpty(emptyState({ meta: { listName: 'Booklist' } }))).toBe(true);
    expect(BookUtils.isDraftStateEffectivelyEmpty(emptyState({ meta: { listName: '  BOOKLIST  ' } }))).toBe(true);
  });

  it('returns false when at least one book is non-blank', () => {
    const s = emptyState();
    s.books[3].isBlank = false;
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when a blank slot has a user-typed description', () => {
    // Typing into the description field does not clear isBlank (only
    // typing into the title field does), so the empty-check has to
    // look at the description text itself.
    const s = emptyState();
    s.books[2].description = 'A great story about a postman.';
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('still returns true when description equals the placeholder string', () => {
    const s = emptyState();
    s.books[2].description = '[Enter a brief description here...]';
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('returns false when a blank slot has a user-typed authorDisplay', () => {
    const s = emptyState();
    s.books[5].authorDisplay = 'By Terry Pratchett - FIC';
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when extraCollageCovers has any entry', () => {
    const s = emptyState({ extraCollageCovers: [{ id: 'x', coverData: 'data:image/jpeg;base64,/9j/' }] });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when a front cover image is set', () => {
    const s = emptyState({ images: { frontCover: 'data:image/jpeg;base64,/9j/', branding: null, customQr: null } });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when a branding image is set', () => {
    const s = emptyState({ images: { frontCover: null, branding: 'data:image/png;base64,iVBOR', customQr: null } });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns true when the only branding is the library default (brandingIsLibraryDefault)', () => {
    const s = emptyState({
      images: {
        frontCover: null,
        branding: '/assets/img/libraries/sanrafael/logo.png',
        brandingIsLibraryDefault: true,
        customQr: null,
      },
    });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('returns false for a user-uploaded branding image even with the flag absent', () => {
    const s = emptyState({
      images: {
        frontCover: null,
        branding: 'data:image/png;base64,iVBOR',
        brandingIsLibraryDefault: false,
        customQr: null,
      },
    });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when a custom QR image is set', () => {
    const s = emptyState({ images: { frontCover: null, branding: null, customQr: 'data:image/png;base64,iVBOR' } });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when qrCodeText has user content', () => {
    const s = emptyState();
    s.ui.qrCodeText = 'Scan for the full list!';
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when qrCodeUrl has user content', () => {
    const s = emptyState();
    s.ui.qrCodeUrl = 'https://example.org/list';
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when coverTitle (simple mode) has user content', () => {
    const s = emptyState();
    s.ui.coverTitle = 'Summer Reads';
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when any coverLineTexts entry (advanced mode) has content', () => {
    const s = emptyState();
    s.ui.coverLineTexts = ['', 'Summer 2026', ''];
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(false);
  });

  it('returns false when listName is a real custom name', () => {
    expect(BookUtils.isDraftStateEffectivelyEmpty(emptyState({ meta: { listName: 'Summer Reads' } }))).toBe(false);
  });

  it('treats whitespace-only text fields as empty', () => {
    const s = emptyState();
    s.ui.qrCodeText = '   ';
    s.ui.qrCodeUrl = '\t';
    s.ui.coverTitle = '\n';
    s.ui.coverLineTexts = ['  ', '', '\t'];
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('ignores style customizations (settings, not content)', () => {
    const s = emptyState({ styles: { coverTitle: { font: 'Lora', size: 48, color: '#FF0000' } } });
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('ignores layout / collage settings (settings, not content)', () => {
    const s = emptyState();
    s.ui.collageLayout = 'tilted';
    s.ui.collageCoverCount = 20;
    s.ui.tiltDegree = 8;
    s.ui.showShelves = true;
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });

  it('ignores visibility toggles (showQr, showBranding)', () => {
    const s = emptyState();
    s.ui.showQr = false;
    s.ui.showBranding = false;
    expect(BookUtils.isDraftStateEffectivelyEmpty(s)).toBe(true);
  });
});

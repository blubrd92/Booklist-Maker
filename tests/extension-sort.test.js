// Tests for the extension's list-capture sort helpers. sort.js is a
// plain browser script that attaches to `window`, so load it the same
// way tests/setup.js loads the tool's script-globals: read the source
// and eval it with `window` pointing at globalThis.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let Sort;

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../extension/popup/sort.js'), 'utf8');
  globalThis.window = globalThis;
  (0, eval)(src);
  Sort = globalThis.window.BooklisterHelperSort;
});

// Shorthand book factory matching the popup's brief shape.
const B = (title, author, callNumber, subTitle) => ({ title, author, callNumber, subTitle });
const titles = (arr) => arr.map((b) => b.title);

describe('extension sort: title', () => {
  it('sorts case-insensitively on Title: Subtitle', () => {
    const out = Sort.sortBooks([B('zebra', 'x', ''), B('Apple', 'x', '')], 'title');
    expect(titles(out)).toEqual(['Apple', 'zebra']);
  });

  it('ignores leading articles The/A/An', () => {
    const out = Sort.sortBooks(
      [B('The Zebra Book', 'x', ''), B('A Tale of Two Cities', 'x', ''), B('An Apple a Day', 'x', ''), B('Mort', 'x', '')],
      'title'
    );
    expect(titles(out)).toEqual(['An Apple a Day', 'Mort', 'A Tale of Two Cities', 'The Zebra Book']);
  });

  it('does not strip article-like prefixes inside real words', () => {
    // "Theodore" starts with "the" but has no following space.
    expect(Sort.titleKey(B('Theodore Boone', 'x', ''))).toBe('theodore boone');
    expect(Sort.titleKey(B('Answers', 'x', ''))).toBe('answers');
  });

  it('includes the subtitle in the key', () => {
    expect(Sort.titleKey(B('Mort', 'x', '', 'A Novel'))).toBe('mort: a novel');
  });
});

describe('extension sort: author', () => {
  it('sorts by the text before the first comma (last name)', () => {
    const out = Sort.sortBooks(
      [B('t1', 'Smith, John', ''), B('t2', 'Dickens, Charles', ''), B('t3', 'Adams, Douglas', '')],
      'author'
    );
    expect(titles(out)).toEqual(['t3', 't2', 't1']);
  });

  it('uses the whole string when there is no comma', () => {
    expect(Sort.authorKey(B('t', 'Banksy', ''))).toBe('banksy');
  });

  it('sorts the no-author placeholder and empty authors to the bottom', () => {
    const out = Sort.sortBooks(
      [B('t1', 'No author listed', ''), B('t2', 'Adams, Douglas', ''), B('t3', '', '')],
      'author'
    );
    expect(titles(out)).toEqual(['t2', 't1', 't3']);
  });
});

describe('extension sort: call number', () => {
  it('puts letter-led call numbers before number-led', () => {
    const out = Sort.sortBooks([B('t1', 'x', '92'), B('t2', 'x', 'FIC SMITH')], 'callnumber');
    expect(titles(out)).toEqual(['t2', 't1']);
  });

  it('compares the leading integer numerically (92 before 808.83)', () => {
    const out = Sort.sortBooks([B('t1', 'x', '808.83'), B('t2', 'x', '92')], 'callnumber');
    expect(titles(out)).toEqual(['t2', 't1']);
  });

  it('compares Dewey decimals digit-by-digit (808.83 before 808.9)', () => {
    const out = Sort.sortBooks([B('t1', 'x', '808.9'), B('t2', 'x', '808.83')], 'callnumber');
    expect(titles(out)).toEqual(['t2', 't1']);
  });

  it('is case-insensitive for letter-led numbers', () => {
    const out = Sort.sortBooks([B('t1', 'x', 'fic z'), B('t2', 'x', 'FIC A')], 'callnumber');
    expect(titles(out)).toEqual(['t2', 't1']);
  });

  it('sorts empty call numbers to the bottom', () => {
    const out = Sort.sortBooks([B('t1', 'x', ''), B('t2', 'x', 'FIC A')], 'callnumber');
    expect(titles(out)).toEqual(['t2', 't1']);
  });
});

describe('extension sort: list mode and stability', () => {
  const catalog = [B('c', 'x', ''), B('a', 'x', ''), B('b', 'x', '')];

  it("'list' returns the input order untouched", () => {
    expect(titles(Sort.sortBooks(catalog, 'list'))).toEqual(['c', 'a', 'b']);
  });

  it('unknown modes behave like list order', () => {
    expect(titles(Sort.sortBooks(catalog, 'bogus'))).toEqual(['c', 'a', 'b']);
  });

  it('returns a copy, never mutating the input array', () => {
    const input = [B('b', 'x', ''), B('a', 'x', '')];
    Sort.sortBooks(input, 'title');
    expect(titles(input)).toEqual(['b', 'a']);
  });

  it('keeps page order for ties (stable sort)', () => {
    const out = Sort.sortBooks(
      [B('first', 'Same, Author', ''), B('second', 'Same, Author', '')],
      'author'
    );
    expect(titles(out)).toEqual(['first', 'second']);
  });
});

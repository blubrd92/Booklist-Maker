/**
 * Booklister Helper — list-capture sort helpers.
 *
 * Pure functions only: no DOM, no browser.* API. Kept separate from
 * popup.js so the ordering rules can be unit-tested outside a browser
 * (tests/extension-sort.test.js evals this file directly).
 *
 * Ordering rules (ascending only, by design):
 * - 'list'      : the curator's page order — the input order, untouched.
 * - 'title'     : case-insensitive on "Title: Subtitle", ignoring a
 *                 leading article (The/A/An) so titles file under their
 *                 first significant word, the way a catalog shelves them.
 * - 'author'    : by the first listed author's last name — the text
 *                 before the first comma (briefs arrive cleanAuthor-
 *                 normalized to "Last, First"; a comma-less name uses
 *                 the whole string). No-author placeholders sort last.
 * - 'callnumber': the catalog's LISTED call number (the SSR fallback the
 *                 popup shows — the final holdings-resolved number can
 *                 differ; accepted approximation, see CLAUDE.md).
 *                 Letter-led numbers (FIC, LC classes) come before
 *                 number-led (Dewey). Within number-led, the leading
 *                 integer compares numerically (92 before 808.83) and
 *                 the remainder as a plain string, which is correct for
 *                 Dewey decimals (.83 shelves before .9). Empty call
 *                 numbers sort last.
 *
 * Ties keep their relative page order (Array.prototype.sort is stable).
 */

'use strict';

(function () {
  const LEADING_ARTICLE_RE = /^(?:the|a|an)\s+/i;

  // Must match NO_AUTHOR_PLACEHOLDER in content.js — the popup's briefs
  // arrive with the placeholder already substituted for missing authors,
  // so string equality is the only way to recognize them here.
  const NO_AUTHOR_PLACEHOLDER = 'No author listed';

  function fullTitle(book) {
    const t = (book.title || '').trim();
    const s = (book.subTitle || '').trim();
    return s ? `${t}: ${s}` : t;
  }

  function titleKey(book) {
    return fullTitle(book).toLowerCase().replace(LEADING_ARTICLE_RE, '');
  }

  /** Last-name sort key, or null for missing/placeholder authors (sort last). */
  function authorKey(book) {
    const a = (book.author || '').trim();
    if (!a || a === NO_AUTHOR_PLACEHOLDER) return null;
    const comma = a.indexOf(',');
    return (comma > 0 ? a.slice(0, comma) : a).trim().toLowerCase();
  }

  function compareTitle(a, b) {
    return titleKey(a) < titleKey(b) ? -1 : titleKey(a) > titleKey(b) ? 1 : 0;
  }

  function compareAuthor(a, b) {
    const ka = authorKey(a);
    const kb = authorKey(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }

  function compareCallNumber(a, b) {
    const ka = (a.callNumber || '').trim().toLowerCase();
    const kb = (b.callNumber || '').trim().toLowerCase();
    if (!ka && !kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    const aNumberLed = /^\d/.test(ka);
    const bNumberLed = /^\d/.test(kb);
    if (aNumberLed !== bNumberLed) return aNumberLed ? 1 : -1;
    if (aNumberLed) {
      // Leading integer numerically (92 < 808), remainder as a plain
      // string (Dewey decimals: ".83" < ".9" digit-by-digit).
      const ma = ka.match(/^(\d+)(.*)$/);
      const mb = kb.match(/^(\d+)(.*)$/);
      const na = parseInt(ma[1], 10);
      const nb = parseInt(mb[1], 10);
      if (na !== nb) return na - nb;
      return ma[2] < mb[2] ? -1 : ma[2] > mb[2] ? 1 : 0;
    }
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }

  /**
   * Returns a new array of books ordered per `mode` ('list' | 'title' |
   * 'author' | 'callnumber'). Unknown modes behave like 'list'.
   */
  function sortBooks(books, mode) {
    const arr = books.slice();
    if (mode === 'title') arr.sort(compareTitle);
    else if (mode === 'author') arr.sort(compareAuthor);
    else if (mode === 'callnumber') arr.sort(compareCallNumber);
    return arr;
  }

  window.BooklisterHelperSort = {
    sortBooks,
    titleKey,
    authorKey,
    compareTitle,
    compareAuthor,
    compareCallNumber,
  };
})();

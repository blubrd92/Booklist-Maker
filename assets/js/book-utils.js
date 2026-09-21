/**
 * Booklister - Shared Utility Functions
 * Pure functions extracted from app.js to eliminate duplication and enable testing.
 */
(function() {
  'use strict';

  // Common cover sizes recognized by the Open Library covers API
  const VALID_COVER_SIZES = ['S', 'M', 'L'];

  // Returns true if the given string looks like a placeholder image URL.
  // Case-insensitive and whitespace-tolerant.
  function isPlaceholderUrl(value) {
    if (!value || typeof value !== 'string') return true;
    const trimmed = value.trim();
    if (!trimmed) return true;
    return trimmed.toLowerCase().includes('placehold.co');
  }

  const BookUtils = {

    /**
     * Checks if a book has a valid (non-placeholder) cover image.
     * @param {Object} book - A book object from the booklist
     * @returns {boolean}
     */
    hasValidCover: function(book) {
      if (!book) return false;
      const hasOpenLibraryCover =
        Array.isArray(book.cover_ids) &&
        book.cover_ids.some(function(id) { return !!id; });
      const hasCustomCover =
        typeof book.customCoverData === 'string' &&
        !isPlaceholderUrl(book.customCoverData);
      return !!(hasOpenLibraryCover || hasCustomCover);
    },

    /**
     * Returns all non-blank, starred (includeInCollage) books.
     * @param {Array} booklist - The myBooklist array
     * @returns {Array}
     */
    getStarredBooks: function(booklist) {
      return booklist.filter(function(b) {
        return !b.isBlank && b.includeInCollage;
      });
    },

    /**
     * Returns all starred books that also have a valid cover.
     * @param {Array} booklist - The myBooklist array
     * @returns {Array}
     */
    getStarredBooksWithCovers: function(booklist) {
      return BookUtils.getStarredBooks(booklist).filter(BookUtils.hasValidCover);
    },

    /**
     * Checks whether the total cover count has reached the limit.
     * @param {Array} booklist - The myBooklist array
     * @param {Array} extraCovers - The extraCollageCovers array
     * @param {number} maxCovers - CONFIG.MAX_COVERS_FOR_COLLAGE
     * @returns {boolean} true if at or over the limit
     */
    isAtCoverLimit: function(booklist, extraCovers, maxCovers) {
      const starredCount = BookUtils.getStarredBooks(booklist).length;
      return (starredCount + extraCovers.length) >= maxCovers;
    },

    /**
     * Counts the total number of valid covers (starred books + extras).
     * @param {Array} booklist - The myBooklist array
     * @param {Array} extraCovers - The extraCollageCovers array
     * @param {boolean|number} modeOrCount - Either the legacy boolean
     *   (true = extended/20, false = standard/12) or a numeric cover
     *   count (12, 16, or 20). Extras only count when the mode requires
     *   more than MIN_COVERS_FOR_COLLAGE books.
     * @returns {number}
     */
    countTotalCovers: function(booklist, extraCovers, modeOrCount) {
      const count = BookUtils.getRequiredCovers(modeOrCount);
      const booksWithCovers = BookUtils.getStarredBooksWithCovers(booklist);
      const extraCount = count > CONFIG.MIN_COVERS_FOR_COLLAGE
        ? extraCovers.filter(function(ec) {
            return ec.coverData && !isPlaceholderUrl(ec.coverData);
          }).length
        : 0;
      return booksWithCovers.length + extraCount;
    },

    /**
     * Determines the required number of covers based on mode.
     * Accepts either the legacy boolean (true = 20, false = 12) or a
     * numeric cover count (12, 16, or 20). Any unknown value falls
     * back to MIN_COVERS_FOR_COLLAGE.
     * @param {boolean|number} modeOrCount
     * @returns {number}
     */
    getRequiredCovers: function(modeOrCount) {
      if (typeof modeOrCount === 'boolean') {
        return modeOrCount
          ? CONFIG.MAX_COVERS_FOR_COLLAGE
          : CONFIG.MIN_COVERS_FOR_COLLAGE;
      }
      if (typeof modeOrCount === 'number' &&
          CONFIG.COLLAGE_COVER_COUNTS.indexOf(modeOrCount) !== -1) {
        return modeOrCount;
      }
      return CONFIG.MIN_COVERS_FOR_COLLAGE;
    },

    /**
     * Builds an Open Library cover image URL.
     * @param {string|number} coverId - The Open Library cover ID
     * @param {string} [size='M'] - Size suffix: 'S', 'M', or 'L'. Invalid sizes fall back to 'M'.
     * @returns {string} Full URL or placeholder
     */
    getCoverUrl: function(coverId, size) {
      if (!VALID_COVER_SIZES.includes(size)) size = 'M';
      if (!coverId || coverId === 'placehold') {
        return CONFIG.PLACEHOLDER_NO_COVER_URL;
      }
      return CONFIG.OPEN_LIBRARY_COVERS_URL + coverId + '-' + size + '.jpg';
    },

    /**
     * Gets the best available cover URL for a book (custom > OpenLibrary > placeholder).
     * @param {Object} book - A book object
     * @param {string} [size='M'] - Size suffix for Open Library covers
     * @returns {string}
     */
    getBookCoverUrl: function(book, size) {
      if (!VALID_COVER_SIZES.includes(size)) size = 'M';
      if (typeof book.customCoverData === 'string' && !isPlaceholderUrl(book.customCoverData)) {
        return book.customCoverData;
      }
      if (Array.isArray(book.cover_ids) && book.cover_ids.length > 0) {
        // Clamp currentCoverIndex to a valid range so a corrupted or
        // out-of-bounds index falls back to the first cover instead of
        // silently returning the placeholder.
        let idx = book.currentCoverIndex;
        if (typeof idx !== 'number' || idx < 0 || idx >= book.cover_ids.length) {
          idx = 0;
        }
        return BookUtils.getCoverUrl(book.cover_ids[idx], size);
      }
      return CONFIG.PLACEHOLDER_COLLAGE_COVER_URL;
    },

    /**
     * Checks whether the collage should auto-regenerate based on current state.
     * @param {Array} booklist
     * @param {Array} extraCovers
     * @param {boolean|number} modeOrCount - Legacy boolean or numeric cover count
     * @returns {boolean}
     */
    hasEnoughCoversForCollage: function(booklist, extraCovers, modeOrCount) {
      const total = BookUtils.countTotalCovers(booklist, extraCovers, modeOrCount);
      const required = BookUtils.getRequiredCovers(modeOrCount);
      return total >= required;
    },

    /**
     * Flip "Last, First" → "First Last" when the name has exactly one
     * comma. Multi-comma strings (e.g. "Smith, John, and Doe, Jane")
     * stay as-is to avoid mangling multi-author or suffix cases. Empty
     * input or names with no comma are returned untouched (trimmed).
     * @param {string} name
     * @returns {string}
     */
    flipAuthorName: function(name) {
      if (!name) return name || '';
      const trimmed = name.trim();
      if (!trimmed) return trimmed;
      const commaCount = (trimmed.match(/,/g) || []).length;
      if (commaCount !== 1) return trimmed;
      const parts = trimmed.split(',').map(function(p) { return p.trim(); });
      if (!parts[0] || !parts[1]) return trimmed;
      return parts[1] + ' ' + parts[0];
    },

    /**
     * Convert a string to English-style Title Case for book titles.
     * Capitalizes the first and last words, plus all major words.
     * Articles, conjunctions, and short prepositions stay lowercase
     * unless they're the first or last word, OR the first word of a
     * subtitle (the word immediately after a token ending in : ? !).
     * All-uppercase tokens of length 2+ (e.g. "USA", "C.S.") are
     * preserved as acronyms.
     *
     * Intended for English titles. Spanish and other languages that
     * use sentence case should bypass this via the toggle in the
     * Quick Add modal.
     * @param {string} str
     * @returns {string}
     */
    toTitleCase: function(str) {
      if (!str) return str || '';
      const minorWords = new Set([
        'a', 'an', 'the',
        'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
        'as', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'via',
        'from', 'into', 'onto', 'over', 'with',
      ]);
      const tokens = str.split(/(\s+)/);
      let firstWordIdx = -1;
      let lastWordIdx = -1;
      // Word indices that start a subtitle (immediately follow a word
      // ending in : ? !). Per Chicago/AP style, these are always
      // capitalized regardless of being a minor word.
      const subtitleStarts = new Set();
      let prevWordEndedSubtitle = false;
      for (let i = 0; i < tokens.length; i++) {
        if (/\S/.test(tokens[i])) {
          if (firstWordIdx === -1) firstWordIdx = i;
          lastWordIdx = i;
          if (prevWordEndedSubtitle) subtitleStarts.add(i);
          prevWordEndedSubtitle = /[:?!]$/.test(tokens[i]);
        }
      }
      // Capitalize the first letter of each hyphen-separated segment so a
      // compound like "Word-Word" stays "Word-Word" instead of collapsing
      // to "Word-word". BiblioCommons enters hyphenated titles this way.
      function capitalizeWord(word) {
        return word.split('-').map(function(seg) {
          if (!seg) return seg;
          return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
        }).join('-');
      }
      return tokens.map(function(token, i) {
        if (!/\S/.test(token)) return token;
        const lower = token.toLowerCase();
        // Preserve all-uppercase acronyms of length 2+ (e.g. "USA",
        // "C.S.", "NASA"). Length-1 tokens like "I" still flow through
        // the capitalize-first branch below, which gives the same result.
        if (token.length >= 2 && token === token.toUpperCase() && /[A-Z]/.test(token)) {
          return token;
        }
        if (i !== firstWordIdx && i !== lastWordIdx && !subtitleStarts.has(i) && minorWords.has(lower)) {
          return lower;
        }
        return capitalizeWord(token);
      }).join('');
    },

    /**
     * Convert a string to sentence case: lowercase the words, then
     * capitalize the first word and the first word of each subtitle. For
     * Spanish and other languages that capitalize only the first word and
     * proper nouns in titles.
     *
     * Acronyms survive, the same way they do in `toTitleCase`: an
     * all-uppercase token of length 2+ is left alone, so
     * `SPQR: a history of ancient Rome` keeps SPQR.
     *
     * The exception is a title that `isCaselessTitle` says is SHOUTING
     * rather than merely carrying an acronym (no lowercase letter
     * anywhere). There every word looks like an acronym, so protecting
     * them would mean returning the title untouched, which is the one
     * thing this function exists to avoid. Those are flattened whole:
     * `LA CASA DE BERNARDA ALBA` becomes `La casa de bernarda alba`. The
     * cost is that a shouting title carrying a genuine acronym loses it,
     * since at that point nothing in the string tells the two apart.
     *
     * A word following a token that ends in `:`, `?` or `!` IS
     * capitalized. RAE says a Spanish subtitle naming a partial aspect
     * takes a colon plus lowercase, and this deliberately does not follow
     * that: the same rule would lowercase every English subtitle too, and
     * English subtitles are the common case here. A Spanish title that
     * wants the lowercase can have it with one keystroke, which is the
     * cheaper direction to be wrong in. `?` and `!` end a sentence
     * outright, so capitalizing after them is right in both languages.
     *
     * Still no proper-noun detection: interior proper nouns are
     * lowercased and need fixing by hand (`PEDRO PARAMO` becomes `Pedro
     * paramo`). No dictionary-free rule can tell a proper noun from a
     * common one, and the titles are editable in place.
     * @param {string} str
     * @returns {string}
     */
    toSentenceCase: function(str) {
      if (!str) return str || '';
      const keepAcronyms = !BookUtils.isCaselessTitle(str);
      const tokens = str.split(/(\s+)/);

      // Word indices that begin a sentence: the first word, and any word
      // after a token ending in : ? !. `pending` stays true across a
      // token with no letters in it, so a title or subtitle opening with
      // «, " or ¿ hands the capital to the word that follows instead of
      // swallowing it.
      const sentenceStarts = new Set();
      let pending = true;
      for (let i = 0; i < tokens.length; i++) {
        if (!/\S/.test(tokens[i])) continue;
        if (pending) {
          sentenceStarts.add(i);
          if (/\p{L}/u.test(tokens[i])) pending = false;
        }
        if (/[:?!]$/.test(tokens[i])) pending = true;
      }

      return tokens.map(function(token, i) {
        if (!/\S/.test(token)) return token;
        // Same acronym test as toTitleCase, deliberately including its
        // ASCII-only /[A-Z]/ guard, so the two functions agree on what
        // counts as an acronym.
        if (keepAcronyms && token.length >= 2
            && token === token.toUpperCase() && /[A-Z]/.test(token)) {
          return token;
        }
        const lowered = token.toLowerCase();
        if (!sentenceStarts.has(i)) return lowered;
        // Capitalize the first LETTER, not the first character: an
        // inverted mark or an opening quote would otherwise absorb it.
        const at = lowered.search(/\p{L}/u);
        if (at === -1) return lowered;
        return lowered.slice(0, at) + lowered.charAt(at).toUpperCase() + lowered.slice(at + 1);
      }).join('');
    },

    /**
     * Whether a title carries no usable case information at all: not a
     * single lowercase letter anywhere, but at least one uppercase one.
     *
     * `toTitleCase` inspects one word at a time and preserves any word
     * that is entirely uppercase, which is right for `the USA today`
     * and useless for `EL AMOR EN LOS TIEMPOS DEL CÓLERA`, where every
     * word passes that test and the title comes back untouched. This
     * looks at the string as a whole, so a caller can flatten the case
     * before converting.
     *
     * A ONE-WORD all-caps title counts as caseless too, and that is a
     * deliberate reversal of an earlier two-word floor that existed to
     * protect titles like `SPQR`, `NW` and `IQ`. The floor protected
     * those and trapped everything else: press UPPERCASE on `Beloved`
     * and no button could turn `BELOVED` back, because one all-caps
     * word reads as an acronym. Stuck is worse than wrong-and-fixable,
     * single-word titles vastly outnumber acronym-only ones on a
     * display list, and nothing happens to `SPQR` unless the user
     * presses a button and asks for it. The acronym protection that
     * matters is still intact, because a title with any lowercase in it
     * is never caseless: `SPQR: a history of ancient Rome` keeps SPQR.
     *
     * Strings with no cased letters at all (numerals, CJK) return
     * false: there is nothing to flatten.
     * @param {string} str
     * @returns {boolean}
     */
    isCaselessTitle: function(str) {
      if (!str || typeof str !== 'string') return false;
      if (/\p{Ll}/u.test(str)) return false;
      return /\p{Lu}/u.test(str);
    },

    /**
     * The byline words this app knows, as a plain lowercase array.
     * Reads CONFIG.BYLINE_PREFIXES unless given an explicit list (the
     * tests pass one; production never does).
     * @param {Array} [prefixes] - Override list, entries {value} or string
     * @returns {string[]} Lowercased words, empty array if none configured
     */
    // How far into a line setBylinePrefix will look for an opener's
    // trailing byline word. Three covers "Edited by" and "Escrito por"
    // while keeping the scan away from a mid-line ", edited by".
    BYLINE_OPENER_MAX_WORDS: 3,

    getBylinePrefixWords: function(prefixes) {
      const list = Array.isArray(prefixes)
        ? prefixes
        : (typeof CONFIG !== 'undefined' && CONFIG.BYLINE_PREFIXES) || [];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const word = typeof entry === 'string' ? entry : (entry && entry.value);
        if (word) out.push(String(word).toLowerCase());
      }
      return out;
    },

    /**
     * Split a leading byline word off an author line.
     *
     * Matches the word followed by at least one whitespace character.
     * `\s` is deliberate rather than a literal space: real author lines
     * carry U+00A0 from catalog pastes (the tour's own sample data has
     * "By Terry Pratchett - [NBSP] Fiction Pratchett") and can hold line
     * breaks, since the byline field permits them.
     *
     * @param {string} text - An author line
     * @param {Array} [prefixes] - Override word list (tests only)
     * @returns {{prefix: string|null, rest: string}} prefix is null when
     *   the line does not open with a word this app knows
     */
    stripBylinePrefix: function(text, prefixes) {
      const str = (text === null || text === undefined) ? '' : String(text);
      const words = BookUtils.getBylinePrefixWords(prefixes);
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const head = str.slice(0, word.length);
        if (head.toLowerCase() !== word) continue;
        const after = str.slice(word.length);
        const gap = after.match(/^\s+/);
        if (!gap) continue;
        return {
          prefix: str.slice(0, word.length + gap[0].length),
          rest: after.slice(gap[0].length),
        };
      }
      return { prefix: null, rest: str };
    },

    /**
     * Rewrite the byline word on one author line.
     *
     * The line is a single hand-editable string ("By Ada Lovelace - 510
     * LOV"), so the word at the front may be one this app wrote, one the
     * user typed, or absent because they deleted it. Two passes:
     *
     *   1. A known word at the very start, which is the common case.
     *   2. A known word used as the tail of a hand-written opener, so
     *      "Edited by" and "Escrito por" are replaced rather than having
     *      a second word stacked in front of them. Only the first few
     *      words are searched: an opener lives at the start, and scanning
     *      the whole line would cut "Ada Lovelace, edited by Someone"
     *      down to "Someone" and lose the author.
     *
     * With no known word anywhere near the front, the line is treated as
     * having no byline word and the new one is prepended. That default
     * matters more than it looks: a book typed by hand into the grid
     * keeps book.author as the placeholder (the byline field's input
     * handler writes back authorDisplay only), so there is no reliable
     * name to anchor on, and bailing instead would mean pressing the
     * button on a hand-typed list did nothing at all. The cost is that a
     * genuinely unfamiliar opener gets a word stacked in front of it,
     * which is visible on the line and undone with one keystroke.
     *
     * @param {string} line - The current author line
     * @param {string} newPrefix - Word to set, '' to remove the word
     * @param {Array} [prefixes] - Override word list (tests only)
     * @returns {string|null} The rewritten line, or null to leave as-is
     */
    setBylinePrefix: function(line, newPrefix, prefixes) {
      const str = (line === null || line === undefined) ? '' : String(line);
      if (!str.trim()) return null;
      const want = (newPrefix === null || newPrefix === undefined) ? '' : String(newPrefix).trim();

      let rest = null;

      const stripped = BookUtils.stripBylinePrefix(str, prefixes);
      if (stripped.prefix !== null) {
        rest = stripped.rest;
      } else {
        const words = BookUtils.getBylinePrefixWords(prefixes);
        // Walk the gaps between the first few words, looking for one of
        // the known words used as an opener's tail.
        const tokens = str.split(/(\s+)/);
        let wordsSeen = 0;
        for (let i = 0; i < tokens.length && wordsSeen < BookUtils.BYLINE_OPENER_MAX_WORDS; i++) {
          if (!/\S/.test(tokens[i])) continue;
          wordsSeen++;
          if (words.indexOf(tokens[i].toLowerCase()) === -1) continue;
          const after = tokens.slice(i + 1).join('');
          if (!/^\s/.test(tokens[i + 1] || '')) continue;
          rest = after;
          break;
        }
        // No opener found: nothing in front of the name to replace.
        if (rest === null) rest = str;
      }

      rest = rest.replace(/^\s+/, '');
      const next = want ? want + ' ' + rest : rest;
      return next === str ? null : next;
    },

    /**
     * Parse a tab-separated paste from a spreadsheet (Google Sheets,
     * Excel, Numbers, etc.) into rows of { title, author, callNumber,
     * coverUrl }. Used by the Quick Add modal's "Spreadsheet" tab.
     *
     * Behavior:
     *  - Splits on \r?\n, drops blank lines, trims each line.
     *  - Replaces non-breaking spaces (U+00A0) with regular spaces
     *    before splitting; Numbers (Apple) sometimes inserts NBSP
     *    inside cells.
     *  - Auto-detects an optional header row (case-insensitive token
     *    match): cell[0] in {title, book title, name} OR cell[1] in
     *    {author, authors, by} OR cell[2] in {call number, callnumber,
     *    call no, call#} OR cell[3] in {cover, cover url, image,
     *    image url}. The matched row is excluded from the result.
     *  - Splits each remaining line on \t and takes cells [0], [1],
     *    [2], [3] as title, author, callNumber, coverUrl. Cells
     *    beyond [3] are ignored.
     *  - The coverUrl column is OPTIONAL and ignored unless the cell
     *    parses as an http(s) URL or a `data:image/*` URL. The
     *    Booklister Helper browser extension fetches the cover from
     *    BiblioCommons' provider and emits a base64-encoded
     *    `data:image/jpeg;base64,...` URL by default, so saved booklists
     *    remain self-contained even if the cover provider's URLs change
     *    or expire. Plain http(s) URLs are also accepted for users who
     *    want hotlinked covers in their pastes. Anything else
     *    (data:text/html, javascript:, file:, malformed) becomes empty
     *    string. Users pasting plain spreadsheet content with 3 columns
     *    are unaffected.
     *  - Empty cells become empty strings; the caller decides which
     *    rows to keep (e.g. require title + author).
     *  - Quoted cells are NOT unwrapped — Excel only quotes when a
     *    cell contains a literal tab/newline, which is vanishingly
     *    rare for book titles. Documented limitation.
     *
     * Author flipping and title casing happen at the call site, not
     * here — keeps the parser pure and lets the caller toggle title
     * casing per batch.
     *
     * @param {string} rawText
     * @param {{ maxRows?: number }} [options]
     * @returns {{ rows: Array<{title: string, author: string, callNumber: string, coverUrl: string}>,
     *            headerSkipped: boolean,
     *            truncated: boolean,
     *            truncatedAt: number } | null}
     *   Returns null when the input is non-string, empty, or
     *   whitespace-only.
     */
    parseQuickAddTsv: function(rawText, options) {
      if (typeof rawText !== 'string') return null;
      // The character between the slashes on the next line is U+00A0
      // (non-breaking space). Numbers (Apple) and some web sources
      // insert NBSP inside cells; replacing with a regular space lets
      // the per-cell .trim() clean it up like normal whitespace.
      const text = rawText.replace(/\u00A0/g, ' ');
      // Drop empty / whitespace-only lines, but DO NOT trim the
      // surviving lines themselves — trimming the line would strip a
      // leading tab, collapsing a row whose first cell was legitimately
      // empty into one whose first cell is whatever was second. Per-cell
      // .trim() (below) handles internal whitespace cleanup.
      const lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
      if (lines.length === 0) return null;

      const HEADER_TITLE  = /^(title|book title|name)$/i;
      const HEADER_AUTHOR = /^(author|authors|by)$/i;
      const HEADER_CALL   = /^(call number|callnumber|call no|call#)$/i;
      const HEADER_COVER  = /^(cover|cover url|image|image url)$/i;

      const first = lines[0].split('\t').map(function(c) { return c.trim(); });
      const isHeader =
        HEADER_TITLE.test(first[0] || '') ||
        HEADER_AUTHOR.test(first[1] || '') ||
        HEADER_CALL.test(first[2] || '') ||
        HEADER_COVER.test(first[3] || '');
      const dataLines = isHeader ? lines.slice(1) : lines;

      const requestedMax = options && options.maxRows;
      const max = (typeof requestedMax === 'number' && requestedMax > 0)
        ? requestedMax
        : dataLines.length;
      const sliced = dataLines.slice(0, max);

      // Accept http: / https: URLs (raw hotlinks) and data:image/*
      // URLs (base64-embedded image bytes — what the Booklister Helper
      // browser extension produces by default, so .booklist files stay
      // self-contained without runtime dependency on the cover provider).
      // Reject everything else: data:text/html, data:application/...,
      // javascript:, file:, malformed strings — these would either be
      // unsafe or render as broken images.
      function safeCoverUrl(raw) {
        const v = (raw || '').trim();
        if (!v) return '';
        if (/^https?:\/\//i.test(v)) return v;
        if (/^data:image\//i.test(v)) return v;
        return '';
      }

      const rows = sliced.map(function(line) {
        const cells = line.split('\t').map(function(c) { return c.trim(); });
        return {
          title: cells[0] || '',
          author: cells[1] || '',
          callNumber: cells[2] || '',
          coverUrl: safeCoverUrl(cells[3]),
        };
      });

      return {
        rows: rows,
        headerSkipped: isHeader,
        truncated: dataLines.length > sliced.length,
        truncatedAt: max,
      };
    },

    /**
     * Rebuild a Quick Add spreadsheet paste with some parsed rows
     * removed. Used by the Spreadsheet tab's partial-success path:
     * rows that were added to the booklist are trimmed out of the
     * textarea, leaving only the rows that still need attention
     * (overflow rows that didn't fit, rows skipped for a missing
     * Title/Author, and anything past the truncation cap) so the
     * user can fix and resubmit without re-pasting.
     *
     * `rowIndices` are indices into parseQuickAddTsv(rawText).rows —
     * i.e. data-row indices AFTER blank-line filtering and AFTER the
     * header row (when headerSkipped is true). The header line, when
     * present, is preserved in the rebuilt text.
     *
     * Index alignment with parseQuickAddTsv is guaranteed because both
     * functions drop exactly the same lines: the parser filters on
     * `line.trim().length > 0` after replacing NBSP (U+00A0) with
     * regular spaces, and String.prototype.trim already treats NBSP as
     * whitespace, so filtering the raw text here yields the same line
     * set. Original line text (including NBSPs and extra cells) is
     * preserved verbatim for the kept rows.
     *
     * @param {string} rawText - the original textarea content
     * @param {Set<number>|number[]} rowIndices - parsed-row indices to remove
     * @param {boolean} headerSkipped - parseQuickAddTsv(rawText).headerSkipped
     * @returns {string} the rebuilt paste (kept lines joined with \n)
     */
    removeQuickAddRows: function(rawText, rowIndices, headerSkipped) {
      if (typeof rawText !== 'string') return '';
      const remove = (rowIndices instanceof Set) ? rowIndices : new Set(rowIndices || []);
      const lines = rawText.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
      const dataStart = headerSkipped ? 1 : 0;
      const kept = [];
      for (let i = 0; i < lines.length; i++) {
        if (i >= dataStart && remove.has(i - dataStart)) continue;
        kept.push(lines[i]);
      }
      return kept.join('\n');
    },

    /**
     * Split the cover header textarea's text into its renderable lines.
     * Splits on \r?\n, trims each line, and drops empty lines — blank
     * lines don't consume a per-line style group and aren't rendered
     * in per-line styling mode. Used by app.js's getCoverTitleStyles
     * and updateCoverLineStyleGroups so the two always agree on what
     * counts as a "line".
     * @param {string} text - raw textarea content
     * @returns {string[]} trimmed non-empty lines ([] for non-string/empty input)
     */
    splitCoverLines: function(text) {
      if (typeof text !== 'string' || !text) return [];
      return text.split(/\r?\n/)
        .map(function(line) { return line.trim(); })
        .filter(function(line) { return line.length > 0; });
    },

    /**
     * Re-pair legacy per-line cover styles with their text after gap
     * compaction. Pre-unified states stored cover text in three line
     * inputs, and the old renderer kept text in input N styled by
     * style group N even when an earlier input was blank. Migrating
     * such a state joins the non-empty lines, which shifts each text
     * up past the gaps — so its style entry must shift with it or the
     * cover silently renders with a different line's font/size/color.
     * Style entries whose text was blank are appended after the kept
     * ones, preserving the array length so every style group still
     * restores a valid entry. Gap-free input returns the entries in
     * their original order.
     * @param {Array} lineTexts - legacy ui.coverLineTexts (entries may be blank)
     * @param {Array} lineStyles - saved styles.coverTitle.lines entries
     * @returns {Array} lineStyles reordered to follow the compacted text;
     *   returned unchanged when it isn't an array
     */
    compactLegacyCoverLineStyles: function(lineTexts, lineStyles) {
      if (!Array.isArray(lineStyles)) return lineStyles;
      const texts = Array.isArray(lineTexts) ? lineTexts : [];
      const kept = [];
      const rest = [];
      for (let i = 0; i < lineStyles.length; i++) {
        const t = typeof texts[i] === 'string' ? texts[i] : '';
        (t.trim() ? kept : rest).push(i);
      }
      return kept.concat(rest).map(function(i) { return lineStyles[i]; });
    },

    /**
     * Canvas font-shorthand style prefix for bold/italic flags. Order
     * matters to ctx.font ('italic bold 40px ...'), and the trailing
     * space is intentional — callers prepend the result directly to
     * the size. Shared by getCoverTitleStyles and buildLookTitleStyles
     * in app.js so the two can't drift.
     * @param {boolean} bold
     * @param {boolean} italic
     * @returns {string} '', 'bold ', 'italic ', or 'italic bold '
     */
    buildCanvasFontStyle: function(bold, italic) {
      return (italic ? 'italic ' : '') + (bold ? 'bold ' : '');
    },

    /**
     * Pick which looks the Front Cover tab's chip strip features for a
     * given month. Seasonal looks (whose `months` array contains the
     * month) come first, then year-round looks (empty/absent `months`),
     * then out-of-season looks as last-resort filler — each group in
     * catalog order, truncated to `count`. Deterministic: same inputs,
     * same strip. The full gallery is unaffected; this only orders the
     * featured subset.
     * @param {Array} looks - the CONFIG.LOOKS catalog
     * @param {number} month - calendar month, 1-12
     * @param {number} count - how many looks the strip shows
     * @returns {Array} up to `count` look objects
     */
    pickFeaturedLooks: function(looks, month, count) {
      if (!Array.isArray(looks) || !(count > 0)) return [];
      const seasonal = [];
      const yearRound = [];
      const offSeason = [];
      looks.forEach(function(look) {
        const months = Array.isArray(look.months) ? look.months : [];
        if (months.indexOf(month) !== -1) seasonal.push(look);
        else if (months.length === 0) yearRound.push(look);
        else offSeason.push(look);
      });
      return seasonal.concat(yearRound, offSeason).slice(0, count);
    },

    /**
     * Create a blank book object with placeholder fields.
     * Used for empty slots in a new booklist or after deletion.
     * @returns {Object} A blank book object
     */
    createBlankBook: function() {
      const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      return {
        key: `blank-${uuid}`,
        isBlank: true,
        title: CONFIG.PLACEHOLDERS.title,
        author: CONFIG.PLACEHOLDERS.author,
        callNumber: CONFIG.PLACEHOLDERS.callNumber,
        authorDisplay: CONFIG.PLACEHOLDERS.authorWithCall,
        description: CONFIG.PLACEHOLDERS.description,
        cover_i: null,
        customCoverData: CONFIG.PLACEHOLDER_COVER_URL,
        cover_ids: [],
        currentCoverIndex: 0,
        includeInCollage: false // Blank books don't count toward collage
      };
    },

    /**
     * Whether a parsed draft state (the shape produced by app.js's
     * serializeState) is "effectively empty" — equivalent to a fresh
     * page load with no user content. Used by restoreDraftLocalIfPresent
     * to suppress the "Draft restored from this browser." toast when
     * there's nothing meaningful to advertise as restored.
     *
     * Checks every surface a user could have filled in:
     * - books: all blank placeholders, or no books
     * - extraCollageCovers: empty
     * - images: no front cover, branding, or custom QR upload
     * - ui text: no QR url, no QR blurb, no cover title (simple or
     *   advanced mode lines)
     * - meta.listName: empty, or the default-fallback string 'booklist'
     *   that serializeState writes when the input is blank
     *
     * Intentionally NOT checked (treated as "settings, not content"):
     * style customizations from captureStyleGroups, layout choice,
     * tilt/title-bar settings, collage cover count, visibility toggles
     * (showQr / showBranding). Those have no visible effect without
     * content, so a draft that has only these is still "empty" for
     * the purposes of the restored-toast.
     *
     * IMPORTANT: this function is coupled to app.js's serializeState
     * schema. When you add a new "content" field to the saved state,
     * extend this function so the restored-toast keeps firing for
     * drafts that contain only the new field.
     */
    isDraftStateEffectivelyEmpty: function(state) {
      if (!state) return true;
      const books = Array.isArray(state.books) ? state.books : [];
      // A blank-flagged slot can still hold user-typed description or
      // author text — only the title field's input handler clears
      // isBlank, so typing into description/author keeps the flag true
      // even though real content is present. Treat such a slot as
      // non-empty so the draft-restored toast fires when the user has
      // typed anything into a blank entry.
      const PH = (CONFIG && CONFIG.PLACEHOLDERS) || {};
      const realText = function(val, placeholder) {
        const s = (val == null ? '' : String(val)).trim();
        return s !== '' && s !== placeholder;
      };
      const allBlank = books.length === 0 || books.every(function(b) {
        if (!b) return true;
        if (!b.isBlank) return false;
        if (realText(b.description, PH.description)) return false;
        if (realText(b.authorDisplay, PH.authorWithCall)) return false;
        return true;
      });
      const noExtras = !Array.isArray(state.extraCollageCovers) || state.extraCollageCovers.length === 0;
      const images = state.images || {};
      // On branded instances the library logo is auto-applied by
      // applyLibraryConfig on every load, so images.branding is set even
      // when the user uploaded nothing. serializeState flags that case
      // via images.brandingIsLibraryDefault — don't count the library's
      // own default branding as user content.
      const brandingIsContent = !!images.branding && !images.brandingIsLibraryDefault;
      const noImages = !images.frontCover && !brandingIsContent && !images.customQr;
      const ui = state.ui || {};
      const coverLineTexts = Array.isArray(ui.coverLineTexts) ? ui.coverLineTexts : [];
      const noText = !(ui.qrCodeText || '').trim()
        && !(ui.qrCodeUrl || '').trim()
        && !(ui.coverTitle || '').trim()
        && !coverLineTexts.some(function(t) { return (t || '').trim(); });
      const listName = ((state.meta && state.meta.listName) || '').trim().toLowerCase();
      const noListName = !listName || listName === 'booklist';
      return allBlank && noExtras && noImages && noText && noListName;
    },
  };

  // Expose globally
  globalThis.BookUtils = BookUtils;
})();

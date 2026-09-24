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

    /**
     * The subset of byline words allowed to match INSIDE a line, as the
     * tail of a hand-written opener. See the `opener` flag on
     * CONFIG.BYLINE_PREFIXES: a word that doubles as a surname particle
     * is excluded here, because matching "von" inside "Ludwig von
     * Beethoven" would treat the first name as part of the opener and
     * delete it.
     * @param {Array} [prefixes] - Override list, entries {value, opener}
     * @returns {string[]} Lowercased words, possibly empty
     */
    getBylineOpenerWords: function(prefixes) {
      const list = Array.isArray(prefixes)
        ? prefixes
        : (typeof CONFIG !== 'undefined' && CONFIG.BYLINE_PREFIXES) || [];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (!entry || typeof entry === 'string' || !entry.opener || !entry.value) continue;
        out.push(String(entry.value).toLowerCase());
      }
      return out;
    },

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
     *   2. An OPENER word (the `opener: true` subset) used as the tail of
     *      a hand-written opener, so "Edited by" and "Escrito por" are
     *      replaced rather than having a second word stacked in front of
     *      them. Two limits keep this from eating real names: only the
     *      first few words are searched, so "Ada Lovelace, edited by
     *      Someone" is not cut down to "Someone"; and only flagged words
     *      qualify, so a surname particle in the word list (Di, Von) is
     *      never mistaken for an opener in "Leonardo di Caprio".
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
        // The opener subset, NOT every known word: a surname particle in
        // the list (Di, Von) would otherwise read as an opener and eat
        // the first name off "Leonardo di Caprio".
        const words = BookUtils.getBylineOpenerWords(prefixes);
        // Walk the gaps between the first few words, looking for one of
        // those words used as an opener's tail.
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
     * Apply a case transform to the highlighted part of a multi-line
     * string, the way the cover header's Change capitalization buttons
     * use it. A collapsed selection (start === end) means "no highlight"
     * and transforms the whole text.
     *
     * Works one line at a time so Title Case treats each cover line as
     * its own title. For a partial line, the transform runs on the WHOLE
     * line and only the highlighted characters are kept, so the words
     * read in context: highlighting "of books" in "Banned of books" and
     * pressing Title Case must not capitalize "of" as though it started
     * the line, and Sentence case on a mid-line word must not capitalize
     * it. That splice needs the transform to preserve length; when it
     * does not (German ß uppercases to SS), the highlighted fragment is
     * transformed on its own instead. A highlighted fragment written
     * entirely in capitals is lowercased before the transform runs (see
     * the comment inside), so the three buttons compose in any order on
     * part of a line just as they do on whole titles.
     *
     * @param {string} text - the full textarea value
     * @param {number} start - selectionStart
     * @param {number} end - selectionEnd
     * @param {function(string): string} fn - the case transform
     * @returns {{text: string, start: number, end: number}} the new text
     *   and the range to re-highlight (collapsed when nothing was
     *   highlighted, so the next press still means "everything")
     */
    transformTextSelection: function(text, start, end, fn) {
      text = typeof text === 'string' ? text : '';
      const len = text.length;
      let a = Math.max(0, Math.min(len, Number(start) || 0));
      let b = Math.max(0, Math.min(len, Number(end) || 0));
      if (b < a) { const t = a; a = b; b = t; }
      const collapsed = a === b;
      if (collapsed) { a = 0; b = len; }

      let out = '';
      let delta = 0;
      let lineStart = 0;
      text.split('\n').forEach(function(line, i) {
        if (i > 0) out += '\n';
        const lineEnd = lineStart + line.length;
        const segA = Math.max(a, lineStart) - lineStart;
        const segB = Math.min(b, lineEnd) - lineStart;
        if (segB > segA) {
          // A highlighted fragment with no lowercase in it is flattened
          // first. Both case functions protect all-caps words as acronyms,
          // so without this a word the UPPERCASE button just produced
          // could never be turned back by the other two.
          const fragment = line.slice(segA, segB);
          const flat = BookUtils.isCaselessTitle(fragment) ? fragment.toLowerCase() : fragment;
          const source = flat.length === fragment.length
            ? line.slice(0, segA) + flat + line.slice(segB)
            : line;
          const whole = fn(source);
          const piece = whole.length === line.length
            ? whole.slice(segA, segB)
            : fn(flat);
          delta += piece.length - (segB - segA);
          out += line.slice(0, segA) + piece + line.slice(segB);
        } else {
          out += line;
        }
        lineStart = lineEnd + 1;
      });

      if (collapsed) {
        const caret = Math.min(Number(start) || 0, out.length);
        return { text: out, start: caret, end: caret };
      }
      return { text: out, start: a, end: b + delta };
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

    // -----------------------------------------------------------------------
    // Collage geometry: Honeycomb and Jigsaw layouts.
    //
    // Everything below is pure layout math in canvas pixels, with no DOM or
    // canvas access, so app.js's draw functions stay thin and these rules
    // stay testable. Two rules govern both layouts' repeats:
    //   1. Every title appears whole at least once before any repeat is dealt.
    //   2. Repeats follow Staggered's rhythm (each row reads through the list
    //      in order, starting further along than the row above) and step past
    //      any title that would sit next to itself.
    // -----------------------------------------------------------------------

    /**
     * Deterministic pseudo-random generator (mulberry32). The same seed
     * always yields the same sequence, so a saved Jigsaw keeps its cut.
     * @param {number} seed
     * @returns {function(): number} values in [0, 1)
     */
    seededRandom: function(seed) {
      let a = seed >>> 0;
      return function() {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    /**
     * Rhythm repeat choice: take the title the pattern calls for; if a copy
     * of it already sits within `near`, step along the list in `dir` until
     * one doesn't (then relax to 60% of `near`, then give in).
     * @param {Array<{cx:number, cy:number, t:number}>} placed
     * @returns {number} title index
     */
    pickRhythmTitle: function(placed, count, cx, cy, preferred, dir, near) {
      const mod = function(v) { return ((v % count) + count) % count; };
      const nearest = function(t) {
        let d = Infinity;
        for (let i = 0; i < placed.length; i++) {
          if (placed[i].t === t) d = Math.min(d, Math.hypot(placed[i].cx - cx, placed[i].cy - cy));
        }
        return d;
      };
      const reaches = [near, near * 0.6];
      for (let r = 0; r < reaches.length; r++) {
        for (let d = 0; d < count; d++) {
          const t = mod(preferred + d * dir);
          if (nearest(t) >= reaches[r]) return t;
        }
      }
      return mod(preferred);
    },

    /**
     * Plans a honeycomb of pointy-top hexagons over a width x height canvas:
     * the largest cells at which `count` cells sit wholly on the canvas and
     * clear of the title bar's zone. A region tall enough to hold a cell must
     * get at least one whole cell (or the comb reads lopsided); up to 15%
     * smaller cells are accepted to achieve that, unless it would leave a
     * comb full of spares.
     * @param {Object} o - { width, height, count, zoneTop, zoneBottom, gutter }
     *   Pass zoneTop = zoneBottom = -1 when there is no title bar.
     * @returns {{r:number, dx:number, dy:number, cells:Array}|null}
     *   cells: { cx, cy, j (row), k (column), full }
     */
    planHoneycomb: function(o) {
      const W = o.width, H = o.height, n = o.count;
      const zoneTop = o.zoneTop, zoneBot = o.zoneBottom;
      const hasBar = zoneBot > zoneTop;
      const pad = o.gutter * 0.5;
      const SQ3 = Math.sqrt(3);
      const cellsFor = function(r, phaseX, phaseY) {
        const dx = SQ3 * r, dy = 1.5 * r, hw = dx / 2, hh = r;
        const cells = [];
        const j0 = Math.floor((-hh - phaseY) / dy) - 1, j1 = Math.ceil((H + hh - phaseY) / dy) + 1;
        const k0 = Math.floor(-W / 2 / dx) - 2, k1 = Math.ceil(W / 2 / dx) + 2;
        for (let j = j0; j <= j1; j++) {
          const cy = phaseY + j * dy;
          const off = (((j % 2) + 2) % 2 ? 0.5 : 0) + phaseX;
          for (let k = k0; k <= k1; k++) {
            const cx = W / 2 + (k + off) * dx;
            if (cx < -hw || cx > W + hw || cy < -hh || cy > H + hh) continue;
            const clear = cy + hh <= zoneTop || cy - hh >= zoneBot;
            // Cells hidden under the bar's white strip are left out entirely.
            if (!clear && cy - hh * 0.5 >= zoneTop && cy + hh * 0.5 <= zoneBot) continue;
            const full = clear && cx - hw >= pad && cx + hw <= W - pad && cy - hh >= pad && cy + hh <= H - pad;
            cells.push({ cx: cx, cy: cy, j: j, k: k, full: full });
          }
        }
        return { r: r, dx: dx, dy: dy, cells: cells };
      };
      let first = null;
      const step = W / 1500;
      for (let r = W * 0.35; r >= W * 0.027; r -= step) {
        if (first && r < first.r * 0.85) break;
        let best = null;
        [0, 0.5].forEach(function(px) {
          [0, 0.25, 0.5, 0.75].forEach(function(f) {
            const plan = cellsFor(r, px, f * 3 * r);
            const full = plan.cells.filter(function(c) { return c.full; });
            if (full.length < n) return;
            plan.fullCount = full.length;
            if (!first) first = plan;
            if (hasBar) {
              const above = full.filter(function(c) { return c.cy < zoneTop; }).length;
              const below = full.length - above;
              if ((zoneTop > 2.3 * r && above === 0) || (H - zoneBot > 2.3 * r && below === 0)) return;
            }
            if (!best || plan.fullCount < best.fullCount) best = plan;
          });
        });
        if (best) return best.fullCount - n > Math.max(3, n * 0.2) && first ? first : best;
      }
      return first;
    },

    /**
     * Deals titles into a planned honeycomb. Every title gets one whole cell,
     * in list order across the page (spare whole cells are the outermost).
     * Every other cell repeats titles in Staggered's rhythm: each row of the
     * comb reads through the list in order, starting further along than the
     * row above, stepping past any title within ~two cells of itself.
     * @param {Array} cells - from planHoneycomb
     * @param {number} count - number of titles
     * @param {number} dx - horizontal cell pitch (planHoneycomb's dx)
     * @returns {{titles:number[], whole:boolean[]}} parallel to cells
     */
    assignHoneycombTitles: function(cells, count, dx) {
      const titles = new Array(cells.length).fill(-1);
      const whole = new Array(cells.length).fill(false);
      const idx = cells.map(function(_, i) { return i; });
      const fullIdx = idx.filter(function(i) { return cells[i].full; })
        .sort(function(a, b) { return cells[a].cy - cells[b].cy || cells[a].cx - cells[b].cx; });
      const W2 = cells.length ? (Math.min.apply(null, cells.map(function(c) { return c.cx; })) + Math.max.apply(null, cells.map(function(c) { return c.cx; }))) / 2 : 0;
      const H2 = cells.length ? (Math.min.apply(null, cells.map(function(c) { return c.cy; })) + Math.max.apply(null, cells.map(function(c) { return c.cy; }))) / 2 : 0;
      const spare = new Set(fullIdx.slice().sort(function(a, b) {
        return Math.abs(cells[b].cx - W2) - Math.abs(cells[a].cx - W2) || Math.abs(cells[b].cy - H2) - Math.abs(cells[a].cy - H2);
      }).slice(0, Math.max(0, fullIdx.length - count)));
      let t = 0;
      fullIdx.forEach(function(i) { if (!spare.has(i) && t < count) { titles[i] = t++; whole[i] = true; } });

      // Row anchors: title = anchor + column, so a row reads the list in order.
      const rows = new Map();
      idx.forEach(function(i) { const j = cells[i].j; if (!rows.has(j)) rows.set(j, []); rows.get(j).push(i); });
      const js = Array.from(rows.keys()).sort(function(a, b) { return a - b; });
      const anchor = new Map(), perRow = [];
      js.forEach(function(j) {
        const w = rows.get(j).filter(function(i) { return whole[i]; }).sort(function(a, b) { return cells[a].k - cells[b].k; });
        if (w.length) { anchor.set(j, titles[w[0]] - cells[w[0]].k); perRow.push(w.length); }
      });
      const stepRows = perRow.length ? Math.max(2, Math.round(perRow.reduce(function(a, v) { return a + v; }, 0) / perRow.length)) : 3;
      const firstIdx = js.findIndex(function(j) { return anchor.has(j); });
      if (firstIdx < 0) return { titles: titles, whole: whole };
      for (let i = firstIdx + 1; i < js.length; i++) if (!anchor.has(js[i])) anchor.set(js[i], anchor.get(js[i - 1]) + stepRows);
      for (let i = firstIdx - 1; i >= 0; i--) if (!anchor.has(js[i])) anchor.set(js[i], anchor.get(js[i + 1]) - stepRows);

      const placed = [];
      idx.forEach(function(i) { if (whole[i]) placed.push({ cx: cells[i].cx, cy: cells[i].cy, t: titles[i] }); });
      const self = this;
      js.forEach(function(j) {
        rows.get(j).slice().sort(function(a, b) { return cells[a].k - cells[b].k; }).forEach(function(i) {
          if (whole[i]) return;
          const c = cells[i];
          const pick = self.pickRhythmTitle(placed, count, c.cx, c.cy, anchor.get(j) + c.k, 1, dx * 1.9);
          titles[i] = pick;
          placed.push({ cx: c.cx, cy: c.cy, t: pick });
        });
      });
      return { titles: titles, whole: whole };
    },

    /**
     * Plans Jigsaw rows. Rows fill the height exactly and bleed off both
     * sides; the plan is the fewest rows (largest pieces) at which every
     * title gets one whole piece clear of the side edges. Covers within 5%
     * of their mean aspect share one piece width in a true grid; anything
     * else is cut free-form, each piece at its own cover's aspect.
     * @param {number[]} aspects - width / height per title, in list order
     * @param {number} width - canvas width
     * @param {number} availHeight - height left for rows after the title bar
     * @returns {{uniform:boolean, rows:number, pieceHeight:number,
     *   pieceWidth?:number, slots?:number, counts:number[]}}
     */
    planJigsaw: function(aspects, width, availHeight) {
      const n = aspects.length;
      const mean = aspects.reduce(function(s, v) { return s + v; }, 0) / n;
      const uniform = aspects.every(function(a) { return Math.abs(a - mean) / mean <= 0.05; });
      const balanced = function(R) {
        return Array.from({ length: R }, function(_, r) { return Math.floor(n / R) + (r < n % R ? 1 : 0); });
      };
      // Contiguous splits of the list into R rows, each 1-7 titles.
      const splits = function(R) {
        const out = [], cur = [];
        (function rec(rem, left) {
          if (left === 0) { if (rem === 0) out.push(cur.slice()); return; }
          for (let v = 1; v <= 7 && v <= rem; v++) {
            const rest = rem - v;
            if (rest < left - 1 || rest > 7 * (left - 1)) continue;
            cur.push(v); rec(rest, left - 1); cur.pop();
          }
        })(n, R);
        return out;
      };
      let last = null;
      for (let R = 2; R <= 7; R++) {
        const ch = availHeight / R;
        if (uniform) {
          const cw = ch * mean;
          // Whole slots per row, leaving a real (>= 35%) cut-off piece at each side.
          const m = Math.max(1, Math.floor((width - 0.7 * cw) / cw));
          last = { uniform: true, rows: R, pieceHeight: ch, pieceWidth: cw, slots: m, counts: balanced(R) };
          if (R * m >= n) return last;
        } else {
          const limit = width - 0.7 * ch * mean;
          let best = null;
          splits(R).forEach(function(c) {
            let i = 0, worst = 0;
            c.forEach(function(k) {
              let s = 0;
              for (let j = 0; j < k; j++) s += aspects[i + j];
              i += k;
              worst = Math.max(worst, s * ch);
            });
            if (worst <= limit && (!best || worst < best.worst)) best = { counts: c, worst: worst };
          });
          last = { uniform: false, rows: R, pieceHeight: ch, counts: best ? best.counts : balanced(R) };
          if (best) return last;
        }
      }
      return last;
    },

    /**
     * Lays out Jigsaw pieces row by row. Every title's whole piece is placed
     * first (centered in its row, list order); repeats then continue each
     * row's run of the list outward, backward past the left end and forward
     * past the right, until the row runs off both edges, stepping past any
     * title that would touch itself.
     * @param {Object} plan - from planJigsaw
     * @param {number[]} aspects
     * @param {number} width - canvas width
     * @param {number[]} rowTops - top y of each row (bar already accounted for)
     * @returns {Array<Array<{x:number, w:number, t:number, whole:boolean}>>}
     *   pieces per row, sorted left to right
     */
    layoutJigsaw: function(plan, aspects, width, rowTops) {
      const n = aspects.length, ch = plan.pieceHeight;
      const rows = [], placed = [], built = [];
      const self = this;
      const add = function(r, t, x, w, whole) {
        const p = { x: x, w: w, t: t, whole: whole };
        rows[r].push(p);
        placed.push({ cx: x + w / 2, cy: rowTops[r] + ch / 2, t: t });
        return p;
      };
      let next = 0;
      for (let r = 0; r < plan.rows; r++) {
        rows.push([]);
        const titles = Array.from({ length: plan.counts[r] }, function(_, k) { return next + k; });
        next += plan.counts[r];
        if (plan.uniform) {
          const cw = plan.pieceWidth, m = plan.slots;
          const left = (width - m * cw) / 2 - cw;        // slot -1 is the cut-off piece at the left edge
          const start = Math.floor((m - titles.length) / 2);
          titles.forEach(function(t, j) { add(r, t, left + (start + j + 1) * cw, cw, true); });
          built.push({ titles: titles, left: left, start: start });
        } else {
          const widths = titles.map(function(t) { return aspects[t] * ch; });
          let x = (width - widths.reduce(function(s, v) { return s + v; }, 0)) / 2;
          const x0 = x;
          titles.forEach(function(t, j) { add(r, t, x, widths[j], true); x += widths[j]; });
          built.push({ titles: titles, x0: x0, x1: x });
        }
      }
      const near = 1.25 * ch;
      built.forEach(function(b, r) {
        const cy = rowTops[r] + ch / 2;
        if (plan.uniform) {
          const cw = plan.pieceWidth, m = plan.slots;
          const slots = [];
          for (let k = -1; k <= m; k++) if (k < b.start || k >= b.start + b.titles.length) slots.push(k);
          slots.sort(function(a, c) { return Math.abs(a - (m - 1) / 2) - Math.abs(c - (m - 1) / 2); })
            .forEach(function(k) {
              const x = b.left + (k + 1) * cw;
              const t = self.pickRhythmTitle(placed, n, x + cw / 2, cy, b.titles[0] + (k - b.start), k < b.start ? -1 : 1, near);
              add(r, t, x, cw, false);
            });
        } else {
          let xl = b.x0, xr = b.x1, side = 0;
          let prevL = b.titles[0], nextR = b.titles[b.titles.length - 1];
          while (xl > 0 || xr < width) {                  // grow outward, alternating sides
            if ((side++ % 2 === 0 && xl > 0) || xr >= width) {
              const t = self.pickRhythmTitle(placed, n, xl - ch * 0.35, cy, prevL - 1, -1, near);
              const w = aspects[t] * ch;
              xl -= w; add(r, t, xl, w, false); prevL = t;
            } else {
              const t = self.pickRhythmTitle(placed, n, xr + ch * 0.35, cy, nextR + 1, 1, near);
              const w = aspects[t] * ch;
              add(r, t, xr, w, false); xr += w; nextR = t;
            }
          }
        }
        rows[r].sort(function(a, c) { return a.x - c.x; });
      });
      return rows;
    },

    /**
     * Cuts the seams of a Jigsaw. Each shared edge is defined once, and both
     * pieces reference the same boundary object, so the two sides of a seam
     * always meet. Side tabs point left or right at random (seeded); tabs
     * between cover rows point up, so every blank lands at the bottom of a
     * cover and none bites a title; both rows beside the title bar tab into
     * it. Tabs vary in position, size, head, neck and lean.
     * @param {Array<{y:number, h:number, bar?:boolean, pieces:Array<{x:number, w:number}>}>} strips
     *   top to bottom; each piece gains top/bottom/left/right boundary refs
     * @param {function(): number} rand - e.g. BookUtils.seededRandom(seed)
     * @param {number} u - tab scale in pixels
     */
    cutJigsawSeams: function(strips, rand, u) {
      const knob = function(r) {
        return { size: 0.85 + r() * 0.3, head: 0.85 + r() * 0.35, neck: 0.8 + r() * 0.3, lean: (r() - 0.5) * 0.35 };
      };
      strips.forEach(function(s) {
        s.pieces.forEach(function(p, j) {
          const q = s.pieces[j + 1];
          if (!q) return;
          const slack = Math.max(0, s.h / 2 - 0.3 * u);
          const k = knob(rand);
          k.y = s.y + s.h / 2 + (rand() - 0.5) * 2 * Math.min(slack, 0.14 * s.h);
          k.dir = rand() < 0.5 ? 'right' : 'left';
          const V = { kind: 'v', x: q.x, y0: s.y, y1: s.y + s.h, knob: k };
          p.right = V; q.left = V;
        });
      });
      for (let i = 0; i < strips.length - 1; i++) {
        const A = strips[i], B = strips[i + 1];
        const cuts = Array.from(new Set(A.pieces.concat(B.pieces).reduce(function(acc, p) {
          acc.push(Math.round(p.x * 100) / 100, Math.round((p.x + p.w) * 100) / 100);
          return acc;
        }, []))).sort(function(a, b) { return a - b; });
        const dir = B.bar ? 'down' : 'up';               // into the bar from above; otherwise up
        const knobs = [];
        for (let c = 0; c < cuts.length - 1; c++) {
          const c0 = cuts[c], c1 = cuts[c + 1], len = c1 - c0;
          if (len < 0.6 * u) continue;
          const slack = Math.max(0, len / 2 - 0.3 * u);
          const k = knob(rand);
          k.x = (c0 + c1) / 2 + (rand() - 0.5) * 2 * Math.min(slack, 0.14 * len);
          k.dir = dir;
          knobs.push(k);
        }
        const Hb = { kind: 'h', y: B.y, knobs: knobs };
        A.pieces.forEach(function(p) { p.bottom = Hb; });
        B.pieces.forEach(function(p) { p.top = Hb; });
      }
    },
  };

  // Expose globally
  globalThis.BookUtils = BookUtils;
})();

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
  };

  // Expose globally
  globalThis.BookUtils = BookUtils;
})();

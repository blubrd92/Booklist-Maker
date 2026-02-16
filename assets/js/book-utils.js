/**
 * Booklist Maker - Shared Utility Functions
 * Pure functions extracted from app.js to eliminate duplication and enable testing.
 */
(function() {
  'use strict';

  const BookUtils = {

    /**
     * Checks if a book has a valid (non-placeholder) cover image.
     * Replaces ~10 inline checks scattered across app.js.
     * @param {Object} book - A book object from the booklist
     * @returns {boolean}
     */
    hasValidCover: function(book) {
      if (!book) return false;
      const hasOpenLibraryCover = book.cover_ids && book.cover_ids.length > 0;
      const hasCustomCover = book.customCoverData &&
        !book.customCoverData.includes('placehold.co');
      return !!(hasOpenLibraryCover || hasCustomCover);
    },

    /**
     * Returns all non-blank, starred (includeInCollage) books.
     * Replaces ~11 identical filter expressions.
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
     * Replaces ~4 duplicated limit-check blocks.
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
     * @param {boolean} extendedMode - Whether extended collage mode is on
     * @returns {number}
     */
    countTotalCovers: function(booklist, extraCovers, extendedMode) {
      const booksWithCovers = BookUtils.getStarredBooksWithCovers(booklist);
      const extraCount = extendedMode
        ? extraCovers.filter(function(ec) {
            return ec.coverData && !ec.coverData.includes('placehold.co');
          }).length
        : 0;
      return booksWithCovers.length + extraCount;
    },

    /**
     * Determines the required number of covers based on mode.
     * @param {boolean} extendedMode - Whether extended collage mode is on
     * @returns {number}
     */
    getRequiredCovers: function(extendedMode) {
      return extendedMode
        ? CONFIG.MAX_COVERS_FOR_COLLAGE
        : CONFIG.MIN_COVERS_FOR_COLLAGE;
    },

    /**
     * Builds an Open Library cover image URL.
     * @param {string|number} coverId - The Open Library cover ID
     * @param {string} [size='M'] - Size suffix: 'S', 'M', or 'L'
     * @returns {string} Full URL or placeholder
     */
    getCoverUrl: function(coverId, size) {
      if (!size) size = 'M';
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
      if (!size) size = 'M';
      if (book.customCoverData && !book.customCoverData.includes('placehold.co')) {
        return book.customCoverData;
      }
      if (book.cover_ids && book.cover_ids.length > 0) {
        const coverId = book.cover_ids[book.currentCoverIndex || 0];
        return BookUtils.getCoverUrl(coverId, size);
      }
      return CONFIG.PLACEHOLDER_COLLAGE_COVER_URL;
    },

    /**
     * Checks whether the collage should auto-regenerate based on current state.
     * @param {Array} booklist
     * @param {Array} extraCovers
     * @param {boolean} extendedMode
     * @returns {boolean}
     */
    hasEnoughCoversForCollage: function(booklist, extraCovers, extendedMode) {
      const total = BookUtils.countTotalCovers(booklist, extraCovers, extendedMode);
      const required = BookUtils.getRequiredCovers(extendedMode);
      return total >= required;
    },
  };

  // Expose globally
  globalThis.BookUtils = BookUtils;
})();

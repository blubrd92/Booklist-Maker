/**
 * Booklister Application
 * Refactored for maintainability, accessibility, and clarity
 *
 * Dependencies (loaded via <script> tags before this file):
 *   - config.js    -> globalThis.CONFIG
 *   - book-utils.js -> globalThis.BookUtils
 */

// =============================================================================
// MAIN APPLICATION MODULE
// =============================================================================
const BooklistApp = (function() {
  'use strict';
  
  // ---------------------------------------------------------------------------
  // Private State
  // ---------------------------------------------------------------------------
  let myBooklist = [];
  let extraCollageCovers = []; // Additional covers for collage (beyond book blocks)
  let MAX_BOOKS = CONFIG.MAX_BOOKS_FULL;
  let isDirtyLocal = false;   // True while edits haven't reached localStorage yet (crash guard)
  let hasUnsavedFile = false;  // True while edits haven't been downloaded as a .booklist file
  let isExportingPdf = false; // Guard against concurrent PDF exports

  // Undo/Redo state
  const UNDO_MAX = 50;
  const UNDO_COALESCE_MS = 1000;
  let _undoStack = [];       // Array of snapshot objects (with image refs)
  let _redoStack = [];       // Array of snapshot objects (with image refs)
  let _lastUndoGroup = null;
  let _lastUndoTime = 0;
  let _isRestoring = false;  // Guard flag to prevent side effects during undo/redo restore
  let _tourActive = false;   // Guard flag: suppresses pushUndo and autosave during guided tour
  let _collageGenId = 0;     // Generation counter to discard stale async collage results
  // Pre-edit snapshot used by style inputs (color pickers, font selects, size
  // inputs, etc.) where the DOM value is mutated by the browser BEFORE the
  // change/input event fires. pushUndo captures the current DOM via
  // serializeState, which would grab the post-change state and make Ctrl+Z
  // useless. We capture on focus (pre-edit) and commit on the first change
  // event of that focus session. See capturePreEditSnapshot / commitPreEditSnapshot.
  let _pendingPreEditSnapshot = null;

  // DOM-independent source of truth for the QR blurb text. The
  // qrCodeTextArea is a contenteditable div inside #qr-code-area, which
  // is toggled display:none when the user turns "Show QR Code" off. The
  // browser's .innerText accessor returns '' for any element whose
  // computed style is display:none, so reading innerText during
  // serialization while the area is hidden would silently overwrite a
  // real blurb with empty. Mirror the text into this module variable
  // on every input event (and during applyState when loading), then
  // have serializeState read from here instead of the DOM. This value
  // never holds the placeholder sentinel — it's either the user's real
  // content or empty.
  let _currentQrText = '';

  // ---------------------------------------------------------------------------
  // IndexedDB Image Cache (deduplicates base64 images across undo snapshots)
  // ---------------------------------------------------------------------------
  const _imageRefPrefix = '__idbimg:';
  let _imageIdCounter = 0;
  const _imageDataToId = new Map(); // dataURL → refId (dedup lookup)
  const _imageCache = new Map();    // refId → dataURL (in-memory fast cache)
  let _idb = null;                  // IndexedDB database handle

  function _openImageDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('booklist-undo-images', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('images');
      };
      req.onsuccess = () => { _idb = req.result; resolve(_idb); };
      req.onerror = () => reject(req.error);
    });
  }

  function _storeImageIDB(refId, dataUrl) {
    _openImageDB().then(db => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put(dataUrl, refId);
    }).catch(() => { /* IndexedDB unavailable — in-memory cache still works */ });
  }

  function _getImageIDB(refId) {
    return _openImageDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readonly');
        const req = tx.objectStore('images').get(refId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function _clearImageDB() {
    _openImageDB().then(db => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').clear();
    }).catch(() => {});
  }

  /** Store a value in IDB and wait for the transaction to complete */
  function _putImageIDB(key, value) {
    return _openImageDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  /** Delete a key from IDB (fire-and-forget) */
  function _deleteImageIDB(key) {
    _openImageDB().then(db => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').delete(key);
    }).catch(() => {});
  }

  /** Get or create a reference ID for a data URL, storing it in cache + IDB */
  function _getImageRef(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return dataUrl;
    // Only deduplicate base64 data URLs (not regular URLs like placehold.co)
    if (!dataUrl.startsWith('data:')) return dataUrl;

    let refId = _imageDataToId.get(dataUrl);
    if (!refId) {
      refId = _imageRefPrefix + (++_imageIdCounter);
      _imageDataToId.set(dataUrl, refId);
      _imageCache.set(refId, dataUrl);
      _storeImageIDB(refId, dataUrl);
    }
    return refId;
  }

  /** Resolve a reference ID back to a data URL (sync from cache, async from IDB fallback) */
  function _resolveImageRef(value) {
    if (!value || typeof value !== 'string' || !value.startsWith(_imageRefPrefix)) {
      return Promise.resolve(value);
    }
    const cached = _imageCache.get(value);
    if (cached) return Promise.resolve(cached);
    return _getImageIDB(value).then(data => {
      if (data) _imageCache.set(value, data);
      return data || null;
    });
  }

  /** Replace all base64 data URLs in a state object with image refs */
  function _extractImages(state) {
    // Books — customCoverData
    if (state.books) {
      state.books = state.books.map(b => ({
        ...b,
        customCoverData: b.customCoverData ? _getImageRef(b.customCoverData) : null
      }));
    }
    // Extra collage covers
    if (state.extraCollageCovers) {
      state.extraCollageCovers = state.extraCollageCovers.map(ec => ({
        ...ec,
        coverData: ec.coverData ? _getImageRef(ec.coverData) : null
      }));
    }
    // Front cover and branding images
    if (state.images) {
      if (state.images.frontCover) {
        state.images.frontCover = _getImageRef(state.images.frontCover);
      }
      if (state.images.branding) {
        state.images.branding = _getImageRef(state.images.branding);
      }
    }
    return state;
  }

  /** Resolve all image refs in a state object back to data URLs */
  function _restoreImages(state) {
    const promises = [];

    if (state.books) {
      state.books.forEach((b, i) => {
        if (b.customCoverData && typeof b.customCoverData === 'string' && b.customCoverData.startsWith(_imageRefPrefix)) {
          promises.push(_resolveImageRef(b.customCoverData).then(url => { state.books[i].customCoverData = url; }));
        }
      });
    }
    if (state.extraCollageCovers) {
      state.extraCollageCovers.forEach((ec, i) => {
        if (ec.coverData && typeof ec.coverData === 'string' && ec.coverData.startsWith(_imageRefPrefix)) {
          promises.push(_resolveImageRef(ec.coverData).then(url => { state.extraCollageCovers[i].coverData = url; }));
        }
      });
    }
    if (state.images) {
      if (state.images.frontCover && typeof state.images.frontCover === 'string' && state.images.frontCover.startsWith(_imageRefPrefix)) {
        promises.push(_resolveImageRef(state.images.frontCover).then(url => { state.images.frontCover = url; }));
      }
      if (state.images.branding && typeof state.images.branding === 'string' && state.images.branding.startsWith(_imageRefPrefix)) {
        promises.push(_resolveImageRef(state.images.branding).then(url => { state.images.branding = url; }));
      }
    }

    return Promise.all(promises).then(() => state);
  }

  // Zoom state
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.25;
  let currentZoom = 1.0;

  // Search pagination state
  const searchPagination = {
    lastQuery: '',      // The full query string from the last search
    currentOffset: 0,   // Current offset into results
    totalResults: 0,    // numFound from Open Library
  };

  /** Toggles the visual "unsaved" indicator on the Save button */
  function updateSaveIndicator() {
    const btn = document.getElementById('save-list-button');
    if (!btn) return;
    btn.classList.toggle('has-unsaved', hasUnsavedFile);
    btn.title = hasUnsavedFile ? 'Save Recent Changes' : 'Save Current List';
  }
  
  // ---------------------------------------------------------------------------
  // Debounced Autosave (defined early so it can be used by renderBooklist)
  // ---------------------------------------------------------------------------
  const debouncedSave = (() => {
    let t;
    function trigger() {
      if (_isRestoring || _tourActive) return; // Don't autosave during undo/redo restore or tour
      isDirtyLocal = true;    // Edits not yet in localStorage
      hasUnsavedFile = true;  // Edits not yet in a .booklist file
      updateSaveIndicator();
      clearTimeout(t);
      t = setTimeout(() => {
        if (_isRestoring || _tourActive) return; // Re-check at execution time
        saveDraftLocal();
      }, CONFIG.AUTOSAVE_DEBOUNCE_MS);
    }
    trigger.cancel = () => { clearTimeout(t); };
    return trigger;
  })();

  // Debounced cover regeneration to prevent lag on rapid changes
  const debouncedCoverRegen = (() => {
    let t;
    function trigger() {
      if (_isRestoring || _tourActive) return;
      clearTimeout(t);
      t = setTimeout(() => {
        if (_isRestoring || _tourActive) return; // Re-check at execution time
        if (elements.frontCoverUploader?.classList.contains('has-image')) {
          generateCoverCollage();
        }
      }, 350); // Slightly longer delay for cover regeneration
    }
    trigger.cancel = () => { clearTimeout(t); };
    return trigger;
  })();
  
  // ---------------------------------------------------------------------------
  // DOM Element References (cached on init)
  // ---------------------------------------------------------------------------
  let elements = {};
  
  function cacheElements() {
    elements = {
      // Search form
      keywordInput: document.getElementById('keywordInput'),
      titleInput: document.getElementById('titleInput'),
      authorInput: document.getElementById('authorInput'),
      subjectInput: document.getElementById('subjectInput'),
      isbnInput: document.getElementById('isbnInput'),
      publisherInput: document.getElementById('publisherInput'),
      personInput: document.getElementById('personInput'),
      fetchButton: document.getElementById('fetchButton'),
      searchForm: document.getElementById('search-form'),
      resultsContainer: document.getElementById('results-container'),
      
      // Panels
      backCoverPanel: document.getElementById('back-cover-panel'),
      insideLeftPanel: document.getElementById('inside-left-panel'),
      insideRightPanel: document.getElementById('inside-right-panel'),
      frontCoverPanel: document.getElementById('front-cover-panel'),
      previewArea: document.getElementById('preview-area'),
      
      // Cover and branding
      frontCoverUploader: document.getElementById('front-cover-uploader'),
      brandingUploader: document.getElementById('branding-uploader'),
      generateCoverButton: document.getElementById('generate-cover-button'),
      
      // Cover mode toggle
      coverAdvancedToggle: document.getElementById('cover-advanced-toggle'),
      coverSimpleMode: document.getElementById('cover-simple-mode'),
      coverAdvancedMode: document.getElementById('cover-advanced-mode'),
      coverSimpleStyle: document.getElementById('cover-simple-style'),
      coverAdvancedStyle: document.getElementById('cover-advanced-style'),
      
      // Collage layout selector (in Settings)
      collageLayoutSelector: document.getElementById('collage-layout-selector'),
      titleBarPosition: document.getElementById('title-bar-position'),
      tiltedSettings: document.getElementById('tilted-settings'),
      tiltDegree: document.getElementById('tilt-degree'),
      tiltOffsetDirection: document.getElementById('tilt-offset-direction'),
      tiltCoverSize: document.getElementById('tilt-cover-size'),
      classicSettings: document.getElementById('classic-settings'),
      showShelvesToggle: document.getElementById('show-shelves-toggle'),
      
      // Auto-draft description toggle (branded instances only)
      autoDescriptionToggle: document.getElementById('auto-description-toggle'),
      autoDescriptionToggleRow: document.getElementById('auto-description-toggle-row'),

      // Collage cover count (12 / 16 / 20)
      collageCoverCountRadios: document.querySelectorAll('input[name="collage-cover-count"]'),
      extraCoversSection: document.getElementById('extra-covers-section'),
      extraCoversGrid: document.getElementById('extra-covers-grid'),
      extraCoversCount: document.getElementById('extra-covers-count'),
      extraCoversMax: document.getElementById('extra-covers-max'),
      extraCoversLabel: document.getElementById('extra-covers-label'),
      extraCoverSearchModal: document.getElementById('extra-cover-search-modal'),
      collageCoverHint: document.getElementById('collage-cover-hint'),
      
      // Simple mode elements
      coverTitleInput: document.getElementById('cover-title-input'),
      coverFontSelect: document.getElementById('cover-font-select'),
      coverFontSize: document.getElementById('cover-font-size'),
      coverBoldToggle: document.getElementById('cover-bold-toggle'),
      coverItalicToggle: document.getElementById('cover-italic-toggle'),
      coverTextColor: document.getElementById('cover-text-color'),
      
      // Advanced mode: 3 lines with full styling (spacing only for lines 2 and 3)
      coverLines: [
        {
          input: document.getElementById('cover-line-1'),
          font: document.getElementById('line-1-font'),
          size: document.getElementById('line-1-size'),
          bold: document.getElementById('line-1-bold'),
          italic: document.getElementById('line-1-italic'),
          color: document.getElementById('line-1-color'),
          spacing: null, // Line 1 has no spacing above it
        },
        {
          input: document.getElementById('cover-line-2'),
          font: document.getElementById('line-2-font'),
          size: document.getElementById('line-2-size'),
          bold: document.getElementById('line-2-bold'),
          italic: document.getElementById('line-2-italic'),
          color: document.getElementById('line-2-color'),
          spacing: document.getElementById('line-2-spacing'),
        },
        {
          input: document.getElementById('cover-line-3'),
          font: document.getElementById('line-3-font'),
          size: document.getElementById('line-3-size'),
          bold: document.getElementById('line-3-bold'),
          italic: document.getElementById('line-3-italic'),
          color: document.getElementById('line-3-color'),
          spacing: document.getElementById('line-3-spacing'),
        },
      ],
      
      // QR Code
      qrCodeArea: document.getElementById('qr-code-area'),
      qrUrlInput: document.getElementById('qr-url-input'),
      generateQrButton: document.getElementById('generate-qr-button'),
      qrCodeCanvas: document.getElementById('qr-code-canvas'),
      qrCodeTextArea: document.getElementById('qr-code-text'),
      
      // Toggles
      stretchCoversToggle: document.getElementById('stretch-covers-toggle'),
      stretchBlockCoversToggle: document.getElementById('stretch-block-covers-toggle'),
      toggleQrCode: document.getElementById('toggle-qr-code'),
      toggleBranding: document.getElementById('toggle-branding'),
      
      // Buttons
      exportPdfButton: document.getElementById('export-pdf-button'),
      loadListButton: document.getElementById('load-list-button'),
      saveListButton: document.getElementById('save-list-button'),
      resetBlankButton: document.getElementById('reset-blank-button'),
      loadListInput: document.getElementById('load-list-input'),
      
      // List name
      listNameInput: document.getElementById('list-name-input'),
      
      // Notification
      notificationArea: document.getElementById('notification-area'),
    };
  }
  
  // ---------------------------------------------------------------------------
  // Populate Font Dropdowns from CONFIG.FONTS (single source of truth)
  // ---------------------------------------------------------------------------
  function populateFontSelects() {
    const selects = document.querySelectorAll(
      '.font-select:not(#title-bar-position):not(#tilt-offset-direction)'
    );
    selects.forEach(select => {
      const defaultValue = select.dataset.default || '';
      select.innerHTML = '';
      CONFIG.FONTS.forEach(font => {
        const option = document.createElement('option');
        option.value = font.value;
        option.textContent = font.label;
        if (font.value === defaultValue) option.selected = true;
        select.appendChild(option);
      });
    });
  }
  
  // ---------------------------------------------------------------------------
  // Utility: Paste Handler (strips formatting, inserts plain text)
  // ---------------------------------------------------------------------------
  function handlePastePlainText(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      // Manually fire input event so oninput handlers sync the data model.
      // range.insertNode() is a programmatic DOM change that does not trigger
      // the browser's input event, so without this the book data (title,
      // authorDisplay, description) stays stale after a paste.
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  /**
   * Strips any HTML/inline styles from a contenteditable element,
   * preserving line breaks. Call this on 'input' events as a safety net.
   */
  function sanitizeContentEditable(element) {
    // Check for problematic formatting elements (not just line breaks)
    const hasFormatting = element.querySelector('span, font, b, i, u, strong, em, [style]') !== null;
    
    if (!hasFormatting) {
      return; // Only line breaks and plain text, nothing to sanitize
    }
    
    // Save cursor position relative to text length
    const selection = window.getSelection();
    let cursorOffset = 0;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      cursorOffset = preCaretRange.toString().length;
    }
    
    // Strip formatting but preserve line breaks
    // Replace formatting elements with their text content, keep <br> and <div> structure
    element.querySelectorAll('span, font, b, i, u, strong, em, [style]').forEach(el => {
      el.replaceWith(...el.childNodes);
    });
    
    // Remove any remaining style attributes
    element.querySelectorAll('[style]').forEach(el => {
      el.removeAttribute('style');
    });
    
    // Restore cursor position
    try {
      const textLength = element.textContent.length;
      const newRange = document.createRange();
      const safeOffset = Math.min(cursorOffset, textLength);
      
      // Find the text node at the cursor position
      let currentOffset = 0;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
      let node = walker.nextNode();
      
      while (node) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= safeOffset) {
          newRange.setStart(node, safeOffset - currentOffset);
          newRange.setEnd(node, safeOffset - currentOffset);
          break;
        }
        currentOffset += nodeLength;
        node = walker.nextNode();
      }
      
      if (node) {
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } catch {
      // If cursor restoration fails, just leave it
    }
  }
  
  // ---------------------------------------------------------------------------
  // Utility: Placeholder Field Management (DRY)
  // ---------------------------------------------------------------------------
  function setupPlaceholderField(element, placeholderText, options = {}) {
    const placeholderColor = options.placeholderColor || CONFIG.PLACEHOLDER_COLOR;
    const originalColor = options.originalColor || getComputedStyle(element).color;
    const useInnerText = options.useInnerText !== false; // default true for contenteditable
    
    const getText = () => useInnerText ? element.innerText : element.value;
    const setText = (val) => {
      if (useInnerText) {
        element.innerText = val;
      } else {
        element.value = val;
      }
    };
    
    // Initial state
    if (getText().trim() === placeholderText || getText().trim() === '') {
      setText(placeholderText);
      element.style.color = placeholderColor;
    }
    
    element.addEventListener('focus', () => {
      if (_isRestoring) return;
      if (getText().trim() === placeholderText) {
        setText('');
        element.style.color = originalColor;
      }
    });

    element.addEventListener('blur', () => {
      if (_isRestoring) return;
      if (getText().trim() === '') {
        setText(placeholderText);
        element.style.color = placeholderColor;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Utility: Image Compression
  // ---------------------------------------------------------------------------

  /**
   * Downscale an image data URL if it exceeds maxDimension on either axis,
   * and convert to JPEG.  Returns a Promise<string> with the compressed data URL.
   * Non-data-URL strings (e.g. placeholder URLs) pass through unchanged.
   */
  function compressImage(dataUrl, { maxDimension = 1600, quality = 0.92 } = {}) {
    return new Promise(resolve => {
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        // Calculate new dimensions (only shrink, never enlarge)
        let nw = w, nh = h;
        if (w > maxDimension || h > maxDimension) {
          const ratio = Math.min(maxDimension / w, maxDimension / h);
          nw = Math.round(w * ratio);
          nh = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = nw;
        canvas.height = nh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, nw, nh);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // ---------------------------------------------------------------------------
  // Utility: Loading State Management
  // ---------------------------------------------------------------------------
  function setLoading(element, isLoading, loadingText = null) {
    if (!element) return;
    
    if (isLoading) {
      element.classList.add('is-loading');
      element.disabled = true;
      if (loadingText && element.dataset.originalText === undefined) {
        element.dataset.originalText = element.textContent;
        element.textContent = loadingText;
      }
    } else {
      element.classList.remove('is-loading');
      element.disabled = false;
      if (element.dataset.originalText !== undefined) {
        element.textContent = element.dataset.originalText;
        delete element.dataset.originalText;
      }
    }
  }
  
  // ---------------------------------------------------------------------------
  // Notification System
  // ---------------------------------------------------------------------------
  let notificationTimeout = null;
  
  function showNotification(message, type = 'error', autoHide = true) {
    if (!elements.notificationArea) return;
    
    // Clear any existing timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
    
    elements.notificationArea.textContent = message;
    elements.notificationArea.className = type;
    elements.notificationArea.classList.add('show');
    
    if (autoHide) {
      // Success notifications auto-hide faster since they're just confirmations;
      // errors get the full duration so users have time to read them.
      const duration = type === 'success'
        ? CONFIG.NOTIFICATION_DURATION_SUCCESS_MS
        : CONFIG.NOTIFICATION_DURATION_MS;
      notificationTimeout = setTimeout(() => {
        hideNotification();
      }, duration);
    }
  }
  
  function hideNotification() {
    if (elements.notificationArea) {
      elements.notificationArea.classList.remove('show');
    }
  }
  
  // ---------------------------------------------------------------------------
  // Description Fetching
  // ---------------------------------------------------------------------------

  // Auto-draft toggle. Controls whether adding a book from search
  // auto-drafts a description. Only relevant on branded instances —
  // the public tool never drafts on add. Per-user preference persists
  // in localStorage; if the user has no preference set, falls back to
  // the per-library default from LIBRARY_CONFIG.autoDraftDescriptionsDefault
  // (settable by the super-admin in the admin console). If that's also
  // absent, falls back to on — matches the historical behavior for
  // libraries that predate this setting.
  const AUTO_DESCRIPTION_STORAGE_KEY = 'booklister.autoDraftDescriptions';

  function getLibraryAutoDescriptionDefault() {
    const cfg = window.LIBRARY_CONFIG;
    if (cfg && typeof cfg.autoDraftDescriptionsDefault === 'boolean') {
      return cfg.autoDraftDescriptionsDefault;
    }
    return true;
  }

  function getAutoDescriptionPreference() {
    try {
      const v = localStorage.getItem(AUTO_DESCRIPTION_STORAGE_KEY);
      if (v !== null) return v === 'true';
    } catch {
      // private browsing — fall through to library default
    }
    return getLibraryAutoDescriptionDefault();
  }

  function setAutoDescriptionPreference(enabled) {
    try {
      localStorage.setItem(AUTO_DESCRIPTION_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // private browsing — preference is session-only
    }
  }

  // Returns true only when (a) we're on a branded instance with a
  // library config and (b) the user hasn't turned auto-drafting off.
  // The public tool always returns false here and never calls the
  // description backend automatically.
  function shouldAutoFetchDescription() {
    if (!window.LIBRARY_CONFIG) return false;
    return getAutoDescriptionPreference();
  }

  function getAiDescription(bookKey, isTest = false) {
    const bookItem = myBooklist.find(b => b.key === bookKey);
    if (!bookItem && !isTest) {
      console.error("Description fetch failed: Could not find book with key:", bookKey);
      return;
    }
    
    const googleAppScriptUrl = "https://script.google.com/macros/s/AKfycbyhqsRgjS7aoEbYwqgN-wyygjFtGNtFdGcUOnrqXmZ7P3Aubjjwlp-HydWp4MPJxXY/exec";
    
    if (googleAppScriptUrl === "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE" || !googleAppScriptUrl) {
      const errorMsg = "Google Apps Script URL is not configured.";
      console.error(errorMsg);
      if (isTest) {
        showNotification(errorMsg, "error");
      } else if (bookItem) {
        bookItem.description = '[Description unavailable]';
        showNotification(`Could not draft description: ${errorMsg}`, 'error');
        updateDescriptionInPlace(bookKey);
        debouncedSave();
      }
      return;
    }
    
    const payload = isTest 
      ? { title: "Test Title", author: "Test Author" } 
      : { title: bookItem.title, author: bookItem.author };
    
    fetch(googleAppScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      mode: 'cors'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network error: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.description) {
        if (isTest) {
          const successMsg = `Test Success: ${data.description}`;
          console.log(successMsg);
          showNotification(successMsg, "success");
        } else {
          bookItem.description = data.description;
          updateDescriptionInPlace(bookKey);
          debouncedSave();
          // Folio: description received, back to idle
          if (window.folio) window.folio.setState('idle');
        }
      } else {
        throw new Error(data.error || 'Unknown error from description service.');
      }
    })
    .catch(error => {
      console.error('Full error object from getAiDescription:', error);
      const errorMessage = error.message || "An unknown error occurred.";
      
      if (isTest) {
        const failMsg = `Test Failed: ${errorMessage}`;
        console.error(failMsg);
        showNotification(failMsg, "error");
      } else if (bookItem) {
        bookItem.description = '[Description unavailable]';
        showNotification(`Could not draft description for "${bookItem.title}": ${errorMessage}`, 'error');
        updateDescriptionInPlace(bookKey);
        debouncedSave();
        // Folio: worried about fetch failure
        if (window.folio) {
          window.folio.react('wince');
          setTimeout(function() { if (window.folio) window.folio.setState('worried', 'fetch-failed'); }, 500);
          setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 5500);
        }
      }
    });
  }
  
  // ---------------------------------------------------------------------------
  // Book Data Management
  // ---------------------------------------------------------------------------
  function initializeBooklist() {
    myBooklist = [];
    for (let i = 0; i < CONFIG.TOTAL_SLOTS; i++) {
      myBooklist.push(BookUtils.createBlankBook());
    }
    handleLayoutChange();
    renderBooklist();
  }
  
  // ---------------------------------------------------------------------------
  // Open Library API
  // ---------------------------------------------------------------------------
  async function fetchAllCoverIdsForWork(workKey) {
    const workId = workKey.split('/').pop();
    const editionsUrl = `https://openlibrary.org/works/${workId}/editions.json?limit=${CONFIG.OPEN_LIBRARY_EDITIONS_LIMIT}`;
    
    try {
      const response = await fetch(editionsUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const coverIds = new Set();
      
      data.entries.forEach(edition => {
        if (edition.covers) {
          edition.covers.forEach(coverId => {
            if (coverId > 0) coverIds.add(coverId);
          });
        }
      });
      
      return Array.from(coverIds);
    } catch (error) {
      console.error("Error fetching edition covers:", error);
      return [];
    }
  }
  
  function getBooks(offset) {
    const resultsContainer = elements.resultsContainer;
    const perPage = CONFIG.SEARCH_RESULTS_PER_PAGE;
    const isNewSearch = typeof offset === 'undefined';
    const currentOffset = isNewSearch ? 0 : offset;

    resultsContainer.innerHTML = '<p>Searching...</p>';
    setLoading(elements.fetchButton, true, 'Searching...');

    let queryString;
    if (isNewSearch) {
      const queryParams = [];
      if (elements.keywordInput.value) queryParams.push(`q=${encodeURIComponent(elements.keywordInput.value)}`);
      if (elements.titleInput.value) queryParams.push(`title=${encodeURIComponent(elements.titleInput.value)}`);
      if (elements.authorInput.value) queryParams.push(`author=${encodeURIComponent(elements.authorInput.value)}`);
      if (elements.subjectInput.value) queryParams.push(`subject=${encodeURIComponent(elements.subjectInput.value)}`);
      if (elements.isbnInput.value) queryParams.push(`isbn=${encodeURIComponent(elements.isbnInput.value)}`);
      if (elements.publisherInput.value) queryParams.push(`publisher=${encodeURIComponent(elements.publisherInput.value)}`);
      if (elements.personInput.value) queryParams.push(`person=${encodeURIComponent(elements.personInput.value)}`);

      if (queryParams.length === 0) {
        resultsContainer.innerHTML = '<p class="error-message">Please enter at least one search term.</p>';
        setLoading(elements.fetchButton, false);
        return;
      }

      queryString = queryParams.join('&');
      searchPagination.lastQuery = queryString;
    } else {
      queryString = searchPagination.lastQuery;
    }

    const apiUrl = `${CONFIG.OPEN_LIBRARY_SEARCH_URL}?${queryString}&limit=${perPage}&offset=${currentOffset}`;

    // Folio: searching
    if (window.folio) window.folio.setState('searching', 'search-started');

    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        resultsContainer.innerHTML = '';
        const books = data.docs;
        const totalResults = data.numFound || 0;

        // Update pagination state
        searchPagination.currentOffset = currentOffset;
        searchPagination.totalResults = totalResults;

        if (books.length === 0) {
          resultsContainer.innerHTML = '<p>No results found.</p>';
          // Folio: worried about empty results
          if (window.folio) {
            window.folio.setState('worried', 'search-empty');
            setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 5000);
          }
          return;
        }

        // Folio: results found, back to idle
        if (window.folio) window.folio.setState('idle');

        books.forEach(book => {
          const bookCard = createSearchResultCard(book);
          resultsContainer.appendChild(bookCard);
        });

        // Add pagination controls
        const paginationEl = renderSearchPagination(currentOffset, totalResults, perPage);
        resultsContainer.appendChild(paginationEl);
      })
      .catch(error => {
        console.error('There was a problem:', error);
        resultsContainer.innerHTML = '<p class="error-message">Sorry, could not connect to the book server. Please check your network connection and try again.</p>';
        // Folio: worried about network error
        if (window.folio) {
          window.folio.react('wince');
          setTimeout(function() { if (window.folio) window.folio.setState('worried', 'network-error'); }, 500);
          setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 5500);
        }
      })
      .finally(() => {
        setLoading(elements.fetchButton, false);
      });
  }
  
  function renderSearchPagination(offset, totalResults, perPage) {
    const container = document.createElement('div');
    container.className = 'search-pagination';

    const currentPage = Math.floor(offset / perPage) + 1;
    const totalPages = Math.ceil(totalResults / perPage);

    const firstButton = document.createElement('button');
    firstButton.className = 'pagination-button';
    firstButton.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
    firstButton.disabled = currentPage <= 1;
    firstButton.setAttribute('aria-label', 'First page');
    firstButton.addEventListener('click', () => {
      getBooks(0);
      elements.resultsContainer.scrollTop = 0;
    });

    const prevButton = document.createElement('button');
    prevButton.className = 'pagination-button';
    prevButton.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
    prevButton.disabled = currentPage <= 1;
    prevButton.setAttribute('aria-label', 'Previous page');
    prevButton.addEventListener('click', () => {
      getBooks(offset - perPage);
      elements.resultsContainer.scrollTop = 0;
    });

    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    pageInfo.setAttribute('aria-live', 'polite');

    const nextButton = document.createElement('button');
    nextButton.className = 'pagination-button';
    nextButton.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
    nextButton.disabled = currentPage >= totalPages;
    nextButton.setAttribute('aria-label', 'Next page');
    nextButton.addEventListener('click', () => {
      getBooks(offset + perPage);
      elements.resultsContainer.scrollTop = 0;
    });

    const lastButton = document.createElement('button');
    lastButton.className = 'pagination-button';
    lastButton.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
    lastButton.disabled = currentPage >= totalPages;
    lastButton.setAttribute('aria-label', 'Last page');
    lastButton.addEventListener('click', () => {
      getBooks((totalPages - 1) * perPage);
      elements.resultsContainer.scrollTop = 0;
    });

    container.appendChild(firstButton);
    container.appendChild(prevButton);
    container.appendChild(pageInfo);
    container.appendChild(nextButton);
    container.appendChild(lastButton);

    return container;
  }

  function createSearchResultCard(book) {
    const initialCoverId = book.cover_i || 'placehold';
    
    const bookElement = document.createElement('div');
    bookElement.className = 'book-card';
    bookElement.dataset.key = book.key;
    
    // Cover carousel
    const coverCarousel = document.createElement('div');
    coverCarousel.className = 'cover-carousel';
    
    const coverElement = document.createElement('img');
    coverElement.src = BookUtils.getCoverUrl(initialCoverId, 'L');
    coverElement.alt = `Cover for ${book.title}`;
    coverElement.onerror = function() {
      this.onerror = null;
      this.src = BookUtils.getCoverUrl(initialCoverId, 'M');
    };
    coverCarousel.appendChild(coverElement);

    // Title
    const titleElement = document.createElement('p');
    titleElement.className = 'book-title';
    titleElement.textContent = book.title;
    
    // Author
    const authorElement = document.createElement('p');
    authorElement.className = 'book-author';
    const authorName = book.author_name ? book.author_name[0] : 'Unknown Author';
    authorElement.textContent = authorName;
    authorElement.title = authorName; // Tooltip for full name on hover
    
    // Actions group
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'card-actions-group';
    
    // Carousel controls
    const { carouselControls, state: carouselState } = createCarouselControls(
      coverElement, 
      initialCoverId, 
      book.key
    );
    
    // Add button
    const addButton = document.createElement('button');
    addButton.className = 'add-to-list-button';
    addButton.dataset.bookKey = book.key;
    addButton.setAttribute('aria-label', `Add "${book.title}" to booklist`);
    
    const isAlreadyAdded = myBooklist.some(item => item.key === book.key);
    if (isAlreadyAdded) {
      addButton.innerHTML = '&#10003;';
      addButton.classList.add('added');
      addButton.setAttribute('aria-label', `Remove "${book.title}" from booklist`);
    } else {
      addButton.textContent = 'Add to List';
    }
    
    addButton.addEventListener('click', () => {
      handleAddToList(book, addButton, carouselState);
    });
    
    // Assemble
    bookElement.appendChild(coverCarousel);
    bookElement.appendChild(titleElement);
    bookElement.appendChild(authorElement);
    actionsGroup.appendChild(carouselControls);
    actionsGroup.appendChild(addButton);
    bookElement.appendChild(actionsGroup);
    
    return bookElement;
  }
  
  /**
   * Creates carousel controls for browsing book cover editions.
   * Unified version — used by both main search cards and extra cover modal cards.
   * @param {HTMLElement} coverElement - The <img> to update
   * @param {string} initialCoverId - First cover ID (or 'placehold')
   * @param {string} bookKey - Open Library work key for fetching editions
   * @param {Object} [options] - Optional overrides
   * @param {boolean} [options.ariaLive=true] - Add aria-live to counter
   * @param {boolean} [options.stopPropagation=false] - Stop click event propagation
   */
  function createCarouselControls(coverElement, initialCoverId, bookKey, options) {
    const opts = options || {};
    const ariaLive = opts.ariaLive !== false;
    const stopPropagation = opts.stopPropagation || false;

    const carouselControls = document.createElement('div');
    carouselControls.className = 'carousel-controls';

    const coverCounter = document.createElement('span');
    coverCounter.className = 'cover-counter';
    coverCounter.textContent = '1 of 1';
    if (ariaLive) {
      coverCounter.setAttribute('aria-live', 'polite');
    }

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'carousel-buttons-container';

    const prevButton = document.createElement('button');
    prevButton.className = 'carousel-button';
    prevButton.textContent = '◀';
    prevButton.setAttribute('aria-label', 'Previous cover');
    prevButton.disabled = true;

    const nextButton = document.createElement('button');
    nextButton.className = 'carousel-button';
    nextButton.textContent = '▶';
    nextButton.setAttribute('aria-label', 'Next cover');
    nextButton.disabled = true;

    buttonsContainer.appendChild(prevButton);
    buttonsContainer.appendChild(nextButton);
    carouselControls.appendChild(coverCounter);
    carouselControls.appendChild(buttonsContainer);

    // Carousel state
    const state = {
      allCoverIds: [initialCoverId],
      currentCoverIndex: 0,
      coversLoaded: false
    };

    const updateCarousel = () => {
      const currentId = state.allCoverIds[state.currentCoverIndex];
      coverElement.src = BookUtils.getCoverUrl(currentId, 'L');
      coverElement.onerror = function() {
        this.onerror = null;
        this.src = BookUtils.getCoverUrl(currentId, 'M');
      };
      coverCounter.textContent = `${state.currentCoverIndex + 1} of ${state.allCoverIds.length}`;
      prevButton.disabled = state.currentCoverIndex === 0;
      nextButton.disabled = state.currentCoverIndex === state.allCoverIds.length - 1;
    };

    const loadAllCovers = async () => {
      if (state.coversLoaded || !bookKey) return;

      const fetchedCovers = await fetchAllCoverIdsForWork(bookKey);

      const finalCovers = [];
      if (initialCoverId !== 'placehold') {
        finalCovers.push(initialCoverId);
      }
      fetchedCovers.forEach(id => finalCovers.push(id));

      state.allCoverIds = [...new Set(finalCovers)];
      if (state.allCoverIds.length === 0) {
        state.allCoverIds.push('placehold');
      }

      state.coversLoaded = true;
      updateCarousel();
    };

    prevButton.addEventListener('click', async (e) => {
      if (stopPropagation) e.stopPropagation();
      if (!state.coversLoaded) await loadAllCovers();
      if (state.currentCoverIndex > 0) {
        state.currentCoverIndex--;
        updateCarousel();
      }
    });

    nextButton.addEventListener('click', async (e) => {
      if (stopPropagation) e.stopPropagation();
      if (!state.coversLoaded) await loadAllCovers();
      if (state.currentCoverIndex < state.allCoverIds.length - 1) {
        state.currentCoverIndex++;
        updateCarousel();
      }
    });

    // Pre-load covers
    if (bookKey) {
      loadAllCovers();
    }

    return { carouselControls, state };
  }
  
  function handleAddToList(book, addButton, carouselState) {
    const isAdded = myBooklist.some(item => item.key === book.key);
    const firstBlankIndex = myBooklist.findIndex((item, index) => item.isBlank && index < MAX_BOOKS);
    
    if (!isAdded) {
      if (firstBlankIndex !== -1) {
        // Only auto-star if under 12 starred books
        const currentStarredCount = BookUtils.getStarredBooks(myBooklist).length;
        
        const newBook = {
          key: book.key,
          isBlank: false,
          title: book.title,
          author: book.author_name ? book.author_name.join(', ') : 'Unknown Author',
          callNumber: CONFIG.PLACEHOLDERS.callNumber,
          authorDisplay: null, // Will be constructed on first render
          // When auto-drafting is enabled (branded instance with the
          // toggle on) we stage a "Drafting..." placeholder because the
          // auto-fetcher below is about to replace it. Otherwise — public
          // tool, or branded instance with the toggle off — the description
          // stays at the standard blank placeholder and the user writes
          // their own (or reaches for the wand button on demand).
          description: shouldAutoFetchDescription()
            ? 'Drafting book description... May take a few minutes.'
            : CONFIG.PLACEHOLDERS.description,
          cover_ids: carouselState.allCoverIds,
          currentCoverIndex: carouselState.currentCoverIndex,
          includeInCollage: currentStarredCount < CONFIG.MIN_COVERS_FOR_COLLAGE
        };
        pushUndo('add-book');
        myBooklist[firstBlankIndex] = newBook;
        addButton.innerHTML = '&#10003;';
        addButton.classList.add('added');
        addButton.setAttribute('aria-label', `Remove "${book.title}" from booklist`);

        // Folio: excited about the new book
        if (window.folio) {
          window.folio.react('nod');
          setTimeout(function() { if (window.folio) window.folio.setState('excited', 'book-added'); }, 300);
          setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
        }

        renderBooklist();
        debouncedSave();
        // Auto-draft a description on book-add when (a) we're on a
        // branded library instance AND (b) the Search-tab toggle is
        // on. The public tool never hits this path; branded users who
        // prefer to write their own descriptions flip the toggle off.
        // The magic wand button on each book remains available either
        // way — it's an explicit per-book opt-in.
        if (shouldAutoFetchDescription()) {
          getAiDescription(newBook.key);
        }
        
        // Folio: check if all slots are now filled
        if (window.folio) {
          const allFilled = myBooklist.every(function(b) { return !b.isBlank; });
          if (allFilled) {
            setTimeout(function() {
              if (window.folio) window.folio.setState('excited', 'slots-full');
              setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 5000);
            }, 4200);
          }
        }
        
        // Auto-generate if this book has a cover, is starred, and completes the required count
        const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
        if (frontCoverImg?.dataset.isAutoGenerated === 'true' && newBook.includeInCollage && carouselState.allCoverIds.length > 0) {
          const currentCount = getCollageCoverCount();
          const totalCovers = BookUtils.countTotalCovers(myBooklist, extraCollageCovers, currentCount);
          const requiredCovers = BookUtils.getRequiredCovers(currentCount);

          if (totalCovers === requiredCovers) {
            generateCoverCollage();
          }
        }
      } else {
        showNotification(`All ${MAX_BOOKS} book slots are full. Please delete one before adding another.`);
      }
    } else {
      const indexToRemove = myBooklist.findIndex(item => item.key === book.key);
      if (indexToRemove !== -1) {
        pushUndo('remove-book');
        myBooklist[indexToRemove] = BookUtils.createBlankBook();
      }
      addButton.textContent = 'Add to List';
      addButton.classList.remove('added');
      addButton.setAttribute('aria-label', `Add "${book.title}" to booklist`);
      renderBooklist();
      debouncedSave();
    }
  }
  
  // ---------------------------------------------------------------------------
  // Layout Management
  // ---------------------------------------------------------------------------
  
  /**
   * Shows or hides layout-specific settings based on currently selected layout
   * Also handles masonry-specific stretch toggle behavior
   */
  function updateTiltedSettingsVisibility() {
    const selectedLayout = elements.collageLayoutSelector?.querySelector('.layout-option.selected')?.dataset.layout || 'classic';
    
    // Show/hide layout-specific settings panels
    if (elements.tiltedSettings) {
      elements.tiltedSettings.style.display = selectedLayout === 'tilted' ? 'block' : 'none';
    }
    if (elements.classicSettings) {
      elements.classicSettings.style.display = selectedLayout === 'classic' ? 'block' : 'none';
    }
    
    // Handle masonry layout: disable stretch toggle and show hint
    const stretchToggle = elements.stretchCoversToggle;
    const masonryHint = document.getElementById('masonry-stretch-hint');
    
    if (selectedLayout === 'masonry') {
      // Disable stretch toggle for masonry (it always uses natural proportions)
      if (stretchToggle) {
        stretchToggle.disabled = true;
        stretchToggle.parentElement?.classList.add('disabled');
      }
      if (masonryHint) {
        masonryHint.style.display = 'block';
      }
    } else {
      // Re-enable stretch toggle for other layouts
      if (stretchToggle) {
        stretchToggle.disabled = false;
        stretchToggle.parentElement?.classList.remove('disabled');
      }
      if (masonryHint) {
        masonryHint.style.display = 'none';
      }
    }
    
    // Disable outer margin for layouts that set their own title bar margins
    const outerMarginInput = document.getElementById('cover-title-outer-margin');
    const outerMarginLabel = outerMarginInput?.previousElementSibling;
    const layoutsWithFixedMargin = ['masonry', 'tilted', 'staggered'];
    
    if (outerMarginInput) {
      if (layoutsWithFixedMargin.includes(selectedLayout)) {
        outerMarginInput.disabled = true;
        outerMarginInput.style.opacity = '0.5';
        if (outerMarginLabel) outerMarginLabel.style.opacity = '0.5';
      } else {
        outerMarginInput.disabled = false;
        outerMarginInput.style.opacity = '1';
        if (outerMarginLabel) outerMarginLabel.style.opacity = '1';
      }
    }
    
    // Force scroll recalculation for settings tab
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab) {
      requestAnimationFrame(() => {
        settingsTab.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          settingsTab.style.overflow = '';
        });
      });
    }
  }
  
  function handleLayoutChange() {
    const showQr = elements.toggleQrCode.checked;
    const showBranding = elements.toggleBranding.checked;

    let newMaxBooks;
    if (showQr && showBranding) {
      newMaxBooks = CONFIG.MAX_BOOKS_BOTH_ELEMENTS;
    } else if (showQr || showBranding) {
      newMaxBooks = CONFIG.MAX_BOOKS_ONE_ELEMENT;
    } else {
      newMaxBooks = CONFIG.MAX_BOOKS_FULL;
    }

    MAX_BOOKS = newMaxBooks;
    updateBackCoverVisibility();
    debouncedSave();
  }
  
  function updateBackCoverVisibility() {
    const showQr = elements.toggleQrCode.checked;
    const showBranding = elements.toggleBranding.checked;
    
    elements.qrCodeArea.style.display = showQr ? 'flex' : 'none';
    elements.brandingUploader.style.display = showBranding ? 'flex' : 'none';
    
    let extraSlotsToShow = 0;
    if (!showQr) extraSlotsToShow++;
    if (!showBranding) extraSlotsToShow++;
    
    const backCoverBooks = elements.backCoverPanel.querySelectorAll('.list-item');
    const baseBackCoverSlots = 3;
    backCoverBooks.forEach((item, index) => {
      if (index < (baseBackCoverSlots + extraSlotsToShow)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });

    // When both QR and branding are off, all slots are books;
    // add padding so descenders on the last entry aren't clipped
    elements.backCoverPanel.classList.toggle('all-books', !showQr && !showBranding);
  }
  
  // ---------------------------------------------------------------------------
  // Booklist Rendering
  // ---------------------------------------------------------------------------
  function renderBooklist() {
    // Preserve scroll position — removing and re-inserting list items in the
    // back-cover panel (which keeps QR/branding elements) can trigger the
    // browser's scroll-anchoring and snap .main-content to a new offset.
    const scrollContainer = document.querySelector('.main-content');
    const prevScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    elements.insideLeftPanel.innerHTML = '';
    elements.insideRightPanel.innerHTML = '';

    elements.backCoverPanel.querySelectorAll('.list-item').forEach(item => item.remove());
    
    myBooklist.forEach((bookItem, index) => {
      let targetPanel;
      let insertBeforeElement = null;
      
      if (index < CONFIG.SLOTS_PER_INSIDE_PANEL) {
        targetPanel = elements.insideLeftPanel;
      } else if (index < CONFIG.SLOTS_PER_INSIDE_PANEL * 2) {
        targetPanel = elements.insideRightPanel;
      } else {
        targetPanel = elements.backCoverPanel;
        insertBeforeElement = elements.qrCodeArea;
      }
      
      const listItem = createListItem(bookItem, index, targetPanel);
      
      if (insertBeforeElement) {
        targetPanel.insertBefore(listItem, insertBeforeElement);
      } else {
        targetPanel.appendChild(listItem);
      }
    });
    
    applyStyles();
    applyBlockCoverStyle();
    updateBackCoverVisibility();

    // Restore scroll position after DOM rebuild
    if (scrollContainer) scrollContainer.scrollTop = prevScrollTop;

    // Trigger autosave after each render
    debouncedSave();
  }
  
  function createListItem(bookItem, index, targetPanel) {
    const listItem = document.createElement('div');
    listItem.className = 'list-item';
    listItem.dataset.id = bookItem.key;
    listItem.dataset.isBlank = bookItem.isBlank;
    listItem.setAttribute('role', 'listitem');
    
    // Controls
    const controlsDiv = createListItemControls(bookItem, index, targetPanel);
    
    // Cover uploader
    const coverUploader = createCoverUploader(bookItem);
    
    // Details
    const detailsDiv = createListItemDetails(bookItem);
    
    listItem.appendChild(controlsDiv);
    listItem.appendChild(coverUploader);
    listItem.appendChild(detailsDiv);
    
    return listItem;
  }
  
  function createListItemControls(bookItem, index, targetPanel) {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'list-item-controls';
    
    if (targetPanel === elements.insideRightPanel) {
      controlsDiv.classList.add('controls-right');
    }
    
    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '&#9776;';
    dragHandle.setAttribute('role', 'button');
    dragHandle.setAttribute('aria-label', `Reorder book ${index + 1}. Use arrow keys to move.`);
    dragHandle.setAttribute('tabindex', '0');
    dragHandle.title = 'Drag to reorder (or use arrow keys)';
    dragHandle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (index > 0) handleBookReorder(index, index - 1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (index < MAX_BOOKS - 1) handleBookReorder(index, index + 1);
      }
    });
    
    // Star toggle (include in collage)
    const starButton = document.createElement('button');
    starButton.className = 'star-button';
    
    // Count currently starred books + extra collage covers
    const starredCount = BookUtils.getStarredBooks(myBooklist).length;
    const currentCoverCount = getCollageCoverCount();
    const isExtended = currentCoverCount > CONFIG.MIN_COVERS_FOR_COLLAGE;
    const maxCovers = currentCoverCount;
    const totalCollageCovers = starredCount + (isExtended ? extraCollageCovers.length : 0);
    const isStarred = bookItem.includeInCollage;
    const atLimit = totalCollageCovers >= maxCovers;

    if (isStarred) {
      starButton.classList.add('active');
    } else if (atLimit) {
      starButton.classList.add('disabled');
      starButton.disabled = true;
    }

    starButton.innerHTML = '<i class="fa-solid fa-star"></i>';
    starButton.title = isStarred ? 'Remove from collage' : (atLimit ? `${maxCovers} covers already selected` : 'Include in collage');
    starButton.setAttribute('aria-label', 'Toggle inclusion in cover collage');
    starButton.setAttribute('aria-pressed', isStarred ? 'true' : 'false');
    starButton.onclick = () => {
      if (!isStarred && atLimit) return; // Can't add more if at limit

      pushUndo('toggle-star');
      bookItem.includeInCollage = !bookItem.includeInCollage;
      debouncedSave();
      renderBooklist(); // Re-render to update all star states
      // Refresh the extra covers grid so "from list" slots (13-15) stay in
      // sync with the starred state. Without this, unstarring book 13 in
      // the preview leaves its cover lingering in the extras grid until
      // some other render is triggered. Guarded so 12-count mode stays
      // a no-op (the extras grid is hidden anyway).
      if (getCollageCoverCount() > CONFIG.MIN_COVERS_FOR_COLLAGE) {
        renderExtraCoversGrid();
      }
      updateExtraCoversCount(); // Update the extra covers section count

      // Folio: nod at the star toggle
      if (window.folio) window.folio.react('nod');

      // Auto-regenerate if there's already an auto-generated image and we have enough covers
      const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
      if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
        if (BookUtils.hasEnoughCoversForCollage(myBooklist, extraCollageCovers, getCollageCoverCount())) {
          generateCoverCollage();
        }
      }
    };
    
    // Magic button (fetch description)
    const magicButton = document.createElement('button');
    magicButton.className = 'magic-button';
    magicButton.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    magicButton.title = 'Draft description';
    magicButton.setAttribute('aria-label', 'Draft description for this book');
    magicButton.onclick = () => handleMagicButtonClick(bookItem);
    
    // Item number (editable input for reordering)
    const itemNumber = document.createElement('input');
    itemNumber.type = 'number';
    itemNumber.className = 'item-number';
    itemNumber.value = index + 1;
    itemNumber.min = 1;
    itemNumber.max = MAX_BOOKS;
    itemNumber.title = `Book #${index + 1} - Edit to move`;
    itemNumber.setAttribute('aria-label', `Position ${index + 1}, edit to reorder`);
    
    // Handle reordering when value changes
    itemNumber.addEventListener('change', () => {
      const newPos = parseInt(itemNumber.value, 10);
      const oldPos = index + 1;
      
      // Validate input
      if (isNaN(newPos) || newPos < 1 || newPos > MAX_BOOKS || newPos === oldPos) {
        itemNumber.value = oldPos; // Reset to current position
        return;
      }
      
      // Reorder the book
      handleBookReorder(index, newPos - 1);
    });
    
    // Select all text on focus for easy editing
    itemNumber.addEventListener('focus', () => {
      itemNumber.select();
    });
    
    // Prevent invalid characters
    itemNumber.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        itemNumber.blur();
      }
    });
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.innerHTML = '&times;';
    deleteButton.title = 'Remove from list';
    deleteButton.setAttribute('aria-label', `Remove book ${index + 1} from list`);
    deleteButton.onclick = () => handleDeleteBook(bookItem, index);
    
    controlsDiv.appendChild(dragHandle);
    controlsDiv.appendChild(magicButton);
    controlsDiv.appendChild(starButton);
    controlsDiv.appendChild(itemNumber);
    controlsDiv.appendChild(deleteButton);
    
    return controlsDiv;
  }
  
  /**
   * Updates a book's description field in the DOM without re-rendering the
   * entire booklist.  This avoids the white flash caused by tearing down and
   * recreating every cover image element.
   * @param {string} bookKey - The key of the book whose description changed.
   * @returns {boolean} true if the in-place update succeeded.
   */
  function updateDescriptionInPlace(bookKey) {
    const bookItem = myBooklist.find(b => b.key === bookKey);
    if (!bookItem) return false;

    const listItem = document.querySelector('.list-item[data-id="' + bookKey + '"]');
    if (!listItem) return false;

    const descField = listItem.querySelector('.description-field');
    if (!descField) return false;

    descField.innerText = bookItem.description;

    const isLoadingOrError = bookItem.description.includes('Drafting') ||
                             bookItem.description.includes('Description unavailable') ||
                             bookItem.description.startsWith('error:');

    if (isLoadingOrError) {
      descField.style.color = CONFIG.PLACEHOLDER_COLOR;
    } else {
      // Clear inline color override so CSS variable from applyStyles() takes effect
      descField.style.color = '';
    }

    return true;
  }

  function handleMagicButtonClick(bookItem) {
    // Description drafting is a custom-instance feature. On the public tool
    // (or any instance without a library config loaded) the button
    // shows a notice and bails instead of calling the Google Apps
    // Script. The call itself costs real money per use, so public
    // users can't trigger it.
    if (!window.LIBRARY_CONFIG) {
      showNotification(
        'This feature is available on custom library instances only.',
        'info'
      );
      return;
    }
    pushUndo('ai-description');
    const currentTitle = (bookItem.title || '').replace(/\u00a0/g, " ").trim();
    
    // Parse author from authorDisplay (lazy parsing for AI description)
    const displayText = (bookItem.authorDisplay || '').replace(/\u00a0/g, " ");

    // Remove "By " prefix if present
    let text = displayText;
    if (text.match(/^By\s/i)) {
      text = text.replace(/^By\s/i, '');
    }

    // Extract author (everything before the last ' - ')
    const lastDashIndex = text.lastIndexOf(' - ');
    let currentAuthor;
    if (lastDashIndex !== -1) {
      currentAuthor = text.substring(0, lastDashIndex).replace(/\n/g, ' ').trim();
    } else {
      currentAuthor = text.replace(/\n/g, ' ').trim();
    }
    
    // Fallback to stored author field if authorDisplay not set
    if (!currentAuthor && bookItem.author) {
      currentAuthor = bookItem.author.replace(/\u00a0/g, " ").trim();
    }
    
    if (currentAuthor.toLowerCase() === 'by') currentAuthor = '';
    
    if (!currentTitle || currentTitle === CONFIG.PLACEHOLDERS.title ||
        !currentAuthor || currentAuthor === CONFIG.PLACEHOLDERS.author) {
      showNotification('Please enter a Title and Author first.', 'error');
      return;
    }
    
    // Update bookItem.author with parsed value for getAiDescription
    bookItem.author = currentAuthor;
    
    bookItem.description = "Drafting title description... May take a few minutes.";
    updateDescriptionInPlace(bookItem.key);
    debouncedSave();
    // Folio: evaluating while fetching description
    if (window.folio) {
      window.folio.react('perk');
      window.folio.setState('evaluating', 'description-fetching');
    }
    getAiDescription(bookItem.key);
  }
  
  function handleDeleteBook(bookItem, index) {
    pushUndo('delete-book');
    const originalKey = myBooklist[index].key;
    myBooklist[index] = BookUtils.createBlankBook();
    renderBooklist();
    debouncedSave();
    
    // Folio: wince at the deletion
    if (window.folio) window.folio.react('wince');
    
    const searchButton = document.querySelector(`#results-container button[data-book-key="${originalKey}"]`);
    if (searchButton) {
      searchButton.textContent = 'Add to List';
      searchButton.classList.remove('added');
    }
  }
  
  /**
   * Reorder a book from one position to another
   * @param {number} fromIndex - Current index (0-based)
   * @param {number} toIndex - Target index (0-based)
   */
  function handleBookReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= MAX_BOOKS) return;
    if (toIndex < 0 || toIndex >= MAX_BOOKS) return;

    pushUndo('reorder');
    // Remove the book from its current position
    const [movedBook] = myBooklist.splice(fromIndex, 1);
    
    // Insert it at the new position
    myBooklist.splice(toIndex, 0, movedBook);
    
    // Re-render and save
    renderBooklist();
    debouncedSave();
    
    // Auto-regenerate if there's an auto-generated cover
    const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
    if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
      generateCoverCollage();
    }
  }
  
  function createCoverUploader(bookItem) {
    const coverUploader = document.createElement('label');
    coverUploader.className = 'cover-uploader';
    coverUploader.setAttribute('role', 'button');
    coverUploader.setAttribute('aria-label', 'Upload or change book cover');
    
    const coverImg = document.createElement('img');
    coverImg.crossOrigin = 'Anonymous';
    
    const selectedCoverId = bookItem.cover_ids && bookItem.cover_ids.length > bookItem.currentCoverIndex
      ? bookItem.cover_ids[bookItem.currentCoverIndex]
      : null;
    
    if (selectedCoverId && selectedCoverId !== 'placehold') {
      coverImg.src = `${CONFIG.OPEN_LIBRARY_COVERS_URL}${selectedCoverId}-L.jpg`;
      coverImg.onerror = function() {
        this.onerror = null;
        this.src = `${CONFIG.OPEN_LIBRARY_COVERS_URL}${selectedCoverId}-M.jpg`;
      };
    } else {
      coverImg.src = bookItem.customCoverData || CONFIG.PLACEHOLDER_COVER_URL;
    }
    
    coverImg.alt = `Cover for ${bookItem.title}`;
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.setAttribute('aria-label', 'Choose cover image file');
    
    // Shared handler for processing an image file (used by both file input and drag-drop)
    const processImageFile = (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        compressImage(event.target.result, { maxDimension: 1600 }).then(compressed => {
          const book = myBooklist.find(b => b.key === bookItem.key);
          if (!book) return; // Book was deleted while image was compressing
          pushUndo('upload-cover');
          book.customCoverData = compressed;
          book.cover_ids = [];
          book.currentCoverIndex = 0;

          // Uploading a cover to a manual entry commits the slot as a real
          // book and auto-stars it if there's room in the collage. Mirrors
          // the search-add flow, where books added from search auto-star up
          // to the collage minimum. Respects the active cover count (12,
          // 16, or 20) so users who've already filled their collage won't
          // see new stars exceed the limit.
          const wasBlank = book.isBlank;
          const wasStarred = book.includeInCollage;
          if (book.isBlank) {
            book.isBlank = false;
          }
          if (!book.includeInCollage) {
            const starredCount = BookUtils.getStarredBooks(myBooklist).length;
            const uploadCoverCount = getCollageCoverCount();
            const isExtendedUpload = uploadCoverCount > CONFIG.MIN_COVERS_FOR_COLLAGE;
            const totalCollageCovers = starredCount + (isExtendedUpload ? extraCollageCovers.length : 0);
            if (totalCollageCovers < uploadCoverCount) {
              book.includeInCollage = true;
            }
          }
          const stateChanged = wasBlank !== book.isBlank || wasStarred !== book.includeInCollage;

          coverImg.src = compressed;
          debouncedSave();

          // If we un-blanked or starred, re-render so the star button and
          // any other state-dependent UI update. Cheap compared to the
          // upload path; only fires when something actually changed.
          if (stateChanged) {
            renderBooklist();
          }

          // Folio: acknowledge cover upload
          if (window.folio) {
            window.folio.react('nod');
            setTimeout(function() { if (window.folio) window.folio.setState('excited', 'cover-uploaded'); }, 300);
            setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
          }

          // Auto-generate if this book is starred and completes the required count
          const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
          if (frontCoverImg?.dataset.isAutoGenerated === 'true' && book.includeInCollage) {
            const uploadTotalCount = getCollageCoverCount();
            if (BookUtils.countTotalCovers(myBooklist, extraCollageCovers, uploadTotalCount) === BookUtils.getRequiredCovers(uploadTotalCount)) {
              generateCoverCollage();
            }
          }
        });
      };
      reader.onerror = () => showNotification('Failed to read image file.', 'error');
      reader.readAsDataURL(file);
    };
    
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        processImageFile(file);
      }
      // Clear input so same file can be re-selected
      e.target.value = '';
    };
    
    coverUploader.appendChild(coverImg);
    coverUploader.appendChild(fileInput);
    
    // Add drag-and-drop support
    setupDragDropUpload(coverUploader, processImageFile);
    
    return coverUploader;
  }
  
  function createListItemDetails(bookItem) {
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'list-item-details';
    
    // Title field
    const titleField = document.createElement('div');
    titleField.className = 'editable-field title-field';
    titleField.contentEditable = true;
    titleField.innerText = bookItem.title;
    titleField.setAttribute('role', 'textbox');
    titleField.setAttribute('aria-label', 'Book title');
    titleField.addEventListener('paste', handlePastePlainText);
    // Pre-edit snapshot pattern (see coverTitleInput / QR text for the
    // rationale). Plain pushUndo on contenteditable input captures the
    // POST-mutation DOM, making Ctrl+Z a no-op on the first coalesced
    // edit and producing the "text doubles on undo/redo" quirk the
    // user reported. Capture on focus, commit on first input of the
    // focus session, clear on blur.
    titleField.onfocus = capturePreEditSnapshot;
    titleField.onblur = clearPreEditSnapshot;
    titleField.oninput = (e) => {
      sanitizeContentEditable(e.target);
      commitPreEditSnapshot('edit-text');
      bookItem.title = e.target.innerText;
      if (bookItem.isBlank && bookItem.title !== CONFIG.PLACEHOLDERS.title) {
        bookItem.isBlank = false;
      }
      debouncedSave();
    };
    
    // Author field
    const authorField = document.createElement('div');
    authorField.className = 'editable-field author-field';
    authorField.contentEditable = true;
    // Use authorDisplay if set, otherwise construct from author/callNumber
    if (bookItem.authorDisplay !== null && bookItem.authorDisplay !== undefined) {
      authorField.innerText = bookItem.authorDisplay;
    } else {
      authorField.innerText = bookItem.author.startsWith('[Enter')
        ? `${bookItem.author} - ${bookItem.callNumber}`
        : `By ${bookItem.author} - ${bookItem.callNumber}`;
    }
    authorField.setAttribute('role', 'textbox');
    authorField.setAttribute('aria-label', 'Author and call number');
    authorField.addEventListener('paste', handlePastePlainText);
    authorField.onfocus = capturePreEditSnapshot;
    authorField.onblur = clearPreEditSnapshot;
    authorField.oninput = (e) => {
      sanitizeContentEditable(e.target);
      commitPreEditSnapshot('edit-text');
      // Store the raw display text exactly as typed
      bookItem.authorDisplay = e.target.innerText;
      debouncedSave();
    };
    
    // Description field
    const descriptionField = document.createElement('div');
    descriptionField.className = 'editable-field description-field';
    descriptionField.contentEditable = true;
    descriptionField.innerText = bookItem.description;
    descriptionField.setAttribute('role', 'textbox');
    descriptionField.setAttribute('aria-label', 'Book description');
    descriptionField.addEventListener('paste', handlePastePlainText);
    descriptionField.onfocus = capturePreEditSnapshot;
    descriptionField.onblur = clearPreEditSnapshot;
    descriptionField.oninput = (e) => {
      sanitizeContentEditable(e.target);
      commitPreEditSnapshot('edit-text');
      bookItem.description = e.target.innerText;
      debouncedSave();
    };
    
    detailsDiv.appendChild(titleField);
    detailsDiv.appendChild(authorField);
    detailsDiv.appendChild(descriptionField);
    
    // Setup placeholders
    const titleOriginalColor = getComputedStyle(titleField).color;
    const authorOriginalColor = getComputedStyle(authorField).color;
    
    setupPlaceholderField(titleField, CONFIG.PLACEHOLDERS.title, { originalColor: titleOriginalColor });
    setupPlaceholderField(authorField, CONFIG.PLACEHOLDERS.authorWithCall, { originalColor: authorOriginalColor });
    
    // Description placeholder (special handling for loading states)
    const isLoadingOrError = bookItem.description.includes('Drafting') ||
                            bookItem.description.includes('Description unavailable') ||
                            bookItem.description.startsWith('error:');
    
    if (!isLoadingOrError) {
      setupPlaceholderField(descriptionField, CONFIG.PLACEHOLDERS.description, {
        originalColor: getComputedStyle(descriptionField).color
      });
    } else {
      descriptionField.style.color = CONFIG.PLACEHOLDER_COLOR;
    }
    
    return detailsDiv;
  }
  
  // ---------------------------------------------------------------------------
  // Color Palette Popover
  // ---------------------------------------------------------------------------

  const _palettePopovers = [];
  let _activePopover = null;

  // Library-friendly curated presets. Hand-picked for booklist design:
  // covers the full spectrum from neutral to vivid, warm to cool.
  const PRESET_COLORS = [
    '#ffffff',   // White
    '#1a202c',   // Rich Black
    '#4a5568',   // Warm Slate
    '#c53030',   // Crimson Red
    '#c05621',   // Burnt Orange
    '#d69e2e',   // Warm Amber
    '#2f855a',   // Forest Green
    '#319795',   // Teal
    '#2b6cb0',   // Marine Blue
    '#63b3ed',   // Sky Blue
    '#6b46c1',   // Royal Purple
    '#d53f8c',   // Vibrant Pink
  ];

  function getUsedColors() {
    const freq = {};
    document.querySelectorAll('input[type="color"]').forEach(input => {
      if (input.offsetParent === null) return;
      const c = (input.value || '').toLowerCase();
      if (c) freq[c] = (freq[c] || 0) + 1;
    });
    const unique = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    // Filter out colors that are already in presets — they'd be
    // redundant in the "used" section.
    return unique.filter(c => !PRESET_COLORS.includes(c)).slice(0, 5);
  }

  function closeActivePopover() {
    if (_activePopover) {
      _activePopover.classList.remove('open');
      _activePopover = null;
    }
  }

  function buildPopoverContent(popover, colorInput) {
    popover.innerHTML = '';
    const currentColor = colorInput.value.toLowerCase();

    // "Used in this booklist" section
    const usedColors = getUsedColors();
    if (usedColors.length > 0) {
      const label1 = document.createElement('div');
      label1.className = 'color-palette-section-label';
      label1.textContent = 'Used in this booklist';
      popover.appendChild(label1);

      const row1 = document.createElement('div');
      row1.className = 'color-palette-row';
      usedColors.forEach(color => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'color-palette-swatch';
        if (color === currentColor) btn.classList.add('active');
        btn.style.backgroundColor = color;
        btn.title = color.toUpperCase();
        btn.setAttribute('aria-label', 'Apply ' + color);
        btn.addEventListener('click', () => applySwatch(color, colorInput));
        row1.appendChild(btn);
      });
      popover.appendChild(row1);
    }

    // "Presets" section
    const label2 = document.createElement('div');
    label2.className = 'color-palette-section-label';
    label2.textContent = 'Presets';
    popover.appendChild(label2);

    const row2 = document.createElement('div');
    row2.className = 'color-palette-row';
    PRESET_COLORS.forEach(color => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-palette-swatch';
      if (color === currentColor) btn.classList.add('active');
      btn.style.backgroundColor = color;
      btn.title = color.toUpperCase();
      btn.setAttribute('aria-label', 'Apply ' + color);
      btn.addEventListener('click', () => applySwatch(color, colorInput));
      row2.appendChild(btn);
    });
    popover.appendChild(row2);

    // "Custom..." button
    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = 'color-palette-custom-btn';
    customBtn.textContent = 'Custom\u2026';
    customBtn.addEventListener('click', () => {
      closeActivePopover();
      colorInput.click();
    });
    popover.appendChild(customBtn);
  }

  function applySwatch(color, colorInput) {
    clearPreEditSnapshot();
    capturePreEditSnapshot();
    colorInput.value = color;
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    closeActivePopover();
  }

  function setupColorPopovers() {
    const selectors = [
      '.export-controls .form-group[data-style-group] .color-picker',
      '#cover-title-style-group .color-picker:not(.line-color)',
      '#cover-title-bg-color',
      '#cover-title-bg-color2',
    ];
    const skipIds = new Set();
    const seen = new Set();

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(picker => {
        if (seen.has(picker) || skipIds.has(picker.id)) return;
        seen.add(picker);

        // Wrap the color input + trigger in a relative container.
        // If the input was initially hidden (e.g. gradient-end color
        // when gradient is off), transfer the hidden state to the
        // wrap so the trigger button doesn't show as a stray icon.
        const wasHidden = picker.style.display === 'none';
        const wrap = document.createElement('span');
        wrap.className = 'color-palette-wrap';
        if (wasHidden) {
          wrap.style.display = 'none';
          picker.style.display = '';
        }
        picker.parentNode.insertBefore(wrap, picker);
        wrap.appendChild(picker);

        // Trigger button (small palette icon)
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'color-palette-trigger';
        trigger.innerHTML = '<i class="fa-solid fa-palette" style="font-size:0.6rem"></i>';
        trigger.title = 'Color palette';
        trigger.setAttribute('aria-label', 'Open color palette');
        wrap.appendChild(trigger);

        // Popover panel
        const popover = document.createElement('div');
        popover.className = 'color-palette-popover';
        wrap.appendChild(popover);

        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          if (_activePopover === popover) {
            closeActivePopover();
            return;
          }
          closeActivePopover();
          buildPopoverContent(popover, picker);
          popover.classList.add('open');
          _activePopover = popover;
        });

        _palettePopovers.push({ picker, popover, trigger });
      });
    });

    // Close popover on click outside
    document.addEventListener('click', (e) => {
      if (_activePopover && !e.target.closest('.color-palette-wrap')) {
        closeActivePopover();
      }
    });
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _activePopover) {
        closeActivePopover();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Style Application
  // ---------------------------------------------------------------------------
  function applyStyles() {
    document.querySelectorAll('.export-controls .form-group[data-style-group]').forEach(group => {
      const styleGroup = group.dataset.styleGroup;
      const font = group.querySelector('.font-select').value;
      const size = group.querySelector('.font-size-input').value + 'pt';
      const color = group.querySelector('.color-picker').value;
      const isBold = group.querySelector('.bold-toggle').classList.contains('active');
      const isItalic = group.querySelector('.italic-toggle').classList.contains('active');
      
      elements.previewArea.style.setProperty(`--${styleGroup}-font`, font);
      elements.previewArea.style.setProperty(`--${styleGroup}-font-size`, size);
      elements.previewArea.style.setProperty(`--${styleGroup}-color`, color);
      elements.previewArea.style.setProperty(`--${styleGroup}-font-weight`, isBold ? 'bold' : 'normal');
      elements.previewArea.style.setProperty(`--${styleGroup}-font-style`, isItalic ? 'italic' : 'normal');
      
      // Apply line spacing if present (used by QR text)
      const lineSpacingInput = group.querySelector('.line-spacing');
      if (lineSpacingInput) {
        elements.previewArea.style.setProperty(`--${styleGroup}-line-height`, lineSpacingInput.value);
      }
    });
  }
  
  function applyBlockCoverStyle() {
    const shouldStretch = elements.stretchBlockCoversToggle.checked;
    document.querySelectorAll('#preview-area .cover-uploader').forEach(uploader => {
      uploader.classList.toggle('stretch', shouldStretch);
    });
  }
  
  // ---------------------------------------------------------------------------
  // Cover Collage Generation (Extracted Functions)
  // ---------------------------------------------------------------------------
  
  /**
   * Creates a canvas configured for high-DPI cover generation
   */
  function createCollageCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 5 * CONFIG.PDF_DPI;
    canvas.height = 8 * CONFIG.PDF_DPI;
    
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    return { canvas, ctx };
  }
  
  /**
   * Extracts style settings from the cover title style group
   */
  function getCoverTitleStyles() {
    const pxPerPt = CONFIG.PDF_DPI / 72;
    const isAdvancedMode = elements.coverAdvancedToggle?.checked || false;
    const bgColor = document.getElementById('cover-title-bg-color')?.value || '#000000';
    const bgGradient = document.getElementById('cover-title-gradient-toggle')?.checked || false;
    const bgColor2 = document.getElementById('cover-title-bg-color2')?.value || '#333333';

    // Shared layout settings
    const layoutSettings = {
      bgColor,
      bgGradient,
      bgColor2,
      outerMarginPx: parseFloat(document.getElementById('cover-title-outer-margin')?.value || '10') * pxPerPt,
      padXPx: parseFloat(document.getElementById('cover-title-pad-x')?.value || '0') * pxPerPt,
      padYPx: parseFloat(document.getElementById('cover-title-pad-y')?.value || '10') * pxPerPt,
      bgSideMarginPx: parseFloat(document.getElementById('cover-title-side-margin')?.value || '0') * pxPerPt,
    };
    
    if (!isAdvancedMode) {
      // Simple mode: single text with shared styling
      const text = (elements.coverTitleInput?.value || '').trim();
      const font = elements.coverFontSelect?.value || "'Oswald', sans-serif";
      const sizePt = parseInt(elements.coverFontSize?.value || '40', 10);
      const isBold = elements.coverBoldToggle?.classList.contains('active') || false;
      const isItalic = elements.coverItalicToggle?.classList.contains('active') || false;
      const color = elements.coverTextColor?.value || '#FFFFFF';
      
      let fontStyle = '';
      if (isItalic) fontStyle += 'italic ';
      if (isBold) fontStyle += 'bold ';
      
      // Return in old format for compatibility with simple mode
      return {
        ...layoutSettings,
        isAdvancedMode: false,
        font,
        fontStyle,
        fontSizePx: sizePt * pxPerPt,
        color,
        text,
      };
    } else {
      // Advanced mode: per-line styling with individual spacing
      const lines = elements.coverLines.map((line, index) => {
        const text = (line.input?.value || '').trim();
        if (!text) return null; // Skip empty lines
        
        const font = line.font?.value || "'Oswald', sans-serif";
        const sizePt = parseInt(line.size?.value || '24', 10);
        const isBold = line.bold?.classList.contains('active') || false;
        const isItalic = line.italic?.classList.contains('active') || false;
        const color = line.color?.value || '#FFFFFF';
        
        // Get per-line spacing (only for lines 2 and 3, index 1 and 2)
        const spacingPt = (index > 0 && line.spacing) 
          ? parseFloat(line.spacing.value || '10') 
          : 0;
        
        let fontStyle = '';
        if (isItalic) fontStyle += 'italic ';
        if (isBold) fontStyle += 'bold ';
        
        return {
          text,
          font,
          fontStyle,
          sizePx: sizePt * pxPerPt,
          sizePt,
          color,
          spacingPx: spacingPt * pxPerPt,
        };
      }).filter(line => line !== null);
      
      return {
        ...layoutSettings,
        isAdvancedMode: true,
        lines,
      };
    }
  }
  
  /**
   * Text wrapping utilities for canvas
   */
  function createTextWrapper(ctx) {
    function breakLongWord(word, maxWidth) {
      const parts = [];
      let buf = '';
      for (const ch of word) {
        const test = buf + ch;
        if (ctx.measureText(test).width <= maxWidth) {
          buf = test;
        } else {
          if (buf) parts.push(buf);
          buf = ch;
        }
      }
      if (buf) parts.push(buf);
      return parts;
    }
    
    function wrapParagraph(text, maxWidth) {
      const words = text.split(/\s+/);
      const lines = [];
      let current = words[0] || '';
      
      for (let i = 1; i < words.length; i++) {
        const test = current + ' ' + words[i];
        if (ctx.measureText(test).width <= maxWidth) {
          current = test;
        } else {
          if (ctx.measureText(words[i]).width > maxWidth) {
            const parts = breakLongWord(words[i], maxWidth);
            if (current) lines.push(current);
            current = parts.shift() || '';
            lines.push(...parts.slice(0, -1));
            if (parts.length) {
              current = (current ? current + ' ' : '') + parts[parts.length - 1];
            }
          } else {
            lines.push(current);
            current = words[i];
          }
        }
      }
      if (current) lines.push(current);
      return lines;
    }
    
    function wrapTextMultiline(text, maxWidth) {
      const paragraphs = text.split(/\r?\n/);
      const lines = [];
      for (const p of paragraphs) {
        if (p.trim() === '') {
          lines.push('');
          continue;
        }
        lines.push(...wrapParagraph(p, maxWidth));
      }
      return lines;
    }
    
    return { wrapTextMultiline };
  }
  
  /**
   * Draws a single cover image, handling stretch vs. contain modes
   */
  function drawCoverImage(ctx, img, x, y, w, h, shouldStretch) {
    if (shouldStretch) {
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    
    const imgAR = img.width / img.height;
    const slotAR = w / h;
    
    if (imgAR > slotAR) {
      const dw = w;
      const dh = dw / imgAR;
      ctx.drawImage(img, x, y + (h - dh) / 2, dw, dh);
    } else {
      const dh = h;
      const dw = dh * imgAR;
      ctx.drawImage(img, x + (w - dw) / 2, y, dw, dh);
    }
  }
  
  /**
   * Waits for fonts with a timeout fallback (prevents indefinite blocking
   * if a font fails to load).
   */
  function waitForFonts(timeoutMs = 5000) {
    return Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
  }

  /**
   * Wait for all <img> elements matching the selector to finish loading
   * and be ready for html2canvas to paint. Without this, an img whose
   * src was just set but whose bytes are still in-flight over the
   * network (or still decoding) appears in the html2canvas output as
   * an empty box, because html2canvas takes a synchronous snapshot and
   * a not-yet-decoded img has naturalWidth === 0.
   *
   * Three cases per image:
   *   1. Already loaded and valid -> resolve immediately.
   *   2. Already loaded but broken (complete but naturalWidth is 0,
   *      e.g. 404) -> resolve immediately, waiting longer won't help.
   *   3. Still loading -> prefer img.decode() where supported, which
   *      returns a Promise resolving when the image is decoded and
   *      ready to paint. Fall back to onload/onerror listeners on
   *      older browsers.
   *
   * A decode failure resolves silently rather than rejecting, so a
   * single broken image can't block the whole PDF export. A per-call
   * timeout race prevents a stuck image (e.g. a remote URL on a bad
   * connection) from hanging the export indefinitely.
   */
  function waitForImagesDecoded(selector, timeoutMs = 5000) {
    const imgs = Array.from(document.querySelectorAll(selector));
    const perImagePromises = imgs.map(img => {
      if (img.complete) {
        // Already loaded (whether valid or broken). Don't block on it.
        return Promise.resolve();
      }
      if (typeof img.decode === 'function') {
        return img.decode().catch(() => { /* decode failure is non-fatal */ });
      }
      return new Promise(resolve => {
        const cleanup = () => {
          img.removeEventListener('load', onLoad);
          img.removeEventListener('error', onError);
        };
        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); resolve(); };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
      });
    });
    const allSettled = Promise.all(perImagePromises);
    const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
    return Promise.race([allSettled, timeout]);
  }

  /**
   * Loads an image from a URL
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Loads an image, trying the primary URL first and falling back to a secondary URL on failure.
   */
  function loadImageWithFallback(primarySrc, fallbackSrc) {
    return loadImage(primarySrc).catch(() => loadImage(fallbackSrc));
  }
  
  /**
   * Main collage generation function
   */
  function generateCoverCollage() {
    const thisGenId = ++_collageGenId;
    const button = elements.generateCoverButton;
    setLoading(button, true, 'Generating...');
    
    const shouldStretchCovers = elements.stretchCoversToggle.checked;
    const selectedLayout = elements.collageLayoutSelector?.querySelector('.layout-option.selected')?.dataset.layout || 'classic';
    const titleBarPosition = elements.titleBarPosition?.value || 'classic';
    
    // Tilted layout specific settings
    const tiltDegree = parseFloat(elements.tiltDegree?.value ?? '-25');
    const tiltOffsetDirection = elements.tiltOffsetDirection?.value || 'vertical';
    // Cover Size slider is a percentage (50–100). Convert to the
    // 0.5–1.0 multiplier used by drawLayoutTilted. Default 100% =
    // 1.0 = no shrink.
    const tiltCoverSizePct = parseFloat(elements.tiltCoverSize?.value ?? '100');
    const tiltCoverSize = Math.max(0.5, Math.min(1.0, (isFinite(tiltCoverSizePct) ? tiltCoverSizePct : 100) / 100));
    
    // Read the active cover count (12 / 16 / 20)
    const collageCoverCount = getCollageCoverCount();
    const isExtended = collageCoverCount > CONFIG.MIN_COVERS_FOR_COLLAGE;
    const maxCovers = collageCoverCount;

    // Gather books with covers that are marked for inclusion
    const booksWithCovers = BookUtils.getStarredBooksWithCovers(myBooklist);

    // Get cover sources from book block DOM elements (already loaded at large size)
    const bookBlockCovers = booksWithCovers.map(book => {
      const listItem = document.querySelector('.list-item[data-id="' + book.key + '"]');
      const img = listItem?.querySelector('.cover-uploader img');
      if (img && img.naturalWidth > 0) {
        return { domImg: img };
      }
      // Fallback: load from URL if DOM image not available
      return { large: BookUtils.getBookCoverUrl(book, 'L'), medium: BookUtils.getBookCoverUrl(book, 'M') };
    });

    // Get URLs from extra collage covers (only if extended mode — 16 or 20)
    const extraCoverUrls = isExtended
      ? extraCollageCovers
          .filter(ec => ec.coverData && !ec.coverData.includes('placehold.co'))
          .map(ec => ec.coverData)
      : [];

    // Combine all covers (up to max for current mode)
    const allCovers = [
      ...bookBlockCovers,
      ...extraCoverUrls.map(url => ({ large: url, medium: url }))
    ].slice(0, maxCovers);

    // Require exactly the active cover count (12, 16, or 20)
    const requiredCovers = collageCoverCount;

    if (allCovers.length < requiredCovers) {
      const starredCount = BookUtils.getStarredBooks(myBooklist).length;
      const totalWithCovers = booksWithCovers.length + extraCoverUrls.length;
      const totalSelected = starredCount + (isExtended ? extraCollageCovers.length : 0);
      
      if (totalSelected < requiredCovers) {
        showNotification(`Need ${requiredCovers} covers. Currently ${totalSelected} selected.`);
      } else {
        showNotification(`Need ${requiredCovers} covers with images. ${totalWithCovers} have covers.`);
      }
      // Folio: worried about missing covers
      if (window.folio) {
        window.folio.setState('worried', 'covers-needed');
        setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 5000);
      }
      setLoading(button, false);
      return;
    }
    
    // Use all gathered covers
    const coversToDraw = allCovers;
    
    const { canvas, ctx } = createCollageCanvas();
    const styles = getCoverTitleStyles();
    
    // Layout options object for all layouts
    const layoutOptions = {
      titleBarPosition,
      tiltDegree,
      tiltOffsetDirection,
      tiltCoverSize,
      coverCount: coversToDraw.length
    };
    
    // Wait for fonts, then load images and draw
    waitForFonts().then(() => {
      return Promise.allSettled(coversToDraw.map(c => {
        if (c.domImg) return Promise.resolve(c.domImg);
        return loadImageWithFallback(c.large, c.medium);
      }));
    }).then(results => {
      // Discard stale result if a newer generation was started (e.g. undo/redo cancelled this one)
      if (thisGenId !== _collageGenId) return;

      const images = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
      if (images.length === 0) {
        showNotification('No cover images could be loaded.', 'error');
        return;
      }
      // Draw based on selected layout
      switch (selectedLayout) {
        case 'masonry':
          drawLayoutMasonry(ctx, canvas, images, styles, layoutOptions);
          break;
        case 'staggered':
          drawLayoutStaggered(ctx, canvas, images, styles, shouldStretchCovers, layoutOptions);
          break;
        case 'tilted':
          drawLayoutTilted(ctx, canvas, images, styles, shouldStretchCovers, layoutOptions);
          break;
        case 'classic':
        default:
          // Check if shelves toggle is enabled for classic layout
          if (elements.showShelvesToggle?.checked) {
            drawLayoutBookshelf(ctx, canvas, images, styles, shouldStretchCovers, layoutOptions);
          } else {
            drawLayoutClassic(ctx, canvas, images, styles, shouldStretchCovers, layoutOptions);
          }
          break;
      }
      
      // Apply to front cover
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const frontCoverImg = elements.frontCoverUploader.querySelector('img');
      frontCoverImg.src = dataUrl;
      frontCoverImg.dataset.isPlaceholder = "false";
      frontCoverImg.dataset.isAutoGenerated = "true";
      elements.frontCoverUploader.classList.add('has-image');
      debouncedSave();
      
      // Folio: excited about the collage
      if (window.folio) {
        window.folio.setState('excited', 'collage-generated');
        setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
      }
      
    }).catch(err => {
      console.error('Cover generation failed:', err);
      showNotification('Could not generate cover. Please try again.');
      // Folio: worried about collage failure
      if (window.folio) {
        window.folio.react('wince');
        setTimeout(function() { if (window.folio) window.folio.setState('worried', 'network-error'); }, 500);
        setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 5500);
      }
    }).finally(() => {
      setLoading(button, false);
    });
  }
  
  /**
   * Draw title bar at a specific Y position
   */
  function drawTitleBarAt(ctx, styles, canvasWidth, yPosition) {
    const { wrapTextMultiline } = createTextWrapper(ctx);
    const availableTextWidth = Math.max(0, canvasWidth - 2 * styles.bgSideMarginPx - 2 * styles.padXPx);
    
    const processedLines = [];
    const defaultGapPx = 8 * (CONFIG.PDF_DPI / 72);
    
    if (!styles.isAdvancedMode) {
      if (!styles.text || styles.text.length === 0) {
        return { bgY: yPosition, bgH: 0 };
      }
      
      ctx.font = `${styles.fontStyle} ${styles.fontSizePx}px ${styles.font}, sans-serif`;
      const wrappedLines = wrapTextMultiline(styles.text, availableTextWidth);
      
      wrappedLines.forEach(wrappedText => {
        const m = ctx.measureText(wrappedText);
        const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : styles.fontSizePx * 0.8;
        const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : styles.fontSizePx * 0.2;
        processedLines.push({
          text: wrappedText,
          font: styles.font,
          fontStyle: styles.fontStyle,
          sizePx: styles.fontSizePx,
          color: styles.color,
          ascent,
          descent,
          height: ascent + descent,
          spacingPx: defaultGapPx,
        });
      });
    } else {
      if (!styles.lines || styles.lines.length === 0) {
        return { bgY: yPosition, bgH: 0 };
      }
      
      styles.lines.forEach((lineData) => {
        ctx.font = `${lineData.fontStyle} ${lineData.sizePx}px ${lineData.font}, sans-serif`;
        const wrappedLines = wrapTextMultiline(lineData.text, availableTextWidth);
        
        wrappedLines.forEach((wrappedText, wrapIndex) => {
          const m = ctx.measureText(wrappedText);
          const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : lineData.sizePx * 0.8;
          const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : lineData.sizePx * 0.2;
          processedLines.push({
            text: wrappedText,
            font: lineData.font,
            fontStyle: lineData.fontStyle,
            sizePx: lineData.sizePx,
            color: lineData.color,
            ascent,
            descent,
            height: ascent + descent,
            // Only apply spacing before the first wrapped segment of each line
            spacingPx: wrapIndex === 0 ? lineData.spacingPx : 0,
          });
        });
      });
    }
    
    if (processedLines.length === 0) {
      return { bgY: yPosition, bgH: 0 };
    }
    
    // Calculate total height with per-line spacing
    let textBlockHeight = 0;
    processedLines.forEach((line, i) => {
      if (i > 0) {
        textBlockHeight += line.spacingPx;
      }
      textBlockHeight += line.height;
    });
    
    const bgH = textBlockHeight + 2 * styles.padYPx;
    const bgX = styles.bgSideMarginPx;
    const bgY = yPosition;
    const bgW = canvasWidth - 2 * styles.bgSideMarginPx;
    
    if (styles.bgGradient) {
      const grad = ctx.createLinearGradient(bgX, bgY, bgX, bgY + bgH);
      grad.addColorStop(0, styles.bgColor);
      grad.addColorStop(1, styles.bgColor2);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = styles.bgColor;
    }
    ctx.fillRect(bgX, bgY, bgW, bgH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const centerX = bgX + bgW / 2;
    let y = bgY + styles.padYPx;
    
    processedLines.forEach((line, i) => {
      if (i > 0) {
        y += line.spacingPx;
      }
      ctx.font = `${line.fontStyle} ${line.sizePx}px ${line.font}, sans-serif`;
      ctx.fillStyle = line.color;
      const baselineY = y + line.ascent;
      ctx.fillText(line.text.trim(), centerX, baselineY);
      y += line.height;
    });
    
    return { bgY, bgH };
  }
  
  /**
   * Layout: Classic Grid
   * Grid of covers with title bar at configurable position
   * Positions: top, classic, center, lower, bottom
   * Rows are flush with top and bottom edges
   * 12 covers = 3×4 (3 cols, 4 rows), 20 covers = 4×5 (4 cols, 5 rows)
   */
  function drawLayoutClassic(ctx, canvas, images, styles, shouldStretch, options = {}) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const position = options.titleBarPosition || 'classic';

    // `margin` is the gap around the title bar. Mutable so the 16-count
    // rescue below can grow it to absorb leftover vertical space.
    let margin = styles.outerMarginPx;
    const bookAspect = 0.75; // width / height
    
    // 12 covers = 3×4, 16 covers = 4×4, 20 covers = 4×5
    const coverCount = images.length;
    const numCols = coverCount <= 12 ? 3 : 4;
    const numRows = coverCount <= 12 ? 4 : (coverCount <= 16 ? 4 : 5);

    // Determine row distribution based on position
    let rowsAbove, rowsBelow;
    switch (position) {
      case 'top': rowsAbove = 0; rowsBelow = numRows; break;
      case 'classic': rowsAbove = 1; rowsBelow = numRows - 1; break;
      case 'center': 
        rowsAbove = Math.floor(numRows / 2); 
        rowsBelow = numRows - rowsAbove; 
        break;
      case 'lower': rowsAbove = numRows - 1; rowsBelow = 1; break;
      case 'bottom': rowsAbove = numRows; rowsBelow = 0; break;
      default: rowsAbove = 1; rowsBelow = numRows - 1;
    }
    
    // First, draw title bar to get actual height
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, 0);
    // Clear it - we'll redraw at correct position
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, bgH + 1);
    
    // Calculate actual number of vGutters used
    const numVGutters = (position === 'top' || position === 'bottom') ? (numRows - 1) : 
                        (rowsAbove > 0 ? rowsAbove - 1 : 0) + (rowsBelow > 0 ? rowsBelow - 1 : 0);
    
    // Calculate available space
    const marginCount = (position === 'top' || position === 'bottom') ? 1 : 2;
    const totalVerticalSpace = canvasHeight - bgH - marginCount * margin;
    
    // Gutter ratios
    const vGutterRatio = 0.08;
    const hGutterRatio = 0.12;
    
    // Calculate slot dimensions that fit BOTH horizontally and vertically
    // Vertical constraint: totalVerticalSpace = numRows * slotHeight + numVGutters * vGutter
    // where vGutter = slotHeight * vGutterRatio
    // totalVerticalSpace = numRows * slotHeight + numVGutters * slotHeight * vGutterRatio
    // totalVerticalSpace = slotHeight * (numRows + numVGutters * vGutterRatio)
    const slotHeightFromVertical = totalVerticalSpace / (numRows + numVGutters * vGutterRatio);
    const slotWidthFromVertical = slotHeightFromVertical * bookAspect;
    
    // Horizontal constraint: canvasWidth = numCols * slotWidth + (numCols + 1) * hGutter
    // where hGutter = slotWidth * hGutterRatio
    // canvasWidth = numCols * slotWidth + (numCols + 1) * slotWidth * hGutterRatio
    // canvasWidth = slotWidth * (numCols + (numCols + 1) * hGutterRatio)
    const slotWidthFromHorizontal = canvasWidth / (numCols + (numCols + 1) * hGutterRatio);
    const slotHeightFromHorizontal = slotWidthFromHorizontal / bookAspect;
    
    // Use the smaller of the two to ensure fit
    let slotWidth, slotHeight;
    if (slotWidthFromVertical <= slotWidthFromHorizontal) {
      slotWidth = slotWidthFromVertical;
      slotHeight = slotHeightFromVertical;
    } else {
      slotWidth = slotWidthFromHorizontal;
      slotHeight = slotHeightFromHorizontal;
    }

    // Horizontally-constrained rescue: if the slot hit its canvas-width
    // cap before it hit the vertical cap (16-count Classic is the only
    // count where this happens), let it grow toward the vertical ideal
    // by tightening horizontal gutters. This absorbs some of the
    // vertical leftover into slot size instead of dumping it all into
    // vGutter, which was making the rows look floaty at short title
    // bars. Stops growing when hGutter hits a minimum so covers never
    // touch. For 12 and 20 counts slotWidthFromVertical is already
    // <= slotWidthFromHorizontal so this branch is a no-op.
    if (slotWidthFromHorizontal < slotWidthFromVertical) {
      const minHGutter = 4 * (CONFIG.PDF_DPI / 72); // ~33 px at 600 DPI
      const maxSlotWidth = (canvasWidth - (numCols + 1) * minHGutter) / numCols;
      const grownSlotWidth = Math.min(slotWidthFromVertical, maxSlotWidth);
      if (grownSlotWidth > slotWidth) {
        slotWidth = grownSlotWidth;
        slotHeight = slotWidth / bookAspect;
      }
    }

    // Calculate actual gutters
    let vGutter = slotHeight * vGutterRatio;
    const hGutter = (canvasWidth - numCols * slotWidth) / (numCols + 1);

    // Balanced leftover redistribution (targets the 16-count case).
    // After the horizontal rescue above, there may still be vertical
    // space unaccounted for between the rows, the title bar, and its
    // margins. Split that leftover between inter-row vGutters and
    // title-bar margins.
    //
    // The split skews toward vGutters (60/40 instead of 50/50) so
    // 16-count Classic rows feel less tightly packed — per user
    // feedback the pre-skew balance left the rows visually cramped
    // against each other. The 60/40 ratio scales with the leftover
    // amount, so at short title bars (large leftover) the extra
    // breathing room is more pronounced; at tall title bars (small
    // leftover) the shift is subtle. For 12 and 20 counts the
    // leftover is ~0 (vertically-constrained slot fills exactly)
    // and the guard below skips entirely.
    if (numVGutters > 0 && marginCount > 0) {
      const availableHeight = canvasHeight - bgH;
      const usedHeight = numRows * slotHeight + numVGutters * vGutter + marginCount * margin;
      const leftover = availableHeight - usedHeight;
      if (leftover > 1) {
        const gutterShare = leftover * 0.6;
        const marginShare = leftover * 0.4;
        vGutter += gutterShare / numVGutters;
        margin += marginShare / marginCount;
      }
    } else if (numVGutters > 0) {
      // Fallback for exotic position/row counts where there are no
      // title bar margins to absorb half. Dump it all into vGutters.
      const usedHeight = numRows * slotHeight + numVGutters * vGutter;
      const leftover = totalVerticalSpace - usedHeight;
      if (leftover > 1) {
        vGutter += leftover / numVGutters;
      }
    }
    
    // Calculate title bar position based on uniform slot height
    let titleY;
    if (position === 'top') {
      titleY = 0;
    } else if (position === 'bottom') {
      titleY = canvasHeight - bgH;
    } else {
      // Middle positions: title bar comes after rowsAbove rows + margin
      const aboveHeight = rowsAbove * slotHeight + (rowsAbove > 0 ? (rowsAbove - 1) * vGutter : 0);
      titleY = aboveHeight + margin;
    }
    
    // Draw rows above title bar (flush at top)
    let imageIndex = 0;
    
    if (rowsAbove > 0) {
      let currentY = 0; // Start flush at top
      for (let row = 0; row < rowsAbove && imageIndex < images.length; row++) {
        for (let col = 0; col < numCols && imageIndex < images.length; col++) {
          const slotX = hGutter + col * (slotWidth + hGutter);
          drawCoverImage(ctx, images[imageIndex], slotX, currentY, slotWidth, slotHeight, shouldStretch);
          imageIndex++;
        }
        currentY += slotHeight + vGutter;
      }
    }
    
    // Draw title bar at correct position
    drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Draw rows below title bar (flush at bottom)
    if (rowsBelow > 0) {
      // Work backwards from bottom to ensure flush
      const belowTotalHeight = rowsBelow * slotHeight + (rowsBelow > 0 ? (rowsBelow - 1) * vGutter : 0);
      let currentY = canvasHeight - belowTotalHeight; // Start so last row ends at bottom
      
      for (let row = 0; row < rowsBelow && imageIndex < images.length; row++) {
        for (let col = 0; col < numCols && imageIndex < images.length; col++) {
          const slotX = hGutter + col * (slotWidth + hGutter);
          drawCoverImage(ctx, images[imageIndex], slotX, currentY, slotWidth, slotHeight, shouldStretch);
          imageIndex++;
        }
        currentY += slotHeight + vGutter;
      }
    }
  }
  
  /**
   * Layout: Bookshelf
   * Grid of covers with shelf lines under each row
   * Title bar at configurable position
   * Rows are flush with top and bottom edges
   * 12 covers = 3×4 (3 cols, 4 rows), 20 covers = 4×5 (4 cols, 5 rows)
   */
  function drawLayoutBookshelf(ctx, canvas, images, styles, shouldStretch, options = {}) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const position = options.titleBarPosition || 'classic';
    
    const shelfLineWidth = 6 * (CONFIG.PDF_DPI / 72);
    const shelfColor = '#5D4037';
    const shelfOverhang = 20 * (CONFIG.PDF_DPI / 72);
    // `margin` is the gap around the title bar. Mutable so the 16-count
    // rescue below can grow it to absorb leftover vertical space.
    let margin = styles.outerMarginPx;

    const bookAspect = 0.75;
    
    // 12 covers = 3×4, 16 covers = 4×4, 20 covers = 4×5
    const coverCount = images.length;
    const numCols = coverCount <= 12 ? 3 : 4;
    const numRows = coverCount <= 12 ? 4 : (coverCount <= 16 ? 4 : 5);

    // Determine row distribution
    let rowsAbove, rowsBelow;
    switch (position) {
      case 'top': rowsAbove = 0; rowsBelow = numRows; break;
      case 'classic': rowsAbove = 1; rowsBelow = numRows - 1; break;
      case 'center':
        rowsAbove = Math.floor(numRows / 2);
        rowsBelow = numRows - rowsAbove;
        break;
      case 'lower': rowsAbove = numRows - 1; rowsBelow = 1; break;
      case 'bottom': rowsAbove = numRows; rowsBelow = 0; break;
      default: rowsAbove = 1; rowsBelow = numRows - 1;
    }
    
    // First, draw title bar to get actual height
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, 0);
    // Clear it - we'll redraw at correct position
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, bgH + 1);
    
    // All rows have shelves underneath
    const numShelves = numRows;
    const totalShelfHeight = numShelves * shelfLineWidth;
    
    // Calculate actual number of vGutters used
    const numVGutters = (position === 'top' || position === 'bottom') ? (numRows - 1) : 
                        (rowsAbove > 0 ? rowsAbove - 1 : 0) + (rowsBelow > 0 ? rowsBelow - 1 : 0);
    
    // Calculate available space
    const marginCount = (position === 'top' || position === 'bottom') ? 1 : 2;
    const totalVerticalSpace = canvasHeight - bgH - marginCount * margin - totalShelfHeight;
    
    // Gutter ratios
    const vGutterRatio = 0.05;
    const hGutterRatio = 0.12;
    
    // Calculate slot dimensions that fit BOTH horizontally and vertically
    const slotHeightFromVertical = totalVerticalSpace / (numRows + numVGutters * vGutterRatio);
    const slotWidthFromVertical = slotHeightFromVertical * bookAspect;
    
    const slotWidthFromHorizontal = canvasWidth / (numCols + (numCols + 1) * hGutterRatio);
    const slotHeightFromHorizontal = slotWidthFromHorizontal / bookAspect;
    
    // Use the smaller to ensure fit
    let slotWidth, slotHeight;
    if (slotWidthFromVertical <= slotWidthFromHorizontal) {
      slotWidth = slotWidthFromVertical;
      slotHeight = slotHeightFromVertical;
    } else {
      slotWidth = slotWidthFromHorizontal;
      slotHeight = slotHeightFromHorizontal;
    }

    // Horizontally-constrained rescue for 16-count (see drawLayoutClassic
    // for the full rationale). Same mechanism: let the slot grow toward
    // the vertical ideal by tightening hGutter, stopping at a minimum
    // so covers don't touch. No-op for 12 and 20 counts.
    if (slotWidthFromHorizontal < slotWidthFromVertical) {
      const minHGutter = 4 * (CONFIG.PDF_DPI / 72); // ~33 px at 600 DPI
      const maxSlotWidth = (canvasWidth - (numCols + 1) * minHGutter) / numCols;
      const grownSlotWidth = Math.min(slotWidthFromVertical, maxSlotWidth);
      if (grownSlotWidth > slotWidth) {
        slotWidth = grownSlotWidth;
        slotHeight = slotWidth / bookAspect;
      }
    }

    let vGutter = slotHeight * vGutterRatio;
    const hGutter = (canvasWidth - numCols * slotWidth) / (numCols + 1);

    // Balanced leftover redistribution (see drawLayoutClassic for the
    // full rationale). Split any remaining vertical space between
    // inter-row vGutters and title-bar margins. Uses the same 60/40
    // skew toward vGutters as Classic does, so 16-count Bookshelf
    // rows feel less tightly packed to match. Shelves are added to
    // usedHeight here since they're a real vertical cost (each row
    // pairs its slot with a shelf underneath). No-op for 12 and 20
    // counts.
    if (numVGutters > 0 && marginCount > 0) {
      const availableHeight = canvasHeight - bgH;
      const usedHeight = numRows * slotHeight + numVGutters * vGutter + marginCount * margin + totalShelfHeight;
      const leftover = availableHeight - usedHeight;
      if (leftover > 1) {
        const gutterShare = leftover * 0.6;
        const marginShare = leftover * 0.4;
        vGutter += gutterShare / numVGutters;
        margin += marginShare / marginCount;
      }
    } else if (numVGutters > 0) {
      // Fallback for exotic positions with no title bar margins.
      const usedHeight = numRows * slotHeight + numVGutters * vGutter;
      const leftover = totalVerticalSpace - usedHeight;
      if (leftover > 1) {
        vGutter += leftover / numVGutters;
      }
    }

    // Helper to draw a row with shelf (handles partial rows)
    let globalImageIndex = 0;
    const drawRowWithShelf = (rowY, height) => {
      const coversInRow = Math.min(numCols, images.length - globalImageIndex);
      for (let col = 0; col < coversInRow; col++) {
        const slotX = hGutter + col * (slotWidth + hGutter);
        drawCoverImage(ctx, images[globalImageIndex], slotX, rowY, slotWidth, height, shouldStretch);
        globalImageIndex++;
      }
      // Shelf under the row
      const shelfY = rowY + height;
      ctx.fillStyle = shelfColor;
      ctx.fillRect(hGutter - shelfOverhang, shelfY, canvasWidth - 2 * hGutter + 2 * shelfOverhang, shelfLineWidth);
    };
    
    // Calculate title bar position based on uniform slot height
    let titleY;
    if (position === 'top') {
      titleY = 0;
    } else if (position === 'bottom') {
      titleY = canvasHeight - bgH;
    } else {
      // Middle positions: title bar comes after rowsAbove rows (each with book + shelf) + vGutters + margin
      const aboveHeight = rowsAbove * (slotHeight + shelfLineWidth) + (rowsAbove > 0 ? (rowsAbove - 1) * vGutter : 0);
      titleY = aboveHeight + margin;
    }
    
    // Draw rows above title bar (flush at top)
    if (rowsAbove > 0) {
      let currentY = 0; // Start flush at top
      for (let row = 0; row < rowsAbove && globalImageIndex < images.length; row++) {
        drawRowWithShelf(currentY, slotHeight);
        currentY += slotHeight + shelfLineWidth + vGutter;
      }
    }
    
    // Draw title bar at correct position
    drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Draw rows below title bar (flush at bottom)
    if (rowsBelow > 0) {
      // Work backwards from bottom to ensure flush
      const belowTotalHeight = rowsBelow * (slotHeight + shelfLineWidth) + (rowsBelow > 0 ? (rowsBelow - 1) * vGutter : 0);
      let currentY = canvasHeight - belowTotalHeight;
      
      for (let row = 0; row < rowsBelow && globalImageIndex < images.length; row++) {
        drawRowWithShelf(currentY, slotHeight);
        currentY += slotHeight + shelfLineWidth + vGutter;
      }
    }
  }
  
  /**
   * Layout: Staggered
   * Brick pattern with gutters, every row fills edge-to-edge (covers bleed off edges)
   * Title bar at configurable position
   * Rows are flush with top and bottom edges
   * 12 covers = 4 rows (3 per row), 20 covers = 5 rows (4 per row)
   */
  function drawLayoutStaggered(ctx, canvas, images, styles, shouldStretch, options = {}) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const position = options.titleBarPosition || 'center';
    
    const bookAspect = 0.667;
    const hGutter = 6 * (CONFIG.PDF_DPI / 72);
    const vGutter = 6 * (CONFIG.PDF_DPI / 72);
    const titleGutter = 8 * (CONFIG.PDF_DPI / 72);
    
    // Dynamic rows: 4 for 12 covers, 5 for 16 or 20 covers.
    // 16-count uses 5 rows (like 20) so the rows are denser and the
    // visual reads more like the higher-count mode the user wanted.
    const coverCount = images.length;
    const numRows = coverCount <= 12 ? 4 : 5;
    
    // Determine row distribution
    let rowsAbove, rowsBelow;
    switch (position) {
      case 'top': rowsAbove = 0; rowsBelow = numRows; break;
      case 'classic': rowsAbove = 1; rowsBelow = numRows - 1; break;
      case 'center': 
        rowsAbove = Math.floor(numRows / 2); 
        rowsBelow = numRows - rowsAbove; 
        break;
      case 'lower': rowsAbove = numRows - 1; rowsBelow = 1; break;
      case 'bottom': rowsAbove = numRows; rowsBelow = 0; break;
      default: rowsAbove = Math.floor(numRows / 2); rowsBelow = numRows - rowsAbove;
    }
    
    // Calculate offset per row to ensure all covers appear.
    // Floor instead of ceil matters for 16-count specifically: with
    // ceil(16/5)=4, row 4's offset (4*4=16) wraps to 0, making rows
    // 0 and 4 identical. With floor(16/5)=3 the offsets are 0,3,6,9,12
    // — all distinct mod 16. For 12 and 20 counts floor == ceil
    // (integer division: 12/4=3, 20/5=4), so this is a no-op.
    const imageOffsetPerRow = Math.floor(images.length / numRows);
    
    // Helper to draw a row filling edge-to-edge with partial covers bleeding off both edges
    const drawBrickRow = (y, h, useOffset, imgOffset) => {
      if (shouldStretch) {
        // === LEGACY STRETCHED PATH ===
        // Uniform cover width (h * bookAspect), fixed count, centered
        // with optional stagger offset. Unchanged from pre-feature.
        const w = h * bookAspect;
        const spacing = w + hGutter;

        const coversNeeded = Math.ceil(canvasWidth / spacing) + 2;
        const totalWidth = coversNeeded * w + (coversNeeded - 1) * hGutter;

        let startX = (canvasWidth - totalWidth) / 2;
        if (useOffset) {
          startX -= spacing / 2;
        }

        for (let i = 0; i < coversNeeded; i++) {
          const imgIdx = (imgOffset + i) % images.length;
          const x = startX + i * spacing;
          drawCoverImage(ctx, images[imgIdx], x, y, w, h, shouldStretch);
        }
      } else {
        // === MASONRY-PACK PATH ===
        //
        // --- TUNING NOTES ------------------------------------------------
        // If a library gives feedback on how the masonry-pack mode looks
        // in Staggered, these are the knobs worth touching (in order of
        // likelihood):
        //
        // hGutter (6pt, near top of drawLayoutStaggered): horizontal
        //   spacing between packed covers in a row. Tighten to 3-4pt for
        //   a denser "pinboard" feel; loosen to 8-10pt for more breathing
        //   room.
        //
        // Left bleed start (`cursor = -h`): one row-height of bleed past
        //   the left edge. Tighten to `-h * 0.5` to pull the leftmost
        //   cover onto the canvas; loosen to `-h * 1.5` for more bleed.
        //
        // Right bleed end (`canvasWidth + h`): same idea on the right.
        //   Both edges should usually be adjusted symmetrically.
        //
        // maxIterPerRow (200): safety cap, not a tuning knob. Only trips
        //   if the dimension fallback fails, which shouldn't happen in
        //   practice.
        //
        // The motivating use case is children's / YA collections where
        // cover aspect ratios vary widely (square picture books, tall
        // middle-grade paperbacks, slim YA). Adult fiction lists with
        // uniform trade-paperback covers will look nearly identical to
        // stretch-on mode. Staggered in particular tends to look better
        // with stretch-on for uniform-aspect collections; the masonry
        // path is mainly valuable when cover sizes vary.
        // ------------------------------------------------------------------
        //
        // Each cover in the row has a variable width derived from its
        // natural aspect ratio; row height stays uniform at h. Alternate
        // rows get a half-cover-width stagger offset to preserve the
        // brick pattern. Covers bleed off left and right edges via a
        // cursor-based loop.
        //
        // Cycling logic (imgOffset + i pattern) is preserved identically
        // from the stretched path above: cover at position i in the row
        // is the same book regardless of stretch mode — just packed
        // tighter with aspect-ratio-preserving width.
        const fallbackW = h * bookAspect;
        let cursor = -h; // one row-height of bleed past the left edge
        // Apply a half-cover-width offset on alternate rows to
        // preserve the brick-pattern stagger, even with variable-
        // width masonry covers. Uses the uniform slot width
        // (h * bookAspect) as the offset basis — same as the
        // stretch path — since per-cover widths vary.
        if (useOffset) {
          cursor -= (fallbackW + hGutter) / 2;
        }
        let i = 0;
        const maxIterPerRow = 200;

        while (cursor < canvasWidth + h && i < maxIterPerRow) {
          const imgIdx = (imgOffset + i) % images.length;
          const img = images[imgIdx];

          // Per-cover width from natural aspect ratio. Defensive fallback
          // to fallbackW if the image isn't loaded or has zero natural
          // dimensions — prevents infinite loops on pathological covers.
          let drawW;
          if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
            drawW = h * (img.naturalWidth / img.naturalHeight);
          } else {
            drawW = fallbackW;
          }
          if (!(drawW > 0)) drawW = fallbackW;

          // drawW was computed to match the cover's natural aspect at row
          // height h, so stretch-to-fit into (drawW, h) is equivalent to
          // aspect-fit. Pass shouldStretch=true here so drawCoverImage
          // uses the cheap 4-arg draw path and the fallback-on-missing
          // branch still fires for unloaded images.
          drawCoverImage(ctx, img, cursor, y, drawW, h, true);

          cursor += drawW + hGutter;
          i++;
        }
      }
    };
    
    // First, draw title bar to get actual height
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, 0);
    // Clear it - we'll redraw at correct position
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, bgH + 1);
    
    // Calculate actual number of vGutters used
    const numVGutters = (position === 'top' || position === 'bottom') ? (numRows - 1) : 
                        (rowsAbove > 0 ? rowsAbove - 1 : 0) + (rowsBelow > 0 ? rowsBelow - 1 : 0);
    
    // Calculate uniform slot height based on actual bgH and vGutter count
    const marginCount = (position === 'top' || position === 'bottom') ? 1 : 2;
    const totalRowSpace = canvasHeight - bgH - marginCount * titleGutter;
    const uniformSlotHeight = (totalRowSpace - numVGutters * vGutter) / numRows;
    
    // Calculate title bar position based on uniform slot height
    let titleY;
    if (position === 'top') {
      titleY = 0;
    } else if (position === 'bottom') {
      titleY = canvasHeight - bgH;
    } else {
      // Middle positions: title bar comes after rowsAbove rows + titleGutter
      const aboveHeight = rowsAbove * uniformSlotHeight + (rowsAbove > 0 ? (rowsAbove - 1) * vGutter : 0);
      titleY = aboveHeight + titleGutter;
    }
    
    // Draw rows above title bar (flush at top)
    let globalRowIndex = 0;
    let imageOffset = 0;
    
    if (rowsAbove > 0) {
      let currentY = 0; // Start flush at top
      for (let row = 0; row < rowsAbove; row++) {
        const shouldOffset = globalRowIndex % 2 === 1;
        drawBrickRow(currentY, uniformSlotHeight, shouldOffset, imageOffset);
        imageOffset += imageOffsetPerRow;
        globalRowIndex++;
        currentY += uniformSlotHeight + vGutter;
      }
    }
    
    // Draw title bar at correct position
    drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Draw rows below title bar (flush at bottom)
    if (rowsBelow > 0) {
      // Work backwards from bottom to ensure flush
      const belowTotalHeight = rowsBelow * uniformSlotHeight + (rowsBelow > 0 ? (rowsBelow - 1) * vGutter : 0);
      let currentY = canvasHeight - belowTotalHeight; // Start so last row ends at bottom
      
      for (let row = 0; row < rowsBelow; row++) {
        const shouldOffset = globalRowIndex % 2 === 1;
        drawBrickRow(currentY, uniformSlotHeight, shouldOffset, imageOffset);
        imageOffset += imageOffsetPerRow;
        globalRowIndex++;
        currentY += uniformSlotHeight + vGutter;
      }
    }
  }
  
  /**
   * Layout: Tilted
   * A staggered grid rotated at configurable angle, with partial covers
   * bleeding off edges to fill the white space created by rotation.
   * Stagger direction can be vertical (columns offset) or horizontal (rows offset).
   * Title bar draws ON TOP with white margin background.
   */
  function drawLayoutTilted(ctx, canvas, images, styles, shouldStretch, options = {}) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const position = options.titleBarPosition || 'center';
    
    const bookAspect = 0.667;
    
    // Rotation angle from options (negative = counter-clockwise)
    const rotationDeg = options.tiltDegree ?? -25;
    const rotationRad = rotationDeg * (Math.PI / 180);
    const cosA = Math.cos(rotationRad);
    const sinA = Math.sin(rotationRad);
    
    // Offset direction from options
    const offsetDirection = options.tiltOffsetDirection || 'vertical';
    
    // Gutters
    const hGutter = 6 * (CONFIG.PDF_DPI / 72);
    const vGutter = 6 * (CONFIG.PDF_DPI / 72);
    const titleGutter = 8 * (CONFIG.PDF_DPI / 72);
    
    // Get actual title bar height first
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, 0);
    // Clear it - we'll redraw at correct position after covers
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, bgH + 1);
    
    // Calculate title bar Y position based on position setting using actual bgH
    let titleY;
    switch (position) {
      case 'top':
        titleY = 0;
        break;
      case 'classic':
        // About 1/4 down from top
        titleY = (canvasHeight - bgH) * 0.25;
        break;
      case 'center':
        titleY = (canvasHeight - bgH) / 2;
        break;
      case 'lower':
        // About 3/4 down from top
        titleY = (canvasHeight - bgH) * 0.75;
        break;
      case 'bottom':
        titleY = canvasHeight - bgH;
        break;
      default:
        titleY = (canvasHeight - bgH) / 2;
    }
    
    // Calculate cover size.
    //
    // The base formula sizes slots to fill two "sections" (above and
    // below the title bar) with 2.5 rows each. tiltedShrinkFactor is
    // a uniform post-scale that tightens every cover in both
    // dimensions — 0.95 = 5% smaller per dimension (~9.75% smaller
    // in area), 1.0 = full size. The user exposes this as a "Cover
    // Size (%)" setting in the Tilted Layout Settings panel (50–100
    // percent, default 100). Shrinking can help maximize the number
    // of unique books visible in the rotated grid since smaller
    // slots mean more cells fit on screen at a given tilt angle.
    // Applies uniformly across 12/16/20 counts and all title bar
    // positions.
    const sectionHeight = (canvasHeight - bgH - 2 * titleGutter) / 2;
    const rowsPerSection = 2.5;
    const tiltedShrinkFactor = (typeof options.tiltCoverSize === 'number' && options.tiltCoverSize > 0)
      ? options.tiltCoverSize
      : 1.0;
    const slotHeight = ((sectionHeight - (rowsPerSection - 1) * vGutter) / rowsPerSection) * tiltedShrinkFactor;
    const slotWidth = slotHeight * bookAspect;
    
    // Spacing between cover centers
    const hStep = slotWidth + hGutter;
    const vStep = slotHeight + vGutter;
    
    // Stagger offset (half a cover dimension)
    const staggerOffset = (offsetDirection === 'vertical') ? vStep / 2 : hStep / 2;
    
    // Center of canvas (rotation pivot point)
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    // Helper: rotate a point around canvas center
    const rotatePoint = (x, y) => {
      const dx = x - centerX;
      const dy = y - centerY;
      return {
        x: centerX + dx * cosA - dy * sinA,
        y: centerY + dx * sinA + dy * cosA
      };
    };
    
    // Helper: check if a rotated rectangle intersects the canvas
    const coverIntersectsBand = (cx, cy, bandTop, bandBottom) => {
      const hw = slotWidth / 2;
      const hh = slotHeight / 2;
      const corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh }
      ].map(c => ({
        x: cx + c.x * cosA - c.y * sinA,
        y: cy + c.x * sinA + c.y * cosA
      }));
      
      const minY = Math.min(...corners.map(c => c.y));
      const maxY = Math.max(...corners.map(c => c.y));
      const minX = Math.min(...corners.map(c => c.x));
      const maxX = Math.max(...corners.map(c => c.x));
      
      return maxX > 0 && minX < canvasWidth && maxY > bandTop && minY < bandBottom;
    };
    
    // Helper: draw a cover at rotated position
    const drawRotatedCover = (img, cx, cy) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotationRad);
      
      if (img && img.complete && img.naturalWidth > 0) {
        if (shouldStretch) {
          ctx.drawImage(img, -slotWidth / 2, -slotHeight / 2, slotWidth, slotHeight);
        } else {
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const slotAspect = slotWidth / slotHeight;
          let drawW, drawH;
          
          if (imgAspect > slotAspect) {
            drawW = slotWidth;
            drawH = slotWidth / imgAspect;
          } else {
            drawH = slotHeight;
            drawW = slotHeight * imgAspect;
          }
          
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        }
      } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(-slotWidth / 2, -slotHeight / 2, slotWidth, slotHeight);
      }
      
      ctx.restore();
    };
    
    // Calculate grid size needed to cover canvas after rotation
    const canvasDiag = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
    const gridExtent = canvasDiag * 0.8;
    
    const numCols = Math.ceil(gridExtent * 2 / hStep) + 2;
    const numRows = 12; // Enough rows to show all covers per column
    
    // Grid origin (top-left of virtual unrotated grid, centered on canvas)
    const gridOriginX = centerX - (numCols * hStep) / 2;
    const gridOriginY = centerY - (numRows * vStep) / 2;
    
    // Deterministic image selection based on cover count, offset
    // direction, and title bar position. 16-count and 20-count share
    // the same overall shape: a sequential pattern for horizontal
    // non-center, a doubled-row pattern for horizontal center, and a
    // col-shuffled pattern for vertical. The only differences are
    // books-per-row (4 for 16-count, 5 for 20-count) and the choice
    // to use 12-count-style vertical for 16-count. 12-count has its
    // own 3×4 patterns. The outer `% totalImages` wrap at the bottom
    // is a defensive safety net.
    const totalImages = images.length;
    const useRegularSequential = (totalImages === 20 || totalImages === 16)
      && position !== 'center'
      && offsetDirection === 'horizontal';

    const getImageForCell = (row, col) => {
      let idx;
      // Sequential row-group order for 16 and 20 count horizontal
      // non-center. 4 rows of N books (N=5 for 20-count, N=4 for
      // 16-count) cycle through the full list, then the pattern
      // repeats every 4 rows. For 16-count specifically, add a
      // period-3 coprime col offset so row 0 and row 4 contain the
      // same 4 books in a DIFFERENT order, extending the visual
      // cycle from 4 rows to LCM(4,3)=12 rows. 20-count doesn't
      // need the offset (5 books per row is enough variety for the
      // visible row count in Tilted).
      if (useRegularSequential) {
        const booksPerRow = totalImages === 20 ? 5 : 4;
        const rowGroup = (row % 4) * booksPerRow;
        const colOffset = totalImages === 16 ? row % 3 : 0;
        idx = rowGroup + ((col + colOffset) % booksPerRow);
      } else if (totalImages <= 12) {
        // 12-count: 3 row groups of 4 horizontal, or 4 col groups of
        // 3 vertical.
        if (offsetDirection === 'horizontal') {
          const rowGroup = (row % 3) * 4;
          idx = rowGroup + (col % 4);
        } else {
          const colGroup = (col % 4) * 3;
          const rowOffset = col % 3;
          idx = colGroup + ((row + rowOffset) % 3);
        }
      } else if (totalImages === 16 && offsetDirection === 'vertical') {
        // 16-count vertical (any position): 12-count-style col-group
        // pattern, adapted with 4-book col groups and period-3 row
        // offset (coprime). Kept from the previous revision — the
        // user explicitly asked for vertical to stay on 12-count-style
        // loop while horizontal moves to 20-count-style.
        const colGroup = (col % 4) * 4;
        const rowOffset = col % 3;
        idx = colGroup + ((row + rowOffset) % 4);
      } else if (totalImages === 16) {
        // 16-count horizontal CENTER position: adapted from the
        // 20-count center-horizontal doubled 6-row pattern, with
        // 4-book row groups instead of 5. Double-visibility rows
        // land on the same visible bands around the title bar to
        // keep the primary books in the reader's eye.
        //   rowMod 0,2 → books 0-3  (double)
        //   rowMod 1   → books 4-7
        //   rowMod 3,5 → books 8-11 (double)
        //   rowMod 4   → books 12-15
        // Repeats every 6 rows.
        const rowMod = row % 6;
        let rowGroup;
        if (rowMod === 0 || rowMod === 2) {
          rowGroup = 0;   // books 0-3
        } else if (rowMod === 1) {
          rowGroup = 4;   // books 4-7
        } else if (rowMod === 3 || rowMod === 5) {
          rowGroup = 8;   // books 8-11
        } else {
          rowGroup = 12;  // books 12-15
        }
        idx = rowGroup + (col % 4);
      } else {
        // 20-image logic
        if (offsetDirection === 'horizontal') {
          // Pattern for maximum visibility:
          // Row 0,2: books 0-4 (1-5)
          // Row 1: books 5-9 (6-10)
          // Row 3,5: books 10-14 (11-15)
          // Row 4: books 15-19 (16-20)
          // Repeats every 6 rows
          const rowMod = row % 6;
          let rowGroup;
          if (rowMod === 0 || rowMod === 2) {
            rowGroup = 0;  // books 0-4
          } else if (rowMod === 1) {
            rowGroup = 5;  // books 5-9
          } else if (rowMod === 3 || rowMod === 5) {
            rowGroup = 10; // books 10-14
          } else {
            rowGroup = 15; // books 15-19
          }
          idx = rowGroup + (col % 5);
        } else {
          // Vertical: each column cycles through 4 books
          // 5 column groups to show all 20: 0-3, 4-7, 8-11, 12-15, 16-19
          // Add cycle offset to prevent same book appearing in repeated columns
          const cycleNum = Math.floor(col / 5);
          const colGroup = (col % 5) * 4;  // 0, 4, 8, 12, 16
          const rowOffset = (col % 4 + cycleNum * 2) % 4;
          idx = colGroup + ((row + rowOffset) % 4);
        }
      }
      // Defensive wrap: every branch above is supposed to return an
      // in-bounds index, but clamp anyway in case a future count is
      // added that slips through. Double-modulo handles any edge case
      // where idx could theoretically go negative.
      return ((idx % totalImages) + totalImages) % totalImages;
    };
    
    // === DRAW FULL GRID ===
    // Draw everything, title bar will cover the appropriate region.
    //
    // Branch:
    //   shouldStretch === true  → fixed-slot grid with stagger (legacy path,
    //                             byte-for-byte identical to pre-feature)
    //   shouldStretch === false → masonry-pack: columns (vertical offset) or
    //                             rows (horizontal offset) packed with
    //                             aspect-ratio-preserving cover dimensions.
    //                             Stagger offsets are dropped in this mode
    //                             (pure masonry look), individual tilt
    //                             rotation is preserved, books cycle
    //                             monotonically, covers bleed off edges.
    const masonryMode = !shouldStretch;
    if (!masonryMode) {
      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          let gridX, gridY;

          if (offsetDirection === 'vertical') {
            // Vertical stagger: odd COLUMNS shift down
            const isOddCol = col % 2 === 1;
            const colStagger = isOddCol ? staggerOffset : 0;
            gridX = gridOriginX + col * hStep + slotWidth / 2;
            gridY = gridOriginY + row * vStep + colStagger + slotHeight / 2;
          } else {
            // Horizontal stagger: odd ROWS shift right
            const isOddRow = row % 2 === 1;
            const rowStagger = isOddRow ? staggerOffset : 0;
            gridX = gridOriginX + col * hStep + rowStagger + slotWidth / 2;
            gridY = gridOriginY + row * vStep + slotHeight / 2;
          }

          const rotated = rotatePoint(gridX, gridY);

          // Draw if cover intersects the canvas at all
          if (coverIntersectsBand(rotated.x, rotated.y, -slotHeight, canvasHeight + slotHeight)) {
            const imgIdx = getImageForCell(row, col) % images.length;
            drawRotatedCover(images[imgIdx], rotated.x, rotated.y);
          }
        }
      }
    } else {
      // === MASONRY-PACK MODE ===
      //
      // --- TUNING NOTES --------------------------------------------------
      // If a library gives feedback on how the masonry-pack mode looks in
      // Tilted, these are the knobs worth touching (in order of likelihood):
      //
      // gridExtent factor (see `canvasDiag * 0.8` a few dozen lines up):
      //   controls how far past canvas edges the pattern extends. Tighten
      //   to 0.6 if bleed feels excessive on a particular collection;
      //   loosen to 1.0 if you see gaps near rotated corners.
      //
      // hGutter / vGutter (6pt, near top of function): horizontal and
      //   vertical spacing between packed covers. Tighten to 3-4pt for a
      //   denser "pinboard" feel; loosen to 8-10pt for more breathing room.
      //
      // maxIterPerLine (200): safety cap, not a tuning knob. Only trips
      //   if the dimension fallback fails, which shouldn't happen in
      //   practice.
      //
      // The motivating use case is children's / YA collections where cover
      // aspect ratios vary widely (square picture books, tall middle-grade
      // paperbacks, slim YA). Adult fiction lists with uniform trade-
      // paperback covers will look nearly identical to stretch-on mode.
      // ------------------------------------------------------------------
      //
      // Packing bounds: symmetric around canvas center on the pack axis,
      // using the same gridExtent the tilted layout already uses for its
      // bleed calculations. Covers start before the canvas and continue
      // past it so the pattern looks continuous through rotation.
      const packStart = offsetDirection === 'vertical'
        ? centerY - gridExtent
        : centerX - gridExtent;
      const packEnd = offsetDirection === 'vertical'
        ? centerY + gridExtent
        : centerX + gridExtent;

      // Number of lines (columns for vertical mode, rows for horizontal).
      // Vertical uses the existing numCols. Horizontal needs an analogous
      // numRows sized from gridExtent (the existing numRows = 12 is fixed
      // for the stretched path and not wide enough here).
      const numLines = offsetDirection === 'vertical'
        ? numCols
        : Math.ceil(gridExtent * 2 / vStep) + 2;

      // Cover selection reuses the existing getImageForCell() formulas so
      // the masonry packing picks books with the same per-line patterns the
      // stretched tilted path uses. getImageForCell expects (row, col):
      //   vertical mode walks down a column, so depth → row, line → col
      //   horizontal mode walks across a row, so line → row, depth → col

      // Belt-and-suspenders iteration cap per line. With a defensive
      // non-zero dimension fallback below, this should never trip in
      // practice. 200 iterations is ~60,000 px of packing at a typical
      // cover size, far beyond any reasonable gridExtent.
      const maxIterPerLine = 200;

      for (let line = 0; line < numLines; line++) {
        let cursor = packStart;
        // Restore the brick-pattern stagger in masonry mode: shift
        // odd lines by half a step along the pack axis (same offset
        // as the stretch path). This gives the characteristic flair
        // of Staggered/Tilted even with variable-dimension covers.
        if (line % 2 === 1) {
          cursor += staggerOffset;
        }
        let depth = 0;

        while (cursor < packEnd && depth < maxIterPerLine) {
          const imgIdx = offsetDirection === 'vertical'
            ? getImageForCell(depth, line) % images.length
            : getImageForCell(line, depth) % images.length;
          const img = images[imgIdx];

          // Per-cover dimensions from natural aspect ratio. If the image
          // isn't ready (no naturalWidth/Height), fall back to the fixed
          // slot dims so the loop always makes forward progress and
          // doesn't infinite-loop on a zero-dimension cover.
          let drawW, drawH;
          if (offsetDirection === 'vertical') {
            drawW = slotWidth;
            if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
              drawH = slotWidth * (img.naturalHeight / img.naturalWidth);
            } else {
              drawH = slotHeight;
            }
            if (!(drawH > 0)) drawH = slotHeight;
          } else {
            drawH = slotHeight;
            if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
              drawW = slotHeight * (img.naturalWidth / img.naturalHeight);
            } else {
              drawW = slotWidth;
            }
            if (!(drawW > 0)) drawW = slotWidth;
          }

          // Unrotated grid-space center of the cover. Same grid origin as
          // the stretched path, with stagger restored via cursor offset.
          let gridX, gridY;
          if (offsetDirection === 'vertical') {
            gridX = gridOriginX + line * hStep + slotWidth / 2;
            gridY = cursor + drawH / 2;
          } else {
            gridX = cursor + drawW / 2;
            gridY = gridOriginY + line * vStep + slotHeight / 2;
          }

          const rotated = rotatePoint(gridX, gridY);

          // Reuse the existing cull. It computes corners from fixed
          // slotWidth/slotHeight rather than the per-cover dimensions, so
          // the check is slightly conservative (may keep a few covers
          // whose variable dimensions actually place them off-canvas).
          // Harmless — at worst a few extra drawImage calls on the margin.
          if (coverIntersectsBand(rotated.x, rotated.y, -slotHeight, canvasHeight + slotHeight)) {
            ctx.save();
            ctx.translate(rotated.x, rotated.y);
            ctx.rotate(rotationRad);
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            } else {
              ctx.fillStyle = '#ddd';
              ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
            }
            ctx.restore();
          }

          // Advance along the packing axis by the variable dimension plus
          // the standard gutter.
          if (offsetDirection === 'vertical') {
            cursor += drawH + vGutter;
          } else {
            cursor += drawW + hGutter;
          }

          depth++;
        }
      }
    }
    
    // === DRAW WHITE MARGIN + TITLE BAR ON TOP ===
    // titleY was calculated using actual bgH, so it's already correct
    
    // Calculate margin sizes based on position
    let marginAbove = titleGutter;
    let marginBelow = titleGutter;
    if (position === 'top') {
      marginAbove = 0;
    } else if (position === 'bottom') {
      marginBelow = 0;
    }
    
    // Draw white rectangle behind title bar
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, titleY - marginAbove, canvasWidth, bgH + marginAbove + marginBelow);
    
    // Draw title bar on top of white margin
    drawTitleBarAt(ctx, styles, canvasWidth, titleY);
  }


  /**
   * Layout: Masonry
   * True masonry layout with columns (5 for 12 covers, 6 for 20 covers).
   * Each column stacks independently.
   * Covers maintain natural aspect ratio (width matches column, height scales proportionally).
   * Images loop in order (0,1,2...11,0,1,2... or 0,1,2...19,0,1,2...).
   * Title bar overlays the collage with a white background and margins.
   */
  function drawLayoutMasonry(ctx, canvas, images, styles, options = {}) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const position = options.titleBarPosition || 'classic';
    
    // Gutters scale with DPI
    const baseGutter = 6 * (CONFIG.PDF_DPI / 72);
    const titleGutter = 8 * (CONFIG.PDF_DPI / 72);
    
    // Column count based on cover count: 5 for 12, 6 for 16 or 20
    const imageCount = images.length;
    const numCols = imageCount <= 12 ? 5 : 6;
    console.log('[Masonry] Using numCols =', numCols, 'for', imageCount, 'covers');
    
    // Calculate column width - gutters only BETWEEN columns, not at edges
    const totalHGutter = (numCols - 1) * baseGutter;
    const colWidth = (canvasWidth - totalHGutter) / numCols;
    
    // Column X positions - first column starts at 0, last column ends at canvasWidth
    const getColX = (colIdx) => colIdx * (colWidth + baseGutter);
    
    // =========================================================================
    // MEASURE TITLE BAR FIRST (before drawing anything)
    // =========================================================================
    
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, 0);
    // Clear the measurement draw
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, bgH + 1);
    
    // Calculate title bar Y position
    let titleY;
    switch (position) {
      case 'top': titleY = 0; break;
      case 'classic': titleY = (canvasHeight - bgH) * 0.22; break;
      case 'center': titleY = (canvasHeight - bgH) / 2; break;
      case 'lower': titleY = (canvasHeight - bgH) * 0.75; break;
      case 'bottom': titleY = canvasHeight - bgH; break;
      default: titleY = (canvasHeight - bgH) * 0.22;
    }
    
    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================
    
    const getCoverHeight = (img, width) => {
      if (!img || !img.naturalWidth || !img.naturalHeight) return width * 1.5;
      return width / (img.naturalWidth / img.naturalHeight);
    };
    
    const drawCover = (img, x, y, w, h) => {
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, w, h);
      } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(x, y, w, h);
      }
    };
    
    // =========================================================================
    // PLACE COVERS IN TRUE MASONRY STYLE
    // =========================================================================
    
    // When title bar is at top, covers start below it; otherwise start at 0
    const startY = position === 'top' ? bgH + titleGutter : 0;
    
    // Track column heights (each column stacks independently)
    const colHeights = new Array(numCols).fill(startY);
    
    let step = 0;
    const maxCovers = 200; // Safety limit
    
    // Keep placing until all columns extend past canvas bottom
    while (Math.min(...colHeights) < canvasHeight && step < maxCovers) {
      // Place one cover in each column (left to right) per round
      for (let col = 0; col < numCols && step < maxCovers; col++) {
        // Check if this column still needs covers
        if (colHeights[col] >= canvasHeight) continue;
        
        // Simple loop: 0,1,2...11,0,1,2... or 0,1,2...19,0,1,2...
        const imgIdx = step % imageCount;
        const img = images[imgIdx];
        const coverH = getCoverHeight(img, colWidth);
        
        const x = getColX(col);
        const y = colHeights[col];
        
        drawCover(img, x, y, colWidth, coverH);
        
        // Update column height (cover height + gutter)
        colHeights[col] = y + coverH + baseGutter;
        
        step++;
      }
    }
    
    // =========================================================================
    // DRAW TITLE BAR ON TOP (same as Tilted)
    // =========================================================================
    
    // Calculate margin sizes based on position
    let marginAbove = titleGutter;
    let marginBelow = titleGutter;
    if (position === 'top') {
      marginAbove = 0;
    } else if (position === 'bottom') {
      marginBelow = 0;
    }
    
    // Draw white rectangle behind title bar
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, titleY - marginAbove, canvasWidth, bgH + marginAbove + marginBelow);
    
    // Draw title bar on top of white margin
    drawTitleBarAt(ctx, styles, canvasWidth, titleY);
  }

  function autoRegenerateCoverIfAble() {
    if (elements.frontCoverUploader.classList.contains('has-image')) {
      generateCoverCollage();
    }
  }
  
  /**
   * Toggles between simple and advanced cover text modes
   */
  function toggleCoverMode(isAdvanced) {
    // Toggle input visibility using classes
    if (elements.coverSimpleMode) {
      elements.coverSimpleMode.classList.toggle('hidden', isAdvanced);
    }
    if (elements.coverAdvancedMode) {
      elements.coverAdvancedMode.classList.toggle('visible', isAdvanced);
    }
    
    // Toggle style controls visibility using classes
    if (elements.coverSimpleStyle) {
      elements.coverSimpleStyle.classList.toggle('hidden', isAdvanced);
    }
    if (elements.coverAdvancedStyle) {
      elements.coverAdvancedStyle.classList.toggle('visible', isAdvanced);
    }
    
    // Force scroll recalculation for settings tab
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab) {
      requestAnimationFrame(() => {
        settingsTab.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          settingsTab.style.overflow = '';
        });
      });
    }
  }
  
  // ---------------------------------------------------------------------------
  // Collage cover count (12 / 16 / 20) + Extra Collage Covers
  // ---------------------------------------------------------------------------

  /**
   * Reads the currently selected collage cover count from the radio group.
   * Returns 12 if nothing is selected or the group is missing.
   */
  function getCollageCoverCount() {
    const radios = elements.collageCoverCountRadios;
    if (!radios || !radios.length) return CONFIG.MIN_COVERS_FOR_COLLAGE;
    for (const radio of radios) {
      if (radio.checked) {
        const n = parseInt(radio.value, 10);
        if (CONFIG.COLLAGE_COVER_COUNTS.indexOf(n) !== -1) return n;
      }
    }
    return CONFIG.MIN_COVERS_FOR_COLLAGE;
  }

  /**
   * Writes a new collage cover count to the radio group without firing
   * the change event. Caller is responsible for any follow-up work
   * (e.g. calling setCollageCoverCount to apply the mode change).
   */
  function setCollageCoverCountUI(count) {
    const radios = elements.collageCoverCountRadios;
    if (!radios || !radios.length) return;
    for (const radio of radios) {
      radio.checked = parseInt(radio.value, 10) === count;
    }
  }

  /**
   * Derived maximum number of "extra" cover slots in the extras grid,
   * computed from the current cover count. 12 → 0, 16 → 4, 20 → 8.
   */
  function getMaxExtraCovers() {
    return Math.max(0, getCollageCoverCount() - CONFIG.MIN_COVERS_FOR_COLLAGE);
  }
  
  /**
   * Applies the given collage cover count (12, 16, or 20). Shows/hides
   * the extras section, auto-stars books up to the allowed cap when
   * switching into extended mode (16 or 20), trims starred books and
   * user-added extras when switching down, and auto-regenerates the
   * collage when enough covers are present.
   *
   * When called with isRestoring=true, skips side effects that would
   * stomp loaded state (placeholder text, auto-generation, debouncedSave).
   */
  function setCollageCoverCount(count, isRestoring = false) {
    if (CONFIG.COLLAGE_COVER_COUNTS.indexOf(count) === -1) {
      count = CONFIG.MIN_COVERS_FOR_COLLAGE;
    }
    const isExtended = count > CONFIG.MIN_COVERS_FOR_COLLAGE;
    setCollageCoverCountUI(count);

    if (elements.extraCoversSection) {
      elements.extraCoversSection.style.display = isExtended ? 'block' : 'none';

      // Force scroll recalculation for settings tab
      const settingsTab = document.getElementById('tab-settings');
      if (settingsTab) {
        requestAnimationFrame(() => {
          settingsTab.style.overflow = 'hidden';
          requestAnimationFrame(() => {
            settingsTab.style.overflow = '';
          });
        });
      }
    }
    if (elements.collageCoverHint) {
      elements.collageCoverHint.textContent = isExtended
        ? `Add covers 13-${count} below to generate collage`
        : 'Star 12 books to include in the collage';
    }
    if (elements.extraCoversLabel) {
      elements.extraCoversLabel.textContent = isExtended
        ? `Additional Covers (Covers 13-${count})`
        : 'Additional Covers';
    }

    if (isExtended) {
      // Only do these things when NOT restoring from saved state
      if (!isRestoring) {
        // Clear existing front cover and show placeholder (need more covers message)
        clearFrontCoverForExtendedMode(count);

        // Auto-star books with covers up to the star cap (TOTAL_SLOTS or count,
        // whichever is smaller). Cap at TOTAL_SLOTS (15) so the extras grid
        // retains room for user-added uploads above the starred range.
        const starCap = Math.min(CONFIG.TOTAL_SLOTS, count);
        let starredCount = 0;
        for (let i = 0; i < myBooklist.length; i++) {
          const book = myBooklist[i];
          if (book.isBlank) continue;

          const hasCover = BookUtils.hasValidCover(book);

          if (hasCover && starredCount < starCap) {
            book.includeInCollage = true;
            starredCount++;
          }
        }

        // NOTE: previous revisions trimmed extraCollageCovers on
        // downgrade (20→16, or 16/20→12) to keep the in-memory array
        // in sync with the visible grid slots. That has been removed
        // per user request so extras survive mode switches: a user
        // who has 8 extras in 20-count and drops to 12 keeps all 8
        // extras hidden in memory, and flipping back to 20 brings
        // them back unchanged. renderExtraCoversGrid already caps
        // visible slots at getMaxExtraCovers(), and
        // generateCoverCollage caps rendered covers at maxCovers
        // via slice(0, maxCovers), so the hidden entries don't
        // cause orphan slots or over-full collages.
      } else {
        // When restoring, just update the placeholder text (don't clear cover)
        updateExtendedModePlaceholderText(count);
      }

      // Always render booklist and extra covers grid
      renderBooklist();
      renderExtraCoversGrid();
    } else {
      // When switching back to 12, unstar books beyond 12. Leave the
      // user-added extraCollageCovers array intact in memory so a
      // subsequent switch back to 16 or 20 brings them right back.
      // The grid is hidden (display:none) in 12-count mode and the
      // count functions ignore extras when count === 12, so keeping
      // them around has no side effect.
      let starredCount = 0;
      for (let i = 0; i < myBooklist.length; i++) {
        const book = myBooklist[i];
        if (!book.isBlank && book.includeInCollage) {
          starredCount++;
          if (starredCount > CONFIG.MIN_COVERS_FOR_COLLAGE) {
            book.includeInCollage = false;
          }
        }
      }
      // Restore default placeholder text
      restoreFrontCoverPlaceholderText();
      renderBooklist();
    }

    // Auto-generate if we have enough covers (and not restoring from saved state)
    if (!isRestoring) {
      if (BookUtils.hasEnoughCoversForCollage(myBooklist, extraCollageCovers, count)) {
        generateCoverCollage();
      }
    }

    if (!isRestoring) {
      debouncedSave();
    }
  }
  
  /**
   * Clears the front cover when switching to extended mode
   */
  function clearFrontCoverForExtendedMode(count) {
    const total = (typeof count === 'number' && count > CONFIG.MIN_COVERS_FOR_COLLAGE)
      ? count
      : getCollageCoverCount();
    const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
    const placeholderText = elements.frontCoverUploader?.querySelector('.placeholder-text');

    if (frontCoverImg) {
      // Use transparent gif instead of placehold.co URL
      frontCoverImg.src = CONFIG.TRANSPARENT_GIF;
      frontCoverImg.dataset.isPlaceholder = "true";
    }

    if (placeholderText) {
      placeholderText.innerHTML = 'Click to upload a custom cover<br/>(min 3000 x 4800 px recommended)<br/><br/>OR<br/><br/>Use the Auto-Generate Cover tool<br/>in Settings &gt; Front Cover<br/>(Add covers 13-' + total + ' using the Additional Covers section)';
    }

    elements.frontCoverUploader?.classList.remove('has-image');
  }
  
  /**
   * Restores the default placeholder text for 12-cover mode
   */
  function restoreFrontCoverPlaceholderText() {
    const placeholderText = elements.frontCoverUploader?.querySelector('.placeholder-text');
    if (placeholderText) {
      placeholderText.innerHTML = 'Click to upload a custom cover<br/>(min 3000 x 4800 px recommended)<br/><br/>OR<br/><br/>Use the Auto-Generate Cover tool<br/>in Settings &gt; Front Cover<br/>(Star 12 books to include in the collage)';
    }
  }

  /**
   * Updates placeholder text for extended mode (16/20) without clearing cover
   */
  function updateExtendedModePlaceholderText(count) {
    const total = (typeof count === 'number' && count > CONFIG.MIN_COVERS_FOR_COLLAGE)
      ? count
      : getCollageCoverCount();
    const placeholderText = elements.frontCoverUploader?.querySelector('.placeholder-text');
    if (placeholderText) {
      placeholderText.innerHTML = 'Click to upload a custom cover<br/>(min 3000 x 4800 px recommended)<br/><br/>OR<br/><br/>Use the Auto-Generate Cover tool<br/>in Settings &gt; Front Cover<br/>(Add covers 13-' + total + ' using the Additional Covers section)';
    }
  }
  
  /**
   * Updates the extra covers count display in both section and modal
   */
  function updateExtraCoversCount() {
    const maxExtras = getMaxExtraCovers();
    // Count starred books beyond 12
    const booksWithCovers = BookUtils.getStarredBooksWithCovers(myBooklist);
    const starredBeyond12 = Math.min(
      maxExtras,
      Math.max(0, booksWithCovers.length - CONFIG.MIN_COVERS_FOR_COLLAGE)
    );
    const extraCount = extraCollageCovers.length;
    const totalExtra = Math.min(maxExtras, starredBeyond12 + extraCount);

    if (elements.extraCoversCount) {
      elements.extraCoversCount.textContent = totalExtra;
    }
    if (elements.extraCoversMax) {
      elements.extraCoversMax.textContent = maxExtras;
    }
    const modalCount = document.getElementById('modal-cover-count');
    if (modalCount) {
      if (starredBeyond12 > 0) {
        modalCount.textContent = `${totalExtra} of ${maxExtras} slots filled (${starredBeyond12} from list, ${extraCount} added)`;
      } else {
        modalCount.textContent = `${totalExtra} of ${maxExtras} extra slots filled`;
      }
    }
  }
  
  /**
   * Renders the extra covers grid. Slot count is derived from the
   * current collage cover count: 4 for 16-mode, 8 for 20-mode, 0 for
   * 12-mode (the section is hidden but this function still renders 0
   * slots defensively). Shows starred books 13+ first (from list, not
   * removable), then user-added extras.
   */
  function renderExtraCoversGrid() {
    if (!elements.extraCoversGrid) return;
    const maxExtras = getMaxExtraCovers();

    elements.extraCoversGrid.innerHTML = '';

    // Get starred books with covers, take those beyond position 12
    const booksWithCovers = BookUtils.getStarredBooksWithCovers(myBooklist);
    const starredBeyond12 = booksWithCovers.slice(CONFIG.MIN_COVERS_FOR_COLLAGE); // Books 13, 14, 15...

    let slotIndex = 0;

    // First: show covers from starred books beyond 12 (from list, not removable)
    for (let i = 0; i < starredBeyond12.length && slotIndex < maxExtras; i++) {
      const book = starredBeyond12[i];
      const slot = document.createElement('div');
      slot.className = 'extra-cover-slot has-cover from-list';
      slot.dataset.slotIndex = slotIndex;
      slot.title = `${book.title} (from your list)`;
      
      const img = document.createElement('img');
      img.src = BookUtils.getBookCoverUrl(book, 'L');
      img.alt = book.title;
      img.onerror = function() {
        this.onerror = null;
        this.src = BookUtils.getBookCoverUrl(book, 'M');
      };
      slot.appendChild(img);
      
      // Label to indicate it's from the list
      const label = document.createElement('span');
      label.className = 'from-list-label';
      label.textContent = `#${13 + i}`;
      slot.appendChild(label);
      
      elements.extraCoversGrid.appendChild(slot);
      slotIndex++;
    }
    
    // Second: show extra covers added via search/upload (removable and draggable)
    for (let i = 0; i < extraCollageCovers.length && slotIndex < maxExtras; i++) {
      const existingCover = extraCollageCovers[i];
      
      if (existingCover && existingCover.coverData) {
        const slot = document.createElement('div');
        slot.className = 'extra-cover-slot has-cover draggable-extra';
        slot.dataset.slotIndex = slotIndex;
        slot.dataset.extraIndex = i;
        slot.dataset.extraId = existingCover.id;
        
        // Drag handle
        const dragHandle = document.createElement('span');
        dragHandle.className = 'extra-drag-handle';
        dragHandle.innerHTML = '⋮⋮';
        dragHandle.title = 'Drag to reorder';
        slot.appendChild(dragHandle);
        
        const img = document.createElement('img');
        img.src = existingCover.coverData;
        img.alt = 'Extra cover';
        slot.appendChild(img);
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove cover';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          removeExtraCover(i);
          // Folio: wince at cover removal
          if (window.folio) window.folio.react('wince');
        };
        slot.appendChild(removeBtn);
        
        elements.extraCoversGrid.appendChild(slot);
        slotIndex++;
      }
    }
    
    // Third: show empty slots for remaining positions
    while (slotIndex < maxExtras) {
      const slot = document.createElement('div');
      slot.className = 'extra-cover-slot';
      slot.dataset.slotIndex = slotIndex;

      const placeholder = document.createElement('span');
      placeholder.className = 'slot-placeholder';
      placeholder.innerHTML = '<i class="fa-solid fa-plus"></i>';
      slot.appendChild(placeholder);

      // File input for upload
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      const currentSlotIndex = slotIndex;

      // Shared handler for processing an image file (used by both file input and drag-drop)
      const processExtraCoverFile = (file) => {
        // Check if at max covers total
        const currentCount = getCollageCoverCount();
        if (BookUtils.isAtCoverLimit(myBooklist, extraCollageCovers, currentCount)) {
          showNotification(`Maximum ${currentCount} covers reached.`);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          compressImage(e.target.result, { maxDimension: 1600 }).then(compressed => {
            addExtraCover(compressed, currentSlotIndex);
          });
        };
        reader.onerror = () => showNotification('Failed to read image file.', 'error');
        reader.readAsDataURL(file);
      };
      
      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          processExtraCoverFile(file);
        }
        e.target.value = ''; // Clear input so same file can be re-selected
      };
      slot.appendChild(fileInput);
      
      slot.onclick = () => fileInput.click();
      
      // Add drag-and-drop support
      setupDragDropUpload(slot, processExtraCoverFile);
      
      elements.extraCoversGrid.appendChild(slot);
      slotIndex++;
    }
    
    updateExtraCoversCount();
  }
  
  /**
   * Adds an extra cover at the specified slot (or next available)
   */
  function addExtraCover(coverData, preferredSlot = null) {
    pushUndo('add-extra-cover');
    const currentCount = getCollageCoverCount();
    const maxExtras = getMaxExtraCovers();
    // Check if at max
    if (BookUtils.isAtCoverLimit(myBooklist, extraCollageCovers, currentCount)) {
      showNotification(`Maximum ${currentCount} covers reached.`);
      return null;
    }

    const newCover = {
      id: `extra-${crypto.randomUUID()}`,
      coverData: coverData
    };

    if (preferredSlot !== null && preferredSlot < maxExtras) {
      // Insert at specific slot
      if (extraCollageCovers.length <= preferredSlot) {
        extraCollageCovers.push(newCover);
      } else {
        extraCollageCovers.splice(preferredSlot, 0, newCover);
        // Trim if over max slots
        if (extraCollageCovers.length > maxExtras) {
          extraCollageCovers = extraCollageCovers.slice(0, maxExtras);
        }
      }
    } else {
      // Add to end if room
      if (extraCollageCovers.length < maxExtras) {
        extraCollageCovers.push(newCover);
      } else {
        showNotification('All extra cover slots are full.');
        return null;
      }
    }

    renderExtraCoversGrid();
    debouncedSave();

    // Folio: acknowledge extra cover upload
    if (window.folio) {
      window.folio.react('nod');
      setTimeout(function() { if (window.folio) window.folio.setState('excited', 'cover-uploaded'); }, 300);
      setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
    }

    // Auto-generate cover when the last slot is filled (if auto-generated image exists)
    const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
    if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
      const starredAfterAdd = BookUtils.getStarredBooks(myBooklist).length;
      if (starredAfterAdd + extraCollageCovers.length === currentCount) {
        generateCoverCollage();
      }
    }

    return newCover.id;
  }

  /**
   * Removes an extra cover by its id
   */
  function removeExtraCoverById(coverId) {
    const index = extraCollageCovers.findIndex(c => c.id === coverId);
    if (index !== -1) {
      pushUndo('remove-extra-cover');
      extraCollageCovers.splice(index, 1);
      renderExtraCoversGrid();
      renderBooklist();
      debouncedSave();
      return true;
    }
    return false;
  }
  
  /**
   * Removes an extra cover at the specified index
   */
  function removeExtraCover(index) {
    if (index >= 0 && index < extraCollageCovers.length) {
      pushUndo('remove-extra-cover');
      extraCollageCovers.splice(index, 1);
      renderExtraCoversGrid();
      renderBooklist(); // Update star states
      debouncedSave();
    }
  }
  
  /**
   * Opens the extra cover search modal
   */
  function openExtraCoverSearchModal() {
    if (!elements.extraCoverSearchModal) return;
    elements.extraCoverSearchModal.style.display = 'flex';
    
    // Clear main search field
    const searchInput = document.getElementById('extra-cover-search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    
    // Clear advanced fields
    ['extra-title-input', 'extra-author-input', 'extra-subject-input', 'extra-isbn-input'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
    
    const resultsContainer = document.getElementById('extra-cover-search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '<p class="modal-search-placeholder">Enter a search term to find book covers</p>';
    }
    
    // Update count display
    updateExtraCoversCount();
  }
  
  /**
   * Closes the extra cover search modal
   */
  function closeExtraCoverSearchModal() {
    if (elements.extraCoverSearchModal) {
      elements.extraCoverSearchModal.style.display = 'none';
    }
  }
  
  /**
   * Performs search for extra cover modal with advanced fields
   */
  async function searchExtraCovers() {
    const resultsContainer = document.getElementById('extra-cover-search-results');
    if (!resultsContainer) return;
    
    // Build query from all fields
    const keyword = document.getElementById('extra-cover-search-input')?.value?.trim() || '';
    const title = document.getElementById('extra-title-input')?.value?.trim() || '';
    const author = document.getElementById('extra-author-input')?.value?.trim() || '';
    const subject = document.getElementById('extra-subject-input')?.value?.trim() || '';
    const isbn = document.getElementById('extra-isbn-input')?.value?.trim() || '';
    
    // Build query string
    const queryParts = [];
    if (keyword) queryParts.push(keyword);
    if (title) queryParts.push(`title:${title}`);
    if (author) queryParts.push(`author:${author}`);
    if (subject) queryParts.push(`subject:${subject}`);
    if (isbn) queryParts.push(`isbn:${isbn}`);
    
    const query = queryParts.join(' ');
    
    if (!query) {
      resultsContainer.innerHTML = '<p class="modal-search-placeholder">Enter a search term to find book covers</p>';
      return;
    }
    
    resultsContainer.innerHTML = '<p class="modal-search-placeholder">Searching...</p>';
    
    try {
      const response = await fetch(`${CONFIG.OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=15`);
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      const books = data.docs || [];
      
      if (books.length === 0) {
        resultsContainer.innerHTML = '<p class="modal-search-placeholder">No results found</p>';
        return;
      }
      
      // Filter to only books with covers
      const booksWithCovers = books.filter(b => b.cover_i);
      
      if (booksWithCovers.length === 0) {
        resultsContainer.innerHTML = '<p class="modal-search-placeholder">No books with covers found</p>';
        return;
      }
      
      resultsContainer.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'modal-results-grid';
      
      booksWithCovers.slice(0, 12).forEach(book => {
        const card = createExtraCoverSearchCard(book);
        grid.appendChild(card);
      });
      
      resultsContainer.appendChild(grid);
      
    } catch (err) {
      console.error('Extra cover search error:', err);
      resultsContainer.innerHTML = '<p class="modal-search-placeholder">Search failed. Please try again.</p>';
    }
  }
  
  /**
   * Creates a search result card for the extra covers modal (matches main search style)
   */
  function createExtraCoverSearchCard(book) {
    const initialCoverId = book.cover_i || 'placehold';
    
    const card = document.createElement('div');
    card.className = 'modal-cover-result book-card';
    card.dataset.key = book.key;
    
    // Cover carousel
    const coverCarousel = document.createElement('div');
    coverCarousel.className = 'cover-carousel';
    
    const coverImg = document.createElement('img');
    coverImg.src = BookUtils.getCoverUrl(initialCoverId, 'L');
    coverImg.alt = `Cover for ${book.title}`;
    coverImg.loading = 'lazy';
    coverImg.onerror = function() {
      this.onerror = null;
      this.src = BookUtils.getCoverUrl(initialCoverId, 'M');
    };
    coverCarousel.appendChild(coverImg);
    
    // Title
    const titleEl = document.createElement('p');
    titleEl.className = 'book-title modal-cover-title';
    titleEl.textContent = book.title || 'Unknown Title';
    
    // Author
    const authorEl = document.createElement('p');
    authorEl.className = 'book-author modal-cover-author';
    const authorName = book.author_name ? book.author_name[0] : 'Unknown Author';
    authorEl.textContent = authorName;
    authorEl.title = authorName;
    
    // Actions group
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'card-actions-group';
    
    // Carousel controls
    const { carouselControls, state: carouselState } = createCarouselControls(
      coverImg,
      initialCoverId,
      book.key,
      { ariaLive: false, stopPropagation: true }
    );
    
    // Track added cover id for removal
    let addedCoverId = null;
    
    // Add to Collage button
    const addButton = document.createElement('button');
    addButton.className = 'add-to-list-button add-to-collage-button';
    addButton.setAttribute('aria-label', `Add "${book.title}" to collage`);
    addButton.textContent = 'Add to Collage';
    
    addButton.addEventListener('click', async () => {
      // If already added, remove it
      if (addButton.classList.contains('added') && addedCoverId) {
        if (removeExtraCoverById(addedCoverId)) {
          addButton.textContent = 'Add to Collage';
          addButton.classList.remove('added');
          addButton.setAttribute('aria-label', `Add "${book.title}" to collage`);
          addedCoverId = null;
          showNotification(`Removed "${book.title}" from collage`);
        }
        return;
      }
      
      // Check if at limit
      {
        const currentCount = getCollageCoverCount();
        if (BookUtils.isAtCoverLimit(myBooklist, extraCollageCovers, currentCount)) {
          showNotification(`Maximum ${currentCount} covers reached.`);
          return;
        }
      }
      
      addButton.disabled = true;
      const originalText = addButton.textContent;
      addButton.textContent = 'Adding...';
      
      // Get current cover from carousel state
      const currentCoverId = carouselState.allCoverIds[carouselState.currentCoverIndex];
      const largeCoverUrl = BookUtils.getCoverUrl(currentCoverId, 'L');
      const mediumCoverUrl = BookUtils.getCoverUrl(currentCoverId, 'M');
      
      try {
        // Try large first, fallback to medium
        let dataUrl;
        try {
          dataUrl = await loadImageAsDataUrl(largeCoverUrl);
        } catch {
          dataUrl = await loadImageAsDataUrl(mediumCoverUrl);
        }
        
        addedCoverId = addExtraCover(dataUrl);
        if (addedCoverId) {
          addButton.textContent = '✓ Added';
          addButton.classList.add('added');
          addButton.setAttribute('aria-label', `Remove "${book.title}" from collage`);
          addButton.disabled = false;
          showNotification(`Added "${book.title}" to collage`, 'success');
        } else {
          addButton.textContent = originalText;
          addButton.disabled = false;
        }
      } catch {
        addButton.textContent = originalText;
        addButton.disabled = false;
        showNotification('Failed to load cover image', 'error');
      }
    });
    
    // Assemble card
    card.appendChild(coverCarousel);
    card.appendChild(titleEl);
    card.appendChild(authorEl);
    actionsGroup.appendChild(carouselControls);
    actionsGroup.appendChild(addButton);
    card.appendChild(actionsGroup);
    
    return card;
  }
  
  /**
   * Loads an image URL and converts to data URL
   */
  function loadImageAsDataUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = url;
    });
  }
  
  /**
   * Binds events for extra covers feature
   */
  function bindExtraCoversEvents() {
    // Collage cover count radio group (12 / 16 / 20). Radios flip
    // their DOM state BEFORE the `change` event fires, so capture
    // pre-change state via mousedown/keydown on each radio input.
    if (elements.collageCoverCountRadios && elements.collageCoverCountRadios.length) {
      elements.collageCoverCountRadios.forEach(function(radio) {
        bindPreChangeCapture(radio, 'set-collage-cover-count');
        radio.addEventListener('change', function() {
          if (!radio.checked) return;
          const newCount = parseInt(radio.value, 10);
          if (CONFIG.COLLAGE_COVER_COUNTS.indexOf(newCount) === -1) return;
          setCollageCoverCount(newCount);
          // Folio: perk at the mode switch
          if (window.folio) window.folio.react('perk');
        });
      });
    }
    
    // Search button
    const searchBtn = document.getElementById('extra-cover-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', openExtraCoverSearchModal);
    }
    
    // Modal close button
    const modalClose = elements.extraCoverSearchModal?.querySelector('.modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', closeExtraCoverSearchModal);
    }
    
    // Modal Done button
    const modalDone = elements.extraCoverSearchModal?.querySelector('.modal-done-btn');
    if (modalDone) {
      modalDone.addEventListener('click', closeExtraCoverSearchModal);
    }
    
    // Modal overlay click to close - track mousedown to prevent closing during text selection
    if (elements.extraCoverSearchModal) {
      let mouseDownOnOverlay = false;
      elements.extraCoverSearchModal.addEventListener('mousedown', (e) => {
        mouseDownOnOverlay = e.target === elements.extraCoverSearchModal;
      });
      elements.extraCoverSearchModal.addEventListener('click', (e) => {
        if (e.target === elements.extraCoverSearchModal && mouseDownOnOverlay) {
          closeExtraCoverSearchModal();
        }
        mouseDownOnOverlay = false;
      });
    }

    // Modal search submit
    const searchSubmit = document.getElementById('extra-cover-search-submit');
    if (searchSubmit) {
      searchSubmit.addEventListener('click', searchExtraCovers);
    }

    // Modal search input enter key
    const searchInput = document.getElementById('extra-cover-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchExtraCovers();
        }
      });
    }

    // Advanced fields enter key support
    ['extra-title-input', 'extra-author-input', 'extra-subject-input', 'extra-isbn-input'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            searchExtraCovers();
          }
        });
      }
    });
  }
  
  // ---------------------------------------------------------------------------
  // QR Code Generation
  // ---------------------------------------------------------------------------
  function generateQrCode() {
    const url = elements.qrUrlInput.value;
    if (!url) {
      showNotification('Please enter a URL for the QR code.');
      return;
    }
    
    elements.qrCodeCanvas.innerHTML = '';
    
    try {
      new QRCode(elements.qrCodeCanvas, {
        text: url,
        width: CONFIG.QR_SIZE_PX,
        height: CONFIG.QR_SIZE_PX,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel[CONFIG.QR_ERROR_CORRECTION]
      });
      // Folio: nod at successful QR generation
      if (window.folio) window.folio.react('nod');
    } catch (err) {
      console.error(err);
      showNotification('Error generating QR code. Check the URL.');
      // Folio: wince at QR failure
      if (window.folio) window.folio.react('wince');
    }
  }
  
  // ---------------------------------------------------------------------------
  // PDF Export
  // ---------------------------------------------------------------------------
  async function exportPdf() {
    if (isExportingPdf) return;
    isExportingPdf = true;
    setLoading(elements.exportPdfButton, true, 'Generating...');
    
    // Get file name from list name input (primary), or fallback to 'booklist'
    const listName = (elements.listNameInput?.value || '').trim();
    const baseName = listName.length > 0 ? listName : 'booklist';
    
    // Sanitize filename: only remove characters forbidden by file systems
    const safeBase = baseName.replace(/[<>:"/\\|?*]+/g, '').trim() || 'booklist';
    const suggestedName = `${safeBase}.pdf`;
    
    showNotification('Generating PDF, please wait...', 'info', false);
    
    // Hide elements for print
    const elementsToRestore = [];
    
    document.querySelectorAll('.list-item').forEach(item => {
      if (item.dataset.isBlank === 'true') {
        elementsToRestore.push({ el: item, display: item.style.display });
        item.style.display = 'none';
      }
    });
    
    document.querySelectorAll('#back-cover-panel .custom-uploader').forEach(uploader => {
      const img = uploader.querySelector('img');
      if (img && img.src.includes('placehold.co')) {
        elementsToRestore.push({ el: uploader, display: uploader.style.display });
        uploader.style.display = 'none';
      }
    });
    
    const frontCoverImg = elements.frontCoverUploader.querySelector('img');
    const isPlaceholder = frontCoverImg.dataset.isPlaceholder !== "false" &&
      (frontCoverImg.src.includes('placehold.co') || frontCoverImg.src.includes('data:image/gif'));
    
    if (isPlaceholder) {
      elementsToRestore.push({ el: elements.frontCoverPanel, display: elements.frontCoverPanel.style.display });
      elements.frontCoverPanel.style.display = 'none';
    }
    
    elements.previewArea.classList.add('print-mode');

    // Reset zoom to 1.0 for accurate html2canvas capture
    const savedZoom = elements.previewArea.style.zoom;
    elements.previewArea.style.zoom = 1;

    try {
      await new Promise(resolve => setTimeout(resolve, CONFIG.PDF_RENDER_DELAY_MS));
      await waitForFonts();
      // Defense in depth: make sure every <img> in both print pages is
      // fully decoded before html2canvas takes its snapshot. Guards
      // against the specific case where branded-library logos or
      // freshly-set images would capture as empty boxes because the
      // bytes hadn't finished arriving over the network when capture
      // started. Resolves silently on broken/missing images so they
      // don't block the export.
      await waitForImagesDecoded('#print-page-1 img, #print-page-2 img');
      
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'in',
        format: 'letter',
        compress: true
      });

      // PDF metadata
      pdf.setProperties({
        title: safeBase,
        creator: 'Booklister',
        subject: 'Printable Booklist',
      });

      const scale = CONFIG.PDF_CANVAS_SCALE;
      const options = {
        scale,
        useCORS: true,
        backgroundColor: '#FFFFFF'
      };

      const canvas1 = await html2canvas(document.getElementById('print-page-1'), options);
      pdf.addImage(canvas1.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, CONFIG.PDF_WIDTH_IN, CONFIG.PDF_HEIGHT_IN);
      pdf.addPage();

      const canvas2 = await html2canvas(document.getElementById('print-page-2'), options);
      pdf.addImage(canvas2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, CONFIG.PDF_WIDTH_IN, CONFIG.PDF_HEIGHT_IN);
      
      pdf.save(suggestedName);
      showNotification('PDF download started.', 'success');
      
      // Folio: excited about PDF
      if (window.folio) {
        window.folio.react('satisfied');
        window.folio.setState('excited', 'pdf-exported');
        setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
      }
      
    } catch (err) {
      console.error("PDF Generation failed:", err);
      showNotification("An error occurred generating the PDF. Please check the console.", 'error');
    } finally {
      isExportingPdf = false;
      elements.previewArea.classList.remove('print-mode');
      elements.previewArea.style.zoom = savedZoom;
      elementsToRestore.forEach(item => item.el.style.display = item.display || '');
      setLoading(elements.exportPdfButton, false);
    }
  }
  
  // ---------------------------------------------------------------------------
  // Save/Load System
  // ---------------------------------------------------------------------------
  function getUploaderImageSrc(uploaderEl) {
    if (!uploaderEl) return null;
    const img = uploaderEl.querySelector('img');
    if (!img || !img.src) return null;
    if (img.src.includes('placehold.co')) return null;
    // Filter out transparent placeholder GIF used when image is cleared
    if (img.src === CONFIG.TRANSPARENT_GIF) return null;
    // If img.src is an absolute URL on the current origin, return just the
    // path portion so saved files travel correctly between booklister.org
    // instances. Absolute cross-origin URLs taint the html2canvas capture
    // during PDF export, leaving the brand block blank in the output.
    if (img.src.startsWith(window.location.origin + '/')) {
      return img.src.slice(window.location.origin.length);
    }
    return img.src;
  }
  
  function captureStyleGroups() {
    const styles = {};
    
    document.querySelectorAll('.export-controls .form-group[data-style-group]').forEach(group => {
      const k = group.dataset.styleGroup;
      const lineSpacingInput = group.querySelector('.line-spacing');
      styles[k] = {
        font: group.querySelector('.font-select')?.value ?? '',
        sizePt: parseFloat(group.querySelector('.font-size-input')?.value ?? '12'),
        color: group.querySelector('.color-picker')?.value ?? '#000000',
        bold: !!group.querySelector('.bold-toggle')?.classList.contains('active'),
        italic: !!group.querySelector('.italic-toggle')?.classList.contains('active'),
        lineSpacing: lineSpacingInput ? parseFloat(lineSpacingInput.value ?? '1.3') : null,
      };
    });
    
    // Cover title styles - shared settings
    styles.coverTitle = {
      outerMarginPt: parseFloat(document.getElementById('cover-title-outer-margin')?.value ?? '10'),
      padXPt: parseFloat(document.getElementById('cover-title-pad-x')?.value ?? '0'),
      padYPt: parseFloat(document.getElementById('cover-title-pad-y')?.value ?? '10'),
      sideMarginPt: parseFloat(document.getElementById('cover-title-side-margin')?.value ?? '0'),
      bgColor: document.getElementById('cover-title-bg-color')?.value ?? '#000000',
      bgGradient: document.getElementById('cover-title-gradient-toggle')?.checked ?? false,
      bgColor2: document.getElementById('cover-title-bg-color2')?.value ?? '#333333',
      // Simple mode styling
      simple: {
        font: elements.coverFontSelect?.value ?? "'Oswald', sans-serif",
        sizePt: parseFloat(elements.coverFontSize?.value ?? '40'),
        color: elements.coverTextColor?.value ?? '#FFFFFF',
        bold: !!elements.coverBoldToggle?.classList.contains('active'),
        italic: !!elements.coverItalicToggle?.classList.contains('active'),
      },
      // Advanced mode per-line styling with individual spacing
      lines: elements.coverLines.map((line, index) => ({
        font: line.font?.value ?? "'Oswald', sans-serif",
        sizePt: parseFloat(line.size?.value ?? '24'),
        color: line.color?.value ?? '#FFFFFF',
        bold: !!line.bold?.classList.contains('active'),
        italic: !!line.italic?.classList.contains('active'),
        spacingPt: (index > 0 && line.spacing) ? parseFloat(line.spacing.value ?? '10') : 0,
      })),
    };
    
    return styles;
  }
  
  function serializeState() {
    const books = myBooklist.map(b => ({
      key: b.key,
      isBlank: !!b.isBlank,
      title: b.title,
      author: b.author,
      callNumber: b.callNumber,
      authorDisplay: b.authorDisplay || null,
      description: b.description,
      cover_ids: Array.isArray(b.cover_ids) ? b.cover_ids : [],
      currentCoverIndex: typeof b.currentCoverIndex === 'number' ? b.currentCoverIndex : 0,
      customCoverData: b.customCoverData || null,
      includeInCollage: b.includeInCollage !== false, // default true
    }));
    
    // Get selected collage layout
    const selectedLayout = elements.collageLayoutSelector?.querySelector('.layout-option.selected')?.dataset.layout || 'classic';
    
    // Get title bar position
    const titleBarPosition = elements.titleBarPosition?.value || 'classic';
    
    // Get tilted layout settings
    const tiltDegree = parseFloat(elements.tiltDegree?.value ?? '-25');
    const tiltOffsetDirection = elements.tiltOffsetDirection?.value || 'vertical';
    const tiltCoverSizePctRaw = parseFloat(elements.tiltCoverSize?.value ?? '100');
    const tiltCoverSizePct = isFinite(tiltCoverSizePctRaw)
      ? Math.max(50, Math.min(100, tiltCoverSizePctRaw))
      : 100;
    
    // Get list name (used for filename)
    const listName = (elements.listNameInput?.value || '').trim();
    
    // Capture cover text (both modes)
    const isAdvancedMode = elements.coverAdvancedToggle?.checked || false;
    const coverTitle = elements.coverTitleInput?.value || ''; // Simple mode text
    const coverLineTexts = elements.coverLines.map(line => line.input?.value || ''); // Advanced mode texts
    // Read the QR blurb from the DOM-independent mirror (_currentQrText)
    // rather than elements.qrCodeTextArea.innerText. innerText returns
    // '' on any display:none element, so when the user has Show QR Code
    // toggled off, serializing would silently wipe their saved blurb.
    // _currentQrText is kept in sync via the input handler and applyState.
    const qrTextContent = (_currentQrText || '').trim();

    return {
      schema: 'booklist-v1',
      savedAt: new Date().toISOString(),
      meta: { 
        listName: listName || 'booklist'
      },
      books,
      extraCollageCovers: extraCollageCovers.map(ec => ({
        id: ec.id,
        coverData: ec.coverData
      })),
      ui: {
        stretchCovers: !!elements.stretchCoversToggle?.checked,
        stretchBlockCovers: !!elements.stretchBlockCoversToggle?.checked,
        showQr: !!elements.toggleQrCode?.checked,
        showBranding: !!elements.toggleBranding?.checked,
        coverAdvancedMode: isAdvancedMode,
        coverTitle, // Simple mode text (backwards compatible)
        coverLineTexts, // Advanced mode texts
        collageLayout: selectedLayout,
        showShelves: !!elements.showShelvesToggle?.checked,
        titleBarPosition,
        tiltDegree,
        tiltOffsetDirection,
        tiltCoverSizePct,
        collageCoverCount: getCollageCoverCount(),
        qrCodeUrl: elements.qrUrlInput?.value || '',
        qrCodeText: (qrTextContent !== CONFIG.PLACEHOLDERS.qrText) ? qrTextContent : '',
      },
      styles: captureStyleGroups(),
      images: {
        frontCover: getUploaderImageSrc(elements.frontCoverUploader),
        frontCoverIsAutoGenerated: elements.frontCoverUploader?.querySelector('img')?.dataset.isAutoGenerated === 'true',
        branding: getUploaderImageSrc(elements.brandingUploader),
      },
    };
  }
  
  function downloadBooklist(state) {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    // Sanitize filename: only remove characters forbidden by file systems
    const safeBase = (state.meta?.listName || 'booklist').replace(/[<>:"/\\|?*]+/g, '').trim() || 'booklist';
    const suggestedName = `${safeBase}.booklist`;
    
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 750);
    return true;
  }
  
  function applyStyleGroups(loadedStyles) {
    if (!loadedStyles) return;
    
    document.querySelectorAll('.export-controls .form-group[data-style-group]').forEach(group => {
      const s = loadedStyles[group.dataset.styleGroup];
      if (!s) return;
      
      const fontSel = group.querySelector('.font-select');
      const sizeInp = group.querySelector('.font-size-input');
      const colorInp = group.querySelector('.color-picker');
      const boldBtn = group.querySelector('.bold-toggle');
      const italicBtn = group.querySelector('.italic-toggle');
      const lineSpacingInp = group.querySelector('.line-spacing');
      
      if (fontSel) fontSel.value = s.font ?? fontSel.value;
      if (sizeInp) sizeInp.value = s.sizePt ?? sizeInp.value;
      if (colorInp) colorInp.value = s.color ?? colorInp.value;
      if (boldBtn) boldBtn.classList.toggle('active', !!s.bold);
      if (italicBtn) italicBtn.classList.toggle('active', !!s.italic);
      if (lineSpacingInp && s.lineSpacing != null) lineSpacingInp.value = s.lineSpacing;
    });
    
    // Cover title styles
    const ct = loadedStyles.coverTitle || {};
    
    // Shared settings
    const setNum = (id, val) => { const el = document.getElementById(id); if (el && typeof val === 'number') el.value = val; };
    const setStr = (id, val) => { const el = document.getElementById(id); if (el && typeof val === 'string') el.value = val; };
    
    setNum('cover-title-outer-margin', ct.outerMarginPt);
    setNum('cover-title-pad-x', ct.padXPt);
    setNum('cover-title-pad-y', ct.padYPt);
    setNum('cover-title-side-margin', ct.sideMarginPt);
    setStr('cover-title-bg-color', ct.bgColor);
    const gradToggle = document.getElementById('cover-title-gradient-toggle');
    if (gradToggle) gradToggle.checked = !!ct.bgGradient;
    setStr('cover-title-bg-color2', ct.bgColor2 || '#333333');
    const bgColor2El = document.getElementById('cover-title-bg-color2');
    // If the gradient input was wrapped by setupColorPopovers, hide/show
    // the wrapper so the palette trigger hides along with the input.
    const bgColor2Target = bgColor2El?.closest('.color-palette-wrap') || bgColor2El;
    if (bgColor2Target) bgColor2Target.style.display = ct.bgGradient ? '' : 'none';

    // Simple mode styling
    const simple = ct.simple || {};
    if (elements.coverFontSelect) elements.coverFontSelect.value = simple.font ?? elements.coverFontSelect.value;
    if (elements.coverFontSize) elements.coverFontSize.value = simple.sizePt ?? 40;
    if (elements.coverTextColor) elements.coverTextColor.value = simple.color ?? '#FFFFFF';
    if (elements.coverBoldToggle) elements.coverBoldToggle.classList.toggle('active', simple.bold !== false);
    if (elements.coverItalicToggle) elements.coverItalicToggle.classList.toggle('active', !!simple.italic);
    
    // Advanced mode per-line styling with individual spacing
    const savedLines = ct.lines || [];
    const defaultSizes = [35, 25, 20];
    elements.coverLines.forEach((line, i) => {
      const saved = savedLines[i] || {};
      if (line.font) line.font.value = saved.font ?? "'Oswald', sans-serif";
      if (line.size) line.size.value = saved.sizePt ?? defaultSizes[i];
      if (line.color) line.color.value = saved.color ?? '#FFFFFF';
      if (line.bold) line.bold.classList.toggle('active', i === 0 ? saved.bold !== false : !!saved.bold);
      if (line.italic) line.italic.classList.toggle('active', !!saved.italic);
      // Restore per-line spacing (only for lines 2 and 3)
      if (i > 0 && line.spacing) {
        line.spacing.value = saved.spacingPt ?? 10;
      }
    });
    
    // Refresh custom font dropdowns to reflect loaded values
    refreshAllCustomFontDropdowns();
  }
  
  /**
   * Refreshes all custom font dropdowns to sync with their hidden select values
   */
  function refreshAllCustomFontDropdowns() {
    document.querySelectorAll('.font-select.has-custom-dropdown').forEach(select => {
      if (select._customDropdown) {
        select._customDropdown.updateValue(select.value);
      }
    });
  }
  
  /**
   * Normalize a saved branding image URL so it loads from the current origin
   * when possible. Old .booklist files baked absolute URLs into the branding
   * src (see getUploaderImageSrc history), and loading an absolute
   * booklister.org URL on a different booklister.org subdomain produces a
   * cross-origin image that renders in the DOM preview but taints the
   * html2canvas capture during PDF export. Stripping the origin turns the
   * reference back into a same-origin relative path, which every deployment
   * resolves locally.
   */
  function normalizeBrandingUrl(rawSrc) {
    if (!rawSrc || typeof rawSrc !== 'string') return rawSrc;
    // Data URLs have no origin and no CORS issues.
    if (rawSrc.startsWith('data:')) return rawSrc;
    // Only rewrite absolute HTTP(S) URLs on known booklister.org hosts.
    try {
      const u = new URL(rawSrc);
      if (u.hostname === 'booklister.org' || u.hostname.endsWith('.booklister.org')) {
        return u.pathname + u.search + u.hash;
      }
      return rawSrc;
    } catch {
      // Not a valid absolute URL — probably already a relative path.
      return rawSrc;
    }
  }

  function applyUploaderImage(uploaderEl, dataUrl) {
    if (!uploaderEl) return;
    const img = uploaderEl.querySelector('img');
    if (!img) return;
    
    // Treat transparent placeholder GIF as null (handles legacy drafts)
    const isTransparentGif = dataUrl && dataUrl === CONFIG.TRANSPARENT_GIF;
    
    if (dataUrl && !isTransparentGif) {
      img.src = dataUrl;
      img.dataset.isPlaceholder = "false";
      uploaderEl.classList.add('has-image');
    } else {
      // Reset to transparent gif so placeholder text shows via CSS
      img.src = CONFIG.TRANSPARENT_GIF;
      img.dataset.isPlaceholder = 'true';
      uploaderEl.classList.remove('has-image');
    }
  }
  
  function applyState(loaded, { silent = false } = {}) {
    if (!loaded || loaded.schema !== 'booklist-v1') {
      if (!silent) showNotification('Invalid or unsupported booklist file.', 'error');
      return;
    }
    
    // Restore list name (with backwards compatibility for older files)
    const listName = loaded.meta?.listName || loaded.meta?.fileNameHint || '';
    if (elements.listNameInput) {
      elements.listNameInput.value = listName !== 'booklist' ? listName : '';
    }
    
    // UI toggles
    if (elements.toggleQrCode) elements.toggleQrCode.checked = !!loaded.ui?.showQr;
    if (elements.toggleBranding) elements.toggleBranding.checked = !!loaded.ui?.showBranding;
    if (elements.stretchCoversToggle) elements.stretchCoversToggle.checked = !!loaded.ui?.stretchCovers;
    if (elements.stretchBlockCoversToggle) elements.stretchBlockCoversToggle.checked = !!loaded.ui?.stretchBlockCovers;
    
    // Restore cover mode and text
    const isAdvancedMode = !!loaded.ui?.coverAdvancedMode;
    if (elements.coverAdvancedToggle) {
      elements.coverAdvancedToggle.checked = isAdvancedMode;
      toggleCoverMode(isAdvancedMode);
    }
    
    // Simple mode text (with backwards compatibility)
    if (elements.coverTitleInput) {
      elements.coverTitleInput.value = loaded.ui?.coverTitle || '';
    }
    
    // Advanced mode line texts
    const savedLineTexts = loaded.ui?.coverLineTexts || [];
    elements.coverLines.forEach((line, i) => {
      if (line.input) {
        line.input.value = savedLineTexts[i] || '';
      }
    });
    
    // Restore collage layout selection
    const savedLayout = loaded.ui?.collageLayout || 'classic';
    if (elements.collageLayoutSelector) {
      elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.layout === savedLayout);
      });
    }
    
    // Restore show shelves toggle for classic layout
    if (elements.showShelvesToggle) {
      elements.showShelvesToggle.checked = !!loaded.ui?.showShelves;
    }
    
    // Restore title bar position
    if (elements.titleBarPosition) {
      elements.titleBarPosition.value = loaded.ui?.titleBarPosition || 'classic';
    }
    
    // Restore tilted layout settings
    if (elements.tiltDegree) {
      elements.tiltDegree.value = loaded.ui?.tiltDegree ?? -25;
    }
    if (elements.tiltOffsetDirection) {
      elements.tiltOffsetDirection.value = loaded.ui?.tiltOffsetDirection || 'vertical';
    }
    if (elements.tiltCoverSize) {
      // Back-compat: older saves don't have this field. Default to
      // 100 (no shrink) so existing drafts open unchanged.
      const loadedPct = loaded.ui?.tiltCoverSizePct;
      const pct = (typeof loadedPct === 'number' && isFinite(loadedPct))
        ? Math.max(50, Math.min(100, loadedPct))
        : 100;
      elements.tiltCoverSize.value = pct;
    }
    
    // Show/hide tilted settings based on layout
    updateTiltedSettingsVisibility();
    
    // Restore collage cover count (12 / 16 / 20) with backward compat
    // for the legacy boolean `extendedCollageMode` field.
    let loadedCoverCount = loaded.ui?.collageCoverCount;
    if (typeof loadedCoverCount !== 'number') {
      loadedCoverCount = loaded.ui?.extendedCollageMode
        ? CONFIG.MAX_COVERS_FOR_COLLAGE
        : CONFIG.MIN_COVERS_FOR_COLLAGE;
    }
    if (CONFIG.COLLAGE_COVER_COUNTS.indexOf(loadedCoverCount) === -1) {
      loadedCoverCount = CONFIG.MIN_COVERS_FOR_COLLAGE;
    }
    const isExtendedMode = loadedCoverCount > CONFIG.MIN_COVERS_FOR_COLLAGE;
    setCollageCoverCountUI(loadedCoverCount);

    // Load extra collage covers (will be rendered after books are loaded)
    extraCollageCovers = Array.isArray(loaded.extraCollageCovers)
      ? loaded.extraCollageCovers.map(ec => ({
          id: ec.id || `extra-${crypto.randomUUID()}`,
          coverData: ec.coverData || null
        })).filter(ec => ec.coverData)
      : [];

    // QR Code URL
    if (elements.qrUrlInput) elements.qrUrlInput.value = loaded.ui?.qrCodeUrl || '';
    
    // QR Code Text
    if (elements.qrCodeTextArea) {
      const loadedText = (loaded.ui?.qrCodeText || '').trim();
      if (loadedText && loadedText !== CONFIG.PLACEHOLDERS.qrText) {
        elements.qrCodeTextArea.innerText = loadedText;
        elements.qrCodeTextArea.style.color = '';
        // Mirror into the DOM-independent source of truth so a later
        // serializeState call reads it correctly even if the QR area
        // is hidden (Show QR Code toggled off).
        _currentQrText = loadedText;
      } else {
        elements.qrCodeTextArea.innerText = CONFIG.PLACEHOLDERS.qrText;
        elements.qrCodeTextArea.style.color = CONFIG.PLACEHOLDER_COLOR;
        _currentQrText = '';
      }
    }
    
    // Regenerate QR code
    elements.qrCodeCanvas.innerHTML = '';
    const loadedUrl = loaded.ui?.qrCodeUrl || '';
    if (loadedUrl) {
      try {
        new QRCode(elements.qrCodeCanvas, {
          text: loadedUrl,
          width: CONFIG.QR_SIZE_PX,
          height: CONFIG.QR_SIZE_PX,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel[CONFIG.QR_ERROR_CORRECTION]
        });
      } catch (err) {
        console.error("Failed to re-generate QR code on load:", err);
        elements.qrCodeCanvas.innerHTML = `<img alt="QR Code Placeholder" src="${CONFIG.PLACEHOLDER_QR_URL}"/>`;
      }
    } else {
      elements.qrCodeCanvas.innerHTML = `<img alt="QR Code Placeholder" src="${CONFIG.PLACEHOLDER_QR_URL}"/>`;
    }
    
    // Styles
    applyStyleGroups(loaded.styles);
    
    // Images
    applyUploaderImage(elements.frontCoverUploader, loaded.images?.frontCover || null);
    // Restore isAutoGenerated flag for front cover
    const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
    if (frontCoverImg) {
      frontCoverImg.dataset.isAutoGenerated = loaded.images?.frontCoverIsAutoGenerated ? 'true' : 'false';
    }
    applyUploaderImage(elements.brandingUploader, normalizeBrandingUrl(loaded.images?.branding || null));
    
    // Books
    const incoming = Array.isArray(loaded.books) ? loaded.books : [];
    let starCount = 0;
    // In extended mode (16 or 20), allow up to TOTAL_SLOTS (15) starred
    // books so the extras grid can show "from list" entries above the
    // standard 12. In 12-count mode, cap at 12.
    const maxStars = isExtendedMode ? CONFIG.TOTAL_SLOTS : CONFIG.MIN_COVERS_FOR_COLLAGE;
    myBooklist = incoming.slice(0, CONFIG.TOTAL_SLOTS).map(b => {
      const wasStarred = b.includeInCollage !== false;
      const shouldStar = wasStarred && !b.isBlank && starCount < maxStars;
      if (shouldStar) starCount++;
      
      return {
        key: b.key,
        isBlank: !!b.isBlank,
        title: b.title ?? CONFIG.PLACEHOLDERS.title,
        author: b.author ?? CONFIG.PLACEHOLDERS.author,
        callNumber: b.callNumber ?? CONFIG.PLACEHOLDERS.callNumber,
        authorDisplay: b.authorDisplay || null,
        description: b.description ?? CONFIG.PLACEHOLDERS.description,
        cover_ids: Array.isArray(b.cover_ids) ? b.cover_ids : [],
        currentCoverIndex: typeof b.currentCoverIndex === 'number' ? b.currentCoverIndex : 0,
        customCoverData: b.customCoverData || null,
        includeInCollage: shouldStar,
      };
    });
    
    while (myBooklist.length < CONFIG.TOTAL_SLOTS) {
      myBooklist.push(BookUtils.createBlankBook());
    }
    
    handleLayoutChange();
    renderBooklist();
    applyStyles();
    applyBlockCoverStyle();
    updateBackCoverVisibility();

    // Apply collage cover count AFTER books are loaded so renderExtraCoversGrid sees the correct data
    setCollageCoverCount(loadedCoverCount, true);

    // Auto-generate cover collage if:
    // 1. All required covers are present
    // 2. Front cover is empty
    // 3. User previously had an auto-generated cover (flag explicitly true)
    // This respects user intent - if they never generated or uploaded custom, don't assume
    const hasFrontCover = elements.frontCoverUploader?.classList.contains('has-image');
    const wasAutoGenerated = loaded.images?.frontCoverIsAutoGenerated === true;

    if (!silent && BookUtils.hasEnoughCoversForCollage(myBooklist, extraCollageCovers, loadedCoverCount) && !hasFrontCover && wasAutoGenerated) {
      // Small delay to ensure DOM is ready
      setTimeout(() => generateCoverCollage(), 150);
    }

    if (!silent) showNotification('Booklist loaded.', 'success');
  }
  
  // Local draft storage (IndexedDB — no localStorage size limits)
  let _draftSaveGenId = 0; // Generation counter to handle concurrent saves

  function saveDraftLocal() {
    const thisGenId = ++_draftSaveGenId;
    const s = serializeState();
    _putImageIDB('draft', JSON.stringify(s)).then(() => {
      // Only update flags if this is still the latest save
      if (thisGenId === _draftSaveGenId) {
        isDirtyLocal = false;
      }
      try { localStorage.setItem('has-draft', 'true'); } catch {}
    }).catch(() => {
      showNotification('Failed to save draft. Use Save to download a .booklist file.', 'error');
    });
  }

  async function restoreDraftLocalIfPresent() {
    try {
      // Check for legacy localStorage draft and migrate to IndexedDB
      try {
        const legacyRaw = localStorage.getItem('booklist-draft');
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          // Restore front cover from old IDB key
          try {
            const frontCover = await _getImageIDB('draft-front-cover');
            if (frontCover && parsed.images) parsed.images.frontCover = frontCover;
          } catch {}
          // Migrate to new IDB key
          await _putImageIDB('draft', JSON.stringify(parsed));
          // Clean up old storage
          localStorage.removeItem('booklist-draft');
          _deleteImageIDB('draft-front-cover');
          try { localStorage.setItem('has-draft', 'true'); } catch {}
          applyState(parsed);
          showNotification('Draft restored from this browser.', 'success');
          return;
        }
      } catch { /* legacy migration failed — try new IDB path */ }

      // Read from IndexedDB
      const raw = await _getImageIDB('draft');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      applyState(parsed);
      showNotification('Draft restored from this browser.', 'success');
    } catch { /* ignore corrupt data */ }
  }

  function resetToBlank() {
    try { localStorage.removeItem('has-draft'); } catch {}
    // Clear draft and legacy keys from IndexedDB
    _deleteImageIDB('draft');
    _deleteImageIDB('draft-front-cover');
    isDirtyLocal = false; // Prevent beforeunload after user already confirmed reset
    location.reload();
  }
  
  // ---------------------------------------------------------------------------
  // File Upload Handlers
  // ---------------------------------------------------------------------------
  
  /**
   * Adds drag-and-drop functionality to an uploader element
   * @param {HTMLElement} uploaderElement - The uploader container
   * @param {Function} onFileDrop - Callback when a valid image file is dropped
   */
  function setupDragDropUpload(uploaderElement, onFileDrop) {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      uploaderElement.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // Highlight on drag enter/over
    ['dragenter', 'dragover'].forEach(eventName => {
      uploaderElement.addEventListener(eventName, () => {
        uploaderElement.classList.add('drag-over');
      });
    });
    
    // Remove highlight on drag leave/drop
    ['dragleave', 'drop'].forEach(eventName => {
      uploaderElement.addEventListener(eventName, () => {
        uploaderElement.classList.remove('drag-over');
      });
    });
    
    // Handle dropped files
    uploaderElement.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        // Check if the file is an image
        if (file.type.startsWith('image/')) {
          onFileDrop(file);
        } else {
          showNotification('Please drop an image file.', 'error');
        }
      }
    });
  }
  
  function setupFileChangeHandler(uploaderElement) {
    const fileInput = uploaderElement.querySelector('input[type="file"]');
    const imgElement = uploaderElement.querySelector('img');

    // Shared handler for processing an image file
    const processImageFile = (file) => {
      pushUndo('upload-branding');
      const reader = new FileReader();
      reader.onload = (event) => {
        compressImage(event.target.result, { maxDimension: 3000 }).then(compressed => {
          imgElement.src = compressed;
          imgElement.dataset.isPlaceholder = "false";
          uploaderElement.classList.add('has-image');
          debouncedSave();
        });
      };
      reader.onerror = () => showNotification('Failed to read image file.', 'error');
      reader.readAsDataURL(file);
    };
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        processImageFile(file);
      }
      // Clear input so same file can be re-selected
      e.target.value = '';
    });
    
    // Add drag-and-drop support
    setupDragDropUpload(uploaderElement, processImageFile);
  }
  
  function setupFrontCoverHandler() {
    const frontCoverFileInput = elements.frontCoverUploader.querySelector('input[type="file"]');
    const frontCoverImgElement = elements.frontCoverUploader.querySelector('img');

    // Shared handler for processing an image file
    const processImageFile = (file) => {
      pushUndo('upload-front-cover');
      elements.frontCoverUploader.dataset.fileName = file.name;

      const reader = new FileReader();
      reader.onload = (event) => {
        compressImage(event.target.result, { maxDimension: 4800 }).then(compressed => {
          frontCoverImgElement.src = compressed;
          frontCoverImgElement.dataset.isPlaceholder = "false";
          frontCoverImgElement.dataset.isAutoGenerated = "false";
          elements.frontCoverUploader.classList.add('has-image');
          debouncedSave(); // Save draft with updated flag

          // Folio: excited about front cover upload
          if (window.folio) {
            window.folio.react('nod');
            setTimeout(function() { if (window.folio) window.folio.setState('excited', 'cover-uploaded'); }, 300);
            setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
          }
        });
      };
      reader.onerror = () => showNotification('Failed to read image file.', 'error');
      reader.readAsDataURL(file);
    };
    
    frontCoverFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        processImageFile(file);
      }
      // Clear input so same file can be re-selected
      e.target.value = '';
    });
    
    // Add drag-and-drop support
    setupDragDropUpload(elements.frontCoverUploader, processImageFile);
    
    elements.frontCoverUploader.addEventListener('click', () => {
      frontCoverFileInput.click();
    });
  }
  
  // ---------------------------------------------------------------------------
  // Drag and Drop (Sortable)
  // ---------------------------------------------------------------------------
  function initializeSortable() {
    const sortableOptions = {
      group: 'shared-list',
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      onStart: function() {
        // Folio: watch the drag
        if (window.folio) window.folio.react('watch');
      },
      onEnd: function() {
        pushUndo('drag-reorder');
        // Folio: acknowledge the reorder
        if (window.folio) {
          window.folio.stopWatch();
          window.folio.react('nod');
        }
        const newBooklist = [];
        const allPanelItems = [
          ...Array.from(elements.insideLeftPanel.children),
          ...Array.from(elements.insideRightPanel.children),
          ...Array.from(elements.backCoverPanel.querySelectorAll('.list-item'))
        ];
        
        const allIds = allPanelItems.map(item => item.dataset.id).filter(id => id);
        
        allIds.forEach(id => newBooklist.push(myBooklist.find(b => b.key === id)));
        
        const currentIds = new Set(newBooklist.map(b => b.key));
        const allBookIds = new Set(myBooklist.map(b => b.key));
        allBookIds.forEach(id => {
          if (!currentIds.has(id)) {
            newBooklist.push(myBooklist.find(b => b.key === id));
          }
        });
        
        myBooklist = newBooklist;
        renderBooklist();
        
        // Auto-regenerate if there's an auto-generated cover
        const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
        if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
          generateCoverCollage();
        }
      },
    };
    
    new Sortable(elements.insideLeftPanel, sortableOptions);
    new Sortable(elements.insideRightPanel, sortableOptions);
    new Sortable(elements.backCoverPanel, sortableOptions);
    
    // Extra covers sortable (only for draggable-extra items, not from-list)
    if (elements.extraCoversGrid) {
      new Sortable(elements.extraCoversGrid, {
        handle: '.extra-drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        filter: '.from-list, .slot-placeholder',
        draggable: '.draggable-extra',
        onEnd: function() {
          pushUndo('reorder-extra');
          // Rebuild extraCollageCovers array based on new order
          const draggableItems = elements.extraCoversGrid.querySelectorAll('.draggable-extra');
          const newOrder = [];
          draggableItems.forEach(item => {
            const extraId = item.dataset.extraId;
            const cover = extraCollageCovers.find(c => c.id === extraId);
            if (cover) newOrder.push(cover);
          });
          extraCollageCovers = newOrder;
          debouncedSave();
          
          // Auto-regenerate if there's an auto-generated cover
          const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
          if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
            generateCoverCollage();
          }
        }
      });
    }
  }
  
  // ---------------------------------------------------------------------------
  // Event Binding
  // ---------------------------------------------------------------------------
  function bindEvents() {
    // Search form
    elements.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      getBooks();
    });
    
    // Folio: perk when search input is focused
    elements.searchForm.querySelectorAll('input').forEach(function(input) {
      input.addEventListener('focus', function() {
        if (window.folio) window.folio.react('perk');
      });
    });

    // Auto-draft description toggle (branded instances only; the row
    // itself stays hidden on the public tool via applyLibraryConfig).
    if (elements.autoDescriptionToggle) {
      elements.autoDescriptionToggle.addEventListener('change', () => {
        setAutoDescriptionPreference(elements.autoDescriptionToggle.checked);
      });
    }
    
    // List name input (triggers autosave). Uses the same pre-edit
    // snapshot pattern as QR URL and the style inputs: text inputs
    // have their .value mutated by the browser BEFORE the input event
    // fires, so a plain pushUndo call would capture post-edit state.
    if (elements.listNameInput) {
      elements.listNameInput.addEventListener('focus', capturePreEditSnapshot);
      elements.listNameInput.addEventListener('blur', clearPreEditSnapshot);
      elements.listNameInput.addEventListener('input', () => {
        commitPreEditSnapshot('edit-list-name');
        debouncedSave();
      });
    }
    
    // Cover generation
    elements.generateCoverButton.addEventListener('click', () => {
      pushUndo('generate-collage');
      generateCoverCollage();
    });
    // Stretch toggles: capture BEFORE the change event (which fires
    // after the checkbox is already flipped). mousedown/keydown both
    // fire pre-mutation.
    bindPreChangeCapture(elements.stretchCoversToggle, 'change-style');
    elements.stretchCoversToggle.addEventListener('change', () => {
      autoRegenerateCoverIfAble();
      debouncedSave();
    });
    bindPreChangeCapture(elements.stretchBlockCoversToggle, 'change-style');
    elements.stretchBlockCoversToggle.addEventListener('change', () => {
      applyBlockCoverStyle();
      debouncedSave();
    });
    
    // Layout selector
    if (elements.collageLayoutSelector) {
      elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(option => {
        option.addEventListener('click', () => {
          pushUndo('change-layout');
          elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');
          // Show/hide tilted settings based on selected layout
          updateTiltedSettingsVisibility();
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
        // Folio: evaluating when hovering layouts
        option.addEventListener('mouseenter', function() {
          if (window.folio) {
            if (window.folio.currentState() !== 'evaluating') window.folio.react('perk');
            window.folio.setState('evaluating', 'comparing-layouts');
          }
        });
      });
      // Folio: back to idle when leaving layout selector
      elements.collageLayoutSelector.addEventListener('mouseleave', function() {
        if (window.folio) window.folio.setState('idle');
      });
    }
    
    // Show shelves toggle for classic layout
    if (elements.showShelvesToggle) {
      bindPreChangeCapture(elements.showShelvesToggle, 'change-style');
      elements.showShelvesToggle.addEventListener('change', () => {
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }

    // Title bar position dropdown
    if (elements.titleBarPosition) {
      bindPreChangeCapture(elements.titleBarPosition, 'change-style');
      elements.titleBarPosition.addEventListener('change', () => {
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }

    // Tilted layout settings. tiltDegree is a number input — use the
    // pre-edit snapshot pattern with focus/blur so typing captures the
    // state before the first keystroke, matching other style inputs.
    if (elements.tiltDegree) {
      elements.tiltDegree.addEventListener('focus', capturePreEditSnapshot);
      elements.tiltDegree.addEventListener('blur', clearPreEditSnapshot);
      elements.tiltDegree.addEventListener('input', () => {
        commitPreEditSnapshot('change-style');
        debouncedSave();
        debouncedCoverRegen();
      });
      elements.tiltDegree.addEventListener('change', () => {
        commitPreEditSnapshot('change-style');
        debouncedSave();
        debouncedCoverRegen();
      });
    }
    if (elements.tiltOffsetDirection) {
      bindPreChangeCapture(elements.tiltOffsetDirection, 'change-style');
      elements.tiltOffsetDirection.addEventListener('change', () => {
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    // Tilted cover size (percent) — number input, same pre-edit
    // snapshot pattern as tiltDegree.
    if (elements.tiltCoverSize) {
      elements.tiltCoverSize.addEventListener('focus', capturePreEditSnapshot);
      elements.tiltCoverSize.addEventListener('blur', () => {
        clearPreEditSnapshot();
        // Snap out-of-range values back to valid range on blur so the
        // field always shows a value the user can trust. The HTML
        // min/max attributes are advisory — users can type anything.
        const raw = parseFloat(elements.tiltCoverSize.value);
        if (!isFinite(raw)) {
          elements.tiltCoverSize.value = 100;
        } else {
          elements.tiltCoverSize.value = Math.max(50, Math.min(100, raw));
        }
      });
      elements.tiltCoverSize.addEventListener('input', () => {
        commitPreEditSnapshot('change-style');
        debouncedSave();
        debouncedCoverRegen();
      });
      elements.tiltCoverSize.addEventListener('change', () => {
        commitPreEditSnapshot('change-style');
        debouncedSave();
        debouncedCoverRegen();
      });
    }


    // Margins & Padding inputs. Number inputs mutate BEFORE the input
    // event, so use the pre-edit snapshot pattern (focus → capture,
    // first input → commit, blur → clear) so undo captures the state
    // before the user started typing.
    ['cover-title-outer-margin', 'cover-title-side-margin', 'cover-title-pad-x', 'cover-title-pad-y'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('focus', capturePreEditSnapshot);
        input.addEventListener('blur', clearPreEditSnapshot);
        input.addEventListener('input', () => {
          commitPreEditSnapshot('change-cover-style');
          debouncedSave();
        });
        input.addEventListener('change', autoRegenerateCoverIfAble);
      }
    });

    // BG Color picker. Color pickers mutate BEFORE input fires, so
    // same pre-edit snapshot pattern.
    const bgColorPicker = document.getElementById('cover-title-bg-color');
    if (bgColorPicker) {
      bgColorPicker.addEventListener('focus', capturePreEditSnapshot);
      bgColorPicker.addEventListener('blur', clearPreEditSnapshot);
      bgColorPicker.addEventListener('input', () => {
        commitPreEditSnapshot('change-cover-style');
        debouncedSave();
      });
      bgColorPicker.addEventListener('change', autoRegenerateCoverIfAble);
    }

    // Gradient toggle checkbox. Pre-change capture (mousedown/keydown)
    // so undo/redo sees the pre-flip state.
    const gradToggle = document.getElementById('cover-title-gradient-toggle');
    if (gradToggle) {
      bindPreChangeCapture(gradToggle, 'change-cover-style');
      gradToggle.addEventListener('change', () => {
        const bgColor2El = document.getElementById('cover-title-bg-color2');
        // Target the palette wrapper if it exists so the trigger
        // button hides/shows alongside the color input.
        const target = bgColor2El?.closest('.color-palette-wrap') || bgColor2El;
        if (target) target.style.display = gradToggle.checked ? '' : 'none';
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }

    // Gradient end color picker. Color inputs mutate BEFORE input
    // fires, so use the focus/blur pre-edit snapshot pattern to
    // capture the pre-interaction color.
    const bgColor2Picker = document.getElementById('cover-title-bg-color2');
    if (bgColor2Picker) {
      bgColor2Picker.addEventListener('focus', capturePreEditSnapshot);
      bgColor2Picker.addEventListener('blur', clearPreEditSnapshot);
      bgColor2Picker.addEventListener('input', () => {
        commitPreEditSnapshot('change-cover-style');
        debouncedSave();
      });
      bgColor2Picker.addEventListener('change', autoRegenerateCoverIfAble);
    }

    // Cover mode toggle
    if (elements.coverAdvancedToggle) {
      bindPreChangeCapture(elements.coverAdvancedToggle, 'change-style');
      elements.coverAdvancedToggle.addEventListener('change', (e) => {
        toggleCoverMode(e.target.checked);
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    
    // Simple mode: textarea handler. The textarea lives in #cover-simple-mode
    // (a separate form-group from #cover-title-style-group), so the main
    // style-groups loop below doesn't catch it and a dedicated handler is
    // needed.
    if (elements.coverTitleInput) {
      // Pre-edit snapshot pattern for the simple-mode cover title
      // textarea. The previous plain pushUndo() path captured the
      // post-mutation DOM state (the textarea's .value has already
      // been updated by the browser before `input` fires), which
      // made Ctrl+Z a no-op for the first coalesced edit and could
      // visually manifest as undo/redo "doubling" the text. Same
      // pattern used by the advanced-mode line inputs and qr text.
      elements.coverTitleInput.addEventListener('focus', capturePreEditSnapshot);
      elements.coverTitleInput.addEventListener('blur', clearPreEditSnapshot);
      elements.coverTitleInput.addEventListener('input', () => {
        commitPreEditSnapshot('edit-cover-text');
        debouncedSave();
        debouncedCoverRegen();
      });
    }

    // NOTE: Simple mode style controls (cover-font-select, cover-font-size,
    // cover-text-color) and the cover-bold-toggle / cover-italic-toggle
    // buttons used to have dedicated handlers here. They were REMOVED because
    // those elements live inside #cover-title-style-group, which is already
    // bound by the main style-groups loop further down. The dedicated
    // handlers were duplicating every click and double-toggling the 'active'
    // class on the bold/italic buttons, which is why those toggles silently
    // stopped working. The main loop handles all of these elements correctly
    // (with the pre-edit pattern for undo and debouncedSave() on every edit).

    // Advanced mode: per-line inputs and style controls
    elements.coverLines.forEach(line => {
      // Text input — pre-edit pattern so undo captures state BEFORE typing.
      if (line.input) {
        line.input.addEventListener('focus', capturePreEditSnapshot);
        line.input.addEventListener('blur', clearPreEditSnapshot);
        line.input.addEventListener('input', () => {
          commitPreEditSnapshot('edit-cover-text');
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Font select — pre-edit pattern.
      if (line.font) {
        line.font.addEventListener('focus', capturePreEditSnapshot);
        line.font.addEventListener('blur', clearPreEditSnapshot);
        line.font.addEventListener('change', () => {
          commitPreEditSnapshot('change-cover-style');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Size input — pre-edit pattern.
      if (line.size) {
        line.size.addEventListener('focus', capturePreEditSnapshot);
        line.size.addEventListener('blur', clearPreEditSnapshot);
        line.size.addEventListener('input', () => {
          commitPreEditSnapshot('change-cover-style');
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Color picker — pre-edit pattern. This is the big one: without the
      // pre-edit capture, Ctrl+Z on colors would pop the already-dragged-to
      // color instead of reverting to what it was before the picker opened.
      if (line.color) {
        line.color.addEventListener('focus', capturePreEditSnapshot);
        line.color.addEventListener('blur', clearPreEditSnapshot);
        line.color.addEventListener('input', () => {
          commitPreEditSnapshot('change-cover-style');
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Spacing input — pre-edit pattern. Both input and change fire on
      // number inputs; both go through the same commit helper so only one
      // undo entry is pushed per focus session.
      if (line.spacing) {
        line.spacing.addEventListener('focus', capturePreEditSnapshot);
        line.spacing.addEventListener('blur', clearPreEditSnapshot);
        line.spacing.addEventListener('input', () => {
          commitPreEditSnapshot('change-cover-style');
          debouncedSave();
          debouncedCoverRegen();
        });
        line.spacing.addEventListener('change', () => {
          commitPreEditSnapshot('change-cover-style');
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Bold toggle — button, pushUndo-before-mutation works correctly.
      if (line.bold) {
        line.bold.addEventListener('click', () => {
          pushUndo('change-cover-style');
          line.bold.classList.toggle('active');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Italic toggle — button, pushUndo-before-mutation works correctly.
      if (line.italic) {
        line.italic.addEventListener('click', () => {
          pushUndo('change-cover-style');
          line.italic.classList.toggle('active');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
    });
    
    // Layout toggles. Same pre-change capture pattern — change fires
    // after the checkbox is already flipped, so hook mousedown/keydown.
    bindPreChangeCapture(elements.toggleQrCode, 'toggle-ui');
    elements.toggleQrCode.addEventListener('change', () => {
      handleLayoutChange();
    });
    bindPreChangeCapture(elements.toggleBranding, 'toggle-ui');
    elements.toggleBranding.addEventListener('change', () => {
      handleLayoutChange();
    });
    
    // QR code
    elements.generateQrButton.addEventListener('click', () => {
      pushUndo('change-qr');
      generateQrCode();
    });
    
    // Spacing inputs and background color for cover auto-regen.
    // Undo capture for these is handled by the dedicated focus/blur
    // pre-edit snapshot handlers higher up (margins, bg colors); this
    // loop only triggers live regeneration on input/change so the
    // preview updates as the user drags a slider or edits a number.
    // Do NOT call pushUndo here — the event fires post-mutation and
    // would create duplicate undo entries on top of the pre-edit ones.
    const coverLayoutInputIds = ['cover-title-outer-margin', 'cover-title-pad-x', 'cover-title-pad-y', 'cover-title-side-margin', 'cover-title-bg-color', 'cover-title-bg-color2'];
    coverLayoutInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        ['input', 'change'].forEach(evt => el.addEventListener(evt, () => {
          debouncedSave();
          debouncedCoverRegen();
        }));
      }
    });
    
    // Style controls
    document.querySelectorAll('.export-controls .form-group[data-style-group], #cover-title-style-group').forEach(group => {
      // For input/select elements: use the pre-edit snapshot pattern so Ctrl+Z
      // actually works for color pickers, font selects, font-size fields, etc.
      // (The browser mutates the DOM value before the change/input event fires,
      // so a plain pushUndo in the handler would capture the post-change state.)
      // debouncedSave() is called on every change so style edits persist across
      // refresh/tab-close even when nothing else triggers a save.
      group.querySelectorAll('select, input').forEach(input => {
        input.addEventListener('focus', capturePreEditSnapshot);
        input.addEventListener('blur', clearPreEditSnapshot);
        input.addEventListener('change', () => {
          commitPreEditSnapshot('change-style');
          debouncedSave();
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            debouncedCoverRegen();
          }
        });
        input.addEventListener('input', () => {
          commitPreEditSnapshot('change-style');
          debouncedSave();
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            debouncedCoverRegen();
          }
        });
      });

      // For buttons: pushUndo-before-mutation works correctly because the
      // click handler runs before classList.toggle, so serializeState captures
      // the old class state. No pre-edit pattern needed, but debouncedSave()
      // is still required so the toggled state persists across refresh.
      group.querySelectorAll('button').forEach(button => {
        // Skip line-specific bold/italic buttons (they have their own handlers)
        if (button.classList.contains('line-bold') || button.classList.contains('line-italic')) {
          return;
        }
        button.addEventListener('click', (e) => {
          pushUndo('change-style');
          if (e.target.classList.contains('bold-toggle') || e.target.classList.contains('italic-toggle')) {
            e.target.classList.toggle('active');
          }
          debouncedSave();
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            autoRegenerateCoverIfAble();
          }
        });
      });
    });
    
    // Header actions
    elements.exportPdfButton.addEventListener('click', exportPdf);
    
    elements.saveListButton.addEventListener('click', () => {
      const state = serializeState();
      const didSave = downloadBooklist(state);
      if (didSave) {
        showNotification('Booklist saved to file.', 'success');
        saveDraftLocal(); // Sync browser draft with saved file (direct call, not debounced)
        isDirtyLocal = false;    // Nothing unsaved anywhere
        hasUnsavedFile = false;  // File has been downloaded
        updateSaveIndicator();
        // Folio: save complete
        if (window.folio) {
          window.folio.react('satisfied');
          window.folio.setState('excited', 'save-complete');
          setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 3000);
        }
      }
    });
    
    elements.loadListButton.addEventListener('click', () => {
      elements.loadListInput.click();
    });
    
    elements.loadListInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        clearUndoHistory();
        applyState(parsed);
        // Direct save (not debounced) so the IndexedDB draft reflects
        // the just-loaded file immediately. The previous code used
        // debouncedSave() which scheduled a write 400ms later — if the
        // user refreshed within that window (or the browser killed the
        // pending setTimeout on beforeunload), the IDB draft still
        // held the PREVIOUS draft and refresh would revert to it,
        // losing everything from the loaded file including the QR
        // blurb text. The save-file path at the button handler uses
        // saveDraftLocal() directly for the same reason; the load path
        // was just never updated to match.
        saveDraftLocal();
        hasUnsavedFile = false; // File was just loaded from disk
        updateSaveIndicator();
        // Folio: greet on file load (guard suppresses cascading hooks)
        if (window.folio) {
          window.folio.guard(3500);
          window.folio.setState('greeting', 'file-loaded');
          setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
        }
      } catch (err) {
        console.error('Import failed:', err);
        showNotification('Could not load this file. Is it a valid .booklist?', 'error');
      } finally {
        e.target.value = '';
      }
    });
    
    elements.resetBlankButton.addEventListener('click', () => {
      const ok = confirm('Reset to a blank list? This clears the current list and local draft. You can still load a saved .booklist later.');
      if (!ok) return;
      resetToBlank();
    });
    
    // File uploaders
    setupFileChangeHandler(elements.brandingUploader);
    setupFrontCoverHandler();

    // Branding delete button - clears the branding image
    const brandingDeleteBtn = elements.brandingUploader.querySelector('.branding-delete-btn');
    if (brandingDeleteBtn) {
      brandingDeleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pushUndo('upload-branding');
        const imgElement = elements.brandingUploader.querySelector('img');
        imgElement.src = CONFIG.TRANSPARENT_GIF;
        imgElement.dataset.isPlaceholder = 'true';
        elements.brandingUploader.classList.remove('has-image');
        debouncedSave();
      });
    }
    
    // Branding "Use Default" button - reloads the library-provided
    // default brand image. CSS hides this button on the public tool
    // (no library default exists); it only appears on branded
    // instances when applyLibraryConfig has added body.has-library-branding
    // AND the user has cleared their branding image. The guard below
    // is defensive in case the button is ever triggered without a
    // library default available.
    const brandingDefaultBtn = elements.brandingUploader.querySelector('.branding-default-btn');
    if (brandingDefaultBtn) {
      brandingDefaultBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const libraryBranding = window.LIBRARY_CONFIG && window.LIBRARY_CONFIG.brandingImagePath;
        if (!libraryBranding) return;
        pushUndo('upload-branding');
        const imgElement = elements.brandingUploader.querySelector('img');
        imgElement.src = libraryBranding;
        imgElement.dataset.isPlaceholder = 'false';
        elements.brandingUploader.classList.add('has-image');
        debouncedSave();
      });
    }

    // Front cover delete button - clears the cover image
    const coverDeleteBtn = elements.frontCoverUploader.querySelector('.cover-delete-btn');
    if (coverDeleteBtn) {
      coverDeleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pushUndo('upload-front-cover');
        const imgElement = elements.frontCoverUploader.querySelector('img');
        imgElement.src = CONFIG.TRANSPARENT_GIF;
        imgElement.dataset.isPlaceholder = 'true';
        imgElement.dataset.isAutoGenerated = 'false';
        elements.frontCoverUploader.classList.remove('has-image');
        debouncedSave();
      });
    }
  }
  
  // ---------------------------------------------------------------------------
  // QR Text Placeholder Setup
  // ---------------------------------------------------------------------------
  function setupQrPlaceholder() {
    setupPlaceholderField(elements.qrCodeTextArea, CONFIG.PLACEHOLDERS.qrText, {
      originalColor: getComputedStyle(elements.qrCodeTextArea).color
    });
    
    // Strip formatting on paste (same as other editable fields)
    elements.qrCodeTextArea.addEventListener('paste', handlePastePlainText);

    // Pre-edit snapshot pattern for undo. The QR blurb text is a
    // contenteditable div, so its DOM content is mutated BEFORE the
    // input event fires. serializeState reads the blurb text directly
    // from the DOM via innerText (no intermediate JS store), so plain
    // pushUndo on input would capture the post-edit state and Ctrl+Z
    // would be a no-op. Capture on focus, commit on first input, clear
    // on blur — same pattern used by style inputs.
    elements.qrCodeTextArea.addEventListener('focus', capturePreEditSnapshot);

    elements.qrCodeTextArea.addEventListener('input', () => {
      sanitizeContentEditable(elements.qrCodeTextArea);
      // Mirror current DOM text into the module-level source of truth
      // so serializeState can read it even if the QR area gets hidden
      // later (via Show QR Code toggle). Never store the placeholder
      // sentinel — that's managed separately by setupPlaceholderField.
      const txt = (elements.qrCodeTextArea.innerText || '').trim();
      _currentQrText = (txt && txt !== CONFIG.PLACEHOLDERS.qrText) ? txt : '';
      commitPreEditSnapshot('edit-qr-text');
      debouncedSave();
    });

    elements.qrCodeTextArea.addEventListener('blur', () => {
      clearPreEditSnapshot();
    });

    // Save QR URL input on change — uses the same pre-edit snapshot
    // pattern. The <input type="text"> value is mutated by the browser
    // before the input event fires, so without the pattern, pushUndo
    // captures post-edit state.
    if (elements.qrUrlInput) {
      elements.qrUrlInput.addEventListener('focus', capturePreEditSnapshot);
      elements.qrUrlInput.addEventListener('blur', clearPreEditSnapshot);
      elements.qrUrlInput.addEventListener('input', () => {
        commitPreEditSnapshot('edit-qr');
        debouncedSave();
      });
    }
  }
  
  // ---------------------------------------------------------------------------
  // Custom Font Dropdown System (Hover Preview)
  // ---------------------------------------------------------------------------
  
  /**
   * Creates a custom dropdown for a font select element
   * @param {HTMLSelectElement} select - The original select element
   * @param {Object} options - Configuration options
   * @param {string} options.type - 'cover-simple' | 'cover-advanced' | 'book-block'
   * @param {number} [options.lineIndex] - Line index for cover-advanced (0, 1, 2)
   */
  // Shared registry of open font dropdowns so a single document click handler
  // can close them all, instead of one document listener per dropdown.
  const openFontDropdowns = new Set();
  document.addEventListener('click', (e) => {
    openFontDropdowns.forEach(dd => {
      if (!dd.wrapper.contains(e.target)) {
        dd.close();
      }
    });
  });

  function createCustomFontDropdown(select, options = {}) {
    const { type } = options;
    
    // Mark original select as having custom dropdown
    select.classList.add('has-custom-dropdown');
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-font-dropdown';
    
    // Create trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-font-dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    
    // Create dropdown list
    const list = document.createElement('ul');
    list.className = 'custom-font-dropdown-list';
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    
    // Track state
    let isOpen = false;
    let committedValue = select.value;
    let highlightedIndex = -1;
    
    // Populate options
    function populateList() {
      list.innerHTML = '';
      Array.from(select.options).forEach((opt, idx) => {
        const li = document.createElement('li');
        li.className = 'custom-font-dropdown-option';
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        li.dataset.index = idx;
        li.textContent = opt.textContent;
        
        // Style each option in its respective font
        li.style.fontFamily = opt.value;
        
        if (opt.value === select.value) {
          li.classList.add('selected');
          li.setAttribute('aria-selected', 'true');
        }
        
        list.appendChild(li);
      });
    }
    
    // Update trigger display
    function updateTrigger() {
      const selectedOption = select.options[select.selectedIndex];
      if (selectedOption) {
        trigger.textContent = selectedOption.textContent;
        trigger.style.fontFamily = selectedOption.value;
      }
    }
    
    // Preview function based on type
    function triggerPreview(fontValue) {
      const originalValue = select.value;
      select.value = fontValue;
      
      if (type === 'cover-simple' || type === 'cover-advanced') {
        // Regenerate cover immediately for preview
        if (elements.frontCoverUploader?.classList.contains('has-image')) {
          generateCoverCollage();
        }
      } else if (type === 'book-block') {
        // Apply styles to book list
        applyStyles();
      }
      
      return originalValue;
    }
    
    // Revert preview
    function revertPreview() {
      select.value = committedValue;
      
      if (type === 'cover-simple' || type === 'cover-advanced') {
        if (elements.frontCoverUploader?.classList.contains('has-image')) {
          generateCoverCollage();
        }
      } else if (type === 'book-block') {
        applyStyles();
      }
    }
    
    // Commit selection
    function commitSelection(value) {
      // Capture the pre-edit snapshot BEFORE mutating the hidden select.
      // The custom dropdown handles user clicks on its own UI (trigger
      // button and option list), so the hidden <select> element never
      // receives a focus event from real interaction. The pre-edit
      // pattern attached to the hidden select in the main style-groups
      // loop therefore never fires, and the change event below ends up
      // in commitPreEditSnapshot with nothing to commit. Capturing here
      // keeps the undo semantics correct for font changes.
      //
      // clearPreEditSnapshot first discards any stale snapshot that
      // might still be pending from a previously focused input. In
      // normal browser flow the blur on that input would have fired
      // already (clicking the custom dropdown transfers focus away),
      // but this is defensive insurance: if a snapshot somehow leaks
      // across focus transitions, we want the font change's undo
      // entry to reflect the state immediately before the font change,
      // not the state before some unrelated earlier edit.
      //
      // capturePreEditSnapshot is a no-op during state restoration and
      // tour mode (guarded internally), so this is safe to call even
      // when commitSelection is invoked programmatically outside user
      // interaction.
      clearPreEditSnapshot();
      capturePreEditSnapshot();

      committedValue = value;
      select.value = value;

      // Update selected state in list
      list.querySelectorAll('.custom-font-dropdown-option').forEach(li => {
        const isSelected = li.dataset.value === value;
        li.classList.toggle('selected', isSelected);
        li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      });

      updateTrigger();

      // Trigger change event on original select for any listeners. The
      // change event handlers in the main style-groups and cover-lines
      // loops will call commitPreEditSnapshot, which will find the
      // snapshot we just captured and push it to the undo stack.
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Save state
      debouncedSave();
    }
    
    // Entry for the shared registry (avoids closing self via the shared handler)
    const dropdownRef = { wrapper, close: () => closeDropdown(true) };

    // Open dropdown
    function openDropdown() {
      if (isOpen) return;
      isOpen = true;
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      openFontDropdowns.add(dropdownRef);

      // Update highlighted index to current selection
      const currentIdx = Array.from(select.options).findIndex(o => o.value === committedValue);
      highlightedIndex = currentIdx >= 0 ? currentIdx : 0;
      updateHighlight();

      // Scroll selected item into view
      const selectedLi = list.querySelector('.selected');
      if (selectedLi) {
        selectedLi.scrollIntoView({ block: 'nearest' });
      }
    }

    // Close dropdown
    function closeDropdown(revert = true) {
      if (!isOpen) return;
      isOpen = false;
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      highlightedIndex = -1;
      openFontDropdowns.delete(dropdownRef);

      // Remove highlight from all options
      list.querySelectorAll('.custom-font-dropdown-option').forEach(li => {
        li.classList.remove('highlighted');
      });

      if (revert && select.value !== committedValue) {
        revertPreview();
      }
    }
    
    // Update visual highlight
    function updateHighlight() {
      const items = list.querySelectorAll('.custom-font-dropdown-option');
      items.forEach((li, idx) => {
        li.classList.toggle('highlighted', idx === highlightedIndex);
      });
      
      // Scroll highlighted into view
      if (highlightedIndex >= 0 && items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
    
    // Event handlers
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        closeDropdown(true);
      } else {
        openDropdown();
      }
    });
    
    trigger.addEventListener('keydown', (e) => {
      const items = list.querySelectorAll('.custom-font-dropdown-option');
      
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (isOpen) {
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
              const value = items[highlightedIndex].dataset.value;
              commitSelection(value);
              closeDropdown(false);
            }
          } else {
            openDropdown();
          }
          break;
          
        case 'Escape':
          if (isOpen) {
            e.preventDefault();
            closeDropdown(true);
            trigger.focus();
          }
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
            updateHighlight();
            // Preview on keyboard nav
            if (items[highlightedIndex]) {
              triggerPreview(items[highlightedIndex].dataset.value);
            }
          }
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            updateHighlight();
            // Preview on keyboard nav
            if (items[highlightedIndex]) {
              triggerPreview(items[highlightedIndex].dataset.value);
            }
          }
          break;
          
        case 'Home':
          if (isOpen) {
            e.preventDefault();
            highlightedIndex = 0;
            updateHighlight();
            if (items[highlightedIndex]) {
              triggerPreview(items[highlightedIndex].dataset.value);
            }
          }
          break;
          
        case 'End':
          if (isOpen) {
            e.preventDefault();
            highlightedIndex = items.length - 1;
            updateHighlight();
            if (items[highlightedIndex]) {
              triggerPreview(items[highlightedIndex].dataset.value);
            }
          }
          break;
      }
    });
    
    // Mouse events on list items
    list.addEventListener('mouseenter', (e) => {
      const li = e.target.closest('.custom-font-dropdown-option');
      if (li) {
        highlightedIndex = parseInt(li.dataset.index, 10);
        updateHighlight();
        triggerPreview(li.dataset.value);
      }
    }, true);
    
    list.addEventListener('mouseleave', () => {
      // Revert to committed value when leaving the list
      if (isOpen) {
        revertPreview();
      }
    });
    
    list.addEventListener('click', (e) => {
      const li = e.target.closest('.custom-font-dropdown-option');
      if (li) {
        e.preventDefault();
        e.stopPropagation();
        commitSelection(li.dataset.value);
        closeDropdown(false);
        trigger.focus();
      }
    });
    
    // Close on scroll (prevents visual detachment)
    const scrollHandler = () => { if (isOpen) closeDropdown(true); };
    let scrollParent = wrapper.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      if (scrollParent.scrollHeight > scrollParent.clientHeight) {
        scrollParent.addEventListener('scroll', scrollHandler, { passive: true });
      }
      scrollParent = scrollParent.parentElement;
    }
    
    // Initialize
    populateList();
    updateTrigger();
    
    // Insert into DOM
    wrapper.appendChild(trigger);
    wrapper.appendChild(list);
    select.parentNode.insertBefore(wrapper, select);
    
    // Store reference for external updates
    select._customDropdown = {
      wrapper,
      trigger,
      list,
      updateValue: (newValue) => {
        committedValue = newValue;
        select.value = newValue;
        populateList();
        updateTrigger();
      },
      refresh: () => {
        populateList();
        updateTrigger();
      }
    };
    
    return wrapper;
  }
  
  /**
   * Initializes custom font dropdowns for all font selects
   */
  function initializeCustomFontDropdowns() {
    // Cover Header - Simple mode
    const coverFontSelect = document.getElementById('cover-font-select');
    if (coverFontSelect) {
      createCustomFontDropdown(coverFontSelect, { type: 'cover-simple' });
    }
    
    // Cover Header - Advanced mode (Line 1, 2, 3)
    ['line-1-font', 'line-2-font', 'line-3-font'].forEach((id, index) => {
      const el = document.getElementById(id);
      if (el) {
        createCustomFontDropdown(el, { type: 'cover-advanced', lineIndex: index });
      }
    });
    
    // Book Block fonts (title, author, desc) - inside .export-controls, excluding QR
    document.querySelectorAll('.export-controls .form-group[data-style-group]:not([data-style-group="qr"]) .font-select').forEach(select => {
      createCustomFontDropdown(select, { type: 'book-block' });
    });
    
    // QR Text font
    const qrFontSelect = document.getElementById('qr-font-select');
    if (qrFontSelect) {
      createCustomFontDropdown(qrFontSelect, { type: 'book-block' });
    }
  }
  
  // ---------------------------------------------------------------------------
  // Undo/Redo Core API
  // ---------------------------------------------------------------------------

  /** Update the enabled/disabled state of undo/redo buttons */
  function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = _undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = _redoStack.length === 0;
  }

  /**
   * Capture a snapshot of the current state before a mutation.
   * @param {string} group - A label for coalescing (e.g. 'edit-text', 'add-book')
   */
  function pushUndo(group) {
    if (_isRestoring || _tourActive) return;

    const now = Date.now();
    const state = serializeState();
    const snapshot = _extractImages(state);

    // Coalesce: if same group within the coalescing window, replace top instead of pushing
    if (group && group === _lastUndoGroup && (now - _lastUndoTime) < UNDO_COALESCE_MS && _undoStack.length > 0) {
      // Don't replace — keep the original pre-mutation snapshot on top
      _lastUndoTime = now;
      return;
    }

    _undoStack.push(JSON.stringify(snapshot));
    _lastUndoGroup = group;
    _lastUndoTime = now;

    // Clear redo stack on new action
    _redoStack = [];

    // Cap stack size
    if (_undoStack.length > UNDO_MAX) {
      _undoStack.shift();
    }

    updateUndoRedoButtons();
  }

  /**
   * Wire pre-change undo capture onto an element whose `change` event
   * fires AFTER the browser has already mutated the DOM state
   * (checkboxes, radios, selects).
   *
   * The tricky part: for `<input type="checkbox">`, the browser runs
   * "pre-click activation steps" that flip `.checked` BEFORE the
   * click event is dispatched to the element (HTML spec). So a
   * `click` listener on the input sees the ALREADY-TOGGLED state —
   * it's useless for pre-change capture. `mousedown`, by contrast,
   * fires strictly before any click activation and sees pre-toggle
   * state, so it's the right hook for direct mouse clicks on the
   * input itself.
   *
   * Label clicks are even trickier: when a user clicks a
   * `<label for="...">`, the mousedown event fires on the LABEL, not
   * on the associated input — mousedown does NOT forward through the
   * label. The label's click handler runs, its default action
   * dispatches a synthetic click on the input, the input's pre-click
   * activation steps toggle the checkbox, and finally the input's
   * click handlers run with `.checked` already flipped. So neither
   * `mousedown` nor `click` on the input catches a label click
   * pre-toggle. The ONLY reliable pre-toggle event is `mousedown` or
   * `click` on the LABEL itself (both fire before the label's
   * default action runs the synthetic click on the input).
   *
   * Keyboard interactions (space/enter/arrow keys on focused
   * element) fire `keydown` before the browser's default action,
   * and don't involve any click dispatch, so `keydown` is
   * straightforwardly pre-mutation.
   *
   * Events attached:
   *   - input element: `mousedown` (pre-toggle, direct clicks),
   *     filtered `keydown` (pre-mutation, keyboard). NOT `click`
   *     (post-toggle, wrong).
   *   - associated label(s): `mousedown` (pre-toggle, label clicks).
   *     Both `label[for="id"]` siblings and `element.closest('label')`
   *     wrappers are covered.
   *
   * pushUndo's coalescing handles rapid repeated interactions and
   * same-tick duplicate captures.
   */
  function bindPreChangeCapture(element, group) {
    if (!element) return;
    const capture = () => pushUndo(group);

    // Direct interactions with the input itself.
    element.addEventListener('mousedown', capture);

    // Allow-list of keys that can actually mutate a checkbox, radio,
    // or select. Ctrl+Z/Cmd+Z and other non-mutating keys must skip
    // — otherwise they'd pollute the undo stack with no-op snapshots
    // right before undo() runs and race it into a no-op pop.
    const MUTATING_KEYS = new Set([
      ' ', 'Enter', 'Spacebar',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'PageUp', 'PageDown', 'Home', 'End',
    ]);
    element.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!MUTATING_KEYS.has(e.key)) return;
      capture();
    });

    // Associated labels: mousedown on either a sibling `<label for>`
    // or a wrapping `<label>` fires pre-toggle for label clicks,
    // which is the only reliable pre-mutation signal available when
    // the user clicks label text instead of the checkbox itself.
    const labels = new Set();
    if (element.id) {
      document.querySelectorAll(`label[for="${element.id}"]`).forEach((l) => labels.add(l));
    }
    const ancestorLabel = element.closest && element.closest('label');
    if (ancestorLabel) labels.add(ancestorLabel);
    labels.forEach((label) => {
      label.addEventListener('mousedown', capture);
    });
  }

  /**
   * Capture the current state as a pre-edit snapshot, to be committed later
   * when a style input actually changes. Used for inputs where the browser
   * updates the DOM value BEFORE the change/input event fires (color pickers,
   * selects, number inputs), which would otherwise cause pushUndo to capture
   * the post-change state and make Ctrl+Z meaningless for that input.
   *
   * Call on focus. Safe to call multiple times — only captures once per
   * focus session (until committed or cleared).
   */
  function capturePreEditSnapshot() {
    if (_isRestoring || _tourActive) return;
    if (_pendingPreEditSnapshot !== null) return; // Already captured this session
    const state = serializeState();
    _pendingPreEditSnapshot = JSON.stringify(_extractImages(state));
  }

  /**
   * Commit the pending pre-edit snapshot to the undo stack, if one exists.
   * Call on the input/change event. Only pushes once per focus session — once
   * committed, subsequent calls are no-ops until a new capturePreEditSnapshot.
   */
  function commitPreEditSnapshot(group) {
    if (_isRestoring || _tourActive) return;
    if (_pendingPreEditSnapshot === null) return;

    _undoStack.push(_pendingPreEditSnapshot);
    _lastUndoGroup = group;
    _lastUndoTime = Date.now();
    _redoStack = [];
    if (_undoStack.length > UNDO_MAX) {
      _undoStack.shift();
    }
    updateUndoRedoButtons();

    _pendingPreEditSnapshot = null;
  }

  /**
   * Discard any uncommitted pre-edit snapshot. Call on blur so stale snapshots
   * don't leak across unrelated interactions.
   */
  function clearPreEditSnapshot() {
    _pendingPreEditSnapshot = null;
  }

  /**
   * Restore a snapshot, handling async image resolution and side-effect guards.
   * @param {string} jsonString - JSON-stringified snapshot with image refs
   * @returns {Promise<void>}
   */
  function restoreSnapshot(jsonString) {
    _isRestoring = true;

    // Cancel pending async operations
    debouncedSave.cancel();
    debouncedCoverRegen.cancel();
    _collageGenId++; // Invalidate any in-flight collage generation

    const state = JSON.parse(jsonString);
    return _restoreImages(state).then(resolved => {
      applyState(resolved, { silent: true });
    }).finally(() => {
      _isRestoring = false;
      // Single clean save of the restored state (isDirtyLocal cleared by
      // saveDraftLocal's async completion, not here — avoids premature flag)
      saveDraftLocal();
      hasUnsavedFile = true;
      updateSaveIndicator();
      updateUndoRedoButtons();
    });
  }

  /**
   * Semantic equality check for two serialized snapshots, ignoring
   * the `savedAt` timestamp that serializeState stamps on every call.
   * Without this, two snapshots taken milliseconds apart with
   * IDENTICAL logical state would compare unequal purely because
   * their savedAt strings differ, which defeats the undo/redo dedup
   * loop and was one of the causes of "undo flashes but doesn't do
   * anything" on toggles.
   */
  function _snapshotsEqual(a, b) {
    if (a === b) return true;
    // Strip the savedAt timestamp before comparing. serializeState
    // stamps a fresh `"savedAt":"..."` on every call, so two
    // snapshots with logically identical state can still differ
    // byte-for-byte. A simple regex replace avoids the overhead and
    // error-handling of JSON.parse — the snapshot format is
    // controlled internally so the field name is stable.
    const SAVED_AT_RE = /"savedAt":"[^"]*"/;
    return a.replace(SAVED_AT_RE, '') === b.replace(SAVED_AT_RE, '');
  }

  function undo() {
    if (_undoStack.length === 0 || _tourActive) return;

    // Compute current state once so we can skip no-op entries and
    // avoid calling serializeState multiple times.
    const currentState = serializeState();
    const currentSnapshot = _extractImages(currentState);
    const currentJson = JSON.stringify(currentSnapshot);

    // Skip any top-of-stack entries that equal the current state.
    // See _snapshotsEqual for why string equality alone isn't
    // enough — savedAt timestamps differ even when logical state
    // is identical.
    while (_undoStack.length > 0 && _snapshotsEqual(_undoStack[_undoStack.length - 1], currentJson)) {
      _undoStack.pop();
    }

    if (_undoStack.length === 0) {
      updateUndoRedoButtons();
      return;
    }

    // Push current state onto redo stack, pop real undo entry, restore.
    _redoStack.push(currentJson);
    const snapshot = _undoStack.pop();
    restoreSnapshot(snapshot);
  }

  function redo() {
    if (_redoStack.length === 0 || _tourActive) return;

    // Same de-dup dance as undo() — skip any top-of-stack redo
    // entries that already match current, so redo doesn't flash.
    const currentState = serializeState();
    const currentSnapshot = _extractImages(currentState);
    const currentJson = JSON.stringify(currentSnapshot);

    while (_redoStack.length > 0 && _snapshotsEqual(_redoStack[_redoStack.length - 1], currentJson)) {
      _redoStack.pop();
    }

    if (_redoStack.length === 0) {
      updateUndoRedoButtons();
      return;
    }

    _undoStack.push(currentJson);
    const snapshot = _redoStack.pop();
    restoreSnapshot(snapshot);
  }

  function clearUndoHistory() {
    _undoStack = [];
    _redoStack = [];
    _lastUndoGroup = null;
    _lastUndoTime = 0;
    _imageDataToId.clear();
    _imageCache.clear();
    _clearImageDB();
    updateUndoRedoButtons();
  }

  function initUndoRedoControls() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.addEventListener('click', undo);
    if (btnRedo) btnRedo.addEventListener('click', redo);

    // Keyboard shortcuts. Only skip our undo/redo when focus is in
    // a text-editable form field that has its own native undo history
    // (typing should use browser undo for character-by-character
    // granularity, not our snapshot-based undo). Checkboxes, radios,
    // color pickers, selects, and buttons do NOT have native undo, so
    // our handler needs to run for them — otherwise Ctrl+Z after
    // clicking e.g. "Stretch Book Covers" does nothing because the
    // checkbox is still focused and the old early-return stole the
    // keypress without routing it anywhere.
    const TEXT_INPUT_TYPES = new Set([
      'text', 'search', 'url', 'email', 'tel', 'password', 'number',
      'date', 'datetime-local', 'month', 'time', 'week'
    ]);
    document.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      const tag = el?.tagName;
      const type = (el?.type || '').toLowerCase();
      const isTextField =
        tag === 'TEXTAREA' ||
        (tag === 'INPUT' && TEXT_INPUT_TYPES.has(type));
      if (isTextField) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey) || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    });

    updateUndoRedoButtons();
  }

  // ---------------------------------------------------------------------------
  // Tour Mode: save/restore full app state so the tour starts from blank
  // ---------------------------------------------------------------------------
  const TOUR_BACKUP_IDB_KEY = 'tour-backup';

  /**
   * Enter tour mode: snapshot current state + undo history to IndexedDB,
   * then reset the app to a blank slate.  Suppresses undo/autosave while active.
   * Returns a Promise<boolean> — false if backup failed (tour should not start).
   */
  async function enterTourMode() {
    if (_tourActive) return false;

    // 1. Capture current state (full serialization, images inline)
    const snapshot = serializeState();

    // 2. Capture undo/redo stacks (already JSON strings with image refs)
    const backup = {
      state: snapshot,
      undoStack: _undoStack.slice(),
      redoStack: _redoStack.slice(),
      lastUndoGroup: _lastUndoGroup,
      lastUndoTime: _lastUndoTime,
    };

    // 3. Persist to IndexedDB so an accidental refresh can recover
    try {
      await _putImageIDB(TOUR_BACKUP_IDB_KEY, JSON.stringify(backup));
    } catch {
      showNotification('Could not back up your current work. Save as a .booklist file before starting the tour.', 'error');
      return false;
    }

    // 4. Activate tour guard (suppresses pushUndo + autosave)
    _tourActive = true;
    _isRestoring = true; // Also suppress side-effects during the blank reset

    // 5. Reset to blank
    initializeBooklist();

    // Reset UI controls to defaults
    if (elements.listNameInput) elements.listNameInput.value = '';
    if (elements.coverTitleInput) elements.coverTitleInput.value = '';
    elements.coverLines.forEach(line => { if (line.input) line.input.value = ''; });
    if (elements.stretchCoversToggle) elements.stretchCoversToggle.checked = false;
    if (elements.stretchBlockCoversToggle) elements.stretchBlockCoversToggle.checked = false;
    if (elements.coverAdvancedToggle) {
      elements.coverAdvancedToggle.checked = false;
      toggleCoverMode(false);
    }
    setCollageCoverCountUI(CONFIG.MIN_COVERS_FOR_COLLAGE);
    setCollageCoverCount(CONFIG.MIN_COVERS_FOR_COLLAGE, true);
    extraCollageCovers = [];

    // Reset collage layout to classic
    if (elements.collageLayoutSelector) {
      elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.layout === 'classic');
      });
    }
    if (elements.showShelvesToggle) elements.showShelvesToggle.checked = false;
    if (elements.titleBarPosition) elements.titleBarPosition.value = 'classic';
    if (elements.tiltDegree) elements.tiltDegree.value = -25;
    if (elements.tiltOffsetDirection) elements.tiltOffsetDirection.value = 'vertical';
    if (elements.tiltCoverSize) elements.tiltCoverSize.value = 100;
    updateTiltedSettingsVisibility();

    // Clear front cover and branding images
    applyUploaderImage(elements.frontCoverUploader, null);
    applyUploaderImage(elements.brandingUploader, null);

    // Reset QR
    if (elements.qrUrlInput) elements.qrUrlInput.value = '';
    if (elements.qrCodeCanvas) {
      elements.qrCodeCanvas.innerHTML = '<img alt="QR Code Placeholder" src="' + CONFIG.PLACEHOLDER_QR_URL + '"/>';
    }
    if (elements.qrCodeTextArea) {
      elements.qrCodeTextArea.innerText = CONFIG.PLACEHOLDERS.qrText;
      elements.qrCodeTextArea.style.color = CONFIG.PLACEHOLDER_COLOR;
    }
    _currentQrText = '';

    // Disable undo/redo buttons
    updateUndoRedoButtons();

    _isRestoring = false;
    return true;
  }

  /**
   * Exit tour mode: restore the user's original state + undo history from the
   * IndexedDB backup.
   */
  async function exitTourMode() {
    if (!_tourActive) return;

    // Invalidate any in-flight collage generation and cancel debounced ops
    // so tour callbacks don't fire after state is restored
    _collageGenId++;
    debouncedSave.cancel();
    debouncedCoverRegen.cancel();

    _isRestoring = true;

    try {
      const raw = await _getImageIDB(TOUR_BACKUP_IDB_KEY);
      if (raw) {
        const backup = JSON.parse(raw);

        // Restore the user's state
        if (backup.state) {
          applyState(backup.state, { silent: true });
        }

        // Restore undo/redo stacks
        _undoStack = Array.isArray(backup.undoStack) ? backup.undoStack : [];
        _redoStack = Array.isArray(backup.redoStack) ? backup.redoStack : [];
        _lastUndoGroup = backup.lastUndoGroup || null;
        _lastUndoTime = backup.lastUndoTime || 0;
      }
    } catch { /* corrupted backup — user keeps blank state */ }

    // Clean up
    _deleteImageIDB(TOUR_BACKUP_IDB_KEY);
    _tourActive = false;
    _isRestoring = false;

    // Re-sync draft with restored state
    saveDraftLocal();
    updateUndoRedoButtons();
    updateSaveIndicator();
  }

  /**
   * Check if a tour backup exists in IndexedDB (called on startup for crash
   * recovery). If found, move the pre-tour state into the draft slot so
   * the normal restore path picks it up, then remove the tour backup.
   */
  async function recoverTourBackupIfPresent() {
    // Clean up legacy localStorage tour backup if present (from pre-IDB versions)
    try { localStorage.removeItem('booklist-tour-backup'); } catch {}

    try {
      const raw = await _getImageIDB(TOUR_BACKUP_IDB_KEY);
      if (!raw) return false;
      const backup = JSON.parse(raw);
      if (backup.state) {
        // Write the pre-tour state directly into the draft IDB slot
        await _putImageIDB('draft', JSON.stringify(backup.state));
        try { localStorage.setItem('has-draft', 'true'); } catch {}
      }
      _deleteImageIDB(TOUR_BACKUP_IDB_KEY);
      return true;
    } catch {
      _deleteImageIDB(TOUR_BACKUP_IDB_KEY);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Zoom Controls
  // ---------------------------------------------------------------------------
  function applyZoom() {
    const target = elements.previewArea;
    if (!target) return;
    // Clear the inline zoom style at 100% so the browser treats the
    // element as unzoomed (avoids containing-block / layout quirks
    // from the CSS `zoom` property at value 1.0)
    if (currentZoom === 1.0) {
      target.style.zoom = '';
    } else {
      target.style.zoom = currentZoom;
    }
    const resetBtn = document.getElementById('btn-zoom-reset');
    if (resetBtn) resetBtn.textContent = Math.round(currentZoom * 100) + '%';
  }

  function computeFitToScreenZoom() {
    const container = document.querySelector('.main-content');
    if (!container || !elements.previewArea) return 1.0;
    const containerW = container.clientWidth;
    // Subtract toolbar height (list name row + hint) from available vertical space
    const toolbar = container.querySelector('.toolbar');
    const toolbarH = toolbar ? toolbar.offsetHeight : 0;
    const containerH = container.clientHeight - toolbarH;
    // Page is 11in wide; at 96 DPI that's 1056px, plus some padding
    const contentW = 11 * 96 + 40;
    const contentH = elements.previewArea.scrollHeight || (8.5 * 96 + 40);
    const fitW = containerW / contentW;
    const fitH = containerH / contentH;
    return Math.min(fitW, fitH) * 0.98;
  }

  function initZoomControls() {
    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');
    const btnReset = document.getElementById('btn-zoom-reset');
    const btnFit = document.getElementById('btn-zoom-fit');

    if (btnIn) btnIn.addEventListener('click', function() {
      currentZoom = Math.min(ZOOM_MAX, currentZoom + ZOOM_STEP);
      applyZoom();
    });
    if (btnOut) btnOut.addEventListener('click', function() {
      currentZoom = Math.max(ZOOM_MIN, currentZoom - ZOOM_STEP);
      applyZoom();
    });
    if (btnReset) btnReset.addEventListener('click', function() {
      currentZoom = 1.0;
      applyZoom();
      // Reset scroll position
      const container = document.querySelector('.main-content');
      if (container) { container.scrollTop = 0; container.scrollLeft = 0; }
    });
    if (btnFit) btnFit.addEventListener('click', function() {
      currentZoom = computeFitToScreenZoom();
      // Clamp to valid range
      currentZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, currentZoom));
      applyZoom();
      // Reset scroll position
      const container = document.querySelector('.main-content');
      if (container) { container.scrollTop = 0; container.scrollLeft = 0; }
    });

    // Ctrl+scroll wheel zoom
    const scrollContainer = document.querySelector('.main-content');
    if (scrollContainer) {
      scrollContainer.addEventListener('wheel', function(e) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        currentZoom = e.deltaY < 0
          ? Math.min(ZOOM_MAX, currentZoom + ZOOM_STEP)
          : Math.max(ZOOM_MIN, currentZoom - ZOOM_STEP);
        applyZoom();
      }, { passive: false });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API / Initialization
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Per-library config application (branded library instances only).
  //
  // Listens for the 'library-config-ready' custom event dispatched by
  // assets/js/library-config.js. On the public tool the event fires with a
  // null config and nothing happens. On branded instances we apply the
  // fields from LIBRARY_CONFIG to the running tool. Font overrides are
  // skipped if the user has already changed the relevant font-select away
  // from its HTML data-default value.
  //
  // The event can fire before OR after init() depending on how fast the
  // Firestore read resolves, so we listen at IIFE top level (which runs
  // when app.js loads, before DOMContentLoaded) and stash a pending config
  // if DOM element refs haven't been cached yet.
  // ---------------------------------------------------------------------------
  let _pendingLibraryConfig = null;
  let _libraryConfigApplied = false;

  function applyLibraryConfig(config) {
    if (!config || _libraryConfigApplied) return;
    _libraryConfigApplied = true;

    // Signal to CSS that a library config is in play. Used to scale up
    // the .header-credit "for <library>" byline to match the logo size.
    document.body.classList.add('has-library-config');

    // Per-library CSS hook. Adds a `library-<id>` class to the body so
    // stylesheets can target a specific library instance for customization
    // (e.g., hide the site footer for one library that doesn't want it).
    // Library IDs are alphanumeric + hyphen from the hostname subdomain,
    // so they're safe to interpolate into a class name.
    if (window.LIBRARY_ID) {
      document.body.classList.add('library-' + window.LIBRARY_ID);
    }

    // Libraries only own two per-library fields: displayName and
    // brandingImagePath. Fonts, layout, and extended mode are per-USER
    // preferences that start from the Booklister defaults — not
    // per-library — so we don't touch them here.

    // Document title + header credit byline.
    if (config.displayName) {
      document.title = config.displayName + ' Booklister';
      const credit = document.querySelector('.header-credit');
      if (credit) credit.textContent = 'for ' + config.displayName;
    }

    // Default branding image — only if the user hasn't uploaded one.
    // The body class is added unconditionally (even if the user already
    // has their own image) so that the "Use Default" button becomes
    // available as a fallback when the user clears their branding,
    // letting them restore the library default.
    if (config.brandingImagePath && elements.brandingUploader) {
      document.body.classList.add('has-library-branding');
      const img = elements.brandingUploader.querySelector('img');
      if (img && img.dataset.isPlaceholder !== 'false') {
        img.src = config.brandingImagePath;
        img.dataset.isPlaceholder = 'false';
        elements.brandingUploader.classList.add('has-image');
      }
    }

    // Auto-draft description toggle — only meaningful on branded
    // instances (where the description backend is actually wired up).
    // Reveal the row and sync the checkbox from the persisted preference.
    if (elements.autoDescriptionToggleRow && elements.autoDescriptionToggle) {
      elements.autoDescriptionToggleRow.hidden = false;
      elements.autoDescriptionToggle.checked = getAutoDescriptionPreference();
    }

    // Role-aware Admin link. Only library admins (users whose memberships
    // doc has role: 'admin') see this — regular staff and public-branded
    // visitors don't. The link opens the admin console in a new tab so
    // they can manage their library's staff roster without losing their
    // current booklist draft. library-config.js sets window.LIBRARY_USER_ROLE
    // after reading the signed-in user's own memberships doc.
    if (window.LIBRARY_USER_ROLE === 'admin') {
      const headerActions = document.querySelector('.header-actions');
      const signOutBtn = document.getElementById('auth-signout-button');
      if (headerActions && !document.getElementById('library-admin-link')) {
        const adminLink = document.createElement('a');
        adminLink.id = 'library-admin-link';
        adminLink.href = 'https://admin.booklister.org/';
        adminLink.target = '_blank';
        adminLink.rel = 'noopener';
        adminLink.title = 'Open the admin console';
        adminLink.setAttribute('aria-label', 'Open the admin console in a new tab');
        adminLink.innerHTML =
          '<i class="fa-solid fa-user-shield" aria-hidden="true"></i> Admin';
        if (signOutBtn) {
          headerActions.insertBefore(adminLink, signOutBtn);
        } else {
          headerActions.appendChild(adminLink);
        }
      }
    }

    // Reveal the tool. An inline script in index.html added this class
    // synchronously at page load to hide everything until a valid config
    // was available, preventing a flash of the unbranded tool on gated
    // subdomains. Removing it now (at the end of applyLibraryConfig)
    // means the body becomes visible with the branded state already in
    // place.
    document.documentElement.classList.remove('awaiting-library-config');
  }

  function _onLibraryConfigReady(evt) {
    const config = (evt && evt.detail && evt.detail.config) || window.LIBRARY_CONFIG || null;
    if (!config) return;
    // If init() hasn't cached the element refs yet, stash; init() applies.
    if (!elements.coverFontSelect) {
      _pendingLibraryConfig = config;
    } else {
      applyLibraryConfig(config);
    }
  }
  window.addEventListener('library-config-ready', _onLibraryConfigReady);

  // Belt-and-suspenders: if library-config.js has already run and set the
  // global before we got here (possible under future script-order changes,
  // e.g. if app.js ever becomes a module itself), stash it so init() still
  // applies it. The 'library-config-ready' listener above handles the
  // normal case where the event fires after we've attached.
  if (window.LIBRARY_CONFIG && !_pendingLibraryConfig) {
    _pendingLibraryConfig = window.LIBRARY_CONFIG;
  }

  function init() {
    cacheElements();
    populateFontSelects();
    bindEvents();
    bindExtraCoversEvents();
    setupQrPlaceholder();
    initializeBooklist();
    applyStyles();
    initializeSortable();
    initializeCustomFontDropdowns();
    renderExtraCoversGrid();
    
    // Initialize zoom and undo/redo controls
    initZoomControls();
    initUndoRedoControls();

    // Set default cover mode (simple)
    toggleCoverMode(false);
    
    // Set initial tilted settings visibility
    updateTiltedSettingsVisibility();

    // Color palette popovers on the primary color pickers
    setupColorPopovers();

    // Apply any library config that arrived before init() ran. On the
    // public tool this is a no-op; on branded instances the listener
    // either stashed the config here (if it arrived early) or has already
    // applied it directly (if it arrived after init() started).
    if (_pendingLibraryConfig) {
      applyLibraryConfig(_pendingLibraryConfig);
      _pendingLibraryConfig = null;
    }

    // Recover tour backup (if page was refreshed mid-tour), then restore draft.
    // Both are async (IndexedDB), chained to ensure correct ordering.
    recoverTourBackupIfPresent().then(() => restoreDraftLocalIfPresent());

    // Folio: greet based on whether a draft exists (has-draft flag is sync)
    if (window.folio) {
      window.folio.guard(3500);
      let hasDraft = false;
      try { hasDraft = !!localStorage.getItem('has-draft'); } catch { /* private browsing */ }
      if (hasDraft) {
        window.folio.setState('greeting', 'draft-restored');
      } else {
        window.folio.setState('greeting', 'page-load');
      }
      setTimeout(function() { if (window.folio) window.folio.setState('idle'); }, 4000);
    }
    
    // Warn before leaving with unsaved changes (only if localStorage hasn't caught up)
    window.addEventListener('beforeunload', (e) => {
      if (isDirtyLocal) {
        // Different browsers need different approaches
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
        return 'You have unsaved changes.';
      }
    });
    
    // Page load / draft restore is not a user edit
    hasUnsavedFile = false;
    updateSaveIndicator();
    
    // Folio: evaluating state when browsing font dropdowns
    document.addEventListener('mouseenter', function(e) {
      if (e.target.closest && e.target.closest('.custom-dropdown-list')) {
        if (window.folio) {
          if (window.folio.currentState() !== 'evaluating') window.folio.react('perk');
          window.folio.setState('evaluating', 'font-previewing');
        }
      }
    }, true);
    document.addEventListener('mouseleave', function(e) {
      if (e.target.closest && e.target.closest('.custom-dropdown-list')) {
        if (window.folio) window.folio.setState('idle');
      }
    }, true);
    
    // Folio: evaluating state when browsing cover carousels (debounced)
    (function() {
      let carouselSettleTimer = null;
      document.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('.carousel-button')) {
          clearTimeout(carouselSettleTimer);
          if (window.folio) {
            if (window.folio.currentState() !== 'evaluating') window.folio.react('perk');
            window.folio.setState('evaluating', 'browsing-covers');
          }
          carouselSettleTimer = setTimeout(function() {
            if (window.folio) window.folio.setState('idle');
          }, 3000);
        }
      });
    })();
  }
  
  // Expose necessary functions for external access
  /** Reset zoom to 100% (called by tour system and on page load) */
  function resetZoom() {
    currentZoom = 1.0;
    applyZoom();
  }

  return {
    init,
    showNotification,
    getAiDescription, // For testing
    updateBackCoverVisibility, // For tour: visual-only toggle update (no data trim)
    resetZoom, // For tour: reset zoom before spotlight positioning
    enterTourMode, // For tour: save state + blank the app
    exitTourMode,  // For tour: restore pre-tour state
    applyState,    // For tour: load sample booklist during tour
    generateCoverCollage, // For tour: generate collage during tour
    get isDirtyLocal() { return isDirtyLocal; },   // For debugging
    get hasUnsavedFile() { return hasUnsavedFile; }, // For debugging
  };
  
})();

// =============================================================================
// TAB SWITCHING (Global for HTML onclick)
// =============================================================================
function openTab(evt, tabName) {
  const tabcontent = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].classList.remove("active");
  }
  
  const tablinks = document.getElementsByClassName("tab-btn");
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].classList.remove("active");
    tablinks[i].setAttribute('aria-selected', 'false');
  }
  
  document.getElementById(tabName).classList.add("active");
  evt.currentTarget.classList.add("active");
  evt.currentTarget.setAttribute('aria-selected', 'true');
}

// =============================================================================
// INITIALIZATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  BooklistApp.init();
});
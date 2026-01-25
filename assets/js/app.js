/**
 * Booklist Maker Application
 * Refactored for maintainability, accessibility, and clarity
 */

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
  // Layout
  TOTAL_SLOTS: 15,
  SLOTS_PER_INSIDE_PANEL: 5,
  BACK_COVER_START_INDEX: 10,
  
  // Dynamic max books based on UI toggles
  MAX_BOOKS_FULL: 15,
  MAX_BOOKS_ONE_ELEMENT: 14,
  MAX_BOOKS_BOTH_ELEMENTS: 13,
  
  // Cover dimensions (pixels at screen resolution)
  COVER_THUMB_WIDTH: 110,
  COVER_THUMB_HEIGHT: 132,
  FRONT_COVER_WIDTH: 480,
  FRONT_COVER_HEIGHT: 768,
  
  // Collage generation
  MIN_COVERS_FOR_COLLAGE: 12,
  MAX_COVERS_FOR_COLLAGE: 20,
  COLLAGE_GRID_COLS: 3,
  COLLAGE_TOP_ROW_COUNT: 3,
  COLLAGE_BOTTOM_ROWS: 3,
  
  // QR Code
  QR_SIZE_PX: 144,
  QR_ERROR_CORRECTION: 'H',
  
  // PDF Export
  PDF_DPI: 300,
  PDF_CANVAS_SCALE: 3,
  PDF_WIDTH_IN: 11,
  PDF_HEIGHT_IN: 8.5,
  
  // Branding area
  BRANDING_WIDTH: 480,
  BRANDING_HEIGHT: 144,
  
  // Timing
  NOTIFICATION_DURATION_MS: 3000,
  AUTOSAVE_DEBOUNCE_MS: 400,
  PDF_RENDER_DELAY_MS: 100,
  
  // API
  OPEN_LIBRARY_SEARCH_URL: 'https://openlibrary.org/search.json',
  OPEN_LIBRARY_COVERS_URL: 'https://covers.openlibrary.org/b/id/',
  OPEN_LIBRARY_EDITIONS_LIMIT: 100,
  
  // Placeholders
  PLACEHOLDER_COVER_URL: 'https://placehold.co/110x132/EAEAEA/333333?text=Upload%20Cover',
  PLACEHOLDER_NO_COVER_URL: 'https://placehold.co/110x132/EAEAEA/333333?text=No%20Cover',
  PLACEHOLDER_QR_URL: 'https://placehold.co/144x144/EAEAEA/333333?text=QR+Code',
  PLACEHOLDER_COLLAGE_COVER_URL: 'https://placehold.co/300x450/EAEAEA/333333?text=No%20Cover',
  
  // Text placeholders
  PLACEHOLDERS: {
    title: '[Enter Title]',
    author: '[Enter Author]',
    callNumber: '[Call #]',
    description: '[Enter a brief description here...]',
    authorWithCall: '[Enter Author] - [Call #]',
    qrText: "Enter your blurb here. To link to an online list (like Bibliocommons), go to the Settings tab and paste the URL in the 'QR Code URL' field and click update. Remember to test the code with your phone!",
  },
  
  // Colors
  PLACEHOLDER_COLOR: '#757575',
};

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
  
  // ---------------------------------------------------------------------------
  // Debounced Autosave (defined early so it can be used by renderBooklist)
  // ---------------------------------------------------------------------------
  const debouncedSave = (() => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => {
        saveDraftLocal();
      }, CONFIG.AUTOSAVE_DEBOUNCE_MS);
    };
  })();
  
  // Debounced cover regeneration to prevent lag on rapid changes
  const debouncedCoverRegen = (() => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (elements.frontCoverUploader?.classList.contains('has-image')) {
          generateCoverCollage();
        }
      }, 350); // Slightly longer delay for cover regeneration
    };
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
      classicSettings: document.getElementById('classic-settings'),
      showShelvesToggle: document.getElementById('show-shelves-toggle'),
      
      // Extended collage mode
      extendedCollageToggle: document.getElementById('extended-collage-toggle'),
      extraCoversSection: document.getElementById('extra-covers-section'),
      extraCoversGrid: document.getElementById('extra-covers-grid'),
      extraCoversCount: document.getElementById('extra-covers-count'),
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
  // Utility: Paste Handler (strips formatting, inserts plain text)
  // ---------------------------------------------------------------------------
  function handlePastePlainText(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    // execCommand is "deprecated" but still the only way to insert text
    // into contenteditable while preserving proper undo/redo behavior
    document.execCommand('insertText', false, text);
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
      if (getText() === placeholderText) {
        setText('');
        element.style.color = originalColor;
      }
    });
    
    element.addEventListener('blur', () => {
      if (getText().trim() === '') {
        setText(placeholderText);
        element.style.color = placeholderColor;
      }
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
      notificationTimeout = setTimeout(() => {
        hideNotification();
      }, CONFIG.NOTIFICATION_DURATION_MS);
    }
  }
  
  function hideNotification() {
    if (elements.notificationArea) {
      elements.notificationArea.classList.remove('show');
    }
  }
  
  // ---------------------------------------------------------------------------
  // AI Description Fetching
  // ---------------------------------------------------------------------------
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
        showNotification(`Could not fetch description: ${errorMsg}`, 'error');
        renderBooklist();
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
          renderBooklist();
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
        showNotification(`Could not fetch description for "${bookItem.title}": ${errorMessage}`, 'error');
        renderBooklist();
      }
    });
  }
  
  // ---------------------------------------------------------------------------
  // Book Data Management
  // ---------------------------------------------------------------------------
  function createBlankBook() {
    return {
      key: `blank-${crypto.randomUUID()}`,
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
  }
  
  function initializeBooklist() {
    myBooklist = [];
    for (let i = 0; i < CONFIG.TOTAL_SLOTS; i++) {
      myBooklist.push(createBlankBook());
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
  
  function getBooks() {
    const resultsContainer = elements.resultsContainer;
    resultsContainer.innerHTML = '<p>Searching...</p>';
    setLoading(elements.fetchButton, true, 'Searching...');
    
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
    
    const queryString = queryParams.join('&');
    const apiUrl = `${CONFIG.OPEN_LIBRARY_SEARCH_URL}?${queryString}`;
    
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
        
        if (books.length === 0) {
          resultsContainer.innerHTML = '<p>No results found.</p>';
          return;
        }
        
        books.forEach(book => {
          const bookCard = createSearchResultCard(book);
          resultsContainer.appendChild(bookCard);
        });
      })
      .catch(error => {
        console.error('There was a problem:', error);
        resultsContainer.innerHTML = '<p class="error-message">Sorry, could not connect to the book server. Please check your network connection and try again.</p>';
      })
      .finally(() => {
        setLoading(elements.fetchButton, false);
      });
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
    coverElement.src = initialCoverId === 'placehold'
      ? CONFIG.PLACEHOLDER_NO_COVER_URL
      : `${CONFIG.OPEN_LIBRARY_COVERS_URL}${initialCoverId}-M.jpg`;
    coverElement.alt = `Cover for ${book.title}`;
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
  
  function createCarouselControls(coverElement, initialCoverId, bookKey) {
    const carouselControls = document.createElement('div');
    carouselControls.className = 'carousel-controls';
    
    const coverCounter = document.createElement('span');
    coverCounter.className = 'cover-counter';
    coverCounter.textContent = '1 of 1';
    coverCounter.setAttribute('aria-live', 'polite');
    
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
      coverElement.src = currentId === 'placehold'
        ? CONFIG.PLACEHOLDER_NO_COVER_URL
        : `${CONFIG.OPEN_LIBRARY_COVERS_URL}${currentId}-M.jpg`;
      coverCounter.textContent = `${state.currentCoverIndex + 1} of ${state.allCoverIds.length}`;
      prevButton.disabled = state.currentCoverIndex === 0;
      nextButton.disabled = state.currentCoverIndex === state.allCoverIds.length - 1;
    };
    
    const loadAllCovers = async () => {
      if (state.coversLoaded || !bookKey) return;
      
      const fetchedCovers = await fetchAllCoverIdsForWork(bookKey);
      
      let finalCovers = [];
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
    
    prevButton.addEventListener('click', async () => {
      if (!state.coversLoaded) await loadAllCovers();
      if (state.currentCoverIndex > 0) {
        state.currentCoverIndex--;
        updateCarousel();
      }
    });
    
    nextButton.addEventListener('click', async () => {
      if (!state.coversLoaded) await loadAllCovers();
      if (state.currentCoverIndex < state.allCoverIds.length - 1) {
        state.currentCoverIndex++;
        updateCarousel();
      }
    });
    
    // Pre-load covers
    if (bookKey) {
      loadAllCovers().then(() => {
        if (state.allCoverIds.length > 1) {
          updateCarousel();
        }
      });
    }
    
    return { carouselControls, state };
  }
  
  function handleAddToList(book, addButton, carouselState) {
    const isAdded = myBooklist.some(item => item.key === book.key);
    const firstBlankIndex = myBooklist.findIndex((item, index) => item.isBlank && index < MAX_BOOKS);
    
    if (!isAdded) {
      if (firstBlankIndex !== -1) {
        // Only auto-star if under 12 starred books
        const currentStarredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
        
        const newBook = {
          key: book.key,
          isBlank: false,
          title: book.title,
          author: book.author_name ? book.author_name.join(', ') : 'Unknown Author',
          callNumber: CONFIG.PLACEHOLDERS.callNumber,
          authorDisplay: null, // Will be constructed on first render
          description: 'Fetching book description... May take a few minutes.',
          cover_ids: carouselState.allCoverIds,
          currentCoverIndex: carouselState.currentCoverIndex,
          includeInCollage: currentStarredCount < CONFIG.MIN_COVERS_FOR_COLLAGE
        };
        myBooklist[firstBlankIndex] = newBook;
        addButton.innerHTML = '&#10003;';
        addButton.classList.add('added');
        addButton.setAttribute('aria-label', `Remove "${book.title}" from booklist`);
        
        renderBooklist();
        getAiDescription(newBook.key);
        
        // Auto-generate if this book has a cover, is starred, and completes the required count
        const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
        if (frontCoverImg?.dataset.isAutoGenerated === 'true' && newBook.includeInCollage && carouselState.allCoverIds.length > 0) {
          const extendedMode = elements.extendedCollageToggle?.checked || false;
          const requiredCovers = extendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
          
          // Count starred books with covers after adding
          const booksWithCovers = myBooklist.filter(b =>
            !b.isBlank &&
            b.includeInCollage &&
            (b.cover_ids.length > 0 || (b.customCoverData && !b.customCoverData.includes('placehold.co')))
          );
          
          const extraCoverCount = extendedMode 
            ? extraCollageCovers.filter(ec => ec.coverData && !ec.coverData.includes('placehold.co')).length
            : 0;
          
          if (booksWithCovers.length + extraCoverCount === requiredCovers) {
            generateCoverCollage();
          }
        }
      } else {
        showNotification(`All ${MAX_BOOKS} book slots are full. Please delete one before adding another.`);
      }
    } else {
      const indexToRemove = myBooklist.findIndex(item => item.key === book.key);
      if (indexToRemove !== -1) {
        myBooklist[indexToRemove] = createBlankBook();
      }
      addButton.textContent = 'Add to List';
      addButton.classList.remove('added');
      addButton.setAttribute('aria-label', `Add "${book.title}" to booklist`);
      renderBooklist();
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
    
    let listWasTrimmed = false;
    if (newMaxBooks < MAX_BOOKS) {
      for (let i = newMaxBooks; i < CONFIG.TOTAL_SLOTS; i++) {
        if (myBooklist[i] && !myBooklist[i].isBlank) {
          myBooklist[i] = createBlankBook();
          listWasTrimmed = true;
        }
      }
    }
    
    MAX_BOOKS = newMaxBooks;
    
    if (listWasTrimmed) {
      renderBooklist();
    } else {
      updateBackCoverVisibility();
    }
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
  }
  
  // ---------------------------------------------------------------------------
  // Booklist Rendering
  // ---------------------------------------------------------------------------
  function renderBooklist() {
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
    dragHandle.setAttribute('aria-label', 'Drag to reorder');
    dragHandle.setAttribute('tabindex', '0');
    dragHandle.title = 'Drag to reorder';
    
    // Star toggle (include in collage)
    const starButton = document.createElement('button');
    starButton.className = 'star-button';
    
    // Count currently starred books + extra collage covers
    const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
    const extendedMode = elements.extendedCollageToggle?.checked || false;
    const maxCovers = extendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
    const totalCollageCovers = starredCount + (extendedMode ? extraCollageCovers.length : 0);
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
      
      bookItem.includeInCollage = !bookItem.includeInCollage;
      debouncedSave();
      renderBooklist(); // Re-render to update all star states
      updateExtraCoversCount(); // Update the extra covers section count
      
      // Auto-regenerate if there's already an auto-generated image and we have enough covers
      const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
      if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
        const currentExtendedMode = elements.extendedCollageToggle?.checked || false;
        const requiredCovers = currentExtendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
        
        // Count starred books with covers
        const booksWithCovers = myBooklist.filter(book =>
          !book.isBlank &&
          book.includeInCollage &&
          (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co')))
        );
        
        // Count extra covers (only in extended mode)
        const extraCoverCount = currentExtendedMode 
          ? extraCollageCovers.filter(ec => ec.coverData && !ec.coverData.includes('placehold.co')).length
          : 0;
        
        const totalCovers = booksWithCovers.length + extraCoverCount;
        
        if (totalCovers >= requiredCovers) {
          generateCoverCollage();
        }
      }
    };
    
    // Magic button (fetch description)
    const magicButton = document.createElement('button');
    magicButton.className = 'magic-button';
    magicButton.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    magicButton.title = 'Fetch description';
    magicButton.setAttribute('aria-label', 'Fetch description for this book');
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
  
  function handleMagicButtonClick(bookItem) {
    const currentTitle = (bookItem.title || '').replace(/\u00a0/g, " ").trim();
    
    // Parse author from authorDisplay (lazy parsing for AI description)
    let currentAuthor = '';
    const displayText = (bookItem.authorDisplay || '').replace(/\u00a0/g, " ");
    
    // Remove "By " prefix if present
    let text = displayText;
    if (text.match(/^By\s/i)) {
      text = text.replace(/^By\s/i, '');
    }
    
    // Extract author (everything before the last ' - ')
    const lastDashIndex = text.lastIndexOf(' - ');
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
    
    bookItem.description = "Fetching title description... May take a few minutes.";
    renderBooklist();
    getAiDescription(bookItem.key);
  }
  
  function handleDeleteBook(bookItem, index) {
    const originalKey = myBooklist[index].key;
    myBooklist[index] = createBlankBook();
    renderBooklist();
    
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
    
    // Remove the book from its current position
    const [movedBook] = myBooklist.splice(fromIndex, 1);
    
    // Insert it at the new position
    myBooklist.splice(toIndex, 0, movedBook);
    
    // Re-render and save
    renderBooklist();
    debouncedSave();
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
    
    coverImg.src = selectedCoverId && selectedCoverId !== 'placehold'
      ? `${CONFIG.OPEN_LIBRARY_COVERS_URL}${selectedCoverId}-M.jpg`
      : bookItem.customCoverData || CONFIG.PLACEHOLDER_COVER_URL;
    
    coverImg.alt = `Cover for ${bookItem.title}`;
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.setAttribute('aria-label', 'Choose cover image file');
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const book = myBooklist.find(b => b.key === bookItem.key);
          book.customCoverData = event.target.result;
          book.cover_ids = [];
          book.currentCoverIndex = 0;
          coverImg.src = event.target.result;
          debouncedSave();
          
          // Auto-generate if this book is starred and completes the required count
          const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
          if (frontCoverImg?.dataset.isAutoGenerated === 'true' && book.includeInCollage) {
            const extendedMode = elements.extendedCollageToggle?.checked || false;
            const requiredCovers = extendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
            
            // Count starred books with covers after this upload
            const booksWithCovers = myBooklist.filter(b =>
              !b.isBlank &&
              b.includeInCollage &&
              (b.cover_ids.length > 0 || (b.customCoverData && !b.customCoverData.includes('placehold.co')))
            );
            
            const extraCoverCount = extendedMode 
              ? extraCollageCovers.filter(ec => ec.coverData && !ec.coverData.includes('placehold.co')).length
              : 0;
            
            if (booksWithCovers.length + extraCoverCount === requiredCovers) {
              generateCoverCollage();
            }
          }
        };
        reader.readAsDataURL(file);
      }
    };
    
    coverUploader.appendChild(coverImg);
    coverUploader.appendChild(fileInput);
    
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
    titleField.oninput = (e) => {
      bookItem.title = e.target.innerText;
      if (bookItem.isBlank && bookItem.title !== CONFIG.PLACEHOLDERS.title) {
        bookItem.isBlank = false;
      }
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
    authorField.oninput = (e) => {
      // Store the raw display text exactly as typed
      bookItem.authorDisplay = e.target.innerText;
    };
    
    // Description field
    const descriptionField = document.createElement('div');
    descriptionField.className = 'editable-field description-field';
    descriptionField.contentEditable = true;
    descriptionField.innerText = bookItem.description;
    descriptionField.setAttribute('role', 'textbox');
    descriptionField.setAttribute('aria-label', 'Book description');
    descriptionField.addEventListener('paste', handlePastePlainText);
    descriptionField.oninput = (e) => {
      bookItem.description = e.target.innerText;
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
    const isLoadingOrError = bookItem.description.includes('Fetching') ||
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
    
    // Shared layout settings
    const layoutSettings = {
      bgColor,
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
   * Calculates layout dimensions for the collage
   */
  function calculateCollageLayout(canvasWidth, canvasHeight, titleBarHeight, outerMarginPx) {
    const vGutterToHeightRatio = 0.15;
    const bookAspectRatio = 0.75;
    const rowsTotal = 4 + 2 * vGutterToHeightRatio;
    const availableForCovers = canvasHeight - (titleBarHeight + 2 * outerMarginPx);
    const slotHeight = Math.max(1, availableForCovers / rowsTotal);
    const slotWidth = slotHeight * bookAspectRatio;
    const hGutter = (canvasWidth - CONFIG.COLLAGE_GRID_COLS * slotWidth) / 4;
    const vGutter = slotHeight * vGutterToHeightRatio;
    
    return { slotWidth, slotHeight, hGutter, vGutter };
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
   * Draws the title bar with text (handles both simple and advanced modes)
   */
  function drawTitleBar(ctx, styles, layout, canvasWidth) {
    const { wrapTextMultiline } = createTextWrapper(ctx);
    const availableTextWidth = Math.max(0, canvasWidth - 2 * styles.bgSideMarginPx - 2 * styles.padXPx);
    
    // Build processed lines array based on mode
    const processedLines = [];
    
    if (!styles.isAdvancedMode) {
      // Simple mode: single text block
      if (!styles.text || styles.text.length === 0) {
        const bgY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
        return { bgY, bgH: 0 };
      }
      
      ctx.font = `${styles.fontStyle} ${styles.fontSizePx}px ${styles.font}, sans-serif`;
      const wrappedLines = wrapTextMultiline(styles.text, availableTextWidth);
      
      // Default gap for simple mode
      const defaultGapPx = 8 * (CONFIG.PDF_DPI / 72);
      
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
          spacingPx: defaultGapPx, // Uniform spacing for simple mode
        });
      });
    } else {
      // Advanced mode: multiple lines with individual styling and spacing
      if (!styles.lines || styles.lines.length === 0) {
        const bgY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
        return { bgY, bgH: 0 };
      }
      
      styles.lines.forEach((lineData, lineIndex) => {
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
      const bgY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
      return { bgY, bgH: 0 };
    }
    
    // Calculate total height with per-line spacing
    let textBlockHeight = 0;
    processedLines.forEach((line, i) => {
      // Add spacing before this line (except for the first line)
      if (i > 0) {
        textBlockHeight += line.spacingPx;
      }
      textBlockHeight += line.height;
    });
    
    const bgH = textBlockHeight + 2 * styles.padYPx;
    
    // Draw background
    const bgX = styles.bgSideMarginPx;
    const bgY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
    const bgW = canvasWidth - 2 * styles.bgSideMarginPx;
    
    ctx.fillStyle = styles.bgColor;
    ctx.fillRect(bgX, bgY, bgW, bgH);
    
    // Draw each line of text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    
    const centerX = bgX + bgW / 2;
    let y = bgY + styles.padYPx;
    
    processedLines.forEach((line, i) => {
      // Add spacing before this line (except for the first line)
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
   * Main collage generation function
   */
  function generateCoverCollage() {
    const button = elements.generateCoverButton;
    setLoading(button, true, 'Generating...');
    
    const shouldStretchCovers = elements.stretchCoversToggle.checked;
    const selectedLayout = elements.collageLayoutSelector?.querySelector('.layout-option.selected')?.dataset.layout || 'classic';
    const titleBarPosition = elements.titleBarPosition?.value || 'classic';
    
    // Tilted layout specific settings
    const tiltDegree = parseFloat(elements.tiltDegree?.value ?? '-25');
    const tiltOffsetDirection = elements.tiltOffsetDirection?.value || 'vertical';
    
    // Check if extended mode is enabled
    const extendedMode = elements.extendedCollageToggle?.checked || false;
    const maxCovers = extendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
    
    // Gather books with covers that are marked for inclusion
    const booksWithCovers = myBooklist.filter(book =>
      !book.isBlank &&
      book.includeInCollage &&
      (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co')))
    );
    
    // Get URLs from starred book blocks
    const bookBlockCoverUrls = booksWithCovers.map(book => {
      if (book.customCoverData && !book.customCoverData.includes('placehold.co')) {
        return book.customCoverData;
      } else if (book.cover_ids.length > 0) {
        const coverId = book.cover_ids[book.currentCoverIndex];
        return coverId !== 'placehold'
          ? `${CONFIG.OPEN_LIBRARY_COVERS_URL}${coverId}.jpg`
          : CONFIG.PLACEHOLDER_COLLAGE_COVER_URL;
      }
      return CONFIG.PLACEHOLDER_COLLAGE_COVER_URL;
    });
    
    // Get URLs from extra collage covers (only if extended mode)
    const extraCoverUrls = extendedMode 
      ? extraCollageCovers
          .filter(ec => ec.coverData && !ec.coverData.includes('placehold.co'))
          .map(ec => ec.coverData)
      : [];
    
    // Combine all cover URLs (up to max for current mode)
    const allCoverUrls = [...bookBlockCoverUrls, ...extraCoverUrls].slice(0, maxCovers);
    
    // In extended mode, require exactly 20 covers; otherwise require 12
    const requiredCovers = extendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
    
    if (allCoverUrls.length < requiredCovers) {
      const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
      const totalWithCovers = booksWithCovers.length + extraCoverUrls.length;
      const totalSelected = starredCount + (extendedMode ? extraCollageCovers.length : 0);
      
      if (totalSelected < requiredCovers) {
        showNotification(`Need ${requiredCovers} covers. Currently ${totalSelected} selected.`);
      } else {
        showNotification(`Need ${requiredCovers} covers with images. ${totalWithCovers} have covers.`);
      }
      setLoading(button, false);
      return;
    }
    
    // Use all gathered covers
    const coversToDraw = allCoverUrls;
    
    const { canvas, ctx } = createCollageCanvas();
    const styles = getCoverTitleStyles();
    
    // Layout options object for all layouts
    const layoutOptions = {
      titleBarPosition,
      tiltDegree,
      tiltOffsetDirection,
      coverCount: coversToDraw.length
    };
    
    // Wait for fonts, then load images and draw
    document.fonts.ready.then(() => {
      return Promise.all(coversToDraw.map(src => loadImage(src)));
    }).then(images => {
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
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const frontCoverImg = elements.frontCoverUploader.querySelector('img');
      frontCoverImg.src = dataUrl;
      frontCoverImg.dataset.isPlaceholder = "false";
      frontCoverImg.dataset.isAutoGenerated = "true";
      elements.frontCoverUploader.classList.add('has-image');
      
    }).catch(err => {
      console.error('Cover generation failed:', err);
      showNotification('Could not generate cover. Please try again.');
    }).finally(() => {
      setLoading(button, false);
    });
  }
  
  /**
   * Calculate title bar height for layouts that need it
   */
  function calculateTitleBarHeight(ctx, styles) {
    const canvasWidth = 5 * CONFIG.PDF_DPI;
    const { wrapTextMultiline } = createTextWrapper(ctx);
    const availableTextWidth = Math.max(0, canvasWidth - 2 * styles.bgSideMarginPx - 2 * styles.padXPx);
    
    let titleBarHeight = 0;
    const defaultGapPx = 8 * (CONFIG.PDF_DPI / 72);
    
    if (!styles.isAdvancedMode) {
      if (styles.text && styles.text.length > 0) {
        ctx.font = `${styles.fontStyle} ${styles.fontSizePx}px ${styles.font}, sans-serif`;
        const wrappedLines = wrapTextMultiline(styles.text, availableTextWidth);
        let textBlockHeight = 0;
        
        wrappedLines.forEach((wrappedText, i) => {
          const m = ctx.measureText(wrappedText);
          const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : styles.fontSizePx * 0.8;
          const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : styles.fontSizePx * 0.2;
          textBlockHeight += ascent + descent;
          if (i < wrappedLines.length - 1) {
            textBlockHeight += defaultGapPx; // Use consistent gap for simple mode
          }
        });
        
        titleBarHeight = textBlockHeight + 2 * styles.padYPx;
      }
    } else {
      if (styles.lines && styles.lines.length > 0) {
        let textBlockHeight = 0;
        let isFirstProcessedLine = true;
        
        styles.lines.forEach((lineData, lineIndex) => {
          ctx.font = `${lineData.fontStyle} ${lineData.sizePx}px ${lineData.font}, sans-serif`;
          const wrappedLines = wrapTextMultiline(lineData.text, availableTextWidth);
          
          wrappedLines.forEach((wrappedText, wrapIndex) => {
            const m = ctx.measureText(wrappedText);
            const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : lineData.sizePx * 0.8;
            const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : lineData.sizePx * 0.2;
            
            // Add spacing before this line (except for the very first line)
            if (!isFirstProcessedLine && wrapIndex === 0) {
              textBlockHeight += lineData.spacingPx;
            }
            
            textBlockHeight += ascent + descent;
            isFirstProcessedLine = false;
          });
        });
        
        titleBarHeight = textBlockHeight + 2 * styles.padYPx;
      }
    }
    
    // Add safety buffer (5% extra) to prevent text cutoff
    return Math.ceil(titleBarHeight * 1.05);
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
      
      styles.lines.forEach((lineData, lineIndex) => {
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
    
    ctx.fillStyle = styles.bgColor;
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
    
    const margin = styles.outerMarginPx;
    const bookAspect = 0.75; // width / height
    
    // Binary: 12 or 20 covers
    const coverCount = images.length;
    const numCols = coverCount <= 12 ? 3 : 4;
    const numRows = coverCount <= 12 ? 4 : 5;
    
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
    
    // Calculate actual gutters
    const vGutter = slotHeight * vGutterRatio;
    const hGutter = (canvasWidth - numCols * slotWidth) / (numCols + 1);
    
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
    const margin = styles.outerMarginPx;
    
    const bookAspect = 0.75;
    
    // Binary: 12 or 20 covers
    const coverCount = images.length;
    const numCols = coverCount <= 12 ? 3 : 4;
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
    
    const vGutter = slotHeight * vGutterRatio;
    const hGutter = (canvasWidth - numCols * slotWidth) / (numCols + 1);
    
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
    
    // Dynamic rows: 4 for 12 covers, 5 for 20 covers
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
    
    // Calculate offset per row to ensure all covers appear
    const imageOffsetPerRow = Math.ceil(images.length / numRows);
    
    // Helper to draw a row filling edge-to-edge with partial covers bleeding off both edges
    const drawBrickRow = (y, h, useOffset, imgOffset) => {
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
    
    // Calculate cover size
    const sectionHeight = (canvasHeight - bgH - 2 * titleGutter) / 2;
    const rowsPerSection = 2.5;
    const slotHeight = (sectionHeight - (rowsPerSection - 1) * vGutter) / rowsPerSection;
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
    
    // Deterministic image selection based on offset direction and bar position
    // Supports both 12 and 20 image counts
    const totalImages = images.length;
    // Only use sequential order for 20-image covers with horizontal offset and non-center position
    const useRegularSequential = totalImages > 12 && position !== 'center' && offsetDirection === 'horizontal';

    const getImageForCell = (row, col) => {
      // For non-center positions with horizontal offset and 20 images, use 4 rows of 5 in a loop
      // Each row shows only its 5 books, columns cycle within that set
      if (useRegularSequential) {
        const rowGroup = (row % 4) * 5;  // 0, 5, 10, 15, then repeats
        return rowGroup + (col % 5);
      }

      if (totalImages <= 12) {
        // Original 12-image logic
        if (offsetDirection === 'horizontal') {
          const rowGroup = (row % 3) * 4;
          return rowGroup + (col % 4);
        } else {
          // Vertical: 4 column groups, each cycles through 3 books
          const colGroup = (col % 4) * 3;
          const rowOffset = col % 3;
          return colGroup + ((row + rowOffset) % 3);
        }
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
          return rowGroup + (col % 5);
        } else {
          // Vertical: each column cycles through 4 books
          // 5 column groups to show all 20: 0-3, 4-7, 8-11, 12-15, 16-19
          // Add cycle offset to prevent same book appearing in repeated columns
          const cycleNum = Math.floor(col / 5);
          const colGroup = (col % 5) * 4;  // 0, 4, 8, 12, 16
          const rowOffset = (col % 4 + cycleNum * 2) % 4;
          return colGroup + ((row + rowOffset) % 4);
        }
      }
    };
    
    // === DRAW FULL GRID ===
    // Draw everything, title bar will cover the appropriate region
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
    
    // Column count based on cover count: 5 for 12, 6 for 20
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
  // Extra Collage Covers (Extended Mode)
  // ---------------------------------------------------------------------------
  const MAX_EXTRA_COVERS = 8;
  
  /**
   * Toggles extended collage mode visibility
   */
  function toggleExtendedCollageMode(enabled, isRestoring = false) {
    if (elements.extraCoversSection) {
      elements.extraCoversSection.style.display = enabled ? 'block' : 'none';
      
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
      elements.collageCoverHint.textContent = enabled 
        ? 'Add covers 13-20 below to generate collage'
        : 'Star 12 books to include in the collage';
    }
    
    if (enabled) {
      // Only do these things when NOT restoring from saved state
      if (!isRestoring) {
        // Clear existing front cover and show placeholder (need 20 covers message)
        clearFrontCoverForExtendedMode();

        // Auto-star all books with covers (not just first 12) up to position 15
        let starredCount = 0;
        for (let i = 0; i < myBooklist.length; i++) {
          const book = myBooklist[i];
          if (book.isBlank) continue;

          const hasCover = book.cover_ids.length > 0 ||
            (book.customCoverData && !book.customCoverData.includes('placehold.co'));

          if (hasCover && starredCount < 15) {
            book.includeInCollage = true;
            starredCount++;
          }
        }
      } else {
        // When restoring, just update the placeholder text (don't clear cover)
        updateExtendedModePlaceholderText();
      }
      
      // Always render booklist and extra covers grid
      renderBooklist();
      renderExtraCoversGrid();
    } else {
      // When disabling extended mode, unstar books beyond 12
      let starredCount = 0;
      for (let i = 0; i < myBooklist.length; i++) {
        const book = myBooklist[i];
        if (!book.isBlank && book.includeInCollage) {
          starredCount++;
          if (starredCount > 12) {
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
      const requiredCovers = enabled ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
      
      // Count covers from starred books
      const booksWithCovers = myBooklist.filter(book =>
        !book.isBlank &&
        book.includeInCollage &&
        (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co')))
      );
      
      // Count extra covers (only in extended mode)
      const extraCoverCount = enabled 
        ? extraCollageCovers.filter(ec => ec.coverData && !ec.coverData.includes('placehold.co')).length
        : 0;
      
      const totalCovers = booksWithCovers.length + extraCoverCount;
      
      if (totalCovers >= requiredCovers) {
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
  function clearFrontCoverForExtendedMode() {
    const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
    const placeholderText = elements.frontCoverUploader?.querySelector('.placeholder-text');
    
    if (frontCoverImg) {
      // Use transparent gif instead of placehold.co URL
      frontCoverImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      frontCoverImg.dataset.isPlaceholder = "true";
    }
    
    if (placeholderText) {
      placeholderText.innerHTML = 'Click to upload a custom cover<br/>(5 x 8 inches recommended)<br/><br/>OR<br/><br/>Use the Auto-Generate Cover tool<br/>in Settings &gt; Cover Header<br/>(Add covers 13-20 using the Additional Covers section)';
    }
    
    elements.frontCoverUploader?.classList.remove('has-image');
  }
  
  /**
   * Restores the default placeholder text for 12-cover mode
   */
  function restoreFrontCoverPlaceholderText() {
    const placeholderText = elements.frontCoverUploader?.querySelector('.placeholder-text');
    if (placeholderText) {
      placeholderText.innerHTML = 'Click to upload a custom cover<br/>(5 x 8 inches recommended)<br/><br/>OR<br/><br/>Use the Auto-Generate Cover tool<br/>in Settings &gt; Cover Header<br/>(Star 12 books to include in the collage)';
    }
  }

  /**
   * Updates placeholder text for 20-cover extended mode (without clearing cover)
   */
  function updateExtendedModePlaceholderText() {
    const placeholderText = elements.frontCoverUploader?.querySelector('.placeholder-text');
    if (placeholderText) {
      placeholderText.innerHTML = 'Click to upload a custom cover<br/>(5 x 8 inches recommended)<br/><br/>OR<br/><br/>Use the Auto-Generate Cover tool<br/>in Settings &gt; Cover Header<br/>(Add covers 13-20 using the Additional Covers section)';
    }
  }
  
  /**
   * Updates the extra covers count display in both section and modal
   */
  function updateExtraCoversCount() {
    // Count starred books beyond 12
    const starredBooks = myBooklist.filter(b => !b.isBlank && b.includeInCollage);
    const booksWithCovers = starredBooks.filter(b => 
      b.cover_ids.length > 0 || (b.customCoverData && !b.customCoverData.includes('placehold.co'))
    );
    const starredBeyond12 = Math.max(0, booksWithCovers.length - 12);
    const extraCount = extraCollageCovers.length;
    const totalExtra = starredBeyond12 + extraCount;
    
    if (elements.extraCoversCount) {
      elements.extraCoversCount.textContent = totalExtra;
    }
    const modalCount = document.getElementById('modal-cover-count');
    if (modalCount) {
      if (starredBeyond12 > 0) {
        modalCount.textContent = `${totalExtra} of 8 slots filled (${starredBeyond12} from list, ${extraCount} added)`;
      } else {
        modalCount.textContent = `${totalExtra} of 8 extra slots filled`;
      }
    }
  }
  
  /**
   * Renders the extra covers grid with 8 slots
   * Shows starred books 13-15 first (from list, not removable), then extra covers
   */
  function renderExtraCoversGrid() {
    if (!elements.extraCoversGrid) return;
    
    elements.extraCoversGrid.innerHTML = '';
    
    // Get starred books with covers, take those beyond position 12
    const starredBooks = myBooklist.filter(b => !b.isBlank && b.includeInCollage);
    const booksWithCovers = starredBooks.filter(b => 
      b.cover_ids.length > 0 || (b.customCoverData && !b.customCoverData.includes('placehold.co'))
    );
    const starredBeyond12 = booksWithCovers.slice(12); // Books 13, 14, 15...
    
    let slotIndex = 0;
    
    // First: show covers from starred books beyond 12 (from list, not removable)
    for (let i = 0; i < starredBeyond12.length && slotIndex < MAX_EXTRA_COVERS; i++) {
      const book = starredBeyond12[i];
      const slot = document.createElement('div');
      slot.className = 'extra-cover-slot has-cover from-list';
      slot.dataset.slotIndex = slotIndex;
      slot.title = `${book.title} (from your list)`;
      
      const img = document.createElement('img');
      if (book.customCoverData && !book.customCoverData.includes('placehold.co')) {
        img.src = book.customCoverData;
      } else if (book.cover_ids.length > 0) {
        const coverId = book.cover_ids[book.currentCoverIndex || 0];
        img.src = coverId !== 'placehold' 
          ? `${CONFIG.OPEN_LIBRARY_COVERS_URL}${coverId}-M.jpg`
          : CONFIG.PLACEHOLDER_COLLAGE_COVER_URL;
      }
      img.alt = book.title;
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
    for (let i = 0; i < extraCollageCovers.length && slotIndex < MAX_EXTRA_COVERS; i++) {
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
        };
        slot.appendChild(removeBtn);
        
        elements.extraCoversGrid.appendChild(slot);
        slotIndex++;
      }
    }
    
    // Third: show empty slots for remaining positions
    while (slotIndex < MAX_EXTRA_COVERS) {
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
      fileInput.onchange = (e) => handleExtraCoverUpload(e, currentSlotIndex);
      slot.appendChild(fileInput);
      
      slot.onclick = () => fileInput.click();
      
      elements.extraCoversGrid.appendChild(slot);
      slotIndex++;
    }
    
    updateExtraCoversCount();
  }
  
  /**
   * Handles file upload for an extra cover slot
   */
  function handleExtraCoverUpload(event, slotIndex) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check if at max covers total
    const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
    if (starredCount + extraCollageCovers.length >= CONFIG.MAX_COVERS_FOR_COLLAGE) {
      showNotification(`Maximum ${CONFIG.MAX_COVERS_FOR_COLLAGE} covers reached.`);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const coverData = e.target.result;
      addExtraCover(coverData, slotIndex);
    };
    reader.readAsDataURL(file);
  }
  
  /**
   * Adds an extra cover at the specified slot (or next available)
   */
  function addExtraCover(coverData, preferredSlot = null) {
    // Check if at max
    const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
    if (starredCount + extraCollageCovers.length >= CONFIG.MAX_COVERS_FOR_COLLAGE) {
      showNotification(`Maximum ${CONFIG.MAX_COVERS_FOR_COLLAGE} covers reached.`);
      return null;
    }
    
    const newCover = {
      id: `extra-${crypto.randomUUID()}`,
      coverData: coverData
    };
    
    if (preferredSlot !== null && preferredSlot < MAX_EXTRA_COVERS) {
      // Insert at specific slot
      if (extraCollageCovers.length <= preferredSlot) {
        extraCollageCovers.push(newCover);
      } else {
        extraCollageCovers.splice(preferredSlot, 0, newCover);
        // Trim if over max slots
        if (extraCollageCovers.length > MAX_EXTRA_COVERS) {
          extraCollageCovers = extraCollageCovers.slice(0, MAX_EXTRA_COVERS);
        }
      }
    } else {
      // Add to end if room
      if (extraCollageCovers.length < MAX_EXTRA_COVERS) {
        extraCollageCovers.push(newCover);
      } else {
        showNotification('All extra cover slots are full.');
        return null;
      }
    }
    
    renderExtraCoversGrid();
    debouncedSave();

    // Auto-generate cover when 20th cover is added (if auto-generated image exists)
    const frontCoverImg = elements.frontCoverUploader?.querySelector('img');
    if (frontCoverImg?.dataset.isAutoGenerated === 'true') {
      const starredAfterAdd = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
      if (starredAfterAdd + extraCollageCovers.length === CONFIG.MAX_COVERS_FOR_COLLAGE) {
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
    let queryParts = [];
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
    coverImg.src = initialCoverId === 'placehold'
      ? CONFIG.PLACEHOLDER_NO_COVER_URL
      : `${CONFIG.OPEN_LIBRARY_COVERS_URL}${initialCoverId}-M.jpg`;
    coverImg.alt = `Cover for ${book.title}`;
    coverImg.loading = 'lazy';
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
    const { carouselControls, state: carouselState } = createExtraCoverCarouselControls(
      coverImg, 
      initialCoverId, 
      book.key
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
      const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
      const totalCovers = starredCount + extraCollageCovers.length;
      
      if (totalCovers >= CONFIG.MAX_COVERS_FOR_COLLAGE) {
        showNotification(`Maximum ${CONFIG.MAX_COVERS_FOR_COLLAGE} covers reached.`);
        return;
      }
      
      addButton.disabled = true;
      const originalText = addButton.textContent;
      addButton.textContent = 'Adding...';
      
      // Get current cover from carousel state
      const currentCoverId = carouselState.allCoverIds[carouselState.currentCoverIndex];
      const largeCoverUrl = currentCoverId === 'placehold'
        ? CONFIG.PLACEHOLDER_NO_COVER_URL
        : `${CONFIG.OPEN_LIBRARY_COVERS_URL}${currentCoverId}-L.jpg`;
      const mediumCoverUrl = currentCoverId === 'placehold'
        ? CONFIG.PLACEHOLDER_NO_COVER_URL
        : `${CONFIG.OPEN_LIBRARY_COVERS_URL}${currentCoverId}-M.jpg`;
      
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
      } catch (err) {
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
   * Creates carousel controls for extra cover search cards
   */
  function createExtraCoverCarouselControls(coverElement, initialCoverId, bookKey) {
    const carouselControls = document.createElement('div');
    carouselControls.className = 'carousel-controls';
    
    const coverCounter = document.createElement('span');
    coverCounter.className = 'cover-counter';
    coverCounter.textContent = '1 of 1';
    
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
      coverElement.src = currentId === 'placehold'
        ? CONFIG.PLACEHOLDER_NO_COVER_URL
        : `${CONFIG.OPEN_LIBRARY_COVERS_URL}${currentId}-M.jpg`;
      coverCounter.textContent = `${state.currentCoverIndex + 1} of ${state.allCoverIds.length}`;
      prevButton.disabled = state.currentCoverIndex === 0;
      nextButton.disabled = state.currentCoverIndex === state.allCoverIds.length - 1;
    };
    
    const loadAllCovers = async () => {
      if (state.coversLoaded || !bookKey) return;
      
      const fetchedCovers = await fetchAllCoverIdsForWork(bookKey);
      
      let finalCovers = [];
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
      e.stopPropagation();
      if (!state.coversLoaded) await loadAllCovers();
      if (state.currentCoverIndex > 0) {
        state.currentCoverIndex--;
        updateCarousel();
      }
    });
    
    nextButton.addEventListener('click', async (e) => {
      e.stopPropagation();
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
    // Extended mode toggle
    if (elements.extendedCollageToggle) {
      elements.extendedCollageToggle.addEventListener('change', () => {
        toggleExtendedCollageMode(elements.extendedCollageToggle.checked);
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
    } catch (err) {
      console.error(err);
      showNotification('Error generating QR code. Check the URL.');
    }
  }
  
  // ---------------------------------------------------------------------------
  // PDF Export
  // ---------------------------------------------------------------------------
  async function exportPdf() {
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
    
    try {
      await new Promise(resolve => setTimeout(resolve, CONFIG.PDF_RENDER_DELAY_MS));
      await document.fonts.ready;
      
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'in',
        format: 'letter'
      });
      
      const options = {
        scale: CONFIG.PDF_CANVAS_SCALE,
        useCORS: true,
        backgroundColor: null,
        windowWidth: 3300,
        windowHeight: 2550
      };
      
      const canvas1 = await html2canvas(document.getElementById('print-page-1'), options);
      pdf.addImage(canvas1.toDataURL('image/png'), 'PNG', 0, 0, CONFIG.PDF_WIDTH_IN, CONFIG.PDF_HEIGHT_IN, undefined, 'SLOW');
      pdf.addPage();
      
      const canvas2 = await html2canvas(document.getElementById('print-page-2'), options);
      pdf.addImage(canvas2.toDataURL('image/png'), 'PNG', 0, 0, CONFIG.PDF_WIDTH_IN, CONFIG.PDF_HEIGHT_IN, undefined, 'SLOW');
      
      pdf.save(suggestedName);
      showNotification('PDF download started.', 'success');
      
    } catch (err) {
      console.error("PDF Generation failed:", err);
      showNotification("An error occurred generating the PDF. Please check the console.", 'error');
    } finally {
      elements.previewArea.classList.remove('print-mode');
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
    if (img.src.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP')) return null;
    return img.src;
  }
  
  function captureStyleGroups() {
    const styles = {};
    
    document.querySelectorAll('.export-controls .form-group[data-style-group]').forEach(group => {
      const k = group.dataset.styleGroup;
      styles[k] = {
        font: group.querySelector('.font-select')?.value ?? '',
        sizePt: parseFloat(group.querySelector('.font-size-input')?.value ?? '12'),
        color: group.querySelector('.color-picker')?.value ?? '#000000',
        bold: !!group.querySelector('.bold-toggle')?.classList.contains('active'),
        italic: !!group.querySelector('.italic-toggle')?.classList.contains('active'),
      };
    });
    
    // Cover title styles - shared settings
    styles.coverTitle = {
      outerMarginPt: parseFloat(document.getElementById('cover-title-outer-margin')?.value ?? '10'),
      padXPt: parseFloat(document.getElementById('cover-title-pad-x')?.value ?? '0'),
      padYPt: parseFloat(document.getElementById('cover-title-pad-y')?.value ?? '10'),
      sideMarginPt: parseFloat(document.getElementById('cover-title-side-margin')?.value ?? '0'),
      bgColor: document.getElementById('cover-title-bg-color')?.value ?? '#000000',
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
    
    // Get list name (used for filename)
    const listName = (elements.listNameInput?.value || '').trim();
    
    // Capture cover text (both modes)
    const isAdvancedMode = elements.coverAdvancedToggle?.checked || false;
    const coverTitle = elements.coverTitleInput?.value || ''; // Simple mode text
    const coverLineTexts = elements.coverLines.map(line => line.input?.value || ''); // Advanced mode texts
    
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
        extendedCollageMode: !!elements.extendedCollageToggle?.checked,
        qrCodeUrl: elements.qrUrlInput?.value || '',
        qrCodeText: (elements.qrCodeTextArea?.innerText !== CONFIG.PLACEHOLDERS.qrText)
          ? (elements.qrCodeTextArea?.innerText || '')
          : '',
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
      
      if (fontSel) fontSel.value = s.font ?? fontSel.value;
      if (sizeInp) sizeInp.value = s.sizePt ?? sizeInp.value;
      if (colorInp) colorInp.value = s.color ?? colorInp.value;
      if (boldBtn) boldBtn.classList.toggle('active', !!s.bold);
      if (italicBtn) italicBtn.classList.toggle('active', !!s.italic);
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
    
    // Simple mode styling
    const simple = ct.simple || {};
    if (elements.coverFontSelect) elements.coverFontSelect.value = simple.font ?? elements.coverFontSelect.value;
    if (elements.coverFontSize) elements.coverFontSize.value = simple.sizePt ?? 40;
    if (elements.coverTextColor) elements.coverTextColor.value = simple.color ?? '#FFFFFF';
    if (elements.coverBoldToggle) elements.coverBoldToggle.classList.toggle('active', simple.bold !== false);
    if (elements.coverItalicToggle) elements.coverItalicToggle.classList.toggle('active', !!simple.italic);
    
    // Advanced mode per-line styling with individual spacing
    const savedLines = ct.lines || [];
    const defaultSizes = [48, 28, 20];
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
  
  function applyUploaderImage(uploaderEl, dataUrl) {
    if (!uploaderEl) return;
    const img = uploaderEl.querySelector('img');
    if (!img) return;
    
    // Treat transparent placeholder GIF as null (handles legacy drafts)
    const isTransparentGif = dataUrl && dataUrl.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP');
    
    if (dataUrl && !isTransparentGif) {
      img.src = dataUrl;
      img.dataset.isPlaceholder = "false";
      uploaderEl.classList.add('has-image');
    } else {
      // Reset to transparent gif so placeholder text shows via CSS
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      img.dataset.isPlaceholder = 'true';
      uploaderEl.classList.remove('has-image');
    }
  }
  
  function applyState(loaded) {
    if (!loaded || loaded.schema !== 'booklist-v1') {
      showNotification('Invalid or unsupported booklist file.', 'error');
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
    
    // Show/hide tilted settings based on layout
    updateTiltedSettingsVisibility();
    
    // Restore extended collage mode and extra covers
    const isExtendedMode = !!loaded.ui?.extendedCollageMode;
    if (elements.extendedCollageToggle) {
      elements.extendedCollageToggle.checked = isExtendedMode;
    }
    
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
      const loadedText = loaded.ui?.qrCodeText || '';
      if (loadedText && loadedText !== CONFIG.PLACEHOLDERS.qrText) {
        elements.qrCodeTextArea.innerText = loadedText;
        elements.qrCodeTextArea.style.color = '';
      } else {
        elements.qrCodeTextArea.innerText = CONFIG.PLACEHOLDERS.qrText;
        elements.qrCodeTextArea.style.color = CONFIG.PLACEHOLDER_COLOR;
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
    applyUploaderImage(elements.brandingUploader, loaded.images?.branding || null);
    
    // Books
    const incoming = Array.isArray(loaded.books) ? loaded.books : [];
    let starCount = 0;
    // Allow up to 15 starred books when extended mode is enabled, otherwise 12
    const maxStars = isExtendedMode ? 15 : CONFIG.MIN_COVERS_FOR_COLLAGE;
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
      myBooklist.push(createBlankBook());
    }
    
    handleLayoutChange();
    renderBooklist();
    applyStyles();
    applyBlockCoverStyle();
    updateBackCoverVisibility();

    // Toggle extended mode AFTER books are loaded so renderExtraCoversGrid sees the correct data
    toggleExtendedCollageMode(isExtendedMode, true);

    // Auto-generate cover collage if all required covers are present but front cover is empty
    // (This handles browser draft restore where the cover image isn't saved to localStorage)
    const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
    const totalCovers = starredCount + extraCollageCovers.length;
    const requiredCovers = isExtendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
    const hasFrontCover = elements.frontCoverUploader?.classList.contains('has-image');
    
    if (totalCovers >= requiredCovers && !hasFrontCover) {
      // Small delay to ensure DOM is ready
      setTimeout(() => generateCoverCollage(), 150);
    }

    showNotification('Booklist loaded.', 'success');
  }
  
  // Local draft storage
  function serializeDraftForLocal() {
    const s = serializeState();
    if (s.images) s.images.frontCover = null;
    return s;
  }
  
  function saveDraftLocal() {
    try {
      localStorage.setItem('booklist-draft', JSON.stringify(serializeDraftForLocal()));
    } catch (_) { /* ignore quota errors */ }
  }
  
  function restoreDraftLocalIfPresent() {
    try {
      const raw = localStorage.getItem('booklist-draft');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      applyState(parsed);
      showNotification('Draft restored from this browser.', 'success');
      
      // Auto-generate if user had a generated cover and we have enough covers
      if (parsed.images?.frontCoverIsAutoGenerated) {
        const extendedMode = parsed.ui?.extendedCollageMode || false;
        const requiredCovers = extendedMode ? CONFIG.MAX_COVERS_FOR_COLLAGE : CONFIG.MIN_COVERS_FOR_COLLAGE;
        
        // Count starred books with covers
        const booksWithCovers = myBooklist.filter(book =>
          !book.isBlank &&
          book.includeInCollage &&
          (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co')))
        );
        
        // Count extra covers (only in extended mode)
        const extraCoverCount = extendedMode 
          ? extraCollageCovers.filter(ec => ec.coverData && !ec.coverData.includes('placehold.co')).length
          : 0;
        
        const totalCovers = booksWithCovers.length + extraCoverCount;
        
        if (totalCovers >= requiredCovers) {
          // Small delay to let UI settle
          setTimeout(() => generateCoverCollage(), 150);
        }
      }
    } catch (_) { /* ignore */ }
  }
  
  function resetToBlank() {
    try { localStorage.removeItem('booklist-draft'); } catch (_) {}
    location.reload();
  }
  
  // ---------------------------------------------------------------------------
  // File Upload Handlers
  // ---------------------------------------------------------------------------
  function setupFileChangeHandler(uploaderElement) {
    const fileInput = uploaderElement.querySelector('input[type="file"]');
    const imgElement = uploaderElement.querySelector('img');
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          imgElement.src = event.target.result;
          imgElement.dataset.isPlaceholder = "false";
          uploaderElement.classList.add('has-image');
          debouncedSave();
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  function setupFrontCoverHandler() {
    const frontCoverFileInput = elements.frontCoverUploader.querySelector('input[type="file"]');
    const frontCoverImgElement = elements.frontCoverUploader.querySelector('img');
    
    frontCoverFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        elements.frontCoverUploader.dataset.fileName = file.name;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          frontCoverImgElement.src = event.target.result;
          frontCoverImgElement.dataset.isPlaceholder = "false";
          frontCoverImgElement.dataset.isAutoGenerated = "false";
          elements.frontCoverUploader.classList.add('has-image');
          debouncedSave(); // Save draft with updated flag
        };
        reader.readAsDataURL(file);
      }
    });
    
    elements.frontCoverUploader.addEventListener('click', (e) => {
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
      onEnd: function() {
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
    
    // List name input (triggers autosave)
    if (elements.listNameInput) {
      elements.listNameInput.addEventListener('input', debouncedSave);
    }
    
    // Cover generation
    elements.generateCoverButton.addEventListener('click', generateCoverCollage);
    elements.stretchCoversToggle.addEventListener('change', () => {
      autoRegenerateCoverIfAble();
      debouncedSave();
    });
    elements.stretchBlockCoversToggle.addEventListener('change', () => {
      applyBlockCoverStyle();
      debouncedSave();
    });
    
    // Layout selector
    if (elements.collageLayoutSelector) {
      elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(option => {
        option.addEventListener('click', () => {
          elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');
          // Show/hide tilted settings based on selected layout
          updateTiltedSettingsVisibility();
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      });
    }
    
    // Show shelves toggle for classic layout
    if (elements.showShelvesToggle) {
      elements.showShelvesToggle.addEventListener('change', () => {
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    
    // Title bar position dropdown
    if (elements.titleBarPosition) {
      elements.titleBarPosition.addEventListener('change', () => {
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    
    // Tilted layout settings
    if (elements.tiltDegree) {
      elements.tiltDegree.addEventListener('input', () => {
        debouncedSave();
        debouncedCoverRegen();
      });
      elements.tiltDegree.addEventListener('change', () => {
        debouncedSave();
        debouncedCoverRegen();
      });
    }
    if (elements.tiltOffsetDirection) {
      elements.tiltOffsetDirection.addEventListener('change', () => {
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    
    // Margins & Padding inputs
    ['cover-title-outer-margin', 'cover-title-side-margin', 'cover-title-pad-x', 'cover-title-pad-y'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', debouncedSave);
        input.addEventListener('change', autoRegenerateCoverIfAble);
      }
    });
    
    // BG Color picker
    const bgColorPicker = document.getElementById('cover-title-bg-color');
    if (bgColorPicker) {
      bgColorPicker.addEventListener('input', debouncedSave);
      bgColorPicker.addEventListener('change', autoRegenerateCoverIfAble);
    }
    
    // Cover mode toggle
    if (elements.coverAdvancedToggle) {
      elements.coverAdvancedToggle.addEventListener('change', (e) => {
        toggleCoverMode(e.target.checked);
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    
    // Simple mode: textarea and style controls
    if (elements.coverTitleInput) {
      elements.coverTitleInput.addEventListener('input', () => {
        debouncedSave();
        debouncedCoverRegen();
      });
    }
    
    // Simple mode style controls
    const simpleStyleElements = [
      elements.coverFontSelect,
      elements.coverFontSize,
      elements.coverTextColor
    ];
    simpleStyleElements.forEach(el => {
      if (el) {
        el.addEventListener('input', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
        el.addEventListener('change', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
      }
    });
    
    // Simple mode bold/italic toggles
    if (elements.coverBoldToggle) {
      elements.coverBoldToggle.addEventListener('click', () => {
        elements.coverBoldToggle.classList.toggle('active');
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    if (elements.coverItalicToggle) {
      elements.coverItalicToggle.addEventListener('click', () => {
        elements.coverItalicToggle.classList.toggle('active');
        debouncedSave();
        autoRegenerateCoverIfAble();
      });
    }
    
    // Advanced mode: per-line inputs and style controls
    elements.coverLines.forEach(line => {
      // Text input (debounced for rapid typing)
      if (line.input) {
        line.input.addEventListener('input', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Font select (instant - discrete change)
      if (line.font) {
        line.font.addEventListener('change', () => {
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Size input (debounced for rapid changes)
      if (line.size) {
        line.size.addEventListener('input', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Color picker (debounced for dragging)
      if (line.color) {
        line.color.addEventListener('input', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Spacing input (debounced for rapid changes)
      if (line.spacing) {
        line.spacing.addEventListener('input', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
        line.spacing.addEventListener('change', () => {
          debouncedSave();
          debouncedCoverRegen();
        });
      }
      // Bold toggle (instant - discrete change)
      if (line.bold) {
        line.bold.addEventListener('click', () => {
          line.bold.classList.toggle('active');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Italic toggle (instant - discrete change)
      if (line.italic) {
        line.italic.addEventListener('click', () => {
          line.italic.classList.toggle('active');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
    });
    
    // Layout toggles
    elements.toggleQrCode.addEventListener('change', handleLayoutChange);
    elements.toggleBranding.addEventListener('change', handleLayoutChange);
    
    // QR code
    elements.generateQrButton.addEventListener('click', generateQrCode);
    
    // Spacing inputs and background color for cover auto-regen
    const coverLayoutInputIds = ['cover-title-outer-margin', 'cover-title-pad-x', 'cover-title-pad-y', 'cover-title-side-margin', 'cover-title-bg-color'];
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
      group.querySelectorAll('select, input').forEach(input => {
        input.addEventListener('change', () => {
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            debouncedCoverRegen();
          }
        });
        input.addEventListener('input', () => {
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            debouncedCoverRegen();
          }
        });
      });
      
      group.querySelectorAll('button').forEach(button => {
        // Skip line-specific bold/italic buttons (they have their own handlers)
        if (button.classList.contains('line-bold') || button.classList.contains('line-italic')) {
          return;
        }
        button.addEventListener('click', (e) => {
          if (e.target.classList.contains('bold-toggle') || e.target.classList.contains('italic-toggle')) {
            e.target.classList.toggle('active');
          }
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
        debouncedSave(); // Sync browser draft with saved file
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
        applyState(parsed);
        debouncedSave(); // Sync browser draft with loaded file
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
        const imgElement = elements.brandingUploader.querySelector('img');
        imgElement.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        imgElement.dataset.isPlaceholder = 'true';
        elements.brandingUploader.classList.remove('has-image');
        debouncedSave();
      });
    }
    
    // Branding "Use Default" button - loads the default branding image
    const brandingDefaultBtn = elements.brandingUploader.querySelector('.branding-default-btn');
    if (brandingDefaultBtn) {
      brandingDefaultBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const imgElement = elements.brandingUploader.querySelector('img');
        imgElement.src = 'assets/img/branding-default.png';
        imgElement.dataset.isPlaceholder = 'false';
        elements.brandingUploader.classList.add('has-image');
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
    
    // Save on blur
    elements.qrCodeTextArea.addEventListener('blur', debouncedSave);
    
    // Save QR URL input on change
    if (elements.qrUrlInput) {
      elements.qrUrlInput.addEventListener('input', debouncedSave);
    }
  }
  
  // ---------------------------------------------------------------------------
  // Custom Font Dropdown System (Hover Preview)
  // ---------------------------------------------------------------------------
  
  /**
   * Extracts the font family name from a CSS font value
   * e.g., "'Oswald', sans-serif" -> "Oswald"
   */
  function extractFontName(fontValue) {
    const match = fontValue.match(/^'([^']+)'/);
    return match ? match[1] : fontValue.split(',')[0].trim().replace(/'/g, '');
  }
  
  /**
   * Creates a custom dropdown for a font select element
   * @param {HTMLSelectElement} select - The original select element
   * @param {Object} options - Configuration options
   * @param {string} options.type - 'cover-simple' | 'cover-advanced' | 'book-block'
   * @param {number} [options.lineIndex] - Line index for cover-advanced (0, 1, 2)
   */
  function createCustomFontDropdown(select, options = {}) {
    const { type, lineIndex } = options;
    
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
      committedValue = value;
      select.value = value;
      
      // Update selected state in list
      list.querySelectorAll('.custom-font-dropdown-option').forEach(li => {
        const isSelected = li.dataset.value === value;
        li.classList.toggle('selected', isSelected);
        li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      });
      
      updateTrigger();
      
      // Trigger change event on original select for any listeners
      select.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Save state
      debouncedSave();
    }
    
    // Open dropdown
    function openDropdown() {
      if (isOpen) return;
      isOpen = true;
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      
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
    
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (isOpen && !wrapper.contains(e.target)) {
        closeDropdown(true);
      }
    });
    
    // Close on scroll (prevents visual detachment)
    let scrollParent = wrapper.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      if (scrollParent.scrollHeight > scrollParent.clientHeight) {
        scrollParent.addEventListener('scroll', () => {
          if (isOpen) closeDropdown(true);
        }, { passive: true });
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
  // Public API / Initialization
  // ---------------------------------------------------------------------------
  function init() {
    cacheElements();
    bindEvents();
    bindExtraCoversEvents();
    setupQrPlaceholder();
    initializeBooklist();
    applyStyles();
    initializeSortable();
    initializeCustomFontDropdowns();
    renderExtraCoversGrid();
    
    // Set default cover mode (simple)
    toggleCoverMode(false);
    
    // Set initial tilted settings visibility
    updateTiltedSettingsVisibility();
    
    // Try restoring draft
    restoreDraftLocalIfPresent();
  }
  
  // Expose necessary functions for external access
  return {
    init,
    showNotification,
    getAiDescription, // For testing
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
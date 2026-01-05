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
  NOTIFICATION_DURATION_MS: 5000,
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
      coverLineSpacing: document.getElementById('cover-line-spacing'),
      
      // Collage layout selector (in Settings)
      collageLayoutSelector: document.getElementById('collage-layout-selector'),
      
      // Simple mode elements
      coverTitleInput: document.getElementById('cover-title-input'),
      coverFontSelect: document.getElementById('cover-font-select'),
      coverFontSize: document.getElementById('cover-font-size'),
      coverBoldToggle: document.getElementById('cover-bold-toggle'),
      coverItalicToggle: document.getElementById('cover-italic-toggle'),
      coverTextColor: document.getElementById('cover-text-color'),
      
      // Advanced mode: 3 lines with full styling
      coverLines: [
        {
          input: document.getElementById('cover-line-1'),
          font: document.getElementById('line-1-font'),
          size: document.getElementById('line-1-size'),
          bold: document.getElementById('line-1-bold'),
          italic: document.getElementById('line-1-italic'),
          color: document.getElementById('line-1-color'),
        },
        {
          input: document.getElementById('cover-line-2'),
          font: document.getElementById('line-2-font'),
          size: document.getElementById('line-2-size'),
          bold: document.getElementById('line-2-bold'),
          italic: document.getElementById('line-2-italic'),
          color: document.getElementById('line-2-color'),
        },
        {
          input: document.getElementById('cover-line-3'),
          font: document.getElementById('line-3-font'),
          size: document.getElementById('line-3-size'),
          bold: document.getElementById('line-3-bold'),
          italic: document.getElementById('line-3-italic'),
          color: document.getElementById('line-3-color'),
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
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    selection.deleteFromDocument();
    selection.getRangeAt(0).insertNode(document.createTextNode(text));
    selection.collapseToEnd();
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
    
    // Count currently starred books
    const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
    const isStarred = bookItem.includeInCollage;
    const atLimit = starredCount >= CONFIG.MIN_COVERS_FOR_COLLAGE;
    
    if (isStarred) {
      starButton.classList.add('active');
    } else if (atLimit) {
      starButton.classList.add('disabled');
      starButton.disabled = true;
    }
    
    starButton.innerHTML = '<i class="fa-solid fa-star"></i>';
    starButton.title = isStarred ? 'Remove from collage' : (atLimit ? '12 covers already selected' : 'Include in collage');
    starButton.setAttribute('aria-label', 'Toggle inclusion in cover collage');
    starButton.setAttribute('aria-pressed', isStarred ? 'true' : 'false');
    starButton.onclick = () => {
      if (!isStarred && atLimit) return; // Can't add more if at limit
      
      bookItem.includeInCollage = !bookItem.includeInCollage;
      debouncedSave();
      renderBooklist(); // Re-render to update all star states
    };
    
    // Magic button (fetch description)
    const magicButton = document.createElement('button');
    magicButton.className = 'magic-button';
    magicButton.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    magicButton.title = 'Fetch AI description';
    magicButton.setAttribute('aria-label', 'Fetch AI description for this book');
    magicButton.onclick = () => handleMagicButtonClick(bookItem);
    
    // Item number
    const itemNumber = document.createElement('span');
    itemNumber.className = 'item-number';
    itemNumber.textContent = index + 1;
    itemNumber.setAttribute('aria-hidden', 'true');
    itemNumber.title = `Book #${index + 1}`;
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.innerHTML = '&times;';
    deleteButton.title = 'Remove from list';
    deleteButton.setAttribute('aria-label', `Remove book ${index + 1} from list`);
    deleteButton.onclick = () => handleDeleteBook(bookItem, index);
    
    controlsDiv.appendChild(dragHandle);
    controlsDiv.appendChild(starButton);
    controlsDiv.appendChild(magicButton);
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
      // Advanced mode: per-line styling
      const lineSpacingPt = parseFloat(elements.coverLineSpacing?.value || '10');
      const lines = elements.coverLines.map(line => {
        const text = (line.input?.value || '').trim();
        if (!text) return null; // Skip empty lines
        
        const font = line.font?.value || "'Oswald', sans-serif";
        const sizePt = parseInt(line.size?.value || '24', 10);
        const isBold = line.bold?.classList.contains('active') || false;
        const isItalic = line.italic?.classList.contains('active') || false;
        const color = line.color?.value || '#FFFFFF';
        
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
        };
      }).filter(line => line !== null);
      
      return {
        ...layoutSettings,
        isAdvancedMode: true,
        lines,
        lineSpacingPx: lineSpacingPt * pxPerPt,
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
        });
      });
    } else {
      // Advanced mode: multiple lines with individual styling
      if (!styles.lines || styles.lines.length === 0) {
        const bgY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
        return { bgY, bgH: 0 };
      }
      
      styles.lines.forEach(lineData => {
        ctx.font = `${lineData.fontStyle} ${lineData.sizePx}px ${lineData.font}, sans-serif`;
        const wrappedLines = wrapTextMultiline(lineData.text, availableTextWidth);
        
        wrappedLines.forEach(wrappedText => {
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
          });
        });
      });
    }
    
    if (processedLines.length === 0) {
      const bgY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
      return { bgY, bgH: 0 };
    }
    
    // Calculate total height with gaps between lines
    // Use custom spacing for advanced mode, default 8pt for simple mode
    const defaultGapPx = 8 * (CONFIG.PDF_DPI / 72);
    const lineGapPx = styles.lineSpacingPx !== undefined ? styles.lineSpacingPx : defaultGapPx;
    
    let textBlockHeight = 0;
    processedLines.forEach((line, i) => {
      textBlockHeight += line.height;
      if (i < processedLines.length - 1) {
        textBlockHeight += lineGapPx;
      }
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
      ctx.font = `${line.fontStyle} ${line.sizePx}px ${line.font}, sans-serif`;
      ctx.fillStyle = line.color;
      const baselineY = y + line.ascent;
      ctx.fillText(line.text.trim(), centerX, baselineY);
      y += line.height;
      if (i < processedLines.length - 1) {
        y += lineGapPx;
      }
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
    
    // Gather books with covers that are marked for inclusion
    const booksWithCovers = myBooklist.filter(book =>
      !book.isBlank &&
      book.includeInCollage &&
      (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co')))
    );
    
    if (booksWithCovers.length < CONFIG.MIN_COVERS_FOR_COLLAGE) {
      const starredCount = myBooklist.filter(b => !b.isBlank && b.includeInCollage).length;
      const totalWithCovers = myBooklist.filter(b => !b.isBlank && (b.cover_ids.length > 0 || (b.customCoverData && !b.customCoverData.includes('placehold.co')))).length;
      
      if (starredCount < CONFIG.MIN_COVERS_FOR_COLLAGE) {
        showNotification(`Need ${CONFIG.MIN_COVERS_FOR_COLLAGE} starred books. Currently ${starredCount} starred.`);
      } else {
        showNotification(`Need ${CONFIG.MIN_COVERS_FOR_COLLAGE} starred books with covers. ${totalWithCovers} have covers.`);
      }
      setLoading(button, false);
      return;
    }
    
    // Get cover URLs
    const coversToDraw = booksWithCovers.slice(0, CONFIG.MIN_COVERS_FOR_COLLAGE).map(book => {
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
    
    const { canvas, ctx } = createCollageCanvas();
    const styles = getCoverTitleStyles();
    
    // Wait for fonts, then load images and draw
    document.fonts.ready.then(() => {
      return Promise.all(coversToDraw.map(src => loadImage(src)));
    }).then(images => {
      // Draw based on selected layout
      switch (selectedLayout) {
        case 'bookshelf':
          drawLayoutBookshelf(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'titleTop':
          drawLayoutTitleTop(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'titleBottom':
          drawLayoutTitleBottom(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'staggered':
          drawLayoutStaggered(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'filmstrip':
          drawLayoutFilmstrip(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'wave':
          drawLayoutWave(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'spotlight':
          drawLayoutSpotlight(ctx, canvas, images, styles, shouldStretchCovers);
          break;
        case 'classic':
        default:
          drawLayoutClassic(ctx, canvas, images, styles, shouldStretchCovers);
          break;
      }
      
      // Apply to front cover
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const frontCoverImg = elements.frontCoverUploader.querySelector('img');
      frontCoverImg.src = dataUrl;
      frontCoverImg.dataset.isPlaceholder = "false";
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
    const lineGapPx = styles.lineSpacingPx !== undefined ? styles.lineSpacingPx : defaultGapPx;
    
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
            textBlockHeight += lineGapPx; // Use consistent gap
          }
        });
        
        titleBarHeight = textBlockHeight + 2 * styles.padYPx;
      }
    } else {
      if (styles.lines && styles.lines.length > 0) {
        let textBlockHeight = 0;
        let totalWrappedLines = 0;
        
        styles.lines.forEach((lineData, i) => {
          ctx.font = `${lineData.fontStyle} ${lineData.sizePx}px ${lineData.font}, sans-serif`;
          const wrappedLines = wrapTextMultiline(lineData.text, availableTextWidth);
          
          wrappedLines.forEach((wrappedText, j) => {
            const m = ctx.measureText(wrappedText);
            const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : lineData.sizePx * 0.8;
            const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : lineData.sizePx * 0.2;
            textBlockHeight += ascent + descent;
            totalWrappedLines++;
          });
          
          if (i < styles.lines.length - 1) {
            textBlockHeight += lineGapPx;
          }
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
    const lineGapPx = styles.lineSpacingPx !== undefined ? styles.lineSpacingPx : defaultGapPx;
    
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
        });
      });
    } else {
      if (!styles.lines || styles.lines.length === 0) {
        return { bgY: yPosition, bgH: 0 };
      }
      
      styles.lines.forEach(lineData => {
        ctx.font = `${lineData.fontStyle} ${lineData.sizePx}px ${lineData.font}, sans-serif`;
        const wrappedLines = wrapTextMultiline(lineData.text, availableTextWidth);
        
        wrappedLines.forEach(wrappedText => {
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
          });
        });
      });
    }
    
    if (processedLines.length === 0) {
      return { bgY: yPosition, bgH: 0 };
    }
    
    let textBlockHeight = 0;
    processedLines.forEach((line, i) => {
      textBlockHeight += line.height;
      if (i < processedLines.length - 1) {
        textBlockHeight += lineGapPx;
      }
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
      ctx.font = `${line.fontStyle} ${line.sizePx}px ${line.font}, sans-serif`;
      ctx.fillStyle = line.color;
      const baselineY = y + line.ascent;
      ctx.fillText(line.text.trim(), centerX, baselineY);
      y += line.height;
      if (i < processedLines.length - 1) {
        y += lineGapPx;
      }
    });
    
    return { bgY, bgH };
  }
  
  /**
   * Layout: Classic Grid (original layout)
   * 3 covers on top, title bar, 3x3 grid below
   */
  function drawLayoutClassic(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const titleBarHeight = calculateTitleBarHeight(ctx, styles);
    const layout = calculateCollageLayout(canvasWidth, canvasHeight, titleBarHeight, styles.outerMarginPx);
    layout.topRowY = 0;
    
    // Draw top row of covers
    let imageIndex = 0;
    for (let col = 0; col < 3; col++) {
      const slotX = layout.hGutter + col * (layout.slotWidth + layout.hGutter);
      drawCoverImage(ctx, images[imageIndex], slotX, layout.topRowY, layout.slotWidth, layout.slotHeight, shouldStretch);
      imageIndex++;
    }
    
    // Draw title bar
    const titleY = layout.topRowY + layout.slotHeight + styles.outerMarginPx;
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Draw bottom grid of covers
    const gridTopY = titleY + bgH + styles.outerMarginPx;
    for (let row = 0; row < 3; row++) {
      const currentRowY = gridTopY + row * (layout.slotHeight + layout.vGutter);
      for (let col = 0; col < 3; col++) {
        const slotX = layout.hGutter + col * (layout.slotWidth + layout.hGutter);
        drawCoverImage(ctx, images[imageIndex], slotX, currentRowY, layout.slotWidth, layout.slotHeight, shouldStretch);
        imageIndex++;
      }
    }
  }
  
  /**
   * Layout: Bookshelf
   * Same as classic but with shelf lines under each row
   */
  function drawLayoutBookshelf(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const shelfLineWidth = 6 * (CONFIG.PDF_DPI / 72); // 6pt line
    const shelfColor = '#5D4037'; // Brown wood color
    const shelfOverhang = 20 * (CONFIG.PDF_DPI / 72);
    const shelfExtraSpace = shelfLineWidth * 4; // Extra space for shelves
    
    const titleBarHeight = calculateTitleBarHeight(ctx, styles);
    
    // Recalculate layout accounting for shelf space
    const totalShelfSpace = shelfExtraSpace; // Only account for shelves in grid area
    const adjustedHeight = canvasHeight - totalShelfSpace;
    const layout = calculateCollageLayout(canvasWidth, adjustedHeight, titleBarHeight, styles.outerMarginPx);
    layout.topRowY = 0;
    
    // Draw top row of covers
    let imageIndex = 0;
    for (let col = 0; col < 3; col++) {
      const slotX = layout.hGutter + col * (layout.slotWidth + layout.hGutter);
      drawCoverImage(ctx, images[imageIndex], slotX, layout.topRowY, layout.slotWidth, layout.slotHeight, shouldStretch);
      imageIndex++;
    }
    
    // Draw shelf under top row
    const topShelfY = layout.topRowY + layout.slotHeight;
    ctx.fillStyle = shelfColor;
    ctx.fillRect(layout.hGutter - shelfOverhang, topShelfY, canvasWidth - 2 * layout.hGutter + 2 * shelfOverhang, shelfLineWidth);
    
    // Draw title bar
    const titleY = topShelfY + shelfLineWidth + styles.outerMarginPx;
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Draw bottom grid of covers with shelves
    const gridTopY = titleY + bgH + styles.outerMarginPx;
    const rowHeight = layout.slotHeight + layout.vGutter + shelfLineWidth;
    
    for (let row = 0; row < 3; row++) {
      const currentRowY = gridTopY + row * rowHeight;
      for (let col = 0; col < 3; col++) {
        const slotX = layout.hGutter + col * (layout.slotWidth + layout.hGutter);
        drawCoverImage(ctx, images[imageIndex], slotX, currentRowY, layout.slotWidth, layout.slotHeight, shouldStretch);
        imageIndex++;
      }
      
      // Draw shelf under this row (ensure it stays within canvas)
      const shelfY = currentRowY + layout.slotHeight;
      if (shelfY + shelfLineWidth <= canvasHeight) {
        ctx.fillStyle = shelfColor;
        ctx.fillRect(layout.hGutter - shelfOverhang, shelfY, canvasWidth - 2 * layout.hGutter + 2 * shelfOverhang, shelfLineWidth);
      }
    }
  }
  
  /**
   * Layout: Title Top
   * Title bar at the very top, then 4 rows of 3 covers
   */
  function drawLayoutTitleTop(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Draw title bar flush at top (no margin)
    const titleY = 0;
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Calculate cover grid (4 rows x 3 cols below title)
    const gridTopY = bgH + styles.outerMarginPx;
    const availableHeight = canvasHeight - gridTopY - styles.outerMarginPx;
    const rows = 4;
    const cols = 3;
    
    const vGutterRatio = 0.08;
    const bookAspect = 0.667;
    const totalVGutters = (rows - 1) * vGutterRatio;
    const slotHeight = availableHeight / (rows + totalVGutters);
    const vGutter = slotHeight * vGutterRatio;
    const slotWidth = slotHeight * bookAspect;
    const hGutter = (canvasWidth - cols * slotWidth) / (cols + 1);
    
    let imageIndex = 0;
    for (let row = 0; row < rows; row++) {
      const currentRowY = gridTopY + row * (slotHeight + vGutter);
      for (let col = 0; col < cols; col++) {
        const slotX = hGutter + col * (slotWidth + hGutter);
        drawCoverImage(ctx, images[imageIndex], slotX, currentRowY, slotWidth, slotHeight, shouldStretch);
        imageIndex++;
      }
    }
  }
  
  /**
   * Layout: Title Bottom
   * 4 rows of 3 covers, then title bar flush at the bottom
   */
  function drawLayoutTitleBottom(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const titleBarHeight = calculateTitleBarHeight(ctx, styles);
    
    // Calculate cover grid (4 rows x 3 cols)
    const gridTopY = styles.outerMarginPx;
    const availableHeight = canvasHeight - gridTopY - titleBarHeight - styles.outerMarginPx;
    const rows = 4;
    const cols = 3;
    
    const vGutterRatio = 0.08;
    const bookAspect = 0.667;
    const totalVGutters = (rows - 1) * vGutterRatio;
    const slotHeight = availableHeight / (rows + totalVGutters);
    const vGutter = slotHeight * vGutterRatio;
    const slotWidth = slotHeight * bookAspect;
    const hGutter = (canvasWidth - cols * slotWidth) / (cols + 1);
    
    let imageIndex = 0;
    for (let row = 0; row < rows; row++) {
      const currentRowY = gridTopY + row * (slotHeight + vGutter);
      for (let col = 0; col < cols; col++) {
        const slotX = hGutter + col * (slotWidth + hGutter);
        drawCoverImage(ctx, images[imageIndex], slotX, currentRowY, slotWidth, slotHeight, shouldStretch);
        imageIndex++;
      }
    }
    
    // Draw title bar flush at bottom
    const titleY = canvasHeight - titleBarHeight;
    drawTitleBarAt(ctx, styles, canvasWidth, titleY);
  }
  
  /**
   * Layout: Pyramid
   * 1 cover on top, then 2, then 3, then title, then 3, then 3
   */
  /**
   * Layout: Staggered
   * Alternating rows of 2 and 3 covers, centered, with partial repeated covers on edges for visual fullness
   */
  function drawLayoutStaggered(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const titleBarHeight = calculateTitleBarHeight(ctx, styles);
    const margin = styles.outerMarginPx;
    const gutter = 8 * (CONFIG.PDF_DPI / 72);
    
    // Pattern: 2, 3, title, 2, 3, 2 = 12 covers
    const bookAspect = 0.667;
    const rows = 5;
    
    // Size based on 3 covers fitting with room for edge partials
    const mainAreaWidth = canvasWidth * 0.85;
    const maxWidth = (mainAreaWidth - 2 * gutter) / 3;
    const availableHeight = canvasHeight - titleBarHeight - 2 * margin;
    const slotHeight = (availableHeight - (rows - 1) * gutter) / rows;
    const slotWidth = Math.min(maxWidth, slotHeight * bookAspect);
    const actualHeight = slotWidth / bookAspect;
    
    let imageIndex = 0;
    let currentY = margin;
    
    // Helper to draw a centered row with optional edge partials
    const drawRow = (count, addPartials) => {
      const rowWidth = count * slotWidth + (count - 1) * gutter;
      const startX = (canvasWidth - rowWidth) / 2;
      
      // Draw partial covers on edges (repeated, clipped by canvas)
      if (addPartials) {
        // Left partial - show right ~40% of a cover
        const leftPartialX = startX - slotWidth - gutter;
        drawCoverImage(ctx, images[imageIndex % 12], leftPartialX, currentY, slotWidth, actualHeight, shouldStretch);
        
        // Right partial - show left ~40% of a cover  
        const rightPartialX = startX + rowWidth + gutter;
        drawCoverImage(ctx, images[(imageIndex + count - 1) % 12], rightPartialX, currentY, slotWidth, actualHeight, shouldStretch);
      }
      
      // Draw main covers (these are the complete ones)
      for (let i = 0; i < count; i++) {
        drawCoverImage(ctx, images[imageIndex], startX + i * (slotWidth + gutter), currentY, slotWidth, actualHeight, shouldStretch);
        imageIndex++;
      }
      
      currentY += actualHeight + gutter;
    };
    
    // Top section: 2 (with partials), then 3
    drawRow(2, true);
    drawRow(3, false);
    
    // Title bar
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, currentY);
    currentY += bgH + gutter;
    
    // Bottom section: 2, 3, 2 (with partials on 2-cover rows)
    drawRow(2, true);
    drawRow(3, false);
    drawRow(2, true);
  }
  
  /**
   * Layout: Filmstrip
   * Dense horizontal rows bleeding off edges, title in middle
   */
  function drawLayoutFilmstrip(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const titleBarHeight = calculateTitleBarHeight(ctx, styles);
    const margin = styles.outerMarginPx;
    const gutter = 6 * (CONFIG.PDF_DPI / 72);
    
    const bookAspect = 0.667;
    
    // 4 rows of covers (2 above title, 2 below), each row has 4 visible + partials
    const availableHeight = canvasHeight - titleBarHeight - 2 * margin - 3 * gutter;
    const slotHeight = availableHeight / 4;
    const slotWidth = slotHeight * bookAspect;
    
    // Helper to draw a filmstrip row with edge bleeds
    const drawFilmstripRow = (y, imgIndices, offset) => {
      // Calculate positions - 4 main covers centered, with partials bleeding off
      const mainWidth = 4 * slotWidth + 3 * gutter;
      const startX = (canvasWidth - mainWidth) / 2 + offset;
      
      // Draw from left edge partial to right edge partial
      const leftPartialX = startX - slotWidth - gutter;
      const rightPartialX = startX + mainWidth + gutter;
      
      // Left partial (repeats last of this row)
      drawCoverImage(ctx, images[imgIndices[imgIndices.length - 1]], leftPartialX, y, slotWidth, slotHeight, shouldStretch);
      
      // Main 4 covers (or 3 if that's what's passed)
      for (let i = 0; i < imgIndices.length; i++) {
        drawCoverImage(ctx, images[imgIndices[i]], startX + i * (slotWidth + gutter), y, slotWidth, slotHeight, shouldStretch);
      }
      
      // Right partial (repeats first of this row)
      drawCoverImage(ctx, images[imgIndices[0]], rightPartialX, y, slotWidth, slotHeight, shouldStretch);
    };
    
    // Row 1: covers 0-2 (3 covers, offset left)
    let currentY = margin;
    drawFilmstripRow(currentY, [0, 1, 2], -slotWidth * 0.3);
    currentY += slotHeight + gutter;
    
    // Row 2: covers 3-5 (3 covers, offset right)
    drawFilmstripRow(currentY, [3, 4, 5], slotWidth * 0.3);
    currentY += slotHeight + gutter;
    
    // Title bar
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, currentY);
    currentY += bgH + gutter;
    
    // Row 3: covers 6-8 (3 covers, offset left)
    drawFilmstripRow(currentY, [6, 7, 8], -slotWidth * 0.3);
    currentY += slotHeight + gutter;
    
    // Row 4: covers 9-11 (3 covers, offset right)
    drawFilmstripRow(currentY, [9, 10, 11], slotWidth * 0.3);
  }
  
  /**
   * Layout: Wave
   * Grid with subtle vertical offsets creating gentle wave pattern
   */
  function drawLayoutWave(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const titleBarHeight = calculateTitleBarHeight(ctx, styles);
    const margin = styles.outerMarginPx;
    
    // Calculate layout with extra vertical space for wave offset
    const waveOffset = 12 * (CONFIG.PDF_DPI / 72); // Subtle offset
    const availableHeight = canvasHeight - titleBarHeight - 2 * margin - waveOffset * 2;
    
    const bookAspect = 0.667;
    const rows = 4; // 1 top + 3 bottom
    const cols = 3;
    const vGutter = 8 * (CONFIG.PDF_DPI / 72);
    
    const slotHeight = (availableHeight - (rows - 1) * vGutter) / rows;
    const slotWidth = slotHeight * bookAspect;
    const hGutter = (canvasWidth - cols * slotWidth) / (cols + 1);
    
    // Wave pattern: columns offset up/down alternately
    // Pattern for each column: [left, center, right]
    const topRowOffsets = [waveOffset, 0, waveOffset]; // Center higher
    const bottomOffsets = [
      [0, waveOffset, 0],      // Row 1: sides higher
      [waveOffset, 0, waveOffset], // Row 2: center higher
      [0, waveOffset, 0]       // Row 3: sides higher
    ];
    
    let imageIndex = 0;
    
    // Top row with wave
    const topRowY = margin + waveOffset;
    for (let col = 0; col < 3; col++) {
      const slotX = hGutter + col * (slotWidth + hGutter);
      const slotY = topRowY + topRowOffsets[col];
      drawCoverImage(ctx, images[imageIndex], slotX, slotY, slotWidth, slotHeight, shouldStretch);
      imageIndex++;
    }
    
    // Title bar
    const titleY = topRowY + slotHeight + waveOffset + margin;
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Bottom grid with wave
    const gridTopY = titleY + bgH + margin;
    for (let row = 0; row < 3; row++) {
      const baseY = gridTopY + row * (slotHeight + vGutter);
      for (let col = 0; col < 3; col++) {
        const slotX = hGutter + col * (slotWidth + hGutter);
        const slotY = baseY + bottomOffsets[row][col];
        drawCoverImage(ctx, images[imageIndex], slotX, slotY, slotWidth, slotHeight, shouldStretch);
        imageIndex++;
      }
    }
  }
  
  /**
   * Layout: Spotlight
   * Title at top, one large featured cover in center, surrounded by smaller covers
   */
  function drawLayoutSpotlight(ctx, canvas, images, styles, shouldStretch) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const margin = styles.outerMarginPx;
    const gutter = 8 * (CONFIG.PDF_DPI / 72);
    const bookAspect = 0.667;
    
    // Title bar at top (flush)
    const titleY = 0;
    const { bgH } = drawTitleBarAt(ctx, styles, canvasWidth, titleY);
    
    // Available space below title
    const contentTop = bgH + margin;
    const contentHeight = canvasHeight - contentTop - margin;
    
    // Layout: 
    // Row 1: 4 small covers
    // Row 2: small | BIG COVER | small  
    // Row 3: 4 small covers
    
    // Calculate sizes
    // Small covers: fit 4 across
    const smallWidth = (canvasWidth - 2 * margin - 3 * gutter) / 4;
    const smallHeight = smallWidth / bookAspect;
    
    // Big cover: spans height of middle section (roughly 2x small height)
    const bigHeight = smallHeight * 2 + gutter;
    const bigWidth = bigHeight * bookAspect;
    
    // Check if layout fits, scale if needed
    const totalHeight = smallHeight * 3 + gutter * 2;
    const scale = Math.min(1, contentHeight / totalHeight);
    
    const finalSmallWidth = smallWidth * scale;
    const finalSmallHeight = smallHeight * scale;
    const finalBigWidth = bigWidth * scale;
    const finalBigHeight = bigHeight * scale;
    const finalGutter = gutter * scale;
    
    // Row 1: 4 small covers (indices 1-4, saving 0 for spotlight)
    let currentY = contentTop;
    const row1Width = 4 * finalSmallWidth + 3 * finalGutter;
    const row1StartX = (canvasWidth - row1Width) / 2;
    
    for (let i = 0; i < 4; i++) {
      const x = row1StartX + i * (finalSmallWidth + finalGutter);
      drawCoverImage(ctx, images[i + 1], x, currentY, finalSmallWidth, finalSmallHeight, shouldStretch);
    }
    currentY += finalSmallHeight + finalGutter;
    
    // Row 2: small cover, BIG cover (index 0), small cover
    // Center the big cover, place smalls on sides
    const bigX = (canvasWidth - finalBigWidth) / 2;
    const sideSmallX1 = bigX - finalSmallWidth - finalGutter;
    const sideSmallX2 = bigX + finalBigWidth + finalGutter;
    
    // Side covers are vertically centered with big cover
    const sideCoverY = currentY + (finalBigHeight - finalSmallHeight) / 2;
    
    // Left small (index 5)
    drawCoverImage(ctx, images[5], sideSmallX1, sideCoverY, finalSmallWidth, finalSmallHeight, shouldStretch);
    
    // Big center cover (index 0 - the spotlight)
    drawCoverImage(ctx, images[0], bigX, currentY, finalBigWidth, finalBigHeight, shouldStretch);
    
    // Right small (index 6)
    drawCoverImage(ctx, images[6], sideSmallX2, sideCoverY, finalSmallWidth, finalSmallHeight, shouldStretch);
    
    currentY += finalBigHeight + finalGutter;
    
    // Row 3: 5 small covers (indices 7-11)
    const row3Width = 5 * finalSmallWidth + 4 * finalGutter;
    const row3StartX = (canvasWidth - row3Width) / 2;
    
    for (let i = 0; i < 5; i++) {
      const x = row3StartX + i * (finalSmallWidth + finalGutter);
      drawCoverImage(ctx, images[i + 7], x, currentY, finalSmallWidth, finalSmallHeight, shouldStretch);
    }
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
    
    const safeBase = baseName.replace(/[^\w.-]+/g, '_');
    const suggestedName = `${safeBase}.pdf`;
    
    // Check File System Access API support
    const supportsFSAccess = 'showSaveFilePicker' in window &&
      (() => { try { return window.self === window.top; } catch { return false; } })();
    
    let saveHandle = null;
    let isModernSave = false;
    
    if (supportsFSAccess) {
      try {
        saveHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
        });
        isModernSave = true;
      } catch (err) {
        if (err.name === 'AbortError') {
          setLoading(elements.exportPdfButton, false);
          return;
        }
        isModernSave = false;
      }
    }
    
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
      
      if (isModernSave && saveHandle) {
        const blob = pdf.output('blob');
        const writable = await saveHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        showNotification('PDF saved successfully.', 'success');
      } else {
        pdf.save(suggestedName);
        showNotification('PDF download started.', 'success');
      }
      
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
      // Advanced mode per-line styling
      lines: elements.coverLines.map(line => ({
        font: line.font?.value ?? "'Oswald', sans-serif",
        sizePt: parseFloat(line.size?.value ?? '24'),
        color: line.color?.value ?? '#FFFFFF',
        bold: !!line.bold?.classList.contains('active'),
        italic: !!line.italic?.classList.contains('active'),
      })),
      lineSpacingPt: parseFloat(elements.coverLineSpacing?.value ?? '10'),
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
      ui: {
        stretchCovers: !!elements.stretchCoversToggle?.checked,
        stretchBlockCovers: !!elements.stretchBlockCoversToggle?.checked,
        showQr: !!elements.toggleQrCode?.checked,
        showBranding: !!elements.toggleBranding?.checked,
        coverAdvancedMode: isAdvancedMode,
        coverTitle, // Simple mode text (backwards compatible)
        coverLineTexts, // Advanced mode texts
        collageLayout: selectedLayout,
        qrCodeUrl: elements.qrUrlInput?.value || '',
        qrCodeText: (elements.qrCodeTextArea?.innerText !== CONFIG.PLACEHOLDERS.qrText)
          ? (elements.qrCodeTextArea?.innerText || '')
          : '',
      },
      styles: captureStyleGroups(),
      images: {
        frontCover: getUploaderImageSrc(elements.frontCoverUploader),
        branding: getUploaderImageSrc(elements.brandingUploader),
      },
    };
  }
  
  async function downloadBooklist(state) {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const safeBase = (state.meta?.listName || 'booklist').replace(/[^\w.-]+/g, '_');
    const suggestedName = `${safeBase}.booklist`;
    
    const supportsFSAccess = 'showSaveFilePicker' in window &&
      (() => { try { return window.self === window.top; } catch { return false; } })();
    
    if (supportsFSAccess) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{
            description: 'Booklist JSON',
            accept: { 'application/json': ['.booklist', '.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (err) {
        if (err && (err.name === 'AbortError' || err.code === 20)) return false;
      }
    }
    
    // Fallback
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
    
    // Advanced mode per-line styling
    const savedLines = ct.lines || [];
    const defaultSizes = [48, 28, 20];
    elements.coverLines.forEach((line, i) => {
      const saved = savedLines[i] || {};
      if (line.font) line.font.value = saved.font ?? "'Oswald', sans-serif";
      if (line.size) line.size.value = saved.sizePt ?? defaultSizes[i];
      if (line.color) line.color.value = saved.color ?? '#FFFFFF';
      if (line.bold) line.bold.classList.toggle('active', i === 0 ? saved.bold !== false : !!saved.bold);
      if (line.italic) line.italic.classList.toggle('active', !!saved.italic);
    });
    
    // Line spacing
    if (elements.coverLineSpacing) {
      elements.coverLineSpacing.value = ct.lineSpacingPt ?? 10;
    }
  }
  
  function applyUploaderImage(uploaderEl, dataUrl) {
    if (!uploaderEl) return;
    const img = uploaderEl.querySelector('img');
    if (!img) return;
    
    if (dataUrl) {
      img.src = dataUrl;
      img.dataset.isPlaceholder = "false";
      uploaderEl.classList.add('has-image');
    } else {
      uploaderEl.classList.remove('has-image');
      delete img.dataset.isPlaceholder;
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
    applyUploaderImage(elements.brandingUploader, loaded.images?.branding || null);
    
    // Books
    const incoming = Array.isArray(loaded.books) ? loaded.books : [];
    let starCount = 0;
    myBooklist = incoming.slice(0, CONFIG.TOTAL_SLOTS).map(b => {
      const wasStarred = b.includeInCollage !== false;
      const shouldStar = wasStarred && !b.isBlank && starCount < CONFIG.MIN_COVERS_FOR_COLLAGE;
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
          elements.frontCoverUploader.classList.add('has-image');
        };
        reader.readAsDataURL(file);
      }
    });
    
    const coverControls = document.getElementById('cover-generate-controls');
    elements.frontCoverUploader.addEventListener('click', (e) => {
      if (coverControls.contains(e.target)) {
        return;
      }
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
    elements.stretchCoversToggle.addEventListener('change', autoRegenerateCoverIfAble);
    elements.stretchBlockCoversToggle.addEventListener('change', applyBlockCoverStyle);
    
    // Layout selector
    if (elements.collageLayoutSelector) {
      elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(option => {
        option.addEventListener('click', () => {
          elements.collageLayoutSelector.querySelectorAll('.layout-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      });
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
    const coverLayoutInputIds = ['cover-title-outer-margin', 'cover-title-pad-x', 'cover-title-pad-y', 'cover-title-side-margin', 'cover-title-bg-color', 'cover-line-spacing'];
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
    
    elements.saveListButton.addEventListener('click', async () => {
      const state = serializeState();
      const didSave = await downloadBooklist(state);
      if (didSave) {
        showNotification('Booklist saved to file.', 'success');
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
  }
  
  // ---------------------------------------------------------------------------
  // QR Text Placeholder Setup
  // ---------------------------------------------------------------------------
  function setupQrPlaceholder() {
    setupPlaceholderField(elements.qrCodeTextArea, CONFIG.PLACEHOLDERS.qrText, {
      originalColor: getComputedStyle(elements.qrCodeTextArea).color
    });
  }
  
  // ---------------------------------------------------------------------------
  // Public API / Initialization
  // ---------------------------------------------------------------------------
  function init() {
    cacheElements();
    bindEvents();
    setupQrPlaceholder();
    initializeBooklist();
    applyStyles();
    initializeSortable();
    
    // Set default cover mode (simple)
    toggleCoverMode(false);
    
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

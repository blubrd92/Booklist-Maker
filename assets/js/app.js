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
      description: CONFIG.PLACEHOLDERS.description,
      cover_i: null,
      customCoverData: CONFIG.PLACEHOLDER_COVER_URL,
      cover_ids: [],
      currentCoverIndex: 0
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
        const newBook = {
          key: book.key,
          isBlank: false,
          title: book.title,
          author: book.author_name ? book.author_name.join(', ') : 'Unknown Author',
          callNumber: CONFIG.PLACEHOLDERS.callNumber,
          description: 'Fetching book description... May take a few minutes.',
          cover_ids: carouselState.allCoverIds,
          currentCoverIndex: carouselState.currentCoverIndex,
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
    
    // Magic button (fetch description)
    const magicButton = document.createElement('button');
    magicButton.className = 'magic-button';
    magicButton.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    magicButton.title = "Fetch Description";
    magicButton.setAttribute('aria-label', 'Fetch AI description for this book');
    magicButton.onclick = () => handleMagicButtonClick(bookItem);
    
    // Item number
    const itemNumber = document.createElement('span');
    itemNumber.className = 'item-number';
    itemNumber.textContent = index + 1;
    itemNumber.setAttribute('aria-hidden', 'true');
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.innerHTML = '&times;';
    deleteButton.setAttribute('aria-label', `Remove book ${index + 1} from list`);
    deleteButton.onclick = () => handleDeleteBook(bookItem, index);
    
    controlsDiv.appendChild(dragHandle);
    controlsDiv.appendChild(magicButton);
    controlsDiv.appendChild(itemNumber);
    controlsDiv.appendChild(deleteButton);
    
    return controlsDiv;
  }
  
  function handleMagicButtonClick(bookItem) {
    const currentTitle = (bookItem.title || '').replace(/\u00a0/g, " ").trim();
    let currentAuthor = (bookItem.author || '').replace(/\u00a0/g, " ").trim();
    
    if (currentAuthor.toLowerCase() === 'by') currentAuthor = '';
    
    if (!currentTitle || currentTitle === CONFIG.PLACEHOLDERS.title ||
        !currentAuthor || currentAuthor === CONFIG.PLACEHOLDERS.author) {
      showNotification('Please enter a Title and Author first.', 'error');
      return;
    }
    
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
    authorField.innerText = bookItem.author.startsWith('[Enter')
      ? `${bookItem.author} - ${bookItem.callNumber}`
      : `By ${bookItem.author} - ${bookItem.callNumber}`;
    authorField.setAttribute('role', 'textbox');
    authorField.setAttribute('aria-label', 'Author and call number');
    authorField.oninput = (e) => {
      let text = e.target.innerText.replace(/\u00a0/g, " ");
      
      if (text.match(/^By\s/i)) {
        text = text.replace(/^By\s/i, '');
      }
      
      if (text.includes(' - ')) {
        const parts = text.split(' - ');
        bookItem.author = (parts[0] || '').trim();
        bookItem.callNumber = (parts[1] || '').trim();
      } else {
        bookItem.author = text.trim();
      }
    };
    
    // Description field
    const descriptionField = document.createElement('div');
    descriptionField.className = 'editable-field description-field';
    descriptionField.contentEditable = true;
    descriptionField.innerText = bookItem.description;
    descriptionField.setAttribute('role', 'textbox');
    descriptionField.setAttribute('aria-label', 'Book description');
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
      const lineSpacingPt = parseFloat(elements.coverLineSpacing?.value || '8');
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
    
    // Gather books with covers
    const booksWithCovers = myBooklist.filter(book =>
      !book.isBlank &&
      (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co')))
    );
    
    if (booksWithCovers.length < CONFIG.MIN_COVERS_FOR_COLLAGE) {
      showNotification(`Please add at least ${CONFIG.MIN_COVERS_FOR_COLLAGE} books with covers to generate a collage.`);
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
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const { wrapTextMultiline } = createTextWrapper(ctx);
      const availableTextWidth = Math.max(0, canvasWidth - 2 * styles.bgSideMarginPx - 2 * styles.padXPx);
      
      // Calculate title bar height based on mode
      let titleBarHeight = 0;
      const defaultGapPx = 8 * (CONFIG.PDF_DPI / 72);
      const lineGapPx = styles.lineSpacingPx !== undefined ? styles.lineSpacingPx : defaultGapPx;
      
      if (!styles.isAdvancedMode) {
        // Simple mode
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
              textBlockHeight += defaultGapPx;
            }
          });
          
          titleBarHeight = textBlockHeight + 2 * styles.padYPx;
        }
      } else {
        // Advanced mode
        if (styles.lines && styles.lines.length > 0) {
          let textBlockHeight = 0;
          
          styles.lines.forEach((lineData, i) => {
            ctx.font = `${lineData.fontStyle} ${lineData.sizePx}px ${lineData.font}, sans-serif`;
            const wrappedLines = wrapTextMultiline(lineData.text, availableTextWidth);
            
            wrappedLines.forEach(wrappedText => {
              const m = ctx.measureText(wrappedText);
              const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : lineData.sizePx * 0.8;
              const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : lineData.sizePx * 0.2;
              textBlockHeight += ascent + descent;
            });
            
            if (i < styles.lines.length - 1) {
              textBlockHeight += lineGapPx;
            }
          });
          
          titleBarHeight = textBlockHeight + 2 * styles.padYPx;
        }
      }
      
      // Calculate layout
      const layout = calculateCollageLayout(canvasWidth, canvasHeight, titleBarHeight, styles.outerMarginPx);
      layout.topRowY = 0;
      
      // Draw top row of covers
      let imageIndex = 0;
      for (let col = 0; col < CONFIG.COLLAGE_GRID_COLS; col++) {
        const slotX = layout.hGutter + col * (layout.slotWidth + layout.hGutter);
        drawCoverImage(ctx, images[imageIndex], slotX, layout.topRowY, layout.slotWidth, layout.slotHeight, shouldStretchCovers);
        imageIndex++;
      }
      
      // Draw title bar
      const { bgY, bgH } = drawTitleBar(ctx, styles, layout, canvasWidth);
      
      // Draw bottom grid of covers
      const gridTopY = bgY + bgH + styles.outerMarginPx;
      for (let row = 0; row < CONFIG.COLLAGE_BOTTOM_ROWS; row++) {
        const currentRowY = gridTopY + row * (layout.slotHeight + layout.vGutter);
        for (let col = 0; col < CONFIG.COLLAGE_GRID_COLS; col++) {
          const slotX = layout.hGutter + col * (layout.slotWidth + layout.hGutter);
          drawCoverImage(ctx, images[imageIndex], slotX, currentRowY, layout.slotWidth, layout.slotHeight, shouldStretchCovers);
          imageIndex++;
        }
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
      lineSpacingPt: parseFloat(elements.coverLineSpacing?.value ?? '8'),
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
      description: b.description,
      cover_ids: Array.isArray(b.cover_ids) ? b.cover_ids : [],
      currentCoverIndex: typeof b.currentCoverIndex === 'number' ? b.currentCoverIndex : 0,
      customCoverData: b.customCoverData || null,
    }));
    
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
      elements.coverLineSpacing.value = ct.lineSpacingPt ?? 8;
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
    myBooklist = incoming.slice(0, CONFIG.TOTAL_SLOTS).map(b => ({
      key: b.key,
      isBlank: !!b.isBlank,
      title: b.title ?? CONFIG.PLACEHOLDERS.title,
      author: b.author ?? CONFIG.PLACEHOLDERS.author,
      callNumber: b.callNumber ?? CONFIG.PLACEHOLDERS.callNumber,
      description: b.description ?? CONFIG.PLACEHOLDERS.description,
      cover_ids: Array.isArray(b.cover_ids) ? b.cover_ids : [],
      currentCoverIndex: typeof b.currentCoverIndex === 'number' ? b.currentCoverIndex : 0,
      customCoverData: b.customCoverData || null,
    }));
    
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
        autoRegenerateCoverIfAble();
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
          autoRegenerateCoverIfAble();
        });
        el.addEventListener('change', () => {
          debouncedSave();
          autoRegenerateCoverIfAble();
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
      // Text input
      if (line.input) {
        line.input.addEventListener('input', () => {
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Font select
      if (line.font) {
        line.font.addEventListener('change', () => {
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Size input
      if (line.size) {
        line.size.addEventListener('input', () => {
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Color picker
      if (line.color) {
        line.color.addEventListener('input', () => {
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Bold toggle
      if (line.bold) {
        line.bold.addEventListener('click', () => {
          line.bold.classList.toggle('active');
          debouncedSave();
          autoRegenerateCoverIfAble();
        });
      }
      // Italic toggle
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
          autoRegenerateCoverIfAble();
        }));
      }
    });
    
    // Style controls
    document.querySelectorAll('.export-controls .form-group[data-style-group], #cover-title-style-group').forEach(group => {
      group.querySelectorAll('select, input').forEach(input => {
        input.addEventListener('change', () => {
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            autoRegenerateCoverIfAble();
          }
        });
        input.addEventListener('input', () => {
          applyStyles();
          if (group.id === 'cover-title-style-group') {
            autoRegenerateCoverIfAble();
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

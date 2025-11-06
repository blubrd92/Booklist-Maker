// Get all element references
        const keywordInput = document.getElementById('keywordInput');
        const titleInput = document.getElementById('titleInput');
        const authorInput = document.getElementById('authorInput');
        const subjectInput = document.getElementById('subjectInput');
        const isbnInput = document.getElementById('isbnInput');
        const publisherInput = document.getElementById('publisherInput');
        const personInput = document.getElementById('personInput');
        const fetchButton = document.getElementById('fetchButton');
        const searchForm = document.getElementById('search-form');
        const resultsContainer = document.getElementById('results-container');
        const exportPdfButton = document.getElementById('export-pdf-button');
        const backCoverPanel = document.getElementById('back-cover-panel');
        const insideLeftPanel = document.getElementById('inside-left-panel');
        const insideRightPanel = document.getElementById('inside-right-panel');
        const previewArea = document.getElementById('preview-area');
        const qrCodeUploader = document.getElementById('qr-code-uploader');
        const brandingUploader = document.getElementById('branding-uploader');
        const frontCoverUploader = document.getElementById('front-cover-uploader');
        const frontCoverPanel = document.getElementById('front-cover-panel');
        const generateCoverButton = document.getElementById('generate-cover-button');
        const coverTitleInput = document.getElementById('cover-title-input');
        const stretchCoversToggle = document.getElementById('stretch-covers-toggle');
        const stretchBlockCoversToggle = document.getElementById('stretch-block-covers-toggle');
        const toggleQrCode = document.getElementById('toggle-qr-code');
        const toggleBranding = document.getElementById('toggle-branding');
        const notificationArea = document.getElementById('notification-area');
        

        let myBooklist = [];
        let MAX_BOOKS = 15;

        // --- NOTIFICATION ---
        function showNotification(message, type = 'error') {
            notificationArea.textContent = message;
            notificationArea.className = type; // 'error' or 'success'
            notificationArea.classList.add('show');
            setTimeout(() => {
                notificationArea.classList.remove('show');
            }, 5000); // Increased time to 5 seconds
        }

        // --- REVISED: Function to get AI-generated description with better logging ---
        function getAiDescription(bookKey, isTest = false) {
            const bookItem = myBooklist.find(b => b.key === bookKey);
            if (!bookItem && !isTest) {
                console.error("Description fetch failed: Could not find book with key:", bookKey);
                return;
            }

            // IMPORTANT: Paste your copied Google Apps Script Web App URL here.
            const googleAppScriptUrl = "https://script.google.com/macros/s/AKfycbyhqsRgjS7aoEbYwqgN-wyygjFtGNtFdGcUOnrqXmZ7P3Aubjjwlp-HydWp4MPJxXY/exec";

            if (googleAppScriptUrl === "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE" || !googleAppScriptUrl) {
                const errorMsg = "error: Google Apps Script URL is not set.";
                console.error(errorMsg);
                if (isTest) {
                    showNotification(errorMsg, "error");
                } else if (bookItem) {
                    bookItem.description = errorMsg;
                }
                return;
            }
            
            const payload = isTest ? { title: "Test Title", author: "Test Author" } : { title: bookItem.title, author: bookItem.author };

            // REVISED: Use POST method for more robust communication
            fetch(googleAppScriptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8', // Required for Apps Script POST
                },
                body: JSON.stringify(payload),
                mode: 'cors' // Explicitly set CORS mode
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
                    // Throw the specific error from the script, or a fallback.
                    throw new Error(data.error || 'Unknown error from description service.');
                }
            })
            .catch(error => {
                // NEW: Enhanced logging
                console.error('Full error object from getAiDescription:', error); 
                const errorMessage = error.message || "An unknown error occurred.";
                
                if (isTest) {
                    const failMsg = `Test Failed: ${errorMessage}`;
                    console.error(failMsg);
                    showNotification(failMsg, "error");
                } else if (bookItem) {
                    bookItem.description = `error: ${errorMessage}`;
                    renderBooklist();
                }
            });
        }


        function createBlankBook() {
            return {
                key: `blank-${crypto.randomUUID()}`,
                isBlank: true,
                title: '[Enter Title]',
                author: '[Enter Author]',
                callNumber: '[Call #]',
                description: '[Enter a brief description here...]',
                cover_i: null,
                customCoverData: 'https://placehold.co/110x132/EAEAEA/333333?text=Upload%20Cover',
                // New fields for cover selection
                cover_ids: [],
                currentCoverIndex: 0 
            };
        }

        function initializeBooklist() {
            for (let i = 0; i < 15; i++) {
                myBooklist.push(createBlankBook());
            }
            handleLayoutChange();
            renderBooklist();
        }

        // --- EVENT LISTENERS ---
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            getBooks();
        });

        
        generateCoverButton.addEventListener('click', generateCoverCollage);
        stretchCoversToggle.addEventListener('change', generateCoverCollage);
        stretchBlockCoversToggle.addEventListener('change', applyBlockCoverStyle);
        toggleQrCode.addEventListener('change', handleLayoutChange);
        toggleBranding.addEventListener('change', handleLayoutChange);

        // Auto-regen cover when spacing inputs change and a cover exists
        const spacingInputIds = ['cover-title-outer-margin','cover-title-pad-x','cover-title-pad-y','cover-title-side-margin'];
        spacingInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                ['input','change'].forEach(evt => el.addEventListener(evt, () => {
                    if (frontCoverUploader.classList.contains('has-image')) {
                        generateCoverCollage();
                    }
                }));
            }
        });

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
        
        setupFileChangeHandler(qrCodeUploader);
        setupFileChangeHandler(brandingUploader);
        setupFileChangeHandler(frontCoverUploader);

        const coverControls = document.getElementById('cover-generate-controls');
        frontCoverUploader.addEventListener('click', (e) => {
            if (coverControls.contains(e.target)) {
                return;
            }
            const fileInput = frontCoverUploader.querySelector('input[type="file"]');
            fileInput.click();
        });


        function applyStyles() {
            document.querySelectorAll('.export-controls .form-group[data-style-group]').forEach(group => {
                const styleGroup = group.dataset.styleGroup;
                const font = group.querySelector('.font-select').value;
                const size = group.querySelector('.font-size-input').value + 'pt';
                const color = group.querySelector('.color-picker').value;
                const isBold = group.querySelector('.bold-toggle').classList.contains('active');
                const isItalic = group.querySelector('.italic-toggle').classList.contains('active');

                previewArea.style.setProperty(`--${styleGroup}-font`, font);
                previewArea.style.setProperty(`--${styleGroup}-font-size`, size);
                previewArea.style.setProperty(`--${styleGroup}-color`, color);
                previewArea.style.setProperty(`--${styleGroup}-font-weight`, isBold ? 'bold' : 'normal');
                previewArea.style.setProperty(`--${styleGroup}-font-style`, isItalic ? 'italic' : 'normal');
            });
        }

        function applyBlockCoverStyle() {
            const shouldStretch = stretchBlockCoversToggle.checked;
            document.querySelectorAll('#preview-area .cover-uploader').forEach(uploader => {
                if (shouldStretch) {
                    uploader.classList.add('stretch');
                } else {
                    uploader.classList.remove('stretch');
                }
            });
        }

        document.querySelectorAll('.export-controls .form-group[data-style-group], #cover-title-style-group').forEach(group => {
            group.querySelectorAll('select, input').forEach(input => {
                 input.addEventListener('change', applyStyles);
                 input.addEventListener('input', applyStyles);
            });
            group.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', (e) => {
                    if(e.target.classList.contains('bold-toggle') || e.target.classList.contains('italic-toggle')){
                        e.target.classList.toggle('active');
                    }
                    applyStyles();
                });
            });
        });

        // --- DYNAMIC LIST LIMIT AND LAYOUT LOGIC ---
        function handleLayoutChange() {
            const showQr = toggleQrCode.checked;
            const showBranding = toggleBranding.checked;

            let newMaxBooks;
            if (showQr && showBranding) {
                newMaxBooks = 13;
            } else if (showQr || showBranding) {
                newMaxBooks = 14;
            } else {
                newMaxBooks = 15;
            }

            let listWasTrimmed = false;
            if (newMaxBooks < MAX_BOOKS) {
                for (let i = newMaxBooks; i < 15; i++) {
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
            const showQr = toggleQrCode.checked;
            const showBranding = toggleBranding.checked;

            qrCodeUploader.style.display = showQr ? 'flex' : 'none';
            brandingUploader.style.display = showBranding ? 'flex' : 'none';

            let extraSlotsToShow = 0;
            if (!showQr) extraSlotsToShow++;
            if (!showBranding) extraSlotsToShow++;

            const backCoverBooks = backCoverPanel.querySelectorAll('.list-item');
            backCoverBooks.forEach((item, index) => {
                if (index < (3 + extraSlotsToShow)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        async function fetchAllCoverIdsForWork(workKey) {
            const workId = workKey.split('/').pop();
            const editionsUrl = `https://openlibrary.org/works/${workId}/editions.json?limit=100`; // Fetch more editions
            try {
                const response = await fetch(editionsUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                const coverIds = new Set();
                data.entries.forEach(edition => {
                    if (edition.covers) {
                        edition.covers.forEach(coverId => {
                            if (coverId > 0) coverIds.add(coverId)
                        });
                    }
                });
                return Array.from(coverIds);
            } catch (error) {
                console.error("Error fetching edition covers:", error);
                return [];
            }
        }

        // --- SEARCH AND ADD-TO-LIST LOGIC ---
        function getBooks() {
            resultsContainer.innerHTML = '<p>Searching...</p>';
            const queryParams = [];
            if (keywordInput.value) queryParams.push(`q=${encodeURIComponent(keywordInput.value)}`);
            if (titleInput.value) queryParams.push(`title=${encodeURIComponent(titleInput.value)}`);
            if (authorInput.value) queryParams.push(`author=${encodeURIComponent(authorInput.value)}`);
            if (subjectInput.value) queryParams.push(`subject=${encodeURIComponent(subjectInput.value)}`);
            if (isbnInput.value) queryParams.push(`isbn=${encodeURIComponent(isbnInput.value)}`);
            if (publisherInput.value) queryParams.push(`publisher=${encodeURIComponent(publisherInput.value)}`);
            if (personInput.value) queryParams.push(`person=${encodeURIComponent(personInput.value)}`);
            
            if (queryParams.length === 0) {
                resultsContainer.innerHTML = '<p class="error-message">Please enter at least one search term.</p>';
                return;
            }
            const queryString = queryParams.join('&');
            const apiUrl = `https://openlibrary.org/search.json?${queryString}`;
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
                    if (books.length === 0) { resultsContainer.innerHTML = '<p>No results found.</p>'; return; }
                    books.forEach(book => {
                        const initialCoverId = book.cover_i || 'placehold'; 
                        
                        const bookElement = document.createElement('div');
                        bookElement.className = 'book-card';
                        bookElement.dataset.key = book.key; 

                        const coverCarousel = document.createElement('div');
                        coverCarousel.className = 'cover-carousel';
                        const coverElement = document.createElement('img');
                        coverElement.src = initialCoverId === 'placehold' ? 
                                           'https://placehold.co/110x132/EAEAEA/333333?text=No%20Cover' :
                                           `https://covers.openlibrary.org/b/id/${initialCoverId}-M.jpg`;
                        coverElement.alt = `Cover for ${book.title}`;
                        coverCarousel.appendChild(coverElement);

                        const titleElement = document.createElement('p');
                        titleElement.className = 'book-title';
                        titleElement.textContent = book.title;

                        // --- Action Buttons Group ---
                        const actionsGroup = document.createElement('div');
                        actionsGroup.className = 'card-actions-group';

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
                        prevButton.setAttribute('aria-label', 'Previous Cover');
                        prevButton.disabled = true;

                        const nextButton = document.createElement('button');
                        nextButton.className = 'carousel-button';
                        nextButton.textContent = '▶';
                        nextButton.setAttribute('aria-label', 'Next Cover');
                        nextButton.disabled = true;

                        buttonsContainer.appendChild(prevButton);
                        buttonsContainer.appendChild(nextButton);

                        carouselControls.appendChild(coverCounter);
                        carouselControls.appendChild(buttonsContainer);

                        let allCoverIds = [initialCoverId];
                        let currentCoverIndex = 0;
                        let coversLoaded = false;

                        const updateCarousel = () => {
                            const currentId = allCoverIds[currentCoverIndex];
                            coverElement.src = currentId === 'placehold' ? 
                                               'https://placehold.co/110x132/EAEAEA/333333?text=No%20Cover' :
                                               `https://covers.openlibrary.org/b/id/${currentId}-M.jpg`;
                            coverCounter.textContent = `${currentCoverIndex + 1} of ${allCoverIds.length}`;
                            prevButton.disabled = currentCoverIndex === 0;
                            nextButton.disabled = currentCoverIndex === allCoverIds.length - 1;
                        };

                        const loadAllCovers = async () => {
                            if (coversLoaded || !book.key) return;
                            const fetchedCovers = await fetchAllCoverIdsForWork(book.key);
                            
                            let finalCovers = [];
                            if (initialCoverId !== 'placehold') {
                                finalCovers.push(initialCoverId);
                            }
                            fetchedCovers.forEach(id => finalCovers.push(id));

                            allCoverIds = [...new Set(finalCovers)]; // Remove duplicates
                             if(allCoverIds.length === 0) {
                                allCoverIds.push('placehold');
                            }

                            coversLoaded = true;
                            updateCarousel();
                        };
                        
                        prevButton.addEventListener('click', async () => {
                            if (!coversLoaded) await loadAllCovers();
                            if (currentCoverIndex > 0) {
                                currentCoverIndex--;
                                updateCarousel();
                            }
                        });
                        nextButton.addEventListener('click', async () => {
                            if (!coversLoaded) await loadAllCovers();
                            if (currentCoverIndex < allCoverIds.length - 1) {
                                currentCoverIndex++;
                                updateCarousel();
                            }
                        });

                        if (book.key) {
                             loadAllCovers().then(() => {
                                if (allCoverIds.length > 1) {
                                    prevButton.disabled = false;
                                    nextButton.disabled = false;
                                    updateCarousel(); // Refresh in case the array changed
                                }
                            });
                        }

                        
                        const addButton = document.createElement('button');
                        addButton.className = 'add-to-list-button';
                        addButton.dataset.bookKey = book.key;
                            
                        const isAlreadyAdded = myBooklist.some(item => item.key === book.key);
                        if(isAlreadyAdded){
                            addButton.innerHTML = '&#10003;';
                            addButton.classList.add('added');
                        } else {
                            addButton.textContent = 'Add to List';
                        }

                        addButton.addEventListener('click', () => {
                            const isAdded = myBooklist.some(item => item.key === book.key);
                            const firstBlankIndex = myBooklist.findIndex((item, index) => item.isBlank && index < MAX_BOOKS);

                            if (!isAdded) {
                                if (firstBlankIndex !== -1) {
                                    const newBook = {
                                        key: book.key,
                                        isBlank: false,
                                        title: book.title,
                                        author: book.author_name ? book.author_name.join(', ') : 'Unknown Author',
                                        callNumber: '[Call #]',
                                        description: 'Fetching book description...',
                                        cover_ids: allCoverIds, 
                                        currentCoverIndex: currentCoverIndex,
                                    };
                                    myBooklist[firstBlankIndex] = newBook;
                                    addButton.innerHTML = '&#10003;';
                                    addButton.classList.add('added');
                                    
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
                                renderBooklist();
                            }
                        });
                        
                        // Assemble the card
                        bookElement.appendChild(coverCarousel);
                        bookElement.appendChild(titleElement);

                        actionsGroup.appendChild(carouselControls);
                        actionsGroup.appendChild(addButton);
                        bookElement.appendChild(actionsGroup);

                        resultsContainer.appendChild(bookElement);
                    });
                })
                .catch(error => {
                    console.error('There was a problem:', error);
                    resultsContainer.innerHTML = '<p class="error-message">Sorry, could not connect to the book server. Please check your network connection and try again.</p>';
                });
        }


        // --- LIVE PREVIEW RENDER LOGIC ---
        function renderBooklist() {
            insideLeftPanel.innerHTML = '';
            insideRightPanel.innerHTML = '';
            
            backCoverPanel.querySelectorAll('.list-item').forEach(item => item.remove());

            myBooklist.forEach((bookItem, index) => {
                let targetPanel;
                let insertBeforeElement = null;

                if (index < 5) {
                    targetPanel = insideLeftPanel;
                } else if (index < 10) {
                    targetPanel = insideRightPanel;
                } else {
                    targetPanel = backCoverPanel;
                    insertBeforeElement = qrCodeUploader;
                }

                const listItem = document.createElement('div');
                listItem.className = 'list-item';
                listItem.dataset.id = bookItem.key;
                listItem.dataset.isBlank = bookItem.isBlank;

                const controlsDiv = document.createElement('div');
                controlsDiv.className = 'list-item-controls';
                
                if (targetPanel === insideRightPanel) {
                    controlsDiv.classList.add('controls-right');
                }

                const itemNumber = document.createElement('span');
                itemNumber.className = 'item-number';
                itemNumber.textContent = index + 1;
                const dragHandle = document.createElement('div');
                dragHandle.className = 'drag-handle';
                dragHandle.innerHTML = '&#9776;';
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-button';
                deleteButton.innerHTML = '&times;';
                deleteButton.onclick = () => {
                    const originalKey = myBooklist[index].key;
                    myBooklist[index] = createBlankBook();
                    renderBooklist();
                    // Fix selector to correctly find the button in the search results
                    const searchButton = document.querySelector(`#results-container button[data-book-key="${originalKey}"]`);
                    if(searchButton) {
                        searchButton.textContent = 'Add to List';
                        searchButton.classList.remove('added');
                    }
                };
                
                controlsDiv.appendChild(dragHandle);
                controlsDiv.appendChild(itemNumber);
                controlsDiv.appendChild(deleteButton);

                const coverUploader = document.createElement('label');
                coverUploader.className = 'cover-uploader';
                const coverImg = document.createElement('img');
                coverImg.crossOrigin = 'Anonymous';
                
                const selectedCoverId = bookItem.cover_ids && bookItem.cover_ids.length > bookItem.currentCoverIndex 
                                        ? bookItem.cover_ids[bookItem.currentCoverIndex] 
                                        : null;
                coverImg.src = selectedCoverId && selectedCoverId !== 'placehold' ? 
                               `https://covers.openlibrary.org/b/id/${selectedCoverId}-M.jpg` :
                               bookItem.customCoverData || 'https://placehold.co/110x132/EAEAEA/333333?text=Upload%20Cover';
                               
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
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
                
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'list-item-details';

                const titleField = document.createElement('div');
                titleField.className = 'editable-field title-field';
                titleField.contentEditable = true;
                titleField.textContent = bookItem.title;
                titleField.oninput = (e) => { 
                    bookItem.title = e.target.textContent;
                    if(bookItem.isBlank && bookItem.title !== '[Enter Title]') {
                        bookItem.isBlank = false;
                        listItem.dataset.isBlank = false;
                    }
                };

                const authorField = document.createElement('div');
                authorField.className = 'editable-field author-field';
                authorField.contentEditable = true;
                authorField.textContent = bookItem.author.startsWith('[Enter') ? `${bookItem.author} - ${bookItem.callNumber}` : `By ${bookItem.author} - ${bookItem.callNumber}`;
                authorField.oninput = (e) => { 
                    let text = e.target.textContent;
                    if (text.includes('By ') && text.includes(' - ')) {
                        const parts = text.replace('By ', '').split(' - ');
                        bookItem.author = parts[0] || '';
                        bookItem.callNumber = parts[1] || '';
                    } else {
                        const parts = text.split(' - ');
                        bookItem.author = parts[0] || '';
                        bookItem.callNumber = parts[1] || '';
                    }
                 };

                const descriptionField = document.createElement('div');
                descriptionField.className = 'editable-field description-field';
                descriptionField.contentEditable = true;
                descriptionField.textContent = bookItem.description;
                descriptionField.oninput = (e) => { bookItem.description = e.target.textContent; };
                
                detailsDiv.appendChild(titleField);
                detailsDiv.appendChild(authorField);
                detailsDiv.appendChild(descriptionField);

                const placeholders = {
                    title: '[Enter Title]',
                    author: '[Enter Author] - [Call #]',
                    description: '[Enter a brief description here...]'
                };

                const setupPlaceholder = (element, placeholderText, originalColor) => {
                    if (element.textContent === placeholderText) {
                        element.style.color = '#757575';
                    }
                    element.onfocus = () => {
                        if (element.textContent === placeholderText) {
                            element.textContent = '';
                            element.style.color = originalColor;
                        }
                    };
                    element.onblur = () => {
                        if (element.textContent.trim() === '') {
                            element.textContent = placeholderText;
                            element.style.color = '#757575';
                        }
                    };
                };

                setupPlaceholder(titleField, placeholders.title, getComputedStyle(titleField).color);
                setupPlaceholder(authorField, placeholders.author, getComputedStyle(authorField).color);
                
                if (bookItem.description !== 'Fetching book description...' && !bookItem.description.startsWith('error:')) {
                     setupPlaceholder(descriptionField, placeholders.description, getComputedStyle(descriptionField).color);
                     descriptionField.style.color = '';
                } else {
                    descriptionField.style.color = '#757575';
                }
                
                listItem.appendChild(controlsDiv);
                listItem.appendChild(coverUploader);
                listItem.appendChild(detailsDiv);
                
                if (insertBeforeElement) {
                    targetPanel.insertBefore(listItem, insertBeforeElement);
                } else {
                    targetPanel.appendChild(listItem);
                }
            });
            applyStyles();
            applyBlockCoverStyle();
            updateBackCoverVisibility();
        }

        // --- DRAG-AND-DROP INITIALIZATION ---
        const sortableOptions = {
            group: 'shared-list',
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                const newBooklist = [];
                const allPanelItems = [
                    ...Array.from(insideLeftPanel.children),
                    ...Array.from(insideRightPanel.children),
                    ...Array.from(backCoverPanel.querySelectorAll('.list-item'))
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
        new Sortable(insideLeftPanel, sortableOptions);
        new Sortable(insideRightPanel, sortableOptions);
        new Sortable(backCoverPanel, sortableOptions);

        // --- COVER COLLAGE GENERATION ---
        function generateCoverCollage() {
            const button = generateCoverButton;
            button.textContent = 'Generating...';
            button.disabled = true;

            const shouldStretchCovers = stretchCoversToggle.checked;

            const booksWithCovers = myBooklist.filter(book => !book.isBlank && (book.cover_ids.length > 0 || (book.customCoverData && !book.customCoverData.includes('placehold.co'))));
            
            if (booksWithCovers.length < 12) {
                showNotification('Please add at least 12 books with covers to generate a collage.');
                button.textContent = 'Auto-Generate Cover';
                button.disabled = false;
                return;
            }

            const coversToDraw = booksWithCovers.slice(0, 12).map(book => {
                if (book.customCoverData && !book.customCoverData.includes('placehold.co')) {
                    return book.customCoverData;
                } else if (book.cover_ids.length > 0) {
                    const coverId = book.cover_ids[book.currentCoverIndex];
                    return coverId !== 'placehold' ? `https://covers.openlibrary.org/b/id/${coverId}.jpg` : 'https://placehold.co/300x450/EAEAEA/333333?text=No%20Cover';
                }
                return 'https://placehold.co/300x450/EAEAEA/333333?text=No%20Cover';
            });

            const canvas = document.createElement('canvas');
            const dpi = 300; 
            canvas.width = 5 * dpi;
            canvas.height = 8 * dpi;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);


            const loadImage = (src) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = src;
                });
            };

            const imagePromises = coversToDraw.map(src => loadImage(src));
            
            // Wrap helpers for width measurement
            function breakLongWord(word, maxWidth) {
              const parts = []; let buf = '';
              for (const ch of word) {
                const test = buf + ch;
                if (ctx.measureText(test).width <= maxWidth) buf = test;
                else { if (buf) parts.push(buf); buf = ch; }
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
                if (ctx.measureText(test).width <= maxWidth) current = test;
                else {
                  if (ctx.measureText(words[i]).width > maxWidth) {
                    const parts = breakLongWord(words[i], maxWidth);
                    if (current) lines.push(current);
                    current = parts.shift() || '';
                    lines.push(...parts.slice(0, -1));
                    if (parts.length) current = (current ? current + ' ' : '') + parts[parts.length - 1];
                  } else { lines.push(current); current = words[i]; }
                }
              }
              if (current) lines.push(current);
              return lines;
            }
            function wrapTextMultiline(text, maxWidth) {
              const paragraphs = text.split(/\r?\n/);
              const lines = [];
              for (const p of paragraphs) {
                if (p.trim() === '') { lines.push(''); continue; }
                lines.push(...wrapParagraph(p, maxWidth));
              }
              return lines;
            }

            const titleStyleGroup = document.getElementById('cover-title-style-group');
            const font = titleStyleGroup.querySelector('.font-select').value;
            const isBold = titleStyleGroup.querySelector('.bold-toggle').classList.contains('active');
            const isItalic = titleStyleGroup.querySelector('.italic-toggle').classList.contains('active');
            let fontStyle = '';
            if (isItalic) fontStyle += 'italic ';
            if (isBold) fontStyle += 'bold ';
            const pxPerPt = dpi / 72;
            const fontSizePt = parseInt(titleStyleGroup.querySelector('.font-size-input').value, 10);
            const fontSizePx = fontSizePt * pxPerPt;

            const outerMarginPt = parseFloat(document.getElementById('cover-title-outer-margin')?.value || '10');
            const padXPt = parseFloat(document.getElementById('cover-title-pad-x')?.value || '0');
            const padYPt = parseFloat(document.getElementById('cover-title-pad-y')?.value || '10');
            const sideMarginPt = parseFloat(document.getElementById('cover-title-side-margin')?.value || '0');

            const outerMarginPx = outerMarginPt * pxPerPt;
            const padXPx = padXPt * pxPerPt;
            const padYPx = padYPt * pxPerPt;
            const bgSideMarginPx = sideMarginPt * pxPerPt;

            const coverTitle = (document.getElementById('cover-title-input').value || 'My Booklist');

            document.fonts.load(`${fontStyle} ${fontSizePt}pt ${font}`).then(() => {
                return Promise.all(imagePromises);
            }).then(images => {
                const canvasWidthPx = canvas.width;
                const canvasHeightPx = canvas.height;

                ctx.font = `${fontStyle} ${fontSizePx}px ${font}, sans-serif`;
                const availableTextWidth = Math.max(0, canvasWidthPx - 2*bgSideMarginPx - 2*padXPx);
                const lines = wrapTextMultiline(coverTitle, availableTextWidth);

                // Accurate vertical centering using TextMetrics
                const lineMetrics = lines.map(line => {
                  const m = ctx.measureText(line);
                  const ascent = (m.actualBoundingBoxAscent !== undefined) ? m.actualBoundingBoxAscent : fontSizePx * 0.8;
                  const descent = (m.actualBoundingBoxDescent !== undefined) ? m.actualBoundingBoxDescent : fontSizePx * 0.2;
                  return { line, ascent, descent, height: ascent + descent };
                });
                const gap = fontSizePx * 0.2;
                const textBlockHeight = lineMetrics.reduce((sum, lm) => sum + lm.height, 0) + gap * Math.max(0, lineMetrics.length - 1);
                const bgH = textBlockHeight + 2*padYPx;

                // Compute slot sizes so rows fit above/below the bar
                const vGutterToHeightRatio = 0.15;
                const bookAspectRatio = 0.75;
                const rowsTotal = 4 + 2*vGutterToHeightRatio; // 1 top + 3 bottom + 2 gutters
                const availableForCovers = canvasHeightPx - (bgH + 2*outerMarginPx);
                const slotHeight = Math.max(1, availableForCovers / rowsTotal);
                const slotWidth = slotHeight * bookAspectRatio;
                const hGutter = (canvasWidthPx - 3*slotWidth) / 4;
                const vGutter = slotHeight * vGutterToHeightRatio;

                // Draw top row
                let imageIndex = 0;
                const topRowY = 0;
                const drawImageSmart = (img, x, y, w, h) => {
                  const stretch = stretchCoversToggle.checked;
                  if (stretch) { ctx.drawImage(img, x, y, w, h); return; }
                  const imgAR = img.width / img.height, slotAR = w / h;
                  if (imgAR > slotAR) {
                    const dw = w, dh = dw / imgAR; ctx.drawImage(img, x, y + (h - dh)/2, dw, dh);
                  } else {
                    const dh = h, dw = dh * imgAR; ctx.drawImage(img, x + (w - dw)/2, y, dw, dh);
                  }
                };
                for (let col = 0; col < 3; col++) {
                  const slotX = hGutter + col*(slotWidth + hGutter);
                  drawImageSmart(images[imageIndex], slotX, topRowY, slotWidth, slotHeight);
                  imageIndex++;
                }

                // Title bar and text
                const bgX = bgSideMarginPx;
                const bgY = topRowY + slotHeight + outerMarginPx;
                const bgW = canvasWidthPx - 2*bgSideMarginPx;

                const color = titleStyleGroup.querySelector('.color-picker').value;
                const bgColor = document.getElementById('cover-title-bg-color').value;
                ctx.fillStyle = bgColor; ctx.fillRect(bgX, bgY, bgW, bgH);

                ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
                const centerX = bgX + bgW / 2;
                let y = bgY + (bgH - textBlockHeight) / 2;
                lineMetrics.forEach((lm) => {
                  const baselineY = y + lm.ascent;
                  ctx.fillText(lm.line.trim(), centerX, baselineY);
                  y += lm.height + gap;
                });

                // Bottom 3x3 covers
                const gridTopY = bgY + bgH + outerMarginPx;
                for (let row = 0; row < 3; row++) {
                  const currentRowY = gridTopY + row*(slotHeight + vGutter);
                  for (let col = 0; col < 3; col++) {
                    const slotX = hGutter + col*(slotWidth + hGutter);
                    drawImageSmart(images[imageIndex], slotX, currentRowY, slotWidth, slotHeight);
                    imageIndex++;
                  }
                }

                const dataUrl = canvas.toDataURL('image/png', 1.0);
                const frontCoverImg = frontCoverUploader.querySelector('img');
                frontCoverImg.src = dataUrl;
                frontCoverImg.dataset.isPlaceholder = "false";
                frontCoverUploader.classList.add('has-image');
            }).catch(err => {
                console.error('Cover generation failed:', err);
                showNotification('Could not generate the cover collage. Please try again.');
            }).finally(() => {
                button.textContent = 'Auto-Generate Cover';
                button.disabled = false;
            });
        }


        // --- FINAL PDF EXPORT ---
        exportPdfButton.addEventListener('click', () => {
            exportPdfButton.textContent = 'Generating...';
            exportPdfButton.disabled = true;

            const elementsToRestore = [];
            // Hide blank list items
            document.querySelectorAll('.list-item').forEach(item => {
                if (item.dataset.isBlank === 'true') {
                    elementsToRestore.push({el: item, display: item.style.display});
                    item.style.display = 'none';
                }
            });

            // Hide placeholder uploaders on the back cover
            document.querySelectorAll('#back-cover-panel .custom-uploader').forEach(uploader => {
                const img = uploader.querySelector('img');
                if (img && img.src.includes('placehold.co')) {
                     elementsToRestore.push({el: uploader, display: uploader.style.display});
                    uploader.style.display = 'none';
                }
            });

            // Hide the entire front cover panel if it's still a placeholder
            const frontCoverImg = frontCoverUploader.querySelector('img');
            const isPlaceholder = frontCoverImg.dataset.isPlaceholder !== "false" && (frontCoverImg.src.includes('placehold.co') || frontCoverImg.src.includes('data:image/gif'));

            if (isPlaceholder) {
                elementsToRestore.push({ el: frontCoverPanel, display: frontCoverPanel.style.display });
                frontCoverPanel.style.display = 'none';
            }


            previewArea.classList.add('print-mode');
            
            setTimeout(() => {
                document.fonts.ready.then(() => {
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter' });

                    const options = { 
                        scale: 4, 
                        useCORS: true, 
                        backgroundColor: null,
                        windowWidth: 3300,
                        windowHeight: 2550
                        };

                    html2canvas(document.getElementById('print-page-1'), options)
                        .then(canvas1 => {
                            pdf.addImage(canvas1.toDataURL('image/png'), 'PNG', 0, 0, 11, 8.5);
                            pdf.addPage();
                            return html2canvas(document.getElementById('print-page-2'), options);
                        })
                        .then(canvas2 => {
                            pdf.addImage(canvas2.toDataURL('image/png'), 'PNG', 0, 0, 11, 8.5);
                            pdf.save('bifold-booklist.pdf');
                        })
                        .catch(err => {
                            console.error("PDF Generation failed:", err);
                            showNotification("An error occurred generating the PDF. Please check the console.");
                        })
                        .finally(() => {
                            previewArea.classList.remove('print-mode');
                            elementsToRestore.forEach(item => item.el.style.display = item.display || '');
                            exportPdfButton.textContent = 'Generate PDF';
                            exportPdfButton.disabled = false;
                        });
                });
            }, 100);
        });

        // Initialize the app
        initializeBooklist();
        applyStyles();

/* === Booklist Save/Load + Local Autosave (append-only) === */

// Helper: pull current image src from a custom uploader, skipping placeholders
function getUploaderImageSrc(uploaderEl) {
  if (!uploaderEl) return null;
  const img = uploaderEl.querySelector('img');
  if (!img || !img.src) return null;
  if (img.src.includes('placehold.co')) return null;
  return img.src;
}

// Capture Title/Author/Description style groups and the Cover Title group
function captureStyleGroups() {
  const styles = {};

  // Title/Author/Description groups (driven by applyStyles)
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

  // Cover title group + spacing
  const ctGroup = document.getElementById('cover-title-style-group');
  styles.coverTitle = {
    font: ctGroup?.querySelector('.font-select')?.value ?? 'Oswald',
    sizePt: parseFloat(ctGroup?.querySelector('.font-size-input')?.value ?? '24'),
    color: ctGroup?.querySelector('.color-picker')?.value ?? '#000000',
    bold: !!ctGroup?.querySelector('.bold-toggle')?.classList.contains('active'),
    italic: !!ctGroup?.querySelector('.italic-toggle')?.classList.contains('active'),
    outerMarginPt: parseFloat(document.getElementById('cover-title-outer-margin')?.value ?? '10'),
    padXPt:       parseFloat(document.getElementById('cover-title-pad-x')?.value ?? '0'),
    padYPt:       parseFloat(document.getElementById('cover-title-pad-y')?.value ?? '10'),
    sideMarginPt: parseFloat(document.getElementById('cover-title-side-margin')?.value ?? '0'),
    bgColor: document.getElementById('cover-title-bg-color')?.value ?? '#FFFFFF',
  };

  return styles;
}

// Serialize the full session to a portable JSON object
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

  return {
    schema: 'booklist-v1',
    savedAt: new Date().toISOString(),
    meta: {
      fileNameHint: (document.getElementById('cover-title-input')?.value || 'booklist'),
    },
    books,
    ui: {
      stretchCovers: !!document.getElementById('stretch-covers-toggle')?.checked,
      stretchBlockCovers: !!document.getElementById('stretch-block-covers-toggle')?.checked,
      showQr: !!document.getElementById('toggle-qr-code')?.checked,
      showBranding: !!document.getElementById('toggle-branding')?.checked,
      coverTitle: document.getElementById('cover-title-input')?.value || '',
    },
    styles: captureStyleGroups(),
    images: {
      frontCover: getUploaderImageSrc(document.getElementById('front-cover-uploader')),
      qr: getUploaderImageSrc(document.getElementById('qr-code-uploader')),
      branding: getUploaderImageSrc(document.getElementById('branding-uploader')),
    },
  };
}

// Download as .booklist file
async function downloadBooklist(state) {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const safeBase = (state.meta?.fileNameHint || 'booklist').replace(/[^\w.-]+/g, '_');
  const suggestedName = `${safeBase}.booklist`;

  // Detect File System Access API (avoid iframes)
  const supportsFSAccess =
    'showSaveFilePicker' in window &&
    (() => { try { return window.self === window.top; } catch { return false; } })();

  if (supportsFSAccess) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Booklist JSON',
            accept: { 'application/json': ['.booklist', '.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // If the user cancels, do nothing; otherwise fall back
      if (err && (err.name === 'AbortError' || err.code === 20)) return;
    }
  }

  // Fallback: anchor download (suggests filename; dialog depends on browser settings)
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 750);
}

// Apply a loaded state
function applyStyleGroups(loadedStyles) {
  if (!loadedStyles) return;

  // Title/Author/Description groups
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

  // Cover title group + spacing controls
  const ct = loadedStyles.coverTitle || {};
  const ctGroup = document.getElementById('cover-title-style-group');
  if (ctGroup) {
    const fontSel = ctGroup.querySelector('.font-select');
    const sizeInp = ctGroup.querySelector('.font-size-input');
    const colorInp = ctGroup.querySelector('.color-picker');
    const boldBtn = ctGroup.querySelector('.bold-toggle');
    const italicBtn = ctGroup.querySelector('.italic-toggle');
    if (fontSel) fontSel.value = ct.font ?? fontSel.value;
    if (sizeInp) sizeInp.value = ct.sizePt ?? sizeInp.value;
    if (colorInp) colorInp.value = ct.color ?? colorInp.value;
    if (boldBtn) boldBtn.classList.toggle('active', !!ct.bold);
    if (italicBtn) italicBtn.classList.toggle('active', !!ct.italic);
  }
  const setNum = (id, val) => { const el = document.getElementById(id); if (el && typeof val === 'number') el.value = val; };
  const setStr = (id, val) => { const el = document.getElementById(id); if (el && typeof val === 'string') el.value = val; };
  setNum('cover-title-outer-margin', ct.outerMarginPt);
  setNum('cover-title-pad-x',       ct.padXPt);
  setNum('cover-title-pad-y',       ct.padYPt);
  setNum('cover-title-side-margin', ct.sideMarginPt);
  setStr('cover-title-bg-color',    ct.bgColor);
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

  // UI toggles and title
  const toggleQrCode = document.getElementById('toggle-qr-code');
  const toggleBranding = document.getElementById('toggle-branding');
  const stretchCoversToggle = document.getElementById('stretch-covers-toggle');
  const stretchBlockCoversToggle = document.getElementById('stretch-block-covers-toggle');
  if (toggleQrCode) toggleQrCode.checked = !!loaded.ui?.showQr;
  if (toggleBranding) toggleBranding.checked = !!loaded.ui?.showBranding;
  if (stretchCoversToggle) stretchCoversToggle.checked = !!loaded.ui?.stretchCovers;
  if (stretchBlockCoversToggle) stretchBlockCoversToggle.checked = !!loaded.ui?.stretchBlockCovers;
  const titleInput = document.getElementById('cover-title-input');
  if (titleInput) titleInput.value = loaded.ui?.coverTitle || '';

  // Styles
  applyStyleGroups(loaded.styles);

  // Images
  applyUploaderImage(document.getElementById('front-cover-uploader'), loaded.images?.frontCover || null);
  applyUploaderImage(document.getElementById('qr-code-uploader'),     loaded.images?.qr || null);
  applyUploaderImage(document.getElementById('branding-uploader'),    loaded.images?.branding || null);

  // Books: clamp/pad to 15 using your existing blank template
  const incoming = Array.isArray(loaded.books) ? loaded.books : [];
  myBooklist = incoming.slice(0, 15).map(b => ({
    key: b.key,
    isBlank: !!b.isBlank,
    title: b.title ?? '[Enter Title]',
    author: b.author ?? '[Enter Author]',
    callNumber: b.callNumber ?? '[Call #]',
    description: b.description ?? '[Enter a brief description here...]',
    cover_ids: Array.isArray(b.cover_ids) ? b.cover_ids : [],
    currentCoverIndex: typeof b.currentCoverIndex === 'number' ? b.currentCoverIndex : 0,
    customCoverData: b.customCoverData || null,
  }));
  while (myBooklist.length < 15) myBooklist.push(createBlankBook());

  // Re-render with current layout logic
  handleLayoutChange();
  renderBooklist();
  applyStyles();
  applyBlockCoverStyle();
  updateBackCoverVisibility();
  showNotification('Booklist loaded.', 'success');
}

// Local draft: lighter snapshot for localStorage (strip large images)
function serializeDraftForLocal() {
  const s = serializeState();
  if (s.images) s.images.frontCover = null;
  return s;
}
function saveDraftLocal() {
  try { localStorage.setItem('booklist-draft', JSON.stringify(serializeDraftForLocal())); }
  catch (_) { /* ignore quota errors */ }
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

// Debounced autosave that triggers after renders
const debouncedSave = (() => { let t; return () => { clearTimeout(t); t = setTimeout(saveDraftLocal, 400); }; })();

// Wrap renderBooklist to autosave after each render
(() => {
  if (typeof renderBooklist === 'function') {
    const originalRender = renderBooklist;
    renderBooklist = function() {
      originalRender();
      debouncedSave();
    };
  }
})();

// Reset to a fresh blank slate with all default values from screenshot
function resetToBlank() {
  // Clear local draft so this clean state persists on reload
  try { localStorage.removeItem('booklist-draft'); } catch (_) {}

  // === Book Block Styles - restore defaults ===
  const titleFont = document.getElementById('title-font');
  const titleSize = document.getElementById('title-size');
  const titleColor = document.getElementById('title-color');
  const titleBold = document.getElementById('title-bold');
  const titleItalic = document.getElementById('title-italic');
  
  if (titleFont) titleFont.selectedIndex = 0;
  if (titleSize) titleSize.value = '14';
  if (titleColor) titleColor.value = '#000000';
  if (titleBold) titleBold.checked = true;
  if (titleItalic) titleItalic.checked = false;
  
  const authorFont = document.getElementById('author-font');
  const authorSize = document.getElementById('author-size');
  const authorColor = document.getElementById('author-color');
  const authorBold = document.getElementById('author-bold');
  const authorItalic = document.getElementById('author-italic');
  
  if (authorFont) authorFont.selectedIndex = 0;
  if (authorSize) authorSize.value = '12';
  if (authorColor) authorColor.value = '#000000';
  if (authorBold) authorBold.checked = true;
  if (authorItalic) authorItalic.checked = false;
  
  const descFont = document.getElementById('desc-font');
  const descSize = document.getElementById('desc-size');
  const descColor = document.getElementById('desc-color');
  const descBold = document.getElementById('desc-bold');
  const descItalic = document.getElementById('desc-italic');
  
  if (descFont) descFont.value = 'Calibri';
  if (descSize) descSize.value = '10';
  if (descColor) descColor.value = '#000000';
  if (descBold) descBold.checked = true;
  if (descItalic) descItalic.checked = false;
  
  const stretchBlockCoversToggle = document.getElementById('stretch-block-covers-toggle');
  if (stretchBlockCoversToggle) stretchBlockCoversToggle.checked = false;
  
  // === Back Cover Options ===
  const toggleQrCode = document.getElementById('toggle-qr-code');
  if (toggleQrCode) toggleQrCode.checked = true;
  
  const toggleBranding = document.getElementById('toggle-branding');
  if (toggleBranding) toggleBranding.checked = true;
  
  // === Cover Title Styles ===
  const coverTitleFont = document.getElementById('cover-title-font');
  const coverTitleSize = document.getElementById('cover-title-size');
  const coverTitleColor = document.getElementById('cover-title-text-color');
  const coverTitleBg = document.getElementById('cover-title-bg-color');
  const coverTitleBold = document.getElementById('cover-title-bold');
  const coverTitleItalic = document.getElementById('cover-title-italic');
  
  if (coverTitleFont) coverTitleFont.selectedIndex = 0;
  if (coverTitleSize) coverTitleSize.value = '40';
  if (coverTitleColor) coverTitleColor.value = '#FFFFFF';
  if (coverTitleBg) coverTitleBg.value = '#000000';
  if (coverTitleBold) coverTitleBold.checked = true;
  if (coverTitleItalic) coverTitleItalic.checked = false;
  
  const outerMargin = document.getElementById('cover-outer-margin');
  if (outerMargin) outerMargin.value = '10';
  
  const bgPadX = document.getElementById('cover-bg-pad-x');
  if (bgPadX) bgPadX.value = '0';
  
  const bgPadY = document.getElementById('cover-bg-pad-y');
  if (bgPadY) bgPadY.value = '10';
  
  const sideMargin = document.getElementById('cover-side-margin');
  if (sideMargin) sideMargin.value = '0';
  
  const stretchCoversToggle = document.getElementById('stretch-covers-toggle');
  if (stretchCoversToggle) stretchCoversToggle.checked = true;
  
  const titleInput = document.getElementById('cover-title-input');
  if (titleInput) titleInput.value = '';

  // === CLEAR ALL IMAGES - Reset to placeholders ===
  
  // Reset QR Code to placeholder
  const qrCodeUploader = document.getElementById('qr-code-uploader');
  if (qrCodeUploader) {
    const qrImg = qrCodeUploader.querySelector('img');
    const qrInput = qrCodeUploader.querySelector('input[type="file"]');
    if (qrImg) {
      qrImg.src = 'https://placehold.co/480x144/EAEAEA/333333?text=Upload+QR+Code+Image+(5x1.5+inches)';
      delete qrImg.dataset.isPlaceholder;
    }
    if (qrInput) qrInput.value = '';
    qrCodeUploader.classList.remove('has-image');
  }
  
// Reset Branding/Marketing to default branding image
const brandingUploader = document.getElementById('branding-uploader');
if (brandingUploader) {
  const brandingImg = brandingUploader.querySelector('img');
  const brandingInput = brandingUploader.querySelector('input[type="file"]');
  if (brandingImg) {
    brandingImg.src = 'assets/img/branding-default.png';
    brandingImg.dataset.isPlaceholder = "false";
  }
  if (brandingInput) brandingInput.value = '';
  brandingUploader.classList.add('has-image');
}
  
  // Reset Front Cover to transparent placeholder
  const frontCoverUploader = document.getElementById('front-cover-uploader');
  if (frontCoverUploader) {
    const frontImg = frontCoverUploader.querySelector('img');
    const frontInput = frontCoverUploader.querySelector('input[type="file"]');
    if (frontImg) {
      frontImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      delete frontImg.dataset.isPlaceholder;
    }
    if (frontInput) frontInput.value = '';
    frontCoverUploader.classList.remove('has-image');
  }

  // Rebuild fresh blank list
  myBooklist = [];
  for (let i = 0; i < 15; i++) myBooklist.push(createBlankBook());

  // Re-render everything
  handleLayoutChange();
  renderBooklist();
  applyStyles();
  applyBlockCoverStyle();
  updateBackCoverVisibility();
  saveDraftLocal();
  showNotification('Reset to blank with default settings.', 'success');
}

// Create and inject Save/Load controls next to Generate PDF with centered group + right-aligned Reset
(function injectSaveLoadControls() {
  const pdfBtn = document.getElementById('export-pdf-button');
  if (!pdfBtn) return;

  // Find the export controls container
  const container =
    pdfBtn.closest('.export-controls') ||
    document.getElementById('export-controls') ||
    pdfBtn.parentElement ||
    document.body;

  // Build the bar and the centered group
  const bar = document.createElement('div');
  bar.className = 'export-actions-bar';

  const centerGroup = document.createElement('div');
  centerGroup.className = 'export-actions-center';

  // Build Load/Save with matching look
  const loadBtn = document.createElement('button');
  loadBtn.id = 'load-list-button';
  loadBtn.type = 'button';
  loadBtn.textContent = 'Load List';
  loadBtn.classList.add('export-action-button');

  const saveBtn = document.createElement('button');
  saveBtn.id = 'save-list-button';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save List';
  saveBtn.classList.add('export-action-button');

  // Ensure the PDF button visually matches sizing
  pdfBtn.classList.add('export-action-button');

  // Reset button on the far right
  const resetBtn = document.createElement('button');
  resetBtn.id = 'reset-blank-button';
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset to Blank';
  resetBtn.classList.add('export-action-button', 'export-actions-right');

  // Assemble: centered [Load, Generate, Save] + right-aligned [Reset]
  container.appendChild(bar);
  bar.appendChild(centerGroup);
  centerGroup.appendChild(loadBtn);
  centerGroup.appendChild(pdfBtn);   // moves existing button into the center group
  centerGroup.appendChild(saveBtn);
  bar.appendChild(resetBtn);

  // Hidden file input for loading
  const fileInput = document.createElement('input');
  fileInput.id = 'load-list-input';
  fileInput.type = 'file';
  fileInput.accept = '.booklist,.json,application/json';
  fileInput.hidden = true;
  container.appendChild(fileInput);

  // Wire events
  saveBtn.addEventListener('click', async () => {
    const state = serializeState();
    await downloadBooklist(state);
    showNotification('Booklist saved to file.', 'success');
  });

  loadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
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

  // Reset handler (requires resetToBlank helper present)
  resetBtn.addEventListener('click', () => {
    const ok = confirm('Reset to a blank list? This clears the current list and local draft. You can still load a saved .booklist later.');
    if (!ok) return;
    resetToBlank();
  });
})();

// Try restoring a local draft after the app has initialized
restoreDraftLocalIfPresent();

/* === End Save/Load + Local Autosave === */

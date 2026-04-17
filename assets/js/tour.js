/* ==========================================================================
   GUIDED TOUR - Folio narrates

   Folio walks users through Booklister in section-based mini-tours.
   A full tour chains all sections in sequence.
   ========================================================================== */
/* global BooklistApp */

(function() {
  'use strict';

  /* ----------------------------------------------------------------
     SECTION & STEP DEFINITIONS

     Each section has:
       title, description, icon (Font Awesome class), steps[]

     Each step has:
       target   - CSS selector for spotlight (null for general/no-target)
       text     - Folio's narration
       state    - Folio animation state
       prepare  - optional function to set up the view (open tabs, scroll, etc.)
       padding  - optional extra px around spotlight (default 8)
     ---------------------------------------------------------------- */

  const SECTION_ORDER = [
    'getting-started',
    'search-add',
    'your-booklist',
    'covers-collage',
    'customize-style',
    'export-finish'
  ];

  const SECTIONS = {
    'getting-started': {
      title: 'Getting Started',
      description: 'What this tool does and how to use it.',
      icon: 'fa-solid fa-rocket',
      steps: [
        {
          target: '#folio-scene',
          text: "Welcome to Booklister! I'm Folio. Let me show you around. Don't worry if you have a booklist loaded, it'll be saved and restored when the tour ends.\n\nTip: Use your arrow keys to navigate.",
          state: 'greeting',
          padding: 4,
          prepare: function() {
            openSidebarTab('tab-search');
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'instant' });
          },
        },
        {
          target: '#preview-area',
          text: "This is your live preview. The first page shows the front cover and back page of your list. The second page shows the inner pages with your book entries.",
          state: 'evaluating',
          padding: 4,
        },
        {
          target: '.sidebar',
          text: "The sidebar is your workspace. The Search tab finds books, the Settings tab customizes everything.",
          state: 'evaluating',
          prepare: function() {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('collapsed')) {
              document.getElementById('toggle-sidebar-btn')?.click();
            }
          },
          padding: 0,
        },
        {
          target: '.header-actions',
          text: "Up here you can Load a saved list, Save your work, Reset to start fresh, and Generate PDF when everything looks right.",
          state: 'idle',
          padding: 6,
        },
      ]
    },

    'search-add': {
      title: 'Search & Add Books',
      description: 'Find books and add them to your list.',
      icon: 'fa-solid fa-magnifying-glass',
      steps: [
        {
          target: '#search-form',
          text: "Start here. Type a keyword, title, or author into the search field and hit the Search button. Let me run a demo search for Discworld, a fantasy series by Terry Pratchett.",
          state: 'searching',
          prepare: function() {
            openSidebarTab('tab-search');
            // Pre-fill and submit a demo search
            const input = document.getElementById('keywordInput');
            if (input && !input.value) {
              input.value = 'Discworld';
              input.classList.add('tour-demo-filled');
              // Auto-click search after a beat
              setTimeout(function() {
                const searchBtn = document.getElementById('fetchButton');
                if (searchBtn) searchBtn.click();
              }, 600);
            }
          },
        },
        {
          target: '#results-container',
          text: "Results show up here from OpenLibrary. It has a huge catalog, but not everything. If a book doesn't come up, you can always add it manually and upload your own cover.",
          state: 'evaluating',
          prepare: function() { openSidebarTab('tab-search'); },
          padding: 4,
        },
        {
          target: '#results-container',
          text: "Some results have arrow buttons to browse different cover editions. If there are multiple, pick the one that looks best for your display.",
          state: 'evaluating',
          interactive: true,
          prepare: function() {
            const results = document.getElementById('results-container');
            if (results) results.scrollTop = 0;
          },
        },
        {
          target: '#results-container',
          text: "Click 'Add to List' to drop a book into the next open slot. It'll appear in your preview right away.",
          state: 'excited',
          interactive: true,
          prepare: function() {
            openSidebarTab('tab-search');
            const results = document.getElementById('results-container');
            if (results) results.scrollTop = 0;
          },
        },
      ]
    },

    'your-booklist': {
      title: 'Your Booklist',
      description: 'Manage, reorder, and customize your books.',
      icon: 'fa-solid fa-list-ol',
      steps: [
        {
          target: '#print-page-2',
          text: "Now let me load a sample Discworld booklist so you can see what a full list looks like. Each entry shows the cover, title, author, and description. You can type directly into these fields to edit anything.",
          state: 'excited',
          prepare: function() {
            BooklistApp.applyState(TOUR_SAMPLE_STATE, { silent: true });
            scrollPreviewTo('print-page-2');
          },
          padding: 4,
        },
        {
          target: '#inside-left-panel .list-item:first-child .star-button',
          text: "The star icon marks a book for the front cover collage. Star at least 12 books if you want to auto-generate one. This sample list already has 12 starred.",
          state: 'evaluating',
          prepare: function() {
            scrollPreviewTo('print-page-2');
          },
        },
        {
          target: '#inside-left-panel .list-item:first-child .drag-handle',
          text: "Drag this handle to reorder books on your list. Or type a new number in the position field to jump a book to a specific spot.",
          state: 'idle',
          prepare: function() {
            scrollPreviewTo('print-page-2');
          },
        },
        {
          target: '#inside-left-panel .list-item:first-child .magic-button',
          text: "The magic wand drafts a description for you. It's available on custom library instances and can also be disabled upon request. Shift+click the wand to paste your own summary for the drafter to condense. You can always edit a draft or write your own from scratch.",
          state: 'evaluating',
          prepare: function() {
            scrollPreviewTo('print-page-2');
          },
        },
        {
          target: '#inside-left-panel .list-item:first-child .cover-uploader',
          text: "Click the cover image to upload your own. Handy when the search didn't find the right edition or you want a custom look.",
          state: 'idle',
          prepare: function() {
            scrollPreviewTo('print-page-2');
          },
        },
        {
          target: '#inside-left-panel .list-item:first-child .delete-button',
          text: "The X button removes a book and frees up that slot. Don't worry, you can always search and add another.",
          state: 'worried',
          prepare: function() {
            scrollPreviewTo('print-page-2');
          },
        },
      ]
    },

    'covers-collage': {
      title: 'Covers & Collage',
      description: 'Build your front cover with a collage of book covers.',
      icon: 'fa-solid fa-grip',
      steps: [
        {
          target: '#front-cover-uploader',
          text: "This is your front cover. You can upload a custom image here, or auto-generate a collage from your starred books. For generated covers, you can customize the title font, size, and background color, even add a gradient.",
          state: 'evaluating',
          prepare: function() {
            // Reset to "no cover yet" state so the narration matches
            // even when the user navigates backward into this step
            clearTourFrontCover();
            scrollPreviewTo('print-page-1');
          },
        },
        {
          target: '#generate-cover-button',
          text: "This button generates the collage. You can find it in the Front Cover section in the Settings tab, right under the title text inputs. You need at least 12 starred books with covers. Let me set a title and pick a layout first.",
          state: 'excited',
          prepare: function() {
            // Keep the "not yet generated" state so back-navigation is clean
            clearTourFrontCover();

            openSidebarTab('tab-settings');
            openSettingsSection('Front Cover', '#generate-cover-button');

            // Switch to advanced cover mode and set title lines
            const advToggle = document.getElementById('cover-advanced-toggle');
            if (advToggle && !advToggle.checked) {
              advToggle.checked = true;
              advToggle.dispatchEvent(new Event('change'));
            }
            const line1 = document.getElementById('cover-line-1');
            const line2 = document.getElementById('cover-line-2');
            if (line1) line1.value = 'Mind How You Go';
            if (line2) line2.value = 'Reading Terry Pratchett';

            // Set title bar gradient background
            const bgColor = document.getElementById('cover-title-bg-color');
            const gradToggle = document.getElementById('cover-title-gradient-toggle');
            const bgColor2 = document.getElementById('cover-title-bg-color2');
            if (bgColor) bgColor.value = '#6b46c1';
            if (gradToggle) gradToggle.checked = true;
            if (bgColor2) { bgColor2.value = '#63b3ed'; bgColor2.style.display = ''; }

            // Set layout to classic and enable stretch covers
            const selector = document.getElementById('collage-layout-selector');
            if (selector) {
              selector.querySelectorAll('.layout-option').forEach(function(opt) {
                opt.classList.toggle('selected', opt.dataset.layout === 'classic');
              });
            }
            const stretchToggle = document.getElementById('stretch-covers-toggle');
            if (stretchToggle) stretchToggle.checked = true;
          },
        },
        {
          target: '#front-cover-uploader',
          text: "This is Classic layout. It's clean and straightforward, great for showing off the covers without distraction.",
          state: 'evaluating',
          prepare: function() {
            scrollPreviewTo('print-page-1');
            // Explicitly set layout to classic so navigating back from
            // the Tilted demo step shows classic again
            const selector = document.getElementById('collage-layout-selector');
            if (selector) {
              selector.querySelectorAll('.layout-option').forEach(function(opt) {
                opt.classList.toggle('selected', opt.dataset.layout === 'classic');
              });
            }
            BooklistApp.generateCoverCollage();
          },
        },
        {
          target: '#collage-layout-selector',
          text: "This is where you switch between layouts. Pick one and regenerate to see the change. Let me switch to Tilted.",
          state: 'evaluating',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Front Cover', '#collage-layout-selector');
          },
        },
        {
          target: '#front-cover-uploader',
          text: "And here's Tilted. It gives the cover a more dynamic, eye-catching feel. There are other layouts to try too, like Staggered and Masonry. Experiment with them later to find your favorite!",
          state: 'excited',
          prepare: function() {
            scrollPreviewTo('print-page-1');
            // Switch to tilted layout and regenerate
            const selector = document.getElementById('collage-layout-selector');
            if (selector) {
              selector.querySelectorAll('.layout-option').forEach(function(opt) {
                opt.classList.toggle('selected', opt.dataset.layout === 'tilted');
              });
            }
            BooklistApp.generateCoverCollage();
          },
        },
        {
          target: '.collage-cover-count-group',
          text: "Pick 12, 16, or 20 covers for the auto-generated collage. The 16 and 20 modes open extra cover slots below where you can add supplementary images.",
          state: 'evaluating',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Front Cover', '.collage-cover-count-group');
          },
        },
        {
          target: '#branding-uploader',
          text: "Add your library's logo or branding here. It appears on the back cover, giving the list a polished, official look. I'll add the default one for now.",
          state: 'idle',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Back Cover');
            scrollPreviewTo('print-page-1', { alignEnd: true });
            // Apply the default branding image
            const uploader = document.getElementById('branding-uploader');
            if (uploader) {
              const img = uploader.querySelector('img');
              if (img) {
                img.src = 'assets/img/branding-default.png';
                img.dataset.isPlaceholder = 'false';
              }
              uploader.classList.add('has-image');
            }
          },
        },
      ]
    },

    'customize-style': {
      title: 'Customize & Style',
      description: 'Fonts, colors, layout, and QR codes.',
      icon: 'fa-solid fa-palette',
      steps: [
        {
          target: '#tab-settings',
          text: "The Settings tab is where you dial in the look. Fonts, colors, text sizes, spacing... it's all here.",
          state: 'evaluating',
          prepare: function() {
            openSidebarTab('tab-settings');
            // Scroll settings tab to the top so Text Styling is visible
            const tabSettings = document.getElementById('tab-settings');
            if (tabSettings) tabSettings.scrollTop = 0;
          },
          padding: 0,
        },
        {
          target: '#list-name-input',
          text: "Give your booklist a name. This shows up on the PDF filename when you export, so make it descriptive.",
          state: 'idle',
          prepare: function() {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'instant' });
            // Set the sample list name
            const nameInput = document.getElementById('list-name-input');
            if (nameInput) nameInput.value = 'The Disc and Beyond';
          },
        },
        {
          target: '.settings-section:first-of-type',
          text: "The Text Styling section controls fonts, sizes, and colors for book titles, authors, and descriptions on the list page.",
          state: 'evaluating',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Text Styling');
          },
          padding: 0,
        },
        {
          target: '#qr-code-area',
          text: "Add a QR code to link patrons to an online booklist, a reading challenge, or any resource you want to highlight. You can enter the QR Code url in the Back Cover section in the Settings tab. Let me add one linking to Terry Pratchett's Wikipedia page.",
          state: 'idle',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Back Cover');
            scrollPreviewTo('print-page-1', { alignEnd: true });
            // Set QR URL and generate
            const qrInput = document.getElementById('qr-url-input');
            if (qrInput) qrInput.value = 'https://en.wikipedia.org/wiki/Terry_Pratchett';
            setTimeout(function() {
              const qrBtn = document.getElementById('generate-qr-button');
              if (qrBtn) qrBtn.click();
            }, 300);
            const qr = document.getElementById('qr-code-area');
            const mainContent = document.querySelector('.main-content');
            if (qr && mainContent) {
              scrollWithin(mainContent, qr, { center: true });
            }
          },
        },
        {
          target: '#qr-code-text',
          text: "This text area is your back cover blurb, next to the QR code. Write a short description, reading prompt, or friendly message for patrons.",
          state: 'idle',
          prepare: function() {
            // Set the sample QR text
            const qrText = document.getElementById('qr-code-text');
            const mainContent = document.querySelector('.main-content');
            if (qrText) {
              qrText.innerText = "Welcome to the Discworld, a fantasy world carried through space on the back of a giant turtle, where Pratchett will make you laugh, and then make you think, and then quietly break your heart. Scan the code to meet the man, then come find the books waiting for you on the shelf.";
              qrText.style.color = '';
              if (mainContent) scrollWithin(mainContent, qrText, { center: true });
            }
          },
        },
      ]
    },

    'export-finish': {
      title: 'Export & Finish',
      description: 'Save your work and generate the final PDF.',
      icon: 'fa-solid fa-file-pdf',
      steps: [
        {
          target: '#save-list-button',
          text: "Save your work anytime as a .booklist file. It captures everything: books, covers, settings, styling. You can pick it back up later. If you see a blinking white dot on this button, that means you have unsaved changes, so make sure to save often!",
          state: 'idle',
          padding: 6,
        },
        {
          target: '#load-list-button',
          text: "Load a previously saved .booklist file to continue editing or create a new version from an existing list.",
          state: 'idle',
          padding: 6,
        },
        {
          target: '#export-pdf-button',
          text: "When everything looks right, hit Generate PDF. For best results, print at Default or Fit to Paper scale, double-sided, and flip on short edge. Your booklist is going to look great!",
          state: 'excited',
          padding: 6,
        },
        {
          target: null,
          text: "That's it! You're all set to make some great booklists. I'll be down here keeping an eye on things. Click the cat button to hide or show me anytime.",
          state: 'greeting',
          prepare: function() {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.scrollTop = 0;
            openSidebarTab('tab-search');
          },
        },
      ]
    }
  };


  /* ----------------------------------------------------------------
     SAMPLE BOOKLIST STATE (loaded during tour to show a complete list)
     Compact version: only the selected cover_id per book, no base64 images.
     Covers load from Open Library; collage is generated live.
     ---------------------------------------------------------------- */
  const TOUR_SAMPLE_STATE = {
    schema: 'booklist-v1',
    meta: { listName: 'The Disc and Beyond' },
    books: [
      { key: '/works/OL453657W', isBlank: false, title: 'The Colour of Magic', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett -\u00a0Fiction Pratchett', description: 'When a naive tourist arrives in Ankh-Morpork seeking adventure, he hires Rincewind, a spectacularly inept wizard, as his guide. Together they stumble through a world of dragons, barbarians, and dark temples, where survival depends less on magic than on sheer dumb luck.', currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [14647238] },
      { key: '/works/OL453680W', isBlank: false, title: 'The Light Fantastic', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: "When a red star hurtles toward the Discworld, only one wizard can save it. Unfortunately, that wizard is Rincewind, a cowardly dropout with one of the Eight Great Spells stuck in his head. Alongside Twoflower and the Luggage, he stumbles through a world of chaos toward cosmic catastrophe.", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [6531015] },
      { key: '/works/OL453670W', isBlank: false, title: 'Equal Rites', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: "When eight-year-old Esk discovers she possesses magical talent, she defies tradition by seeking training as a wizard instead of a witch. Accompanied by the formidable Granny Weatherwax, Esk journeys to Ankh-Morpork's Unseen University, where she must prove that magic knows no gender.", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [6925774] },
      { key: '/works/OL453658W', isBlank: false, title: 'Mort', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett -\u00a0Fiction Pratchett', description: "When a young man becomes Death's apprentice, he discovers the job involves more than just reaping souls. While Mort tries to fix a catastrophic mistake, Death himself embarks on a quest to understand what it means to be human, with hilariously tragic consequences.", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [14648805] },
      { key: '/works/OL453659W', isBlank: false, title: 'Sourcery', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett -\u00a0Fiction Pratchett', description: 'When a child sourcerer arrives at Unseen University wielding apocalyptic power, magic runs wild through Ankh-Morpork. Cowardly wizard Rincewind must join an unlikely band of heroes to stop the power-drunk wizards from tearing reality apart.', currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [15200528] },
      { key: '/works/OL453660W', isBlank: false, title: 'Wyrd Sisters', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: 'When a tyrant murders the king of Lancre and seizes the throne, three quarrelsome witches must outwit him to restore the rightful heir. With a troupe of actors, a sinister cat, and a fool caught in the middle, Granny Weatherwax and her coven discover that magic and mischief make powerful allies.', currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [14648051] },
      { key: '/works/OL453654W', isBlank: false, title: 'Reaper Man', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: "When Death is forcibly retired, he takes on human form as a farmhand named Bill Door, learning what it means to live. Meanwhile, back in Ankh-Morpork, his absence causes chaos as life-force accumulates, and a dead wizard named Windle Poons discovers he's far more useful undead than he ever was alive.", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [12993919] },
      { key: '/works/OL453697W', isBlank: false, title: 'Small Gods', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: 'When the great god Om manifests as a powerless tortoise with only one true believer remaining, he must rely on Brutha, a humble novice with a perfect memory, to restore his faith. In a world where the Omnian church rules through fear, belief becomes the ultimate weapon.', currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [6405489] },
      { key: '/works/OL453707W', isBlank: false, title: 'Interesting Times', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett -\u00a0Fiction Pratchett', description: "When a book about a tourist's holiday becomes revolutionary propaganda, hapless wizard Rincewind finds himself hailed as a savior by rebels in the Agatean Empire. The only problem: he can't even spell wizard, and \"interesting times\" is the worst curse imaginable on Discworld.", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [14778580] },
      { key: '/works/OL453777W', isBlank: false, title: 'Maskerade', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: "When Granny Weatherwax and Nanny Ogg arrive at the opera house, they discover a ghost with very specific demands and a taste for theatrical mayhem. As accidents multiply and mysteries deepen, the witches can't resist meddling in the chaos, uncovering secrets far darker than any phantom's revenge.", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [14646574] },
      { key: '/works/OL453662W', isBlank: false, title: 'Hogfather', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: "When belief in the Hogfather, Discworld's gift-giving icon, dwindles dangerously low, Death himself must don the red suit and deliver presents on Hogswatchnight. But can a seven-foot skeleton truly capture the magic that children need to believe in?", currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [13271889] },
      { key: '/works/OL453852W', isBlank: false, title: 'Thud!', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: 'When a dwarf is found bludgeoned to death in a mine, all evidence points to a troll. Commander Vimes of the City Watch must solve this murder before ancient hatreds ignite a war that will tear Ankh-Morpork apart. With his fractured force and assassins closing in, time is running out.', currentCoverIndex: 0, customCoverData: null, includeInCollage: true, cover_ids: [8741453] },
      { key: '/works/OL453989W', isBlank: false, title: 'Wintersmith', author: 'Terry Pratchett', callNumber: '[Call #]', authorDisplay: 'By Terry Pratchett - Fiction Pratchett', description: 'When young witch Tiffany Aching catches the eye of the Spirit of Winter, he becomes obsessed with keeping her in his frozen world forever. Now Tiffany must use her wits and courage to outwit a lovesick immortal and bring spring back to the Discworld.', currentCoverIndex: 0, customCoverData: null, includeInCollage: false, cover_ids: [6398070] },
      { key: 'blank-tour-1', isBlank: true, title: '[Enter Title]', author: '[Enter Author]', callNumber: '[Call #]', authorDisplay: '[Enter Author] - [Call #]', description: '[Enter a brief description here...]', currentCoverIndex: 0, customCoverData: null, includeInCollage: false, cover_ids: [] },
      { key: 'blank-tour-2', isBlank: true, title: '[Enter Title]', author: '[Enter Author]', callNumber: '[Call #]', authorDisplay: '[Enter Author] - [Call #]', description: '[Enter a brief description here...]', currentCoverIndex: 0, customCoverData: null, includeInCollage: false, cover_ids: [] },
    ],
    extraCollageCovers: [],
    ui: {
      stretchCovers: false, stretchBlockCovers: false,
      showQr: true, showBranding: true,
      coverAdvancedMode: false, coverTitle: '',
      coverLineTexts: ['', '', ''],
      collageLayout: 'classic', showShelves: false,
      titleBarPosition: 'classic', tiltDegree: -25, tiltOffsetDirection: 'vertical',
      collageCoverCount: 12,
      qrCodeUrl: '',
      qrCodeText: '',
    },
    // Style values mirror the HTML defaults from index.html so the tour
    // looks the same regardless of what styles the user had loaded before
    // starting it. Without this, applyStyleGroups() early-exits on missing
    // styles and the tour silently inherits whatever was in the DOM. See
    // the `<input>` and `<select>` defaults in index.html for the source
    // of truth on each value.
    styles: {
      title: {
        font: "'Georgia', serif",
        sizePt: 14,
        color: '#000000',
        bold: false,
        italic: false,
        lineSpacing: null,
      },
      author: {
        font: "'Calibri', sans-serif",
        sizePt: 12,
        color: '#000000',
        bold: true,        // index.html: author bold-toggle has 'active'
        italic: false,
        lineSpacing: null,
      },
      desc: {
        font: "'Calibri', sans-serif",
        sizePt: 11,
        color: '#000000',
        bold: false,
        italic: false,
        lineSpacing: null,
      },
      qr: {
        font: "'Calibri', sans-serif",
        sizePt: 12,
        color: '#000000',
        bold: true,        // index.html: qr bold-toggle has 'active'
        italic: false,
        lineSpacing: 1.3,
      },
      coverTitle: {
        outerMarginPt: 10,
        padXPt: 0,
        padYPt: 10,
        sideMarginPt: 0,
        bgColor: '#000000',
        bgGradient: false,
        bgColor2: '#333333',
        simple: {
          font: "'Oswald', sans-serif",
          sizePt: 40,
          color: '#FFFFFF',
          bold: true,      // index.html: cover-bold-toggle has 'active'
          italic: false,
        },
        lines: [
          {
            font: "'Oswald', sans-serif",
            sizePt: 35,
            color: '#FFFFFF',
            bold: true,    // index.html: line-1-bold has 'active'
            italic: false,
            spacingPt: 0,
          },
          {
            font: "'Oswald', sans-serif",
            sizePt: 25,
            color: '#FFFFFF',
            bold: false,
            italic: false,
            spacingPt: 5,
          },
          {
            font: "'Oswald', sans-serif",
            sizePt: 20,
            color: '#FFFFFF',
            bold: false,
            italic: false,
            spacingPt: 5,
          },
        ],
      },
    },
    images: { frontCover: null, frontCoverIsAutoGenerated: false, branding: null },
  };


  /* ----------------------------------------------------------------
     TOUR STATE
     ---------------------------------------------------------------- */
  let currentSectionId = null;
  let currentStepIndex = 0;
  let isFullTour = false;
  let fullTourSectionIndex = 0;
  let preTourFolioHidden = false;
  let isHoverable = false;

  // DOM refs (created once)
  let modalOverlay = null;
  let spotlight = null;
  let panel = null;
  let blocker = null;


  /* ----------------------------------------------------------------
     HELPERS
     ---------------------------------------------------------------- */
  function openSidebarTab(tabId) {
    // Ensure sidebar is expanded
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      const toggleBtn = document.getElementById('toggle-sidebar-btn');
      if (toggleBtn) toggleBtn.classList.add('active');
      // Update Folio position
      const fc = document.getElementById('folio-container');
      if (fc) fc.style.left = '';
    }

    // Directly toggle tab classes (more reliable than simulating clicks)
    const allTabs = document.querySelectorAll('.tab-content');
    const allBtns = document.querySelectorAll('.sidebar-tabs .tab-btn');

    allTabs.forEach(function(t) { t.classList.remove('active'); });
    allBtns.forEach(function(b) {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    allBtns.forEach(function(b) {
      if (b.getAttribute('aria-controls') === tabId) {
        b.classList.add('active');
        b.setAttribute('aria-selected', 'true');
      }
    });
  }

  // Direct offsetTop-based scroll (avoids scrollIntoView which cascades
  // up ancestor scroll containers and can cause layout shifts when
  // scrolling inside a nested scroll parent like .tab-content).
  // Uses getBoundingClientRect so it works regardless of the
  // offsetParent chain.
  function scrollWithin(scrollContainer, target, { center = false } = {}) {
    if (!scrollContainer || !target) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    // Target's absolute offset within the scroll container
    const currentOffset = (targetRect.top - containerRect.top) + scrollContainer.scrollTop;
    let top;
    if (center) {
      top = currentOffset - (scrollContainer.clientHeight / 2) + (target.clientHeight / 2);
    } else {
      top = currentOffset - 10;
    }
    scrollContainer.scrollTop = Math.max(0, top);
  }

  function openSettingsSection(sectionName, subTargetSelector) {
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(function(details) {
      const summary = details.querySelector('summary');
      if (summary && summary.textContent.includes(sectionName)) {
        if (!details.open) details.open = true;
        // Scroll within .tab-content directly (no scrollIntoView)
        setTimeout(function() {
          const tabSettings = document.getElementById('tab-settings');
          if (!tabSettings) return;
          if (subTargetSelector) {
            const sub = details.querySelector(subTargetSelector);
            if (sub) {
              scrollWithin(tabSettings, sub, { center: true });
              return;
            }
          }
          scrollWithin(tabSettings, details);
        }, 100);
      }
    });
  }

  function scrollPreviewTo(elementId, { alignEnd = false } = {}) {
    const el = document.getElementById(elementId);
    const scrollContainer = document.querySelector('.main-content');
    if (!el || !scrollContainer) return;
    // Use getBoundingClientRect so the scroll accounts for CSS zoom
    // on the preview area (fit-to-width on small screens).
    const containerRect = scrollContainer.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (alignEnd) {
      // Scroll so the BOTTOM of the element is near the bottom of
      // the viewport — useful for targets near the foot of a page
      // (e.g. branding uploader at the bottom of print-page-1).
      const elBottom = (elRect.bottom - containerRect.top) + scrollContainer.scrollTop;
      scrollContainer.scrollTo({
        top: Math.max(0, elBottom - scrollContainer.clientHeight + 40),
        behavior: 'instant'
      });
    } else {
      // Scroll so the TOP of the element is near the top of the viewport.
      const elTop = (elRect.top - containerRect.top) + scrollContainer.scrollTop;
      scrollContainer.scrollTo({
        top: Math.max(0, elTop - 20),
        behavior: 'instant'
      });
    }
  }

  // Clear the front cover uploader back to the empty placeholder state
  // (used when navigating backward to "pre-collage" tour steps)
  function clearTourFrontCover() {
    const uploader = document.getElementById('front-cover-uploader');
    if (!uploader) return;
    const img = uploader.querySelector('img');
    if (img) {
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      img.dataset.isPlaceholder = 'true';
      img.dataset.isAutoGenerated = 'false';
    }
    uploader.classList.remove('has-image');
  }

  // Pre-warm cover images from the embedded TOUR_SAMPLE_STATE so
  // they're in the browser cache by the time step 9 loads the sample
  // booklist. Called at tour START (beginTour), giving 8 steps of
  // reading time for the images to arrive. When renderBooklist later
  // creates <img> elements with these URLs, the browser serves them
  // from cache instantly instead of showing white placeholders.
  function preloadTourCovers() {
    if (!TOUR_SAMPLE_STATE || !TOUR_SAMPLE_STATE.books) return;
    TOUR_SAMPLE_STATE.books.forEach(function(book) {
      if (book.cover_ids && book.cover_ids.length > 0) {
        const idx = book.currentCoverIndex || 0;
        const coverId = book.cover_ids[idx];
        if (coverId) {
          const imgL = new Image();
          imgL.src = 'https://covers.openlibrary.org/b/id/' + coverId + '-L.jpg';
          const imgM = new Image();
          imgM.src = 'https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg';
        }
      }
    });
  }

  // Universal backstop: ensure the spotlight target is scrolled into
  // view inside its scroll container (preview or sidebar) before
  // positioning the spotlight overlay.
  function ensureTargetVisible(target) {
    if (!target) return;

    // Preview area
    const mainContent = document.querySelector('.main-content');
    if (mainContent && mainContent.contains(target)) {
      const cRect = mainContent.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      if (tRect.top < cRect.top || tRect.bottom > cRect.bottom) {
        scrollWithin(mainContent, target);
      }
      return;
    }

    // Sidebar tab content
    const tabContent = target.closest('.tab-content');
    if (tabContent) {
      const cRect = tabContent.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      if (tRect.top < cRect.top || tRect.bottom > cRect.bottom) {
        scrollWithin(tabContent, target, { center: true });
      }
    }
  }

  function totalSteps() {
    if (!currentSectionId) return 0;
    if (isFullTour) {
      let total = 0;
      SECTION_ORDER.forEach(function(id) { total += SECTIONS[id].steps.length; });
      return total;
    }
    return SECTIONS[currentSectionId].steps.length;
  }

  function globalStepIndex() {
    if (!isFullTour) return currentStepIndex;
    let idx = 0;
    for (let i = 0; i < fullTourSectionIndex; i++) {
      idx += SECTIONS[SECTION_ORDER[i]].steps.length;
    }
    return idx + currentStepIndex;
  }


  /* ----------------------------------------------------------------
     DOM CREATION (once, on first use)
     ---------------------------------------------------------------- */
  function ensureDOM() {
    if (modalOverlay) return;

    // --- Modal ---
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'tour-modal-overlay';
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) closeModal();
    });

    const modal = document.createElement('div');
    modal.className = 'tour-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'tour-modal-header';
    header.innerHTML =
      '<div>' +
        '<h2><i class="fa-solid fa-cat" style="margin-right:8px;opacity:0.7"></i>Tour with Folio</h2>' +
        '<p>Let Folio walk you through the tool.</p>' +
      '</div>' +
      '<button class="tour-modal-close" aria-label="Close tour menu">&times;</button>';
    header.querySelector('.tour-modal-close').addEventListener('click', closeModal);
    modal.appendChild(header);

    // Full tour button
    const fullBtn = document.createElement('button');
    fullBtn.className = 'tour-full-btn';
    let fullStepCount = 0;
    SECTION_ORDER.forEach(function(id) { fullStepCount += SECTIONS[id].steps.length; });
    fullBtn.innerHTML =
      '<i class="fa-solid fa-play"></i>' +
      'Take the Full Tour' +
      '<span class="btn-meta">' + fullStepCount + ' steps</span>';
    fullBtn.addEventListener('click', function() {
      closeModal();
      startFullTour();
    });
    modal.appendChild(fullBtn);

    // Sections label
    const label = document.createElement('div');
    label.className = 'tour-sections-label';
    label.textContent = 'Or pick a section';
    modal.appendChild(label);

    // Section cards
    const list = document.createElement('div');
    list.className = 'tour-sections-list';
    SECTION_ORDER.forEach(function(id) {
      const section = SECTIONS[id];
      const card = document.createElement('div');
      card.className = 'tour-section-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<div class="tour-section-icon"><i class="' + section.icon + '"></i></div>' +
        '<div class="tour-section-info">' +
          '<h3>' + section.title + '</h3>' +
          '<p>' + section.description + '</p>' +
        '</div>' +
        '<span class="tour-section-steps">' + section.steps.length + ' steps</span>';
      card.addEventListener('click', function() {
        closeModal();
        startSection(id);
      });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          closeModal();
          startSection(id);
        }
      });
      list.appendChild(card);
    });
    modal.appendChild(list);

    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // --- Interaction Blocker ---
    blocker = document.createElement('div');
    blocker.className = 'tour-blocker';
    document.body.appendChild(blocker);

    // --- Spotlight ---
    spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    document.body.appendChild(spotlight);

    // --- Narration Panel ---
    panel = document.createElement('div');
    panel.className = 'tour-panel';

    const panelBody = document.createElement('div');
    panelBody.className = 'tour-panel-body';
    panelBody.innerHTML =
      '<div class="tour-panel-avatar"><i class="fa-solid fa-cat"></i></div>' +
      '<div class="tour-panel-text">' +
        '<div class="tour-panel-section"></div>' +
        '<div class="tour-panel-message"></div>' +
      '</div>';
    panel.appendChild(panelBody);

    const panelNav = document.createElement('div');
    panelNav.className = 'tour-panel-nav';
    panelNav.innerHTML =
      '<button class="tour-nav-btn tour-prev-btn">Back</button>' +
      '<span class="tour-step-counter"></span>' +
      '<button class="tour-nav-btn primary tour-next-btn">Next</button>' +
      '<button class="tour-nav-exit">Exit</button>';
    panelNav.querySelector('.tour-prev-btn').addEventListener('click', prevStep);
    panelNav.querySelector('.tour-next-btn').addEventListener('click', nextStep);
    panelNav.querySelector('.tour-nav-exit').addEventListener('click', exitTour);
    panel.appendChild(panelNav);

    document.body.appendChild(panel);

    // Keyboard
    document.addEventListener('keydown', function(e) {
      if (!currentSectionId) return;
      if (e.key === 'Escape') exitTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
    });
  }


  /* ----------------------------------------------------------------
     MODAL
     ---------------------------------------------------------------- */
  function openModal() {
    ensureDOM();
    modalOverlay.classList.add('visible');
  }

  function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove('visible');
  }


  /* ----------------------------------------------------------------
     TOUR CONTROL
     ---------------------------------------------------------------- */
  function startSection(sectionId) {
    ensureDOM();
    isFullTour = false;
    currentSectionId = sectionId;
    currentStepIndex = 0;
    beginTour();
  }

  function startFullTour() {
    ensureDOM();
    isFullTour = true;
    fullTourSectionIndex = 0;
    currentSectionId = SECTION_ORDER[0];
    currentStepIndex = 0;
    beginTour();
  }

  async function beginTour() {
    // Mark body as tour-active (elevates Folio, suppresses speech bubble)
    document.body.classList.add('tour-active');

    // Save the user's full state and reset to blank (undo/autosave suppressed)
    const success = await BooklistApp.enterTourMode();
    if (!success) {
      document.body.classList.remove('tour-active');
      currentSectionId = null;
      return;
    }

    // Use 100% zoom when the screen is wide enough to show the full
    // page without horizontal overflow. On smaller screens, fit to
    // width so the tour's spotlight targets are visible without
    // horizontal scrolling.
    const contentArea = document.querySelector('.main-content');
    const pageWidth = 11 * 96 + 40; // 11in page + padding
    const hasRoom = contentArea && contentArea.clientWidth >= pageWidth;
    if (hasRoom && BooklistApp.resetZoom) {
      BooklistApp.resetZoom();
    } else if (BooklistApp.fitToWidth) {
      BooklistApp.fitToWidth();
    } else if (BooklistApp.resetZoom) {
      BooklistApp.resetZoom();
    }

    // Pre-warm cover images from the sample state so they're in the
    // browser cache by the time step 9 loads the sample booklist.
    // 8 steps of reading time before step 9 is plenty for the images
    // to arrive from Open Library.
    preloadTourCovers();

    // Reset UI to a known state
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'instant' });

    // Open sidebar on Search tab
    openSidebarTab('tab-search');

    // Clear search field and results for a clean demo
    const searchInput = document.getElementById('keywordInput');
    if (searchInput) {
      searchInput.value = '';
      searchInput.classList.remove('tour-demo-filled');
    }
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.innerHTML = '';

    // Collapse all settings sections, then open Text Styling
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(function(details) { details.open = false; });
    sections.forEach(function(details) {
      const summary = details.querySelector('summary');
      if (summary && summary.textContent.includes('Text Styling')) details.open = true;
    });

    // Scroll settings tab to top
    const tabSettings = document.getElementById('tab-settings');
    if (tabSettings) tabSettings.scrollTop = 0;

    // Force QR code and branding on for the tour so all UI areas are visible
    const qrToggle = document.getElementById('toggle-qr-code');
    const brandingToggle = document.getElementById('toggle-branding');
    if (qrToggle) qrToggle.checked = true;
    if (brandingToggle) brandingToggle.checked = true;
    BooklistApp.updateBackCoverVisibility();

    // Ensure Folio is visible (class-only; don't touch localStorage
    // so the user's saved preference survives the tour)
    const container = document.getElementById('folio-container');
    if (container) {
      preTourFolioHidden = container.classList.contains('folio-hidden');
      if (preTourFolioHidden) {
        container.classList.remove('folio-hidden');
      }
    }
    showCurrentStep();
  }

  function showCurrentStep() {
    const section = SECTIONS[currentSectionId];
    const step = section.steps[currentStepIndex];

    // Run prepare if defined
    if (step.prepare) step.prepare();

    // Small delay for DOM to settle after prepare
    setTimeout(function() {
      const target = step.target ? document.querySelector(step.target) : null;

      // Folio state
      if (window.folio) {
        window.folio.setState(step.state || 'idle');
      }

      // Hide spotlight/panel first so text doesn't change visibly mid-fade
      spotlight.classList.remove('visible');
      panel.classList.remove('visible');

      // Scroll target into view only if step didn't handle its own scrolling via prepare
      if (target && !step.prepare) {
        target.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      }

      // Toggle interaction blocker
      if (step.interactive) {
        blocker.classList.add('interactive');
        blocker.classList.remove('hoverable');
        isHoverable = false;
      } else if (step.hoverable) {
        blocker.classList.add('hoverable');
        blocker.classList.remove('interactive');
        isHoverable = true;
      } else {
        blocker.classList.remove('interactive');
        blocker.classList.remove('hoverable');
        isHoverable = false;
      }

      // Wait for fade-out + scroll to settle, then update text and show
      setTimeout(function() {
        // Update panel content now that it's fully hidden
        const sectionLabel = panel.querySelector('.tour-panel-section');
        const message = panel.querySelector('.tour-panel-message');
        const counter = panel.querySelector('.tour-step-counter');
        const prevBtn = panel.querySelector('.tour-prev-btn');
        const nextBtn = panel.querySelector('.tour-next-btn');

        sectionLabel.textContent = section.title;
        message.textContent = step.text;

        const gIdx = globalStepIndex();
        const total = totalSteps();
        counter.textContent = (gIdx + 1) + ' / ' + total;

        prevBtn.disabled = (gIdx === 0);
        nextBtn.textContent = (gIdx === total - 1) ? 'Finish' : 'Next';

        ensureTargetVisible(target);
        positionSpotlight(target, step.padding);
        positionPanel(target);
        spotlight.classList.add('visible');
        panel.classList.add('visible');
      }, 450);
    }, 150);
  }

  function nextStep() {
    if (!currentSectionId) return;
    const section = SECTIONS[currentSectionId];

    if (currentStepIndex < section.steps.length - 1) {
      currentStepIndex++;
      showCurrentStep();
    } else if (isFullTour && fullTourSectionIndex < SECTION_ORDER.length - 1) {
      // Advance to next section in full tour
      fullTourSectionIndex++;
      currentSectionId = SECTION_ORDER[fullTourSectionIndex];
      currentStepIndex = 0;
      showCurrentStep();
    } else {
      // Tour complete
      exitTour();
    }
  }

  function prevStep() {
    if (!currentSectionId) return;

    if (currentStepIndex > 0) {
      currentStepIndex--;
      showCurrentStep();
    } else if (isFullTour && fullTourSectionIndex > 0) {
      // Go back to previous section's last step
      fullTourSectionIndex--;
      currentSectionId = SECTION_ORDER[fullTourSectionIndex];
      currentStepIndex = SECTIONS[currentSectionId].steps.length - 1;
      showCurrentStep();
    }
  }

  async function exitTour() {
    currentSectionId = null;
    currentStepIndex = 0;
    isFullTour = false;
    fullTourSectionIndex = 0;
    isHoverable = false;

    // Remove tour-active state
    document.body.classList.remove('tour-active');

    // Hide spotlight and panel
    spotlight.classList.remove('visible');
    panel.classList.remove('visible');

    // Restore the user's full pre-tour state (books, settings, undo history)
    await BooklistApp.exitTourMode();

    // Clean up demo search artifacts
    const input = document.getElementById('keywordInput');
    if (input) {
      input.value = '';
      input.classList.remove('tour-demo-filled');
    }
    const results = document.getElementById('results-container');
    if (results) results.innerHTML = '';

    // Reset the settings tab scroll so the next time the user opens
    // Settings they start at the top
    const tabSettings = document.getElementById('tab-settings');
    if (tabSettings) tabSettings.scrollTop = 0;

    // Restore Folio visibility state (class-only; the user's saved
    // preference in localStorage was never touched during the tour)
    if (preTourFolioHidden) {
      const container = document.getElementById('folio-container');
      if (container) {
        container.classList.add('folio-hidden');
      }
    }

    // Return Folio to idle
    if (window.folio) window.folio.setState('idle');
  }


  /* ----------------------------------------------------------------
     POSITIONING
     ---------------------------------------------------------------- */
  function positionSpotlight(target, extraPad) {
    const pad = (extraPad !== undefined) ? extraPad : 8;

    if (!target) {
      spotlight.classList.add('no-target');
      spotlight.style.top = '50%';
      spotlight.style.left = '50%';
      spotlight.style.width = '0';
      spotlight.style.height = '0';
      return;
    }

    spotlight.classList.remove('no-target');
    const rect = target.getBoundingClientRect();
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  function positionPanel(target) {
    // Determine best position for narration panel
    const panelWidth = 340;
    const panelHeight = panel.offsetHeight || 180;
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!target) {
      // Center the panel
      panel.style.top = Math.max(margin, (vh - panelHeight) / 2) + 'px';
      panel.style.left = Math.max(margin, (vw - panelWidth) / 2) + 'px';
      return;
    }

    const rect = target.getBoundingClientRect();
    let top, left;

    // Try below target
    if (rect.bottom + margin + panelHeight < vh) {
      top = rect.bottom + margin;
      left = Math.min(Math.max(margin, rect.left), vw - panelWidth - margin);
    }
    // Try above target
    else if (rect.top - margin - panelHeight > 0) {
      top = rect.top - margin - panelHeight;
      left = Math.min(Math.max(margin, rect.left), vw - panelWidth - margin);
    }
    // Try right of target
    else if (rect.right + margin + panelWidth < vw) {
      top = Math.min(Math.max(margin, rect.top), vh - panelHeight - margin);
      left = rect.right + margin;
    }
    // Try left of target
    else if (rect.left - margin - panelWidth > 0) {
      top = Math.min(Math.max(margin, rect.top), vh - panelHeight - margin);
      left = rect.left - margin - panelWidth;
    }
    // Fallback: bottom center
    else {
      top = vh - panelHeight - margin;
      left = Math.max(margin, (vw - panelWidth) / 2);
    }

    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }


  /* ----------------------------------------------------------------
     INIT
     ---------------------------------------------------------------- */
  function init() {
    // Wire the header tour button
    const tourBtn = document.getElementById('tour-button');
    if (tourBtn) {
      tourBtn.addEventListener('click', openModal);
    }

    // Handle resize during tour
    window.addEventListener('resize', function() {
      if (!currentSectionId) return;
      const section = SECTIONS[currentSectionId];
      const step = section.steps[currentStepIndex];
      const target = step.target ? document.querySelector(step.target) : null;
      positionSpotlight(target, step.padding);
      positionPanel(target);
    });

    // Block clicks (but not hovers) during hoverable steps
    document.addEventListener('click', function(e) {
      if (!isHoverable) return;
      // Allow clicks on tour panel controls
      if (panel && panel.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.tour = { open: openModal };

})();

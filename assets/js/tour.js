/* ==========================================================================
   GUIDED TOUR - Folio narrates
   
   Folio walks users through Booklist Maker in section-based mini-tours.
   A full tour chains all sections in sequence.
   ========================================================================== */

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
          text: "Welcome to Booklist Maker! I'm Folio. This tool creates printable two-page booklists for library displays. Let me show you around.",
          state: 'greeting',
          padding: 4,
        },
        {
          target: '#preview-area',
          text: "This is your live preview. The first page shows the front cover and back page of your list. The second page shows the inner pages with your book entries.",
          state: 'evaluating',
          padding: 4,
        },
        {
          target: '.sidebar',
          text: "The sidebar is your workspace. The Search tab finds books, the Settings tab customizes everything. All your controls live here.",
          state: 'evaluating',
          prepare: function() {
            var sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('collapsed')) {
              document.getElementById('toggle-sidebar-btn')?.click();
            }
          },
          padding: 0,
        },
        {
          target: '.header-actions',
          text: "These are your main controls. Load a saved list, Save your work, Reset to start fresh, and Generate PDF when everything looks right.",
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
          text: "Start here. Type a keyword, title, or author into the search field and hit the Search button. Let me run a quick demo search for you.",
          state: 'searching',
          prepare: function() {
            openSidebarTab('tab-search');
            // Pre-fill and submit a demo search
            var input = document.getElementById('keywordInput');
            if (input && !input.value) {
              input.value = 'Discworld';
              input.classList.add('tour-demo-filled');
              // Auto-click search after a beat
              setTimeout(function() {
                var searchBtn = document.getElementById('fetchButton');
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
        },
        {
          target: '#results-container',
          text: "Click 'Add to List' to drop a book into the next open slot. It'll appear in your preview right away. Let me add one for you.",
          state: 'excited',
          interactive: true,
          prepare: function() {
            openSidebarTab('tab-search');
            setTimeout(function() {
              var addBtn = document.querySelector('#results-container .add-to-list-button:not(.added)');
              if (addBtn) addBtn.click();
            }, 600);
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
          text: "Your books appear on page two in order. Each entry shows the cover, title, author, and description. You can also type directly into these fields to add a book manually if search didn't have it.",
          state: 'evaluating',
          prepare: function() {
            scrollPreviewTo('print-page-2');
          },
          padding: 4,
        },
        {
          target: '#inside-left-panel .list-item:first-child .star-button',
          text: "The star icon marks a book for the front cover collage. Star at least 12 books if you want to auto-generate one.",
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
          text: "The magic wand fetches a book description for you. If a slot is missing a blurb, one click fills it in.",
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
          text: "This is your front cover. You can upload a custom image here, or auto-generate a collage from your starred books.",
          state: 'evaluating',
          prepare: function() {
            scrollPreviewTo('print-page-1');
          },
        },
        {
          target: '#generate-cover-button',
          text: "Click here to generate the collage automatically. You'll need at least 12 starred books with cover images loaded.",
          state: 'excited',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Cover Header');
          },
        },
        {
          target: '#collage-layout-selector',
          text: "Pick a layout for your collage. Hover over each option to get a description of how it arranges the book covers.",
          state: 'evaluating',
          hoverable: true,
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Cover Layout');
          },
        },
        {
          target: '#extended-collage-toggle',
          text: "Flip this on to expand from 12 to 20 covers. Extra cover slots appear below where you can add supplementary images.",
          state: 'evaluating',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Cover Layout');
          },
        },
        {
          target: '#branding-uploader',
          text: "Add your library's logo or branding here. It appears on the back cover, giving the list a polished, official look.",
          state: 'idle',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Back Cover');
            scrollPreviewTo('print-page-1');
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
            var tabSettings = document.getElementById('tab-settings');
            if (tabSettings) tabSettings.scrollTop = 0;
          },
          padding: 0,
        },
        {
          target: '#list-name-input',
          text: "Give your booklist a name. This shows up on the PDF filename when you export, so make it descriptive.",
          state: 'idle',
          prepare: function() {
            var mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
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
          text: "Add a QR code to link patrons to an online booklist, a reading challenge, or any resource you want to highlight. Paste a URL and click Generate. Makes it easy for patrons to visit the link quickly.",
          state: 'idle',
          prepare: function() {
            openSidebarTab('tab-settings');
            openSettingsSection('Back Cover');
            var qr = document.getElementById('qr-code-area');
            var mainContent = document.querySelector('.main-content');
            if (qr && mainContent) {
              qr.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          },
        },
        {
          target: '#qr-code-text',
          text: "This text area is your back cover blurb, next to the QR code. Write a short description, reading prompt, or instructions for patrons.",
          state: 'idle',
          prepare: function() {
            var qrText = document.getElementById('qr-code-text');
            if (qrText) qrText.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          text: "Save your work anytime as a .booklist file. It captures everything: books, covers, settings, styling. You can pick it back up later.",
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
        },
      ]
    }
  };


  /* ----------------------------------------------------------------
     TOUR STATE
     ---------------------------------------------------------------- */
  var currentSectionId = null;
  var currentStepIndex = 0;
  var isFullTour = false;
  var fullTourSectionIndex = 0;
  var preTourFolioHidden = false;
  var isHoverable = false;
  var preTourQrChecked = null;
  var preTourBrandingChecked = null;

  // DOM refs (created once)
  var modalOverlay = null;
  var spotlight = null;
  var panel = null;
  var blocker = null;


  /* ----------------------------------------------------------------
     HELPERS
     ---------------------------------------------------------------- */
  function openSidebarTab(tabId) {
    // Ensure sidebar is expanded
    var sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      var toggleBtn = document.getElementById('toggle-sidebar-btn');
      if (toggleBtn) toggleBtn.classList.add('active');
      // Update Folio position
      var fc = document.getElementById('folio-container');
      if (fc) fc.style.left = '';
    }

    // Directly toggle tab classes (more reliable than simulating clicks)
    var allTabs = document.querySelectorAll('.tab-content');
    var allBtns = document.querySelectorAll('.sidebar-tabs .tab-btn');

    allTabs.forEach(function(t) { t.classList.remove('active'); });
    allBtns.forEach(function(b) {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });

    var targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    allBtns.forEach(function(b) {
      if (b.getAttribute('aria-controls') === tabId) {
        b.classList.add('active');
        b.setAttribute('aria-selected', 'true');
      }
    });
  }

  function openSettingsSection(sectionName) {
    var sections = document.querySelectorAll('.settings-section');
    sections.forEach(function(details) {
      var summary = details.querySelector('summary');
      if (summary && summary.textContent.includes(sectionName)) {
        if (!details.open) details.open = true;
        // Scroll within the settings tab container
        setTimeout(function() {
          var tabSettings = document.getElementById('tab-settings');
          if (tabSettings) {
            var offsetTop = details.offsetTop - tabSettings.offsetTop;
            tabSettings.scrollTop = offsetTop - 10;
          }
        }, 100);
      }
    });
  }

  function scrollPreviewTo(elementId) {
    var el = document.getElementById(elementId);
    var scrollContainer = document.querySelector('.main-content');
    if (el && scrollContainer) {
      // Calculate offset relative to the scroll container
      var offset = 0;
      var node = el;
      while (node && node !== scrollContainer) {
        offset += node.offsetTop;
        node = node.offsetParent;
      }
      scrollContainer.scrollTo({ top: Math.max(0, offset - 20), behavior: 'smooth' });
    }
  }

  function totalSteps() {
    if (!currentSectionId) return 0;
    if (isFullTour) {
      var total = 0;
      SECTION_ORDER.forEach(function(id) { total += SECTIONS[id].steps.length; });
      return total;
    }
    return SECTIONS[currentSectionId].steps.length;
  }

  function globalStepIndex() {
    if (!isFullTour) return currentStepIndex;
    var idx = 0;
    for (var i = 0; i < fullTourSectionIndex; i++) {
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

    var modal = document.createElement('div');
    modal.className = 'tour-modal';

    // Header
    var header = document.createElement('div');
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
    var fullBtn = document.createElement('button');
    fullBtn.className = 'tour-full-btn';
    var fullStepCount = 0;
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
    var label = document.createElement('div');
    label.className = 'tour-sections-label';
    label.textContent = 'Or pick a section';
    modal.appendChild(label);

    // Section cards
    var list = document.createElement('div');
    list.className = 'tour-sections-list';
    SECTION_ORDER.forEach(function(id) {
      var section = SECTIONS[id];
      var card = document.createElement('div');
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

    var panelBody = document.createElement('div');
    panelBody.className = 'tour-panel-body';
    panelBody.innerHTML =
      '<div class="tour-panel-avatar"><i class="fa-solid fa-cat"></i></div>' +
      '<div class="tour-panel-text">' +
        '<div class="tour-panel-section"></div>' +
        '<div class="tour-panel-message"></div>' +
      '</div>';
    panel.appendChild(panelBody);

    var panelNav = document.createElement('div');
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

  function beginTour() {
    // Mark body as tour-active (elevates Folio, suppresses speech bubble)
    document.body.classList.add('tour-active');

    // Reset UI to a known state
    var mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

    // Open sidebar on Search tab
    openSidebarTab('tab-search');

    // Collapse all settings sections, then open Text Styling
    var sections = document.querySelectorAll('.settings-section');
    sections.forEach(function(details) { details.open = false; });
    sections.forEach(function(details) {
      var summary = details.querySelector('summary');
      if (summary && summary.textContent.includes('Text Styling')) details.open = true;
    });

    // Scroll settings tab to top
    var tabSettings = document.getElementById('tab-settings');
    if (tabSettings) tabSettings.scrollTop = 0;

    // Force QR code and branding on for the tour (save original state)
    var qrToggle = document.getElementById('toggle-qr-code');
    var brandingToggle = document.getElementById('toggle-branding');
    if (qrToggle) {
      preTourQrChecked = qrToggle.checked;
      if (!qrToggle.checked) {
        qrToggle.checked = true;
        qrToggle.dispatchEvent(new Event('change'));
      }
    }
    if (brandingToggle) {
      preTourBrandingChecked = brandingToggle.checked;
      if (!brandingToggle.checked) {
        brandingToggle.checked = true;
        brandingToggle.dispatchEvent(new Event('change'));
      }
    }

    // Ensure Folio is visible
    var container = document.getElementById('folio-container');
    if (container) {
      preTourFolioHidden = container.classList.contains('folio-hidden');
      if (preTourFolioHidden) {
        container.classList.remove('folio-hidden');
        try { localStorage.setItem('folio-hidden', 'false'); } catch(_) {}
      }
    }
    showCurrentStep();
  }

  function showCurrentStep() {
    var section = SECTIONS[currentSectionId];
    var step = section.steps[currentStepIndex];

    // Run prepare if defined
    if (step.prepare) step.prepare();

    // Small delay for DOM to settle after prepare
    setTimeout(function() {
      var target = step.target ? document.querySelector(step.target) : null;

      // Folio state
      if (window.folio) {
        window.folio.setState(step.state || 'idle');
      }

      // Panel content (update immediately, position after scroll)
      var sectionLabel = panel.querySelector('.tour-panel-section');
      var message = panel.querySelector('.tour-panel-message');
      var counter = panel.querySelector('.tour-step-counter');
      var prevBtn = panel.querySelector('.tour-prev-btn');
      var nextBtn = panel.querySelector('.tour-next-btn');

      sectionLabel.textContent = section.title;
      message.textContent = step.text;

      var gIdx = globalStepIndex();
      var total = totalSteps();
      counter.textContent = (gIdx + 1) + ' / ' + total;

      prevBtn.disabled = (gIdx === 0);
      nextBtn.textContent = (gIdx === total - 1) ? 'Finish' : 'Next';

      // Scroll target into view only if step didn't handle its own scrolling via prepare
      if (target && !step.prepare) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // Hide spotlight/panel during transition to avoid stale positions
      spotlight.classList.remove('visible');
      panel.classList.remove('visible');

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

      // Wait for scroll to settle before positioning (needs time for sequenced scrolls)
      setTimeout(function() {
        positionSpotlight(target, step.padding);
        positionPanel(target);
        spotlight.classList.add('visible');
        panel.classList.add('visible');
      }, 450);
    }, 150);
  }

  function nextStep() {
    if (!currentSectionId) return;
    var section = SECTIONS[currentSectionId];

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

  function exitTour() {
    currentSectionId = null;
    currentStepIndex = 0;
    isFullTour = false;
    fullTourSectionIndex = 0;
    isHoverable = false;

    // Remove tour-active state
    document.body.classList.remove('tour-active');

    // Clean up demo search text if we filled it
    var input = document.getElementById('keywordInput');
    if (input && input.classList.contains('tour-demo-filled')) {
      input.value = '';
      input.classList.remove('tour-demo-filled');
    }

    // Hide spotlight and panel
    spotlight.classList.remove('visible');
    panel.classList.remove('visible');

    // Restore QR code and branding toggle states
    var qrToggle = document.getElementById('toggle-qr-code');
    var brandingToggle = document.getElementById('toggle-branding');
    if (qrToggle && preTourQrChecked !== null) {
      qrToggle.checked = preTourQrChecked;
      qrToggle.dispatchEvent(new Event('change'));
      preTourQrChecked = null;
    }
    if (brandingToggle && preTourBrandingChecked !== null) {
      brandingToggle.checked = preTourBrandingChecked;
      brandingToggle.dispatchEvent(new Event('change'));
      preTourBrandingChecked = null;
    }

    // Return Folio to idle
    if (window.folio) window.folio.setState('idle');
  }


  /* ----------------------------------------------------------------
     POSITIONING
     ---------------------------------------------------------------- */
  function positionSpotlight(target, extraPad) {
    var pad = (extraPad !== undefined) ? extraPad : 8;

    if (!target) {
      spotlight.classList.add('no-target');
      spotlight.style.top = '50%';
      spotlight.style.left = '50%';
      spotlight.style.width = '0';
      spotlight.style.height = '0';
      return;
    }

    spotlight.classList.remove('no-target');
    var rect = target.getBoundingClientRect();
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  function positionPanel(target) {
    // Determine best position for narration panel
    var panelWidth = 340;
    var panelHeight = panel.offsetHeight || 180;
    var margin = 16;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (!target) {
      // Center the panel
      panel.style.top = Math.max(margin, (vh - panelHeight) / 2) + 'px';
      panel.style.left = Math.max(margin, (vw - panelWidth) / 2) + 'px';
      return;
    }

    var rect = target.getBoundingClientRect();
    var top, left;

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
    var tourBtn = document.getElementById('tour-button');
    if (tourBtn) {
      tourBtn.addEventListener('click', openModal);
    }

    // Handle resize during tour
    window.addEventListener('resize', function() {
      if (!currentSectionId) return;
      var section = SECTIONS[currentSectionId];
      var step = section.steps[currentStepIndex];
      var target = step.target ? document.querySelector(step.target) : null;
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
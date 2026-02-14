/* =============================================================================
   FOLIO MASCOT — INTEGRATION SCRIPT
   Animated SVG cat companion for the Booklist Maker.

   Public API (available after DOM ready):
     window.folio.setState(state, event?)
     window.folio.react(name)
     window.folio.stopWatch()
     window.folio.showBubble(text)
     window.folio.clickFolio()
     window.folio.currentState()
   ============================================================================= */

(function() {
  'use strict';

  /* ----------------------------------------------------------------
     DOM REFERENCES
     ---------------------------------------------------------------- */
  const folioSvg = document.getElementById('folio');
  const bubble = document.getElementById('speechBubble');
  const folioContainer = document.getElementById('folio-container');
  const folioToggle = document.getElementById('folio-toggle');

  // Bail silently if Folio's SVG isn't in the DOM
  if (!folioSvg || !bubble) return;

  let currentState = 'idle';
  let bubbleTimer = null;
  let droopTimer = null;

  /* ----------------------------------------------------------------
     QUIP SYSTEM

     "triggered" lines fire for specific events (deterministic).
     "ambient" lines use a shuffle bag (all play before any repeat).
     ---------------------------------------------------------------- */
  const quips = {
    greeting: {
      triggered: {
        'page-load':      "Ready to build a booklist?",
        'draft-restored': "Welcome back! Your draft is right where you left it.",
        'wake-up':        "I'm awake! I'm awake!",
      },
      ambient: [
        "Hey! What are we making today?",
        "Good morning! Or is it afternoon? I'm a cat.",
        "We need to fill in those slots.",
        "I already have opinions about fonts.",
        "*happy purr*",
        "The printer is probably ready. Probably.",
        "Let's make something good.",
      ]
    },
    idle: {
      triggered: {},
      ambient: [
        "I could sit on this shelf all day.",
        "*adjusts glasses*",
        "Take your time. I'm not going anywhere.",
        "A booklist is a love letter to readers.",
        "*purrs while reviewing layout*",
        "I wonder what patrons will pick up first.",
        "Print is not dead. I'm proof.",
      ]
    },
    searching: {
      triggered: {
        'search-started':  "Let's see what's out there...",
        'results-loading': "Open Library is thinking...",
      },
      ambient: [
        "I know Open Library has it...",
        "Try the ISBN, it's faster.",
        "*sniffs along the search results*",
        "Browse the carousel, better covers might be hiding.",
        "Open Library can be slow, give it a sec.",
        "I love a good search hunt.",
        "There's always something good hiding in here.",
      ]
    },
    excited: {
      triggered: {
        'book-added':       "Great pick!",
        'collage-generated':"The collage just came together perfectly!",
        'pdf-exported':     "PDF is on its way!",
        'save-complete':    "Saved! Your work is safe.",
        'slots-full':       "Every slot filled! Full house!",
      },
      ambient: [
        "THAT is a front cover!",
        "*happy bouncing*",
        "This booklist is going to fly off the rack!",
        "Look at that layout!",
        "Patrons will love this one!",
        "Everything lines up! This is clean!",
        "This is really coming together!",
      ]
    },
    evaluating: {
      triggered: {
        'description-fetching': "Let's see what comes back...",
        'browsing-covers': [
          "Take your time, covers matter.",
          "Ooh, that one has good contrast.",
          "The spine art says a lot about a book.",
          "Keep going, the right cover is in here.",
          "This one would pop on the collage.",
          "I'm partial to bold colors, personally.",
        ],
        'comparing-layouts': [
          "They're all good... but which is best?",
          "Classic is safe. Tilted is fun. Your call.",
          "Try them all. I'll wait.",
          "*squints at the grid spacing*",
          "A good layout can make or break the list.",
          "Trust your gut on this one.",
          "The right layout makes the covers sing.",
        ],
        'font-previewing': [
          "Ooh, try the next one too.",
          "Serif or sans? The eternal question.",
          "That one's clean. Very readable.",
          "Bold move. Literally.",
          "I have opinions about kerning. Don't test me.",
          "Fonts set the mood before a single word is read.",
        ],
      },
      ambient: [
        "Hmm. Hmm. Hmmmmm.",
        "*peers over glasses*",
        "I go back and forth on these things.",
        "Sometimes you just have to sit with it.",
        "Trust the process.",
        "*chin on paw, deep in thought*",
        "Interesting. Very interesting.",
      ]
    },
    sleeping: {
      triggered: {
        'inactivity': "zzz... five more minutes... zzz...",
      },
      ambient: [
        "zzz... perfect kerning... zzz...",
        "zzz... no paper jams... zzz...",
        "*soft purring*",
        "zzz... patrons read the QR code... zzz...",
        "zzz... the fold lines up... zzz...",
        "zzz... unlimited color ink... zzz...",
        "*dream twitches*",
      ]
    },
    worried: {
      triggered: {
        'search-empty':  "Nothing came back... try different keywords?",
        'network-error': "Something's wrong with the connection...",
        'fetch-failed':  "The description didn't come through...",
        'covers-needed': "We need more starred covers for the collage...",
      },
      ambient: [
        "Is the wifi ok? Asking for a friend.",
        "*nervous tail twitch*",
        "Deep breaths. We'll figure it out.",
        "It's fine. Everything is fine.",
        "Technical difficulties make my fur stand up.",
        "I've seen this before. It usually resolves.",
        "I don't like when things go quiet...",
      ]
    }
  };

  /* ----------------------------------------------------------------
     SHUFFLE BAG: Cycles through all ambient quips before repeating.
     Prevents same line twice in a row, even across bag refills.
     ---------------------------------------------------------------- */
  const bags = {};

  function pickAmbient(state) {
    const pool = quips[state]?.ambient;
    if (!pool || pool.length === 0) return null;

    if (!bags[state] || bags[state].remaining.length === 0) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      if (bags[state] && shuffled[0] === bags[state].last) {
        const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
      }
      bags[state] = { remaining: shuffled, last: null };
    }

    const quip = bags[state].remaining.shift();
    bags[state].last = quip;
    return quip;
  }

  /* ----------------------------------------------------------------
     REUSABLE SHUFFLE BAG for click escalation pools.
     ---------------------------------------------------------------- */
  function createShuffleBag(pool) {
    let remaining = [];
    let last = null;

    function refill() {
      remaining = [...pool].sort(() => Math.random() - 0.5);
      if (last && remaining[0] === last) {
        const swapIdx = 1 + Math.floor(Math.random() * (remaining.length - 1));
        [remaining[0], remaining[swapIdx]] = [remaining[swapIdx], remaining[0]];
      }
    }

    return {
      next() {
        if (remaining.length === 0) refill();
        last = remaining.shift();
        return last;
      }
    };
  }

  /* ----------------------------------------------------------------
     STATE MACHINE

     setState(state, event?)
       Changes Folio's full-body animation.
       With event: shows triggered quip.
       Without event: shows random ambient quip.
     ---------------------------------------------------------------- */
  function setState(state, event) {
    const tail = document.getElementById('tail');
    const booksLeft = document.getElementById('books-left');
    const body = document.getElementById('body');

    // Clear sleep tail classes on any state change
    folioSvg.classList.remove('tail-droop', 'tail-sleeping');
    clearTimeout(droopTimer);

    if (state === 'sleeping') {
      // Move tail behind books (SVG paints in document order)
      booksLeft.parentNode.insertBefore(tail, booksLeft);
    } else if (tail.nextElementSibling === booksLeft) {
      // Tail currently behind books; move it back in front
      body.parentNode.insertBefore(tail, body);
    }

    // Set base state class (replaces all classes on SVG root)
    folioSvg.className.baseVal = state;
    currentState = state;

    // Add droop classes after baseVal is set so they persist
    if (state === 'sleeping') {
      requestAnimationFrame(() => {
        folioSvg.classList.add('tail-droop');
        droopTimer = setTimeout(() => {
          folioSvg.classList.add('tail-sleeping');
        }, 2500);
      });
    }

    // Pick quip: triggered if event matches, otherwise ambient.
    // Triggered values can be a string (single line) or array (rotating pool).
    let line = null;
    const triggered = event && quips[state]?.triggered[event];
    if (triggered) {
      if (Array.isArray(triggered)) {
        line = pickTriggered(state, event);
      } else {
        line = triggered;
      }
    } else {
      line = pickAmbient(state);
    }
    if (line) showBubble(line);
  }

  /* ----------------------------------------------------------------
     TRIGGERED SHUFFLE BAG: Same anti-repeat logic as ambient,
     for triggered events that have an array of rotating lines.
     ---------------------------------------------------------------- */
  const triggeredBags = {};

  function pickTriggered(state, event) {
    const pool = quips[state]?.triggered[event];
    if (!pool || !Array.isArray(pool) || pool.length === 0) return null;

    const key = state + ':' + event;
    if (!triggeredBags[key] || triggeredBags[key].remaining.length === 0) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      if (triggeredBags[key] && shuffled[0] === triggeredBags[key].last) {
        const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
      }
      triggeredBags[key] = { remaining: shuffled, last: null };
    }

    const quip = triggeredBags[key].remaining.shift();
    triggeredBags[key].last = quip;
    return quip;
  }

  /* ----------------------------------------------------------------
     CLICK INTERACTION: Playful escalation system.
     ---------------------------------------------------------------- */
  let clickTimestamps = [];
  let clickResetTimer = null;

  const pesteredQuips = [
    "I'm right here, you know.",
    "Yes? Yes? What.",
    "You're going to wear out my pixels.",
    "That tickles. Stop.",
    "I am not a button.",
    "This is not what my animation degree was for.",
    "Ok. Ok. I see you.",
  ];
  const pesteredBag = createShuffleBag(pesteredQuips);

  const annoyedQuips = [
    "Hey! Still reading here.",
    "One click is enough, I promise.",
    "Ears are up. What do you need?",
    "Alright, alright, you have my attention.",
    "I heard you the first time!",
  ];
  const annoyedBag = createShuffleBag(annoyedQuips);

  function clickFolio() {
    const now = Date.now();

    // Sleeping: bypass escalation, trigger full wake sequence
    if (currentState === 'sleeping') {
      react('startle');
      setTimeout(() => setState('greeting', 'wake-up'), 800);
      setTimeout(() => setState('idle'), 4000);
      return;
    }

    // Track click timing
    clickTimestamps.push(now);
    clearTimeout(clickResetTimer);
    clickResetTimer = setTimeout(() => { clickTimestamps = []; }, 3000);

    // Count recent rapid clicks (within last 1.5s)
    const recent = clickTimestamps.filter(t => now - t < 1500);
    clickTimestamps = recent;

    if (recent.length >= 4) {
      // Persistent: exasperated, no physical reaction
      showBubble(pesteredBag.next());
    } else if (recent.length >= 2) {
      // Rapid: perk + mildly annoyed
      react('perk');
      showBubble(annoyedBag.next());
    } else {
      // Single: nod + ambient quip
      react('nod');
      const quip = pickAmbient(currentState);
      if (quip) showBubble(quip);
    }
  }

  // Bind click handler (replaces inline onclick on SVG)
  folioSvg.addEventListener('click', clickFolio);

  /* ----------------------------------------------------------------
     SPEECH BUBBLE: Pop in, hold, shrink out.
     ---------------------------------------------------------------- */
  function showBubble(text) {
    clearTimeout(bubbleTimer);
    bubble.className = 'speech-bubble';
    bubble.textContent = text;
    void bubble.offsetWidth;
    bubble.classList.add('visible');
    bubbleTimer = setTimeout(() => {
      bubble.classList.remove('visible');
      bubble.classList.add('hiding');
      setTimeout(() => { bubble.className = 'speech-bubble'; }, 250);
    }, 3200);
  }

  /* ----------------------------------------------------------------
     MICRO-REACTION SYSTEM

     react(name) adds a .react-{name} class to the SVG. CSS uses
     !important to temporarily override state animations. After the
     animation duration, the class is removed and the state animation
     resumes seamlessly.

     'watch' is special: continuous, ended with stopWatch().
     ---------------------------------------------------------------- */
  const reactionDurations = {
    nod: 600,
    perk: 700,
    wince: 500,
    yawn: 2500,
    startle: 800,
    satisfied: 1500,
  };

  let reactTimer = null;
  let watchHandler = null;

  function react(name) {
    clearTimeout(reactTimer);
    clearReaction();

    if (name === 'watch') {
      startWatch();
      return;
    }

    // Startle: clear sleep droop so the CSS animation can take over
    if (name === 'startle') {
      folioSvg.classList.remove('tail-droop', 'tail-sleeping');
      clearTimeout(droopTimer);
    }

    const duration = reactionDurations[name];
    if (!duration) return;

    folioSvg.classList.add('react-' + name);

    reactTimer = setTimeout(() => {
      folioSvg.classList.remove('react-' + name);

      // Startle complete: tail is upright, move it in front of books
      if (name === 'startle') {
        const tail = document.getElementById('tail');
        const booksLeft = document.getElementById('books-left');
        const body = document.getElementById('body');
        if (tail.nextElementSibling === booksLeft) {
          body.parentNode.insertBefore(tail, body);
        }
      }
    }, duration);
  }

  function clearReaction() {
    Object.keys(reactionDurations).forEach(name => {
      folioSvg.classList.remove('react-' + name);
    });
    folioSvg.classList.remove('react-watch');
    if (watchHandler) stopWatch();
  }

  /* ----------------------------------------------------------------
     WATCH: Continuous head tracking during drag operations.
     ---------------------------------------------------------------- */
  function startWatch() {
    folioSvg.classList.add('react-watch');
    folioSvg.style.setProperty('--watch-x', '0');

    const folioRect = folioSvg.getBoundingClientRect();
    const centerX = folioRect.left + folioRect.width / 2;

    watchHandler = function(e) {
      const dx = (e.clientX - centerX) / (folioRect.width / 2);
      const clamped = Math.max(-3, Math.min(3, dx * 3));
      folioSvg.style.setProperty('--watch-x', clamped.toFixed(2));
    };

    document.addEventListener('mousemove', watchHandler);
  }

  function stopWatch() {
    folioSvg.classList.remove('react-watch');
    folioSvg.style.removeProperty('--watch-x');
    if (watchHandler) {
      document.removeEventListener('mousemove', watchHandler);
      watchHandler = null;
    }
  }

  /* ----------------------------------------------------------------
     TOGGLE: Show/hide Folio with localStorage persistence.
     ---------------------------------------------------------------- */
  function initToggle() {
    if (!folioContainer || !folioToggle) return;

    const hidden = localStorage.getItem('folio-hidden') === 'true';
    if (hidden) folioContainer.classList.add('folio-hidden');

    folioToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      folioContainer.classList.toggle('folio-hidden');
      const isHidden = folioContainer.classList.contains('folio-hidden');
      localStorage.setItem('folio-hidden', isHidden);
    });
  }

  /* ----------------------------------------------------------------
     INACTIVITY TIMER

     90s of no interaction: yawn (pre-sleep warning)
     90s more: full sleep
     Any interaction during sleep: startle > greeting > idle
     ---------------------------------------------------------------- */
  let inactivityTimer = null;
  let yawnFired = false;

  function resetInactivity() {
    clearTimeout(inactivityTimer);
    yawnFired = false;

    // If waking from sleep, trigger the wake sequence
    if (currentState === 'sleeping') {
      react('startle');
      setTimeout(() => setState('greeting', 'wake-up'), 800);
      setTimeout(() => setState('idle'), 4000);
      return;
    }

    // Start the inactivity countdown
    inactivityTimer = setTimeout(() => {
      react('yawn');
      yawnFired = true;

      inactivityTimer = setTimeout(() => {
        setState('sleeping', 'inactivity');
      }, 90000); // Another 90s after yawn
    }, 90000);   // First yawn at 90s
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(evt) {
    document.addEventListener(evt, resetInactivity);
  });

  /* ----------------------------------------------------------------
     INITIALIZATION
     ---------------------------------------------------------------- */
  initToggle();
  resetInactivity();

  /* ----------------------------------------------------------------
     EXPOSE PUBLIC API
     ---------------------------------------------------------------- */
  window.folio = {
    setState: setState,
    react: react,
    stopWatch: stopWatch,
    showBubble: showBubble,
    clickFolio: clickFolio,
    currentState: function() { return currentState; }
  };

})();
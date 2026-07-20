/* =============================================================================
   FOLIO MASCOT — INTEGRATION SCRIPT
   Animated SVG cat companion for Booklister.

   Public API (available after DOM ready):
     window.folio.setState(state, event?)
     window.folio.react(name)
     window.folio.celebrate(opts)
     window.folio.guard(duration)
     window.folio.stopWatch()
     window.folio.showBubble(text)
     window.folio.clickFolio()
     window.folio.currentState()
     window.folio.setContextProvider(fn)
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

  // Bubble pacing: bubbles must be visible for at least MIN_VISIBLE_MS
  // before another can replace them. New bubbles arriving inside that
  // window are deferred (only the most recent deferred text fires, so
  // rapid hovers/cascades collapse to the last quip rather than
  // flickering through several). A pending defer is tracked here so
  // a fresh showBubble can replace it.
  const MIN_VISIBLE_MS = 1500;
  let bubbleStartTime = 0;
  let pendingBubbleTimer = null;
  let pendingBubbleText = null;

  // Bubble hold time scales with text length so short quips don't
  // linger and long ones aren't yanked away mid-read.
  const BUBBLE_MIN_HOLD_MS = 3200;
  const BUBBLE_MAX_HOLD_MS = 6500;
  const BUBBLE_MS_PER_CHAR = 55;

  // Live media query: when the user prefers reduced motion, the CSS
  // freezes all animations (see the block at the end of folio.css) and
  // the JS skips scheduling invisible motion (fidgets, hearts).
  const reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function folioIsHidden() {
    return !!(folioContainer && folioContainer.classList.contains('folio-hidden'));
  }

  /* ----------------------------------------------------------------
     QUIP SYSTEM

     "triggered" lines fire for specific events (deterministic).
     "ambient" lines use a shuffle bag (all play before any repeat).
     ---------------------------------------------------------------- */
  const quips = {
    greeting: {
      triggered: {
        'page-load':      "Ready to build a booklist?",
        'draft-restored': "Welcome back! Ready to keep working on your list?",
        'file-loaded':    "Ooh, let's see what we're working with.",
        'wake-up':        "I'm awake! I'm awake!",
        'toggled-on':     "Hi! I'm Folio. Need a paw with that list?",
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
        'book-added': [
          "Great pick!",
          "Good one.",
          "Ooh, that one.",
          "Onto the list it goes.",
          "Nice choice.",
          "I'd read that.",
          "*nods approvingly*",
        ],
        'quick-add-single': [
          "Typed it in yourself, even better.",
          "Direct add. I like efficiency.",
          "Quick and clean.",
          "Skipping the search, I see. Bold.",
          "*nods at the manual entry*",
        ],
        'quick-add-multi': [
          "Whoa, that's a stack!",
          "A whole batch at once. Productive.",
          "*purrs at the spreadsheet energy*",
          "Look at all these new arrivals.",
          "Now we're cooking.",
        ],
        'cover-uploaded': [
          "Looking good!",
          "Oh, that's a nice cover.",
          "Sharp. Very sharp.",
          "That one's going to catch some eyes.",
          "Good image quality too. Nice.",
          "I approve. Carry on.",
          "*nods approvingly*",
        ],
        'collage-generated':"The collage just came together perfectly!",
        'collage-ready': [
          "That's enough starred covers — the collage is unlocked!",
          "Cover quota reached! Time to generate that collage.",
          "All the stars are in. Let's see that collage!",
        ],
        'pdf-exported':     "PDF is on its way!",
        'save-complete': [
          "Saved! Your work is safe.",
          "Tucked away. Nice and tidy.",
          "Backed up. One less thing to worry about.",
          "Safe and sound.",
          "*contented blink*",
          "Good habit. Save early, save often.",
          "Filed away for next time.",
        ],
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
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const bags = {};

  function pickAmbient(state) {
    const pool = quips[state]?.ambient;
    if (!pool || pool.length === 0) return null;

    if (!bags[state] || bags[state].remaining.length === 0) {
      const shuffled = shuffleArray([...pool]);
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
      remaining = shuffleArray([...pool]);
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

     guard(duration)
       Suppresses all setState and react calls except greetings
       for the given duration. Used during file/draft loads to
       prevent cascading hooks from stomping the greeting.
     ---------------------------------------------------------------- */
  let guardTimer = null;
  let isGuarded = false;

  function guard(duration) {
    isGuarded = true;
    clearTimeout(guardTimer);
    guardTimer = setTimeout(() => { isGuarded = false; }, duration);
  }

  /* Tail z-order helpers. SVG paints in document order, so the tail is
     physically moved in the DOM: behind the books while sleeping (it
     curls around the body), back in front of the body when awake. */
  function tailBehindBooks() {
    const tail = document.getElementById('tail');
    const booksLeft = document.getElementById('books-left');
    if (tail && booksLeft) booksLeft.parentNode.insertBefore(tail, booksLeft);
  }

  function tailInFront() {
    const tail = document.getElementById('tail');
    const booksLeft = document.getElementById('books-left');
    const body = document.getElementById('body');
    if (tail && body && tail.nextElementSibling === booksLeft) {
      body.parentNode.insertBefore(tail, body);
    }
  }

  function setState(state, event) {
    // While guarded, only greetings get through
    if (isGuarded && state !== 'greeting') return;

    // Clear sleep tail classes on any state change
    folioSvg.classList.remove('tail-droop', 'tail-sleeping');
    clearTimeout(droopTimer);

    if (state === 'sleeping') {
      tailBehindBooks();
    } else {
      tailInFront();
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

    // Pick quip: triggered ONLY when an event is supplied.
    //
    // setState calls without an event are "transition home" calls
    // (e.g. setState('idle') after an action completes, or a hover
    // mouseleave). Those used to fall through to pickAmbient and
    // fire a random ambient bubble immediately after the action's
    // triggered bubble — the source of the rushed back-to-back
    // bubble effect. We now stay silent on bare transitions and let
    // the click-to-pet path remain the only on-demand ambient
    // trigger. Triggered values can be a string (single line) or an
    // array (rotating pool, shuffle-bagged).
    if (!event) return;

    // Memory overrides: a handful of events get a personalized line
    // (visit memory, time of day, first-ever title) before falling
    // through to the standard triggered pools.
    let line = buildMemoryLine(state, event);

    if (!line) {
      const triggered = quips[state]?.triggered[event];
      if (!triggered) return;
      line = Array.isArray(triggered)
        ? pickTriggered(state, event)
        : triggered;
    }
    if (line) showBubble(line);
  }

  /* ----------------------------------------------------------------
     CELEBRATE: One-shot helper for the very common pattern of
     "react + transition to a state with a triggered quip + return
     to idle after a beat." Replaces ~14 hand-rolled triples in
     app.js that each set their own setTimeout chain.

     Single rolling return timer means a NEW celebrate cancels the
     previous one's pending return-to-idle, so back-to-back actions
     don't have an old timer firing into the middle of the next
     celebration.

     Options (all optional):
       reaction      micro-reaction name fired immediately ('nod', 'wince', etc.)
       state         state to transition into (default 'excited')
       event         triggered event name for the bubble quip
       reactionDelay ms before the state change fires (default 300 if a
                     reaction was given; 0 otherwise — matches the
                     existing call patterns where the nod/wince
                     animation gets a head-start before the bubble)
       returnAfter   ms after the celebrate call before snapping back
                     to idle (default 4000). Pass 0/null to skip the
                     auto-return (e.g. for evaluating-while-awaiting
                     where the caller manages the return itself).
     ---------------------------------------------------------------- */
  let celebrateReturnTimer = null;

  function celebrate(opts) {
    opts = opts || {};
    const reaction = opts.reaction || null;
    const state = opts.state || 'excited';
    const event = opts.event || null;
    const reactionDelay = (typeof opts.reactionDelay === 'number')
      ? opts.reactionDelay
      : (reaction ? 300 : 0);
    const returnAfter = (typeof opts.returnAfter === 'number')
      ? opts.returnAfter
      : 4000;

    // Cancel any prior celebration's return-to-idle so it can't fire
    // mid-display of the new celebration. setTimeout with a falsy
    // handle is a no-op, so this is safe on the first call too.
    clearTimeout(celebrateReturnTimer);
    celebrateReturnTimer = null;

    if (reaction) react(reaction);

    if (reactionDelay > 0) {
      setTimeout(() => setState(state, event), reactionDelay);
    } else {
      setState(state, event);
    }

    if (returnAfter && returnAfter > 0) {
      celebrateReturnTimer = setTimeout(() => {
        celebrateReturnTimer = null;
        setState('idle');
      }, returnAfter);
    }
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
      const shuffled = shuffleArray([...pool]);
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
     CONTEXT AWARENESS

     app.js registers a provider via window.folio.setContextProvider()
     that returns live facts about the booklist:
       { bookCount, maxBooks, starredCovers, requiredCovers, listName }
     Folio never reaches into the app's state himself — the provider
     is the one-way window through the IIFE boundary, same spirit as
     the window.* globals the Firebase layer uses.

     Context quips fire on the click-to-pet path (the one place the
     user explicitly solicits him), mixed with the ambient pool. Each
     rule returns a line or null; eligible lines are picked at random.
     ---------------------------------------------------------------- */
  let contextProvider = null;

  function setContextProvider(fn) {
    contextProvider = (typeof fn === 'function') ? fn : null;
  }

  function getContext() {
    if (!contextProvider) return null;
    try { return contextProvider() || null; } catch { return null; }
  }

  const contextQuips = [
    (ctx) => ctx.bookCount === 0
      ? "Empty list. My favorite part — anything could go on it."
      : null,
    (ctx) => ctx.bookCount === 1
      ? "One title down. A list of one is just a recommendation."
      : null,
    (ctx) => {
      const left = ctx.maxBooks - ctx.bookCount;
      return (ctx.bookCount >= 2 && left >= 1 && left <= 3)
        ? `Only ${left} ${left === 1 ? 'slot' : 'slots'} left. Choose wisely.`
        : null;
    },
    (ctx) => (ctx.bookCount > 0 && ctx.bookCount === ctx.maxBooks)
      ? "Every slot filled. Now we're just polishing."
      : null,
    (ctx) => {
      const left = ctx.requiredCovers - ctx.starredCovers;
      return left === 1
        ? "One more starred cover and the collage is ready."
        : null;
    },
    (ctx) => {
      const left = ctx.requiredCovers - ctx.starredCovers;
      return (ctx.bookCount > 0 && left >= 2 && left <= 4)
        ? `${left} more starred covers and we can make a collage.`
        : null;
    },
    (ctx) => (ctx.listName && ctx.listName.length <= 30)
      ? `"${ctx.listName}" — good theme. I'd browse that shelf.`
      : null,
  ];

  let lastContextQuip = null;

  function pickContextQuip() {
    const ctx = getContext();
    if (!ctx) return null;
    const candidates = [];
    contextQuips.forEach((rule) => {
      try {
        const quip = rule(ctx);
        if (quip && quip !== lastContextQuip) candidates.push(quip);
      } catch { /* a bad rule never breaks the cat */ }
    });
    if (candidates.length === 0) return null;
    lastContextQuip = candidates[Math.floor(Math.random() * candidates.length)];
    return lastContextQuip;
  }

  /* ----------------------------------------------------------------
     MEMORY

     Light localStorage persistence (same key convention as
     'folio-hidden'). Tracks visit count, last-visit time, and whether
     the first-ever title has been celebrated. Only ticks when Folio
     is actually visible — an invisible cat doesn't collect memories.
     ---------------------------------------------------------------- */
  const LS_VISITS = 'folio-visits';
  const LS_LAST_VISIT = 'folio-last-visit';
  const LS_FIRST_BOOK = 'folio-first-book-seen';

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private browsing */ }
  }

  let visitMemory = null; // recorded once per session, at first greeting

  function recordVisit() {
    if (visitMemory) return visitMemory;
    const visits = (parseInt(lsGet(LS_VISITS), 10) || 0) + 1;
    const lastRaw = parseInt(lsGet(LS_LAST_VISIT), 10);
    const daysSince = lastRaw ? (Date.now() - lastRaw) / 86400000 : null;
    lsSet(LS_VISITS, String(visits));
    lsSet(LS_LAST_VISIT, String(Date.now()));
    visitMemory = { visits, daysSince };
    return visitMemory;
  }

  /* Personalized line for select events, or null to use the standard
     pools. Greeting events get visit memory + time-of-day flavor;
     the first-ever book added gets a one-time milestone line. */
  function buildMemoryLine(state, event) {
    if (folioIsHidden()) return null;

    if (state === 'greeting' && (event === 'page-load' || event === 'draft-restored')) {
      const mem = recordVisit();

      if (mem.daysSince !== null && mem.daysSince >= 14) {
        return "It's been a while! I kept the shelf warm for you.";
      }
      if (mem.visits === 10) return "Visit number ten. I should get you a punch card.";
      if (mem.visits === 25) return "Twenty-five visits. You're basically staff.";

      // Time-of-day flavor ~60% of the time so the standard greetings
      // still rotate through. Afternoon uses the standard lines.
      const hour = new Date().getHours();
      const tod = (hour < 5) ? "Up late? The best lists happen after hours."
        : (hour < 12) ? "Good morning! The shelf and I are ready."
        : (hour < 17) ? null
        : (hour < 22) ? "Evening shift? Let's make it a good one."
        : "Up late? The best lists happen after hours.";
      if (tod && Math.random() < 0.6) return tod;
      return null;
    }

    if (state === 'excited' && event === 'book-added' && !lsGet(LS_FIRST_BOOK)) {
      lsSet(LS_FIRST_BOOK, '1');
      // Only celebrate "first title" when the list really has one title.
      // A veteran who toggles Folio on mid-list burns the flag silently
      // (they're clearly not new; the line would read as a mistake).
      const ctx = getContext();
      if (!ctx || ctx.bookCount <= 1) {
        return "Your first title on the list! Off to a great start.";
      }
      return null;
    }

    return null;
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
      wakeUp();
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
      // Persistent: exhausted flatten + exasperated quip. Re-triggering
      // on every spam click keeps him slumped (same-class re-add
      // doesn't restart the CSS animation) rather than jittering.
      react('flatten');
      showBubble(pesteredBag.next());
    } else if (recent.length >= 2) {
      // Rapid: perk + mildly annoyed
      react('perk');
      showBubble(annoyedBag.next());
    } else {
      // Single: tactile squish (a poke deserves a physical response,
      // not a polite nod) + a quip. When the context provider has
      // something relevant to say about the actual booklist, prefer
      // it ~60% of the time so he feels like he's been paying
      // attention; the ambient pool covers the rest (and any context
      // gap).
      react('squish');
      const quip = (Math.random() < 0.6 ? pickContextQuip() : null)
        || pickAmbient(currentState);
      if (quip) showBubble(quip);
    }
  }

  // Bind click handler (replaces inline onclick on SVG)
  folioSvg.addEventListener('click', clickFolio);

  /* ----------------------------------------------------------------
     PETTING: Rub back and forth over the cat to pet him.

     A "stroke" is sustained horizontal pointer travel in one
     direction (>= PET_STROKE_MIN_PX); it's counted when the direction
     reverses. Three counted strokes inside a 2s window — i.e. a
     deliberate back-and-forth rub, not a pass-over — triggers the
     satisfied slow-blink, a floating heart, and a purr quip.
     Accumulating extent per direction (rather than per-event deltas)
     makes slow, gentle strokes register too. Pointer events cover
     touch: after a touchstart on the SVG the pointer is implicitly
     captured, so finger-rubs deliver pointermove here (and the CSS
     sets touch-action: pan-y on #folio so horizontal rubs aren't
     swallowed by the scroll gesture handler).
     ---------------------------------------------------------------- */
  const PET_STROKE_MIN_PX = 15;
  const PET_STROKES_NEEDED = 3;
  const PET_WINDOW_MS = 2000;
  const PET_COOLDOWN_MS = 8000;

  const purrQuips = [
    "*purrrrrr*",
    "*leans into it*",
    "Right behind the ear. Yes. There.",
    "*purring intensifies*",
    "Okay, that's the spot.",
    "*happy rumble*",
    "I suppose you may continue.",
  ];
  const purrBag = createShuffleBag(purrQuips);

  // When a rub lands while he's mid-sentence, the bubble is cut off
  // and he reacts to being petted mid-thought. He deliberately does
  // NOT resume the old line afterwards — losing the train of thought
  // is the joke, and several lines lampshade it.
  const petInterruptQuips = [
    "—mmh. Where was I? *purr*",
    "I was saying something, but this is better.",
    "—oh. Oh, that's the spot.",
    "Hm? Lost my train of thought. *purrr*",
    "...it'll come back to me. *purr*",
  ];
  const petInterruptBag = createShuffleBag(petInterruptQuips);

  let petLastX = null;
  let petDir = 0;
  let petExtent = 0;
  let petStrokes = [];
  let lastPetAt = 0;

  function resetPetTracking() {
    petLastX = null;
    petDir = 0;
    petExtent = 0;
  }

  function handlePetMove(e) {
    if (folioIsHidden()) return;
    if (petLastX === null) { petLastX = e.clientX; return; }
    const dx = e.clientX - petLastX;
    petLastX = e.clientX;
    if (dx === 0) return;

    const dir = dx > 0 ? 1 : -1;
    if (dir === petDir) {
      petExtent += Math.abs(dx);
      return;
    }

    // Direction reversal: count the stroke that just ended (if it was
    // a real stroke and not jitter), then start tracking the new one.
    if (petDir !== 0 && petExtent >= PET_STROKE_MIN_PX) {
      const now = Date.now();
      petStrokes.push(now);
      petStrokes = petStrokes.filter(t => now - t < PET_WINDOW_MS);
      if (petStrokes.length >= PET_STROKES_NEEDED && now - lastPetAt >= PET_COOLDOWN_MS) {
        lastPetAt = now;
        petStrokes = [];
        triggerPet();
      }
    }
    petDir = dir;
    petExtent = Math.abs(dx);
  }

  function triggerPet() {
    // No petting during guarded restores, drag-watching, or the wake
    // sequence (the document-level mousemove listener wakes a sleeping
    // cat before a rub could ever land on one).
    if (isGuarded || watchHandler || isWaking) return;
    // Was he mid-sentence? Then the rub interrupts: the bubble is
    // replaced immediately (a deliberate physical act outranks the
    // pacing queue) with an interrupted-thought line.
    const wasTalking = bubble.classList.contains('visible');
    react('satisfied');
    spawnHeart();
    setTimeout(spawnHeart, 280);
    interruptBubble(wasTalking ? petInterruptBag.next() : purrBag.next());
  }

  function spawnHeart() {
    if (reducedMotion.matches || folioIsHidden()) return;
    const scene = document.getElementById('folio-scene');
    if (!scene) return;
    const heart = document.createElement('div');
    heart.className = 'folio-heart';
    heart.textContent = '♥';
    heart.style.left = (40 + Math.random() * 20) + '%';
    scene.appendChild(heart);
    setTimeout(() => heart.remove(), 1400);
  }

  folioSvg.addEventListener('pointermove', handlePetMove);
  folioSvg.addEventListener('pointerleave', resetPetTracking);
  folioSvg.addEventListener('pointerdown', resetPetTracking);

  /* ----------------------------------------------------------------
     SPEECH BUBBLE: Pop in, hold, shrink out.

     Pacing rule: a new bubble cannot replace a current one until the
     current one has been visible for MIN_VISIBLE_MS. Inside that
     window the new text is deferred and any prior pending text is
     dropped, so a burst of rapid setState calls (hover spam, fast
     async returns) collapses to the latest single quip rather than
     flashing through every one.
     ---------------------------------------------------------------- */
  function showBubble(text) {
    if (!text) return;
    // No bubbles while Folio is hidden: the scene is invisible, and a
    // text swap would still hit the aria-live region — screen reader
    // announcements from a cat that isn't there.
    if (folioIsHidden()) return;

    const now = Date.now();
    const elapsed = bubbleStartTime ? now - bubbleStartTime : Infinity;

    if (elapsed < MIN_VISIBLE_MS) {
      // Defer: replace any existing pending text with the new one.
      pendingBubbleText = text;
      clearTimeout(pendingBubbleTimer);
      pendingBubbleTimer = setTimeout(() => {
        const next = pendingBubbleText;
        pendingBubbleText = null;
        pendingBubbleTimer = null;
        if (next) showBubbleNow(next);
      }, MIN_VISIBLE_MS - elapsed);
      return;
    }

    // Any pending defer is now stale — this bubble is allowed through
    // immediately, so its text supersedes whatever was queued.
    clearTimeout(pendingBubbleTimer);
    pendingBubbleTimer = null;
    pendingBubbleText = null;

    showBubbleNow(text);
  }

  /* Immediate bubble replacement, bypassing the MIN_VISIBLE_MS pacing
     queue. Reserved for deliberate physical interactions (petting):
     the pacing rule exists to collapse bursts of async EVENT quips,
     but when the user's hand is on the cat, the interruption is the
     point. Also drops any pending deferred bubble — the pet outranks
     whatever was queued. */
  function interruptBubble(text) {
    if (!text) return;
    if (folioIsHidden()) return;
    clearTimeout(pendingBubbleTimer);
    pendingBubbleTimer = null;
    pendingBubbleText = null;
    showBubbleNow(text);
  }

  function showBubbleNow(text) {
    clearTimeout(bubbleTimer);
    bubbleStartTime = Date.now();
    bubble.className = 'speech-bubble';
    bubble.textContent = text;
    void bubble.offsetWidth;
    bubble.classList.add('visible');
    // Hold scales with reading length: short quips keep the old 3.2s,
    // longer ones stay up long enough to actually finish reading.
    const hold = Math.min(
      BUBBLE_MAX_HOLD_MS,
      Math.max(BUBBLE_MIN_HOLD_MS, 1400 + text.length * BUBBLE_MS_PER_CHAR)
    );
    bubbleTimer = setTimeout(() => {
      bubble.classList.remove('visible');
      bubble.classList.add('hiding');
      setTimeout(() => { bubble.className = 'speech-bubble'; }, 250);
    }, hold);
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
    squish: 550,
    flatten: 2000,
    // Idle fidgets (scheduled ambient motion, see FIDGETS below).
    // Durations must match the CSS animation durations — the class is
    // removed on this timer, so a mismatch cuts the motion off early.
    stretch: 1800,
    'ear-flick': 600,
    'tail-swish': 1400,
  };

  let reactTimer = null;
  let watchHandler = null;
  let activeReaction = null; // name of the reaction currently playing

  function react(name) {
    // While guarded, suppress reactions from cascading hooks
    if (isGuarded) return;

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
    activeReaction = name;

    reactTimer = setTimeout(() => {
      folioSvg.classList.remove('react-' + name);
      activeReaction = null;

      // Startle complete: tail is upright, move it in front of books
      if (name === 'startle') {
        tailInFront();
      }
    }, duration);
  }

  function clearReaction() {
    Object.keys(reactionDurations).forEach(name => {
      folioSvg.classList.remove('react-' + name);
    });
    folioSvg.classList.remove('react-watch');
    activeReaction = null;
    if (watchHandler) stopWatch();
  }

  /* ----------------------------------------------------------------
     WATCH: Continuous head tracking during drag operations.
     ---------------------------------------------------------------- */
  function startWatch() {
    folioSvg.classList.add('react-watch');
    folioSvg.style.setProperty('--watch-x', '0');

    watchHandler = function(e) {
      const folioRect = folioSvg.getBoundingClientRect();
      const centerX = folioRect.left + folioRect.width / 2;
      const halfWidth = folioRect.width / 2;
      if (halfWidth === 0) return;
      const dx = (e.clientX - centerX) / halfWidth;
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

    // INTENTIONAL: Folio is hidden by default for first-time visitors
    // (absent key fails the === 'false' check). He's opt-in — only a
    // visitor who has explicitly toggled him on (key === 'false') sees
    // him on load. Don't "fix" this to default-shown.
    //
    // The markup ships the container WITH .folio-hidden so the cat
    // never flashes on first paint while waiting for this code to run
    // (it used to render visible, then vanish at DOMContentLoaded).
    // We therefore REMOVE the class for opted-in visitors instead of
    // adding it for everyone else.
    const shown = localStorage.getItem('folio-hidden') === 'false';
    if (shown) folioContainer.classList.remove('folio-hidden');
    // Reflect the initial shown/hidden state on the header toggle so its
    // pressed styling (filled when Folio is on) and a11y state are right
    // from first paint.
    folioToggle.setAttribute('aria-pressed', String(shown));

    folioToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      folioContainer.classList.toggle('folio-hidden');
      const isHidden = folioContainer.classList.contains('folio-hidden');
      folioToggle.setAttribute('aria-pressed', String(!isHidden));
      localStorage.setItem('folio-hidden', isHidden);
      // Turning Folio ON is his entrance — greet, same guard pattern
      // as the page-load greeting so cascading hooks can't stomp it.
      // The inactivity clock only runs while he's visible (there's
      // nothing to fall asleep when hidden; resetInactivity also
      // self-gates, this just cleans up the pending timer promptly).
      if (!isHidden) {
        guard(3500);
        celebrate({ state: 'greeting', event: 'toggled-on', reactionDelay: 0 });
        resetInactivity();
      } else {
        clearTimeout(inactivityTimer);
      }
    });
  }

  /* ----------------------------------------------------------------
     INACTIVITY TIMER

     45s of no interaction: yawn (pre-sleep warning)
     45s more: full sleep
     Any interaction during sleep: startle > greeting > idle

     On tab return: if Folio slept while hidden, re-snap the
     sleeping pose so the CSS animation is visible before wake.
     ---------------------------------------------------------------- */
  let inactivityTimer = null;
  let isWaking = false;

  /* Wake sequence: startle, then a groggy greeting, then settle to
     idle. Shared by click-on-sleeping-cat and any-activity-wakes. */
  function wakeUp() {
    if (isWaking) return;
    isWaking = true;
    react('startle');
    setTimeout(() => setState('greeting', 'wake-up'), 800);
    setTimeout(() => {
      setState('idle');
      isWaking = false;
    }, 4000);
  }

  function resetInactivity() {
    clearTimeout(inactivityTimer);

    // Hidden cat: no sleep clock to run, no wake to perform. (The
    // document-level listeners stay attached, but bail here before
    // any timer churn.)
    if (folioIsHidden()) return;

    // If waking from sleep, trigger the wake sequence (once)
    if (currentState === 'sleeping') {
      wakeUp();
      return;
    }

    // Start the inactivity countdown
    inactivityTimer = setTimeout(() => {
      react('yawn');

      inactivityTimer = setTimeout(() => {
        setState('sleeping', 'inactivity');
      }, 45000);
    }, 45000);
  }

  // If Folio fell asleep while the tab was hidden, re-snap the
  // sleeping pose so CSS animations are visible when the user returns
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentState === 'sleeping') {
      tailBehindBooks();
      folioSvg.className.baseVal = 'sleeping';
      folioSvg.classList.add('tail-droop', 'tail-sleeping');
    }
  });

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(evt) {
    document.addEventListener(evt, resetInactivity);
  });

  /* ----------------------------------------------------------------
     IDLE FIDGETS

     Real cats don't loop the same breath forever. Every 14-32s of
     idle, play one small fidget (stretch, ear flick, tail swish) from
     a shuffle bag. Fires only when he's visible, in the idle state,
     unguarded, not mid-reaction, not eye-tracking a drag, the tab is
     in the foreground, and the user hasn't asked for reduced motion.
     The timer self-reschedules forever; the guards make missed slots
     silent no-ops.
     ---------------------------------------------------------------- */
  const FIDGET_MIN_DELAY_MS = 14000;
  const FIDGET_EXTRA_DELAY_MS = 18000;
  const fidgetBag = createShuffleBag(['stretch', 'ear-flick', 'tail-swish']);
  let fidgetTimer = null;

  function maybeFidget() {
    if (currentState !== 'idle') return;
    if (folioIsHidden() || document.hidden) return;
    if (isGuarded || activeReaction || watchHandler) return;
    if (reducedMotion.matches) return;
    react(fidgetBag.next());
  }

  function scheduleFidget() {
    clearTimeout(fidgetTimer);
    fidgetTimer = setTimeout(() => {
      maybeFidget();
      scheduleFidget();
    }, FIDGET_MIN_DELAY_MS + Math.random() * FIDGET_EXTRA_DELAY_MS);
  }

  /* ----------------------------------------------------------------
     INITIALIZATION
     ---------------------------------------------------------------- */
  initToggle();
  resetInactivity();
  scheduleFidget();

  /* ----------------------------------------------------------------
     EXPOSE PUBLIC API
     ---------------------------------------------------------------- */
  window.folio = {
    setState: setState,
    react: react,
    celebrate: celebrate,
    guard: guard,
    stopWatch: stopWatch,
    showBubble: showBubble,
    clickFolio: clickFolio,
    currentState: function() { return currentState; },
    setContextProvider: setContextProvider
  };

})();
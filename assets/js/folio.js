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
  // The 250ms cleanup that runs after the shrink animation. Tracked so a
  // line shown DURING the shrink can cancel it; untracked, it fired into
  // the new bubble and wiped it a fraction of a second after it appeared.
  let bubbleHideTimer = null;
  let droopTimer = null;

  // Bubble pacing: bubbles must be visible for at least MIN_VISIBLE_MS
  // before another can replace them. New bubbles arriving inside that
  // window are deferred (only the most recent deferred text fires, so
  // rapid hovers/cascades collapse to the last quip rather than
  // flickering through several). A pending defer is tracked here so
  // a fresh showBubble can replace it.
  const MIN_VISIBLE_MS = 1500;
  // A long line gets longer before anything may replace it: a flat 1.5s
  // cut a 56-character line off before it could be read. Capped, so a
  // burst still collapses to its last line in reasonable time.
  const MIN_VISIBLE_PER_CHAR_MS = 45;
  const MIN_VISIBLE_CAP_MS = 3000;
  let bubbleMinVisibleMs = MIN_VISIBLE_MS;
  let bubbleStartTime = 0;
  let pendingBubbleTimer = null;
  let pendingBubbleText = null;
  let pendingBubbleKey = null;
  // "state:event" of the line on screen (null for clicks, pets and other
  // lines with no event). The same event firing again while its line is
  // still up is skipped rather than swapping in a same-meaning line.
  let currentBubbleKey = null;
  // One-shot follow-up: a line waiting for the CURRENT bubble to
  // complete its full hold (used by the click-annoyance tiers so
  // their lines breathe instead of stomping each other at the
  // MIN_VISIBLE_MS boundary). Any newly shown bubble clears it.
  let followUpBubbleText = null;
  // Whether the visible bubble is a PHYSICAL-interaction line (purr,
  // poke/pet interrupt, annoyed, pestered, mollified) vs a standard
  // line (ambient, context, triggered event quips, greetings). The
  // interaction grammar hangs off this: physical lines interrupt
  // standard ones instantly, never stomp each other mid-read, and
  // can't be stomped by deferred standard quips.
  let bubblePhysical = false;

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
        "Let's find something worth displaying.",
        "Let's make something good.",
      ]
    },
    idle: {
      triggered: {
        // "Clear content, keep styles": the titles go, the look stays.
        'content-cleared': [
          "Fresh shelf. Same good bones.",
          "Empty shelf, ready for the next display.",
          "New display, same shelf.",
          "All cleared. Your fonts and colors stayed put.",
          "*sweeps the shelf with his tail*",
        ],
      },
      ambient: [
        "I could sit on this shelf all day.",
        "*adjusts glasses*",
        "Take your time. I'm not going anywhere.",
        "A booklist is a love letter to readers.",
        "*purrs while reviewing layout*",
        "I wonder what patrons will pick up first.",
        "A good display starts with one good title.",
      ]
    },
    searching: {
      triggered: {
        'search-started': [
          "Let's see what's out there...",
          "Let's see what turns up.",
          "*ears forward*",
          "Checking the stacks...",
        ],
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
          "Straight onto the list.",
          "Direct add. I like efficiency.",
          "Quick and clean.",
          "Added. Nice and simple.",
          "*nods at the manual entry*",
        ],
        'quick-add-multi': [
          "Whoa, that's a stack!",
          "A whole batch at once. Productive.",
          "*counts the new arrivals*",
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
          "*tilts head at the art*",
        ],
        // Only on a Create Cover press: automatic rebuilds stay quiet.
        'collage-generated': [
          "There's the front cover.",
          "The collage came together.",
          "*admires the front cover*",
          "Now that's a front cover.",
        ],
        'collage-ready': [
          "That's enough starred covers for the collage.",
          "Every collage slot has a star now.",
          "All the stars are in.",
        ],
        'pdf-exported': [
          "PDF is on its way!",
          "Off to the printer.",
          "*stamps it approved*",
        ],
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
        "Good momentum.",
        "*tail up, pleased*",
        "This list has a point of view. I like it.",
        "Look at that layout!",
        "Patrons will love this one!",
        "Everything lines up. Clean.",
        "This is really coming together!",
      ]
    },
    evaluating: {
      triggered: {
        'description-fetching': [
          "Drafting a description...",
          "Give it a moment to write.",
          "*watches the words come in*",
        ],
        'browsing-covers': [
          "Take your time, covers matter.",
          "Ooh, that one has good contrast.",
          "Cover art says a lot about a title.",
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
      // The dream lines used to sit in an ambient pool nothing could
      // reach (a click on a sleeping cat wakes him instead), so only
      // "five more minutes" ever played. They rotate on falling asleep.
      triggered: {
        'inactivity': [
          "zzz... five more minutes... zzz...",
          "zzz... perfect kerning... zzz...",
          "zzz... no paper jams... zzz...",
          "*soft purring*",
          "zzz... patrons read the QR code... zzz...",
          "zzz... the fold lines up... zzz...",
          "zzz... unlimited color ink... zzz...",
          "*dream twitches*",
        ],
      },
      ambient: []
    },
    worried: {
      triggered: {
        'search-empty':  "Nothing came back... try different keywords?",
        'network-error': "Something's wrong with the connection...",
        'fetch-failed':  "The description didn't come through...",
        'covers-needed': "We need a few more starred titles for the collage...",
        'cover-images-needed': "Some starred titles still need cover images...",
        'collage-failed': "The cover didn't draw. Let's try that again.",
      },
      ambient: [
        "*ears flatten a little*",
        "*nervous tail twitch*",
        "Deep breaths. We'll figure it out.",
        "We'll sort it out.",
        "Technical difficulties make my fur stand up.",
        "I've seen this before. It usually resolves.",
        "Let's give it another try.",
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

    // Set base state class (replaces all classes on SVG root). A reaction
    // in flight keeps its class: celebrate() changes state 300ms after
    // starting a reaction, and wiping the class there cut every nod and
    // perk off partway through.
    folioSvg.className.baseVal = state;
    if (activeReaction) folioSvg.classList.add('react-' + activeReaction);
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
    if (line) showBubble(line, state + ':' + event);
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
  let celebrateStateTimer = null;

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
    // Same for a prior celebration's delayed state change: without this,
    // a reaction-led celebration followed within its delay by one with
    // no delay landed its quip AFTER the newer one.
    clearTimeout(celebrateStateTimer);
    celebrateStateTimer = null;

    if (reaction) react(reaction);

    if (reactionDelay > 0) {
      celebrateStateTimer = setTimeout(() => {
        celebrateStateTimer = null;
        setState(state, event);
      }, reactionDelay);
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
      ? "Empty list. My favorite part\u00a0— anything could go on it."
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
      ? `Working on \u201c${ctx.listName}\u201d. I'm in.`
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
    "Enough pokes for one day.",
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

  // A poke that lands while he's mid-STANDARD-sentence: he breaks off
  // and acknowledges the poke (the click sibling of petInterruptQuips).
  const clickInterruptQuips = [
    "—yes? I'm listening.",
    "—hm? Oh. Hi.",
    "I was mid-sentence, but go on.",
    "—oof. Noted.",
    "As I was saying— actually, what?",
  ];
  const clickInterruptBag = createShuffleBag(clickInterruptQuips);

  // When the last pestered-tier click happened; a pet within
  // PESTERED_MEMORY_MS of it gets the reconciliation pool.
  let lastPesteredAt = 0;

  // When the last PHYSICAL interaction happened (pet or annoyed-tier
  // click). Within this window a lone click stays physical — squish
  // only, no quip. Without it, a click landing mid-purr deferred an
  // ambient line that stomped the purr 1.5s later, and a click right
  // after a spam burst (click counter resets in 3s) drew shelf
  // musings like "Print is not dead" that read as him changing the
  // subject mid-play.
  const INTERACTION_QUIET_MS = 6000;
  let lastPhysicalAt = 0;

  // A standard line younger than this when a lone click lands gets the
  // break-off-mid-sentence treatment; an older one (already read) is
  // simply replaced by the next quip.
  const CLICK_INTERRUPT_FRESH_MS = 2200;

  // A lone click's line waits this long, so the first click of a
  // double-click doesn't flash a line for a fifth of a second (and push
  // it to screen readers) before the annoyed tier replaces it. The
  // squish itself stays instant.
  const SINGLE_CLICK_QUIP_DELAY_MS = 260;
  let singleClickTimer = null;

  /* Annoyance-tier routing follows the interaction grammar:
     - Mid-STANDARD-line (ambient/context/event quip): the pokes
       interrupt it immediately — being clicked at outranks droning on.
     - Mid-PHYSICAL-line (an earlier annoyed/pestered/purr line): the
       new line waits in the follow-up slot and shows after the current
       hold fully completes (each click's draw overwrites the slot, so
       escalation still upgrades the waiting line). His own grievances
       never stomp each other mid-read.
     - Silence: show immediately. */
  function queueTierLine(bag) {
    if (bubbleIsVisible() && bubblePhysical) {
      followUpBubbleText = bag.next();
    } else {
      interruptBubble(bag.next());
    }
  }

  function clickFolio() {
    const now = Date.now();

    // Sleeping: bypass escalation, trigger full wake sequence
    if (currentState === 'sleeping') {
      wakeUp();
      return;
    }

    // Like petting, a click ENDS any guard window: the guard blocks
    // cascading app hooks, not the user's hand. Without this, clicks
    // during the entrance greeting had no squish (react() is guard-
    // suppressed) and felt completely dead.
    if (isGuarded) {
      isGuarded = false;
      clearTimeout(guardTimer);
    }

    // A second click cancels the first click's waiting line.
    clearTimeout(singleClickTimer);
    singleClickTimer = null;

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
      // doesn't restart the CSS animation) rather than jittering —
      // so each spam click gets its per-click acknowledgment from a
      // grump mark instead.
      react('flatten');
      spawnGrump();
      lastPesteredAt = now;
      lastPhysicalAt = now;
      // Fresh spam re-arms the rebuff: more clicking means the next
      // pet gets pushed away again before forgiveness can be earned.
      angerRebuffed = false;
      clearTimeout(rebuffTimer);
      rebuffTimer = null;
      queueTierLine(pesteredBag);
    } else if (recent.length >= 2) {
      // Rapid: squish again (restarted — every click must visibly
      // land; perk was too subtle here and left clicks 2-3 feeling
      // dead) + mildly annoyed quip.
      react('squish');
      lastPhysicalAt = now;
      queueTierLine(annoyedBag);
    } else {
      // Single: tactile squish (a poke deserves a physical response,
      // not a polite nod) + a verbal response chosen by situation:
      // - Inside an active physical session (just petted / just
      //   pestered), or over the tail of a physical line: squish
      //   only, no commentary (see INTERACTION_QUIET_MS). Lone
      //   clicks deliberately do NOT extend the window, so the
      //   solicit-a-comment affordance survives.
      // - Mid-FRESH-standard-line: he breaks off and acknowledges
      //   the poke, same instant-interrupt treatment as petting.
      // - Otherwise (silence, or a standard line he's basically
      //   finished saying): a context quip when the provider has
      //   something relevant (~60%), else the ambient pool.
      react('squish');
      if (now - lastPhysicalAt > INTERACTION_QUIET_MS) {
        if (bubbleIsVisible() && bubblePhysical) {
          // tail of a purr/annoyed line past the quiet window: let it be
        } else {
          // Freshness is judged at the click, not after the wait.
          const fresh = bubbleIsVisible() && now - bubbleStartTime < CLICK_INTERRUPT_FRESH_MS;
          singleClickTimer = setTimeout(() => {
            singleClickTimer = null;
            if (fresh) {
              interruptBubble(clickInterruptBag.next());
              return;
            }
            const quip = (Math.random() < 0.6 ? pickContextQuip() : null)
              || pickAmbient(currentState);
            if (quip) showBubble(quip);
          }, SINGLE_CLICK_QUIP_DELAY_MS);
        }
      }
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
    "Okay, yes. Right there.",
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

  // Petting an ANNOYED cat is the way back into his good graces, but
  // ANGER OVERCOMES PETTING: while the pestered grudge is hot, the
  // first rub is REBUFFED (his angry line stands; dismissive flick;
  // no hearts) and only rubbing on through the sulk earns the
  // grudging-forgiveness line. True to cats: they sulk, you make it
  // up to them, and it takes a minute.
  const PESTERED_MEMORY_MS = 6000;
  const REBUFF_HOLD_MS = 2500;
  let angerRebuffed = false;
  let lastRebuffAt = 0;
  // The rebuff line waiting for his current line's minimum time. The
  // sulk clock starts when the rebuff is actually on screen: timing it
  // from the rub let the sulk (and the grudge) run out while the rebuff
  // still waited behind a full hold, so it arrived after forgiveness,
  // or never.
  let rebuffTimer = null;

  // Still mad: the grudge is fresh, or he has rebuffed a rub and the
  // hand hasn't won him round yet (a started rebuff keeps the grudge
  // alive until forgiveness, rather than expiring mid-sulk).
  function angerIsHot(now) {
    if (now - lastPesteredAt < PESTERED_MEMORY_MS) return true;
    return angerRebuffed && (!!rebuffTimer || now - lastRebuffAt < PESTERED_MEMORY_MS);
  }

  function showRebuffLine() {
    const line = rebuffBag.next();
    // The rebuff is his answer to the hand, so it takes the place of a
    // grievance still waiting in the follow-up slot; that line landing
    // just as the rub began read as his reply to it.
    followUpBubbleText = null;
    const wait = bubbleIsVisible()
      ? Math.max(0, bubbleMinVisibleMs - (Date.now() - bubbleStartTime))
      : 0;
    clearTimeout(rebuffTimer);
    rebuffTimer = setTimeout(() => {
      rebuffTimer = null;
      if (folioIsHidden()) return;
      lastRebuffAt = Date.now();
      interruptBubble(line);
    }, wait);
  }

  const rebuffQuips = [
    "A rub doesn't undo all that clicking.",
    "*pointedly ignores the hand*",
    "Hmph. Not yet.",
    "Oh, NOW you're nice to me.",
    "I'm still mad. ...keep going, though.",
  ];
  const rebuffBag = createShuffleBag(rebuffQuips);

  const mollifiedQuips = [
    "...fine. You're forgiven.",
    "*grudging purr*",
    "Hmph. ...don't stop, though.",
    "This doesn't make us even. ...okay, it does.",
    "Apology accepted. Barely.",
  ];
  const mollifiedBag = createShuffleBag(mollifiedQuips);

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
      if (now - lastPetAt < PET_COOLDOWN_MS) {
        // Still in cooldown from the last purr quip, but the hand is
        // still on the cat — keep the petting ALIVE (hearts + squint)
        // without spamming new quips. This is what makes sustained
        // rubbing feel continuous instead of one-shot.
        continuePet(now);
      } else if (petStrokes.length >= PET_STROKES_NEEDED) {
        // lastPetAt is set inside triggerPet, and only for pets that
        // land as full pets — the anger rebuff/sulk phases leave it
        // untouched so continued rubbing keeps re-attempting.
        petStrokes = [];
        triggerPet();
      }
    }
    petDir = dir;
    petExtent = Math.abs(dx);
  }

  /* Sustained rubbing between purr quips: a throttled heart per
     completed stroke and the satisfied squint refreshed once the
     previous one has finished (activeReaction check — re-adding the
     class while it's still on wouldn't restart the animation anyway,
     see the flatten note in folio.css). */
  let lastHeartAt = 0;

  function continuePet(now) {
    if (isGuarded || watchHandler || isWaking) return;
    lastPhysicalAt = now;
    if (now - lastHeartAt < 700) return;
    lastHeartAt = now;
    if (angerIsHot(now)) {
      // He's mad: rubs during the pet cooldown get the cold shoulder
      // (a grump mark, not a heart, and no blissful squint).
      spawnGrump();
      return;
    }
    spawnHeart();
    if (!activeReaction) react('satisfied');
  }

  function triggerPet() {
    // No petting during drag-watching or the wake sequence (the
    // document-level mousemove listener wakes a sleeping cat before a
    // rub could ever land on one).
    if (watchHandler || isWaking) return;
    // A real hand on the cat ENDS the guard early. The guard exists
    // to stop cascading app hooks from stomping a greeting — not to
    // make him ignore being petted. The greeting he was mid-way
    // through is exactly what the interrupt lines play against
    // (pet-during-entrance-greeting was the classic dead spot).
    if (isGuarded) {
      isGuarded = false;
      clearTimeout(guardTimer);
    }
    const now = Date.now();
    lastPhysicalAt = now;

    // ANGER OVERCOMES PETTING: while the grudge is hot, forgiveness
    // must be earned. Rebuff and sulk phases do NOT set lastPetAt, so
    // continued rubbing keeps re-attempting (each attempt needs 3
    // fresh strokes) instead of falling into the 8s quip cooldown.
    if (angerIsHot(now)) {
      if (!angerRebuffed) {
        // Stage 1 — rebuff: the hand gets a dismissive tail swish and a
        // grump mark (no hearts, no blissful squint), and the rebuff line
        // answers it once his current line has had its minimum time on
        // screen (see showRebuffLine).
        angerRebuffed = true;
        react('tail-swish');
        spawnGrump();
        showRebuffLine();
        return;
      }
      if (rebuffTimer || now - lastRebuffAt < REBUFF_HOLD_MS) {
        // Mid-sulk: pointedly ignoring the hand. A throttled grump
        // mark keeps the (rebuffed) effort visible.
        if (now - lastHeartAt >= 700) {
          lastHeartAt = now;
          spawnGrump();
        }
        return;
      }
      // Stage 2 — persistence pays: grudging forgiveness. The
      // forgiveness moment is the payoff, so it MAY cut off an angry
      // line mid-read — the emotional turn justifies the one stomp.
      lastPesteredAt = 0;
      angerRebuffed = false;
      lastRebuffAt = 0;
      lastPetAt = now;
      react('satisfied');
      lastHeartAt = now;
      spawnHeart();
      setTimeout(spawnHeart, 280);
      interruptBubble(mollifiedBag.next());
      return;
    }

    // No grudge: joy is instant (squint + hearts), and the purr LINE
    // follows the bubble grammar — it queues behind his own fresh
    // physical line (e.g. an annoyed line from two quick clicks),
    // breaks off a standard line with an interrupted-thought quip,
    // and purrs plainly into silence.
    lastPetAt = now;
    react('satisfied');
    lastHeartAt = now;
    spawnHeart();
    setTimeout(spawnHeart, 280);
    if (bubbleIsVisible() && bubblePhysical) {
      followUpBubbleText = purrBag.next();
    } else if (bubbleIsVisible()) {
      interruptBubble(petInterruptBag.next());
    } else {
      interruptBubble(purrBag.next());
    }
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

  /* Grump mark: the pestered-tier counterpart to the petting heart.
     One pops per spam click so every click visibly lands even while
     he holds the flatten slump. Lightly throttled against
     autoclickers. */
  let lastGrumpAt = 0;

  function spawnGrump() {
    if (reducedMotion.matches || folioIsHidden()) return;
    const now = Date.now();
    if (now - lastGrumpAt < 180) return;
    lastGrumpAt = now;
    const scene = document.getElementById('folio-scene');
    if (!scene) return;
    const mark = document.createElement('div');
    mark.className = 'folio-grump';
    mark.textContent = '\u{1F4A2}';
    mark.style.left = (30 + Math.random() * 40) + '%';
    scene.appendChild(mark);
    setTimeout(() => mark.remove(), 900);
  }

  // Only the cat's own shapes take the pointer (see folio.css), so a
  // natural rub swings past his outline at each end of the stroke, and
  // that is exactly where the direction reversal that counts a stroke
  // happens. Listening on the SVG alone lost those reversals and reset
  // the count on every overshoot. Instead, moves are tracked page-wide
  // but only while the hand was on the cat within PET_OFF_CAT_MS.
  const PET_OFF_CAT_MS = 450;
  let petLastOnCatAt = 0;

  document.addEventListener('pointermove', function(e) {
    if (folioIsHidden()) return;
    const now = Date.now();
    const onCat = e.target && e.target.closest && e.target.closest('#folio');
    if (onCat) {
      petLastOnCatAt = now;
    } else if (now - petLastOnCatAt > PET_OFF_CAT_MS) {
      if (petLastX !== null) resetPetTracking();
      return;
    }
    handlePetMove(e);
  });
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
  function showBubble(text, key) {
    if (!text) return;
    // No bubbles while Folio is hidden: the scene is invisible, and a
    // text swap would still hit the aria-live region — screen reader
    // announcements from a cat that isn't there.
    if (folioIsHidden()) return;
    // The same event again while its line is still up: keep the line.
    if (key && key === currentBubbleKey && bubble.classList.contains('visible')) return;

    const now = Date.now();
    const elapsed = bubbleStartTime ? now - bubbleStartTime : Infinity;

    if (elapsed < bubbleMinVisibleMs) {
      // Defer: replace any existing pending text with the new one.
      pendingBubbleText = text;
      pendingBubbleKey = key || null;
      clearTimeout(pendingBubbleTimer);
      pendingBubbleTimer = setTimeout(() => {
        const next = pendingBubbleText;
        const nextKey = pendingBubbleKey;
        pendingBubbleText = null;
        pendingBubbleKey = null;
        pendingBubbleTimer = null;
        // A physical line may have interrupted in while this standard
        // quip waited (via the follow-up path, which doesn't clear
        // pendings). Standard loses: dropping a background event quip
        // beats stomping his in-the-moment response mid-read. And a cat
        // hidden in the meantime (the tour's exit re-hides him) says
        // nothing.
        if (next && !folioIsHidden() && !(bubbleIsVisible() && bubblePhysical)) {
          showBubbleNow(next, false, nextKey);
        }
      }, bubbleMinVisibleMs - elapsed);
      return;
    }

    // Any pending defer is now stale — this bubble is allowed through
    // immediately, so its text supersedes whatever was queued.
    clearTimeout(pendingBubbleTimer);
    pendingBubbleTimer = null;
    pendingBubbleText = null;
    pendingBubbleKey = null;

    showBubbleNow(text, false, key);
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
    pendingBubbleKey = null;
    // showBubbleNow also clears any queued follow-up line — important
    // for the pet-while-pestered reconciliation, which must not be
    // chased by a stale "I am not a button."
    showBubbleNow(text, true);
  }

  // A line in its 250ms shrink still counts as up: treating it as gone
  // let a line arriving in that window wipe the queued follow-up (a
  // rebuff or pestered line vanished that way).
  function bubbleIsVisible() {
    return bubble.classList.contains('visible') || bubble.classList.contains('hiding');
  }

  /* Hard stop on all speech: drops the visible bubble and every queued
     line (pacing defer + follow-up slot). Used when Folio is toggled
     off — hiding him should silence him completely, and toggling back
     on must not resurrect a sentence from the previous session. */
  function silenceBubble() {
    clearTimeout(bubbleTimer);
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = null;
    clearTimeout(pendingBubbleTimer);
    pendingBubbleTimer = null;
    pendingBubbleText = null;
    pendingBubbleKey = null;
    clearTimeout(rebuffTimer);
    rebuffTimer = null;
    clearTimeout(singleClickTimer);
    singleClickTimer = null;
    followUpBubbleText = null;
    currentBubbleKey = null;
    bubblePhysical = false;
    bubbleStartTime = 0;
    bubble.className = 'speech-bubble';
    stopTalking();
    // Also drop the text itself: the normal hide path leaves the last
    // line in textContent (harmless while he's live), but a hidden
    // Folio shouldn't be holding a stale sentence in a role="status".
    bubble.textContent = '';
  }

  /* Word-by-word reveal. Each word is its own span with a staggered
     animation-delay; *stage directions* get a muted span of their own.
     Returns how long the reveal takes, in ms (0 under reduced motion,
     where the CSS drops the animation). */
  const WORD_STAGGER_MS = 55;
  const WORD_REVEAL_MAX_MS = 900;

  function renderBubbleText(text) {
    bubble.textContent = '';
    const stagger = reducedMotion.matches ? 0 : WORD_STAGGER_MS;
    let wordIndex = 0;
    let lastDelay = 0;
    text.split(/(\*[^*]+\*)/).forEach((part) => {
      if (!part) return;
      let host = bubble;
      if (/^\*[^*]+\*$/.test(part)) {
        host = document.createElement('span');
        host.className = 'speech-action';
        bubble.appendChild(host);
      }
      part.split(/(\s+)/).forEach((token) => {
        if (!token) return;
        if (/^\s+$/.test(token)) {
          host.appendChild(document.createTextNode(token));
          return;
        }
        const word = document.createElement('span');
        word.className = 'speech-word';
        lastDelay = Math.min(WORD_REVEAL_MAX_MS, wordIndex * stagger);
        word.style.animationDelay = lastDelay + 'ms';
        host.appendChild(word).textContent = token;
        wordIndex++;
      });
    });
    return stagger ? lastDelay + 260 : 0;
  }

  // Mouth moves while a spoken line arrives. Pure stage directions
  // (*purrs*) and sleep-talk stay closed-mouthed.
  let talkTimer = null;

  function stopTalking() {
    clearTimeout(talkTimer);
    talkTimer = null;
    const scene = document.getElementById('folio-scene');
    if (scene) scene.classList.remove('talking');
  }

  function startTalking(text, ms) {
    stopTalking();
    if (!ms || currentState === 'sleeping') return;
    // The tour hides the bubble (tour.css), so a moving mouth there is
    // talking with no words.
    if (document.body.classList.contains('tour-active')) return;
    if (!text.replace(/\*[^*]+\*/g, '').trim()) return;
    const scene = document.getElementById('folio-scene');
    if (!scene) return;
    scene.classList.add('talking');
    talkTimer = setTimeout(stopTalking, ms + 150);
  }

  /* Size and place the bubble for the words just rendered.

     Shrink-wrap: text-wrap: balance evens out a two-line quip, but the
     box keeps the full max-width, so balanced lines sat in a mostly
     empty bubble. CSS can't size a box to balanced lines, so measure
     the widest line from the word spans (offsetLeft/offsetWidth ignore
     the pop animation's scale) and set the width to fit.

     Keep on screen: the bubble centres on the scene, and when the
     sidebar collapses the scene sits at the left edge, so a wide bubble
     ran off the screen (and with the sidebar open it spilled over the
     sidebar). Shift it right just enough to clear the preview area's
     left edge, and move the pointer back the same distance so it still
     points at his head. The shift and pointer ride on CSS variables the
     pop, swap and shrink keyframes all read. */
  const BUBBLE_EDGE_GAP = 8;
  const BUBBLE_POINTER_INSET = 22;

  function fitBubble() {
    bubble.style.width = '';
    bubble.style.setProperty('--bub-dx', '0px');
    bubble.style.removeProperty('--bub-tail');

    const lines = new Map();
    bubble.querySelectorAll('.speech-word').forEach((w) => {
      const top = w.offsetTop;
      const line = lines.get(top) || [Infinity, -Infinity];
      line[0] = Math.min(line[0], w.offsetLeft);
      line[1] = Math.max(line[1], w.offsetLeft + w.offsetWidth);
      lines.set(top, line);
    });
    if (lines.size > 1) {
      let widest = 0;
      lines.forEach(([l, r]) => { widest = Math.max(widest, r - l); });
      const cs = getComputedStyle(bubble);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const border = cs.boxSizing === 'border-box'
        ? pad + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
        : 0;
      bubble.style.width = Math.ceil(widest + border + 1) + 'px';
    }

    const scene = document.getElementById('folio-scene');
    if (!scene) return;
    const sceneRect = scene.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const naturalLeft = sceneRect.left + sceneRect.width / 2 - width / 2;
    const main = document.querySelector('.main-content');
    const mainLeft = main ? main.getBoundingClientRect().left : 0;
    const minLeft = Math.max(BUBBLE_EDGE_GAP, mainLeft + BUBBLE_EDGE_GAP);
    const maxRight = window.innerWidth - BUBBLE_EDGE_GAP;
    let dx = 0;
    if (naturalLeft < minLeft) dx = minLeft - naturalLeft;
    else if (naturalLeft + width > maxRight) dx = maxRight - (naturalLeft + width);
    if (!dx) return;
    const pointer = Math.min(width - BUBBLE_POINTER_INSET,
      Math.max(BUBBLE_POINTER_INSET, width / 2 - dx));
    bubble.style.setProperty('--bub-dx', Math.round(dx) + 'px');
    bubble.style.setProperty('--bub-tail', Math.round(pointer) + 'px');
  }

  // The sidebar slides the scene over 0.3s, and a window resize moves it
  // too: re-place a bubble that is up when either settles.
  if (folioContainer) {
    folioContainer.addEventListener('transitionend', (e) => {
      if (e.target === folioContainer && e.propertyName === 'left' &&
          bubble.classList.contains('visible')) fitBubble();
    });
  }
  window.addEventListener('resize', () => {
    if (bubble.classList.contains('visible')) fitBubble();
  });
  // His greeting can arrive before the Caveat webfont does. Words fitted
  // to the fallback font rewrap when Caveat lands, so fit again then.
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', () => {
      if (bubble.classList.contains('visible')) fitBubble();
    });
  }

  function showBubbleNow(text, isPhysical, key) {
    clearTimeout(bubbleTimer);
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = null;
    // A new bubble supersedes any queued follow-up (the follow-up
    // fires below only when the hold expires with nothing new shown).
    followUpBubbleText = null;
    bubblePhysical = !!isPhysical;
    currentBubbleKey = key || null;
    bubbleStartTime = Date.now();
    bubbleMinVisibleMs = Math.min(MIN_VISIBLE_CAP_MS,
      Math.max(MIN_VISIBLE_MS, 600 + text.length * MIN_VISIBLE_PER_CHAR_MS));
    // Already up: swap the words in place with a squash instead of
    // collapsing to nothing and popping back. Not when the size jumps,
    // though: a squash can't hide a bubble doubling in width in one
    // frame, so a very different line pops in fresh instead.
    let swapping = bubble.classList.contains('visible');
    const oldWidth = swapping ? bubble.offsetWidth : 0;
    bubble.className = 'speech-bubble';
    const revealMs = renderBubbleText(text);
    fitBubble();
    if (swapping && oldWidth &&
        Math.abs(bubble.offsetWidth - oldWidth) / oldWidth > 0.4) {
      swapping = false;
    }
    void bubble.offsetWidth;
    bubble.classList.add('visible');
    if (swapping) bubble.classList.add('swap');
    startTalking(text, revealMs);
    // Hold scales with reading length: short quips keep the old 3.2s,
    // longer ones stay up long enough to actually finish reading. The
    // clock starts once the last word has landed.
    const hold = revealMs + Math.min(
      BUBBLE_MAX_HOLD_MS,
      Math.max(BUBBLE_MIN_HOLD_MS, 1400 + text.length * BUBBLE_MS_PER_CHAR)
    );
    bubbleTimer = setTimeout(() => {
      stopTalking();
      bubble.classList.remove('visible', 'swap');
      bubble.classList.add('hiding');
      bubbleHideTimer = setTimeout(() => {
        bubbleHideTimer = null;
        bubble.className = 'speech-bubble';
        currentBubbleKey = null;
        const followUp = followUpBubbleText;
        followUpBubbleText = null;
        // Follow-ups are tier lines — physical by definition.
        if (followUp && !folioIsHidden()) {
          showBubbleNow(followUp, true);
        } else {
          // Nothing follows: drop the words too. The shrunk bubble is
          // invisible but still in the accessibility tree, where a screen
          // reader could find his last line indefinitely.
          bubble.textContent = '';
        }
      }, 250);
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
    const wasActive = folioSvg.classList.contains('react-' + name);
    clearReaction();

    if (name === 'watch') {
      startWatch();
      return;
    }

    // Squish is per-click tactile feedback: when it's re-triggered
    // mid-play, force a style flush between the class removal above
    // and the re-add below so the animation RESTARTS — every click
    // visibly presses him down again. All other reactions keep the
    // same-frame no-restart behavior (flatten's stay-slumped-under-
    // spam depends on it).
    if (name === 'squish' && wasActive) {
      void folioSvg.getBoundingClientRect();
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
    tailReact(name);

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
     TAIL: a jointed, spring-driven tail.

     The tail used to be one rigid path that CSS rotated around its
     base, so every wag swung it like a stick. Now the drawing is
     rebuilt every frame from a spine of TAIL_REST points (fitted to
     the original artwork's centerline), and each joint is a damped
     spring chasing its parent. Three things drive it:

     - The CSS state animations on #tail are UNCHANGED and still own
       the pose: the lazy idle sway, the sleep droop to -70deg, the
       startle spring, the swish fidget. They rotate the whole group,
       and the chain feels that rotation through its springs, so the
       tip lags the base, overshoots and settles (follow-through).
       Nothing in the CSS choreography had to move.
     - A travelling wave that runs base to tip, sized and paced per
       state (TAIL_MOODS), gives the S-shaped ripple a real tail has.
     - Short-lived moods from reactions: a lashing tail when pestered,
       a contented curl when petted, a bottle-brush puff on startle.

     Angles are absolute in the SVG's frame (root rotation included);
     rendering subtracts the root so the path is drawn in the group's
     own rotated frame. The loop only runs while he is visible, the tab
     is foregrounded and reduced motion is off; otherwise the tail
     rests in its drawn pose.
     ---------------------------------------------------------------- */
  const tailGroup = document.getElementById('tail');
  const tailPathEls = tailGroup ? tailGroup.querySelectorAll('path') : [];
  const tailOutline = tailPathEls[0] || null;
  const tailStripes = Array.prototype.slice.call(tailPathEls, 1);

  // Base (hidden behind the body) to tip, in SVG units. The last three
  // points are the hook at the top of the tail.
  const TAIL_REST = [
    [153, 416], [137, 400], [128, 380], [122, 358], [118, 336], [114, 314],
    [109, 292], [102, 270], [94, 249], [85, 230], [77, 212], [73, 197], [74, 184],
  ];
  const TAIL_SEGS = TAIL_REST.length - 1;
  // Where the three fur stripes sit, as fractional spine indices.
  const TAIL_STRIPE_AT = [5.2, 7.2, 9.1];
  // Most any joint may trail its target, in radians (about 14deg).
  const TAIL_MAX_LAG = 0.24;

  // amp: wave size in degrees per joint (it accumulates toward the tip)
  // period: seconds per wave. curl: multiplier on the tip's rest bend.
  // puff: width multiplier.
  const TAIL_MOODS = {
    idle:       { amp: 1.4, period: 3.8, curl: 1.0,  puff: 1.0 },
    searching:  { amp: 1.0, period: 1.4, curl: 1.25, puff: 1.0 },
    excited:    { amp: 2.4, period: 0.8, curl: 0.9,  puff: 1.0 },
    evaluating: { amp: 1.0, period: 5.5, curl: 1.25, puff: 1.0 },
    sleeping:   { amp: 0.5, period: 6.5, curl: 1.5,  puff: 1.0 },
    greeting:   { amp: 2.2, period: 1.5, curl: 1.0,  puff: 1.0 },
    worried:    { amp: 0.9, period: 0.7, curl: 0.7,  puff: 1.06 },
    // Reaction moods (see tailReact)
    lash:       { amp: 3.6, period: 0.55, curl: 0.6, puff: 1.08 },
    content:    { amp: 1.1, period: 2.6, curl: 1.35, puff: 1.0 },
  };

  const tailLen = [];
  const tailRel = [];      // rest bend of each joint relative to its parent
  let tailRootRest = 0;    // rest angle of the first segment
  for (let i = 0; i < TAIL_SEGS; i++) {
    const [x0, y0] = TAIL_REST[i];
    const [x1, y1] = TAIL_REST[i + 1];
    tailLen.push(Math.hypot(x1 - x0, y1 - y0));
    const ang = Math.atan2(y1 - y0, x1 - x0);
    if (i === 0) {
      tailRootRest = ang;
      tailRel.push(0);
    } else {
      const [px, py] = TAIL_REST[i - 1];
      let rel = ang - Math.atan2(y0 - py, x0 - px);
      if (rel > Math.PI) rel -= 2 * Math.PI;
      if (rel < -Math.PI) rel += 2 * Math.PI;
      tailRel.push(rel);
    }
  }

  const tailAng = new Array(TAIL_SEGS).fill(0);
  const tailVel = new Array(TAIL_SEGS).fill(0);
  const tailCur = Object.assign({}, TAIL_MOODS.idle);
  let tailPhase = 0;
  let tailPuffBoost = 0;
  let tailMoodName = null;
  let tailMoodUntil = 0;
  let tailNextFlickAt = 0;
  let tailRaf = null;
  let tailLastTs = 0;

  // Current rotation CSS has applied to the #tail group, in radians.
  function readTailRoot() {
    if (!tailGroup) return 0;
    const t = getComputedStyle(tailGroup).transform;
    if (!t || t === 'none') return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    const parts = m[1].split(',');
    return Math.atan2(parseFloat(parts[1]), parseFloat(parts[0]));
  }

  // The tip's rest bend is scaled by the mood's curl over the last four
  // joints, so a curious tail hooks harder and an angry one straightens.
  function tailCurlAt(i, curl) {
    const t = Math.max(0, (i - (TAIL_SEGS - 5)) / 4);
    return 1 + (curl - 1) * Math.min(1, t);
  }

  function tailTarget(i, parentAng) {
    const wave = (tailCur.amp * Math.PI / 180)
      * Math.sin(tailPhase - i * 0.55)
      * (0.35 + 0.65 * i / TAIL_SEGS);
    return parentAng + tailRel[i] * tailCurlAt(i, tailCur.curl) + wave;
  }

  // Snap every joint to its target: no motion, no leftover velocity.
  function resyncTail(root) {
    tailAng[0] = root + tailRootRest;
    tailVel[0] = 0;
    for (let i = 1; i < TAIL_SEGS; i++) {
      tailAng[i] = tailTarget(i, tailAng[i - 1]);
      tailVel[i] = 0;
    }
  }

  function tailMood(name, ms) {
    tailMoodName = name;
    tailMoodUntil = Date.now() + ms;
  }

  // Called from react(): the tail's share of each micro-reaction.
  function tailReact(name) {
    if (name === 'flatten') tailMood('lash', 2600);
    else if (name === 'satisfied') tailMood('content', 1800);
    else if (name === 'startle') tailPuffBoost = 0.45;
  }

  function stepTail(dt, root) {
    const now = Date.now();
    const moodKey = (tailMoodName && now < tailMoodUntil) ? tailMoodName : currentState;
    const target = TAIL_MOODS[moodKey] || TAIL_MOODS.idle;
    // Ease between moods so a state change never pops the pose.
    const blend = 1 - Math.exp(-dt / 0.35);
    tailCur.amp += (target.amp - tailCur.amp) * blend;
    tailCur.period += (target.period - tailCur.period) * blend;
    tailCur.curl += (target.curl - tailCur.curl) * blend;
    tailCur.puff += (target.puff - tailCur.puff) * blend;
    tailPuffBoost *= Math.exp(-dt / 0.9);
    // Integrated phase (not t / period) so a period change bends the
    // wave's pace instead of jumping it to a new position.
    tailPhase += dt * 2 * Math.PI / tailCur.period;

    // The occasional tip flick of a cat that is only half paying attention.
    if (moodKey === 'idle' || moodKey === 'evaluating' || moodKey === 'sleeping') {
      if (!tailNextFlickAt) tailNextFlickAt = now + 3000 + Math.random() * 5000;
      if (now >= tailNextFlickAt) {
        const kick = (Math.random() < 0.5 ? -1 : 1)
          * (1.6 + Math.random() * 1.6)
          * (moodKey === 'sleeping' ? 0.4 : 1);
        for (let i = TAIL_SEGS - 3; i < TAIL_SEGS; i++) tailVel[i] += kick;
        tailNextFlickAt = now + 4000 + Math.random() * 5000;
      }
    } else {
      tailNextFlickAt = 0;
    }

    // Fixed substeps keep the springs stable at any frame rate.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      tailAng[0] = root + tailRootRest;
      for (let i = 1; i < TAIL_SEGS; i++) {
        // Stiff near the base, loose at the tip: that gradient is what
        // makes the tip whip after the base has already stopped.
        const k = 260 * (1 - 0.6 * i / TAIL_SEGS);
        const c = 2 * 0.62 * Math.sqrt(k);
        const want = tailTarget(i, tailAng[i - 1]);
        const acc = k * (want - tailAng[i]) - c * tailVel[i];
        tailVel[i] += acc * h;
        tailAng[i] += tailVel[i] * h;
        // A joint may lag its target by at most TAIL_MAX_LAG. Past that
        // the outline kinks, and at the hook it can fold over itself.
        const lag = tailAng[i] - want;
        if (lag > TAIL_MAX_LAG || lag < -TAIL_MAX_LAG) {
          tailAng[i] = want + Math.sign(lag) * TAIL_MAX_LAG;
          tailVel[i] *= 0.5;
        }
      }
    }
  }

  function tailWidthAt(k) {
    return (24 + 8 * Math.pow(k / TAIL_SEGS, 1.6)) * (tailCur.puff + tailPuffBoost);
  }

  // Catmull-Rom through pts as cubic Beziers, starting at pts[0].
  function smoothThrough(pts) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ' C ' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)
        + ', ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)
        + ', ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  function renderTail(root) {
    if (!tailOutline) return;
    // Spine in the group's own (rotated) frame.
    const pts = [TAIL_REST[0].slice()];
    const segAng = [];
    for (let i = 0; i < TAIL_SEGS; i++) {
      const a = tailAng[i] - root;
      segAng.push(a);
      const p = pts[i];
      pts.push([p[0] + tailLen[i] * Math.cos(a), p[1] + tailLen[i] * Math.sin(a)]);
    }
    // Tangent at each point: the mean of the segments meeting there.
    const tan = pts.map((_, k) => {
      const a = segAng[Math.max(0, k - 1)];
      const b = segAng[Math.min(TAIL_SEGS - 1, k)];
      return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
    });
    const left = [];
    const right = [];
    pts.forEach((p, k) => {
      const hw = tailWidthAt(k) / 2;
      const nx = -Math.sin(tan[k]);
      const ny = Math.cos(tan[k]);
      left.push([p[0] + nx * hw, p[1] + ny * hw]);
      right.push([p[0] - nx * hw, p[1] - ny * hw]);
    });

    // Rounded tip: one cubic whose handles run 2/3 of the width along
    // the tip's heading approximates a half circle closely.
    const lt = left[TAIL_SEGS];
    const rt = right[TAIL_SEGS];
    const cap = tailWidthAt(TAIL_SEGS) * 0.667;
    const tx = Math.cos(tan[TAIL_SEGS]) * cap;
    const ty = Math.sin(tan[TAIL_SEGS]) * cap;
    const rightBack = right.slice().reverse();
    const d = 'M ' + left[0][0].toFixed(1) + ' ' + left[0][1].toFixed(1)
      + smoothThrough(left)
      + ' C ' + (lt[0] + tx).toFixed(1) + ' ' + (lt[1] + ty).toFixed(1)
      + ', ' + (rt[0] + tx).toFixed(1) + ' ' + (rt[1] + ty).toFixed(1)
      + ', ' + rt[0].toFixed(1) + ' ' + rt[1].toFixed(1)
      + smoothThrough(rightBack)
      + ' Z';
    tailOutline.setAttribute('d', d);

    // Stripes: thin fur bands laid across the spine, inset from the
    // outline, bowed slightly toward the base like the original art.
    tailStripes.forEach((el, n) => {
      const at = TAIL_STRIPE_AT[n];
      if (at === undefined) return;
      const band = (s) => {
        const k = Math.min(TAIL_SEGS - 1, Math.floor(s));
        const f = s - k;
        const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f;
        const y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f;
        const a = segAng[k];
        const hw = tailWidthAt(s) / 2 - 2.5;
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const bx = -Math.cos(a) * 3;
        const by = -Math.sin(a) * 3;
        return { l: [x + nx * hw, y + ny * hw], r: [x - nx * hw, y - ny * hw], c: [x + bx, y + by] };
      };
      const a = band(at);
      const b = band(at + 0.2);
      const f = (p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      el.setAttribute('d', 'M ' + f(a.l) + ' Q ' + f(a.c) + ' ' + f(a.r)
        + ' L ' + f(b.r) + ' Q ' + f(b.c) + ' ' + f(b.l) + ' Z');
    });
  }

  function tailShouldRun() {
    return !!tailOutline && !reducedMotion.matches && !folioIsHidden() && !document.hidden;
  }

  function tailFrame(ts) {
    tailRaf = null;
    if (!tailShouldRun()) return;
    const dt = tailLastTs ? Math.min(0.05, (ts - tailLastTs) / 1000) : 1 / 60;
    tailLastTs = ts;
    const root = readTailRoot();
    stepTail(dt, root);
    renderTail(root);
    tailRaf = requestAnimationFrame(tailFrame);
  }

  // Idempotent: safe to call on every "he might be visible now" event.
  // A resumed loop starts from the rest pose so a long pause (the sleep
  // droop happened while the tab was away) doesn't release as a whip.
  function startTail() {
    if (tailRaf !== null || !tailShouldRun()) return;
    tailLastTs = 0;
    resyncTail(readTailRoot());
    tailRaf = requestAnimationFrame(tailFrame);
  }

  // Draw the procedural rest pose once so the reduced-motion and the
  // animated tail are the same shape.
  function restTail() {
    Object.assign(tailCur, TAIL_MOODS.idle);
    tailPuffBoost = 0;
    const root = readTailRoot();
    resyncTail(root);
    renderTail(root);
  }

  // Any path that shows him restarts the loop: the header toggle, and
  // also the guided tour, which removes .folio-hidden directly.
  if (folioContainer && window.MutationObserver) {
    new MutationObserver(startTail).observe(folioContainer, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) restTail();
      else startTail();
    });
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
    //
    // Phones (the tool's 768px phone layout) never show the floating cat,
    // whatever the saved preference: at that width he covered the corner
    // of whichever view was open and caught taps there, and his one-line
    // bubble ran off the left edge. Keeping .folio-hidden (rather than
    // hiding him with CSS) keeps "hidden = actually off": no bubbles, no
    // aria-live, no sleep clock. The preference itself is left alone, so
    // the same browser at desktop width still honors it (after a reload).
    // The guided tour still narrates as Folio from its panel's avatar.
    const isPhone = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    const shown = !isPhone && lsGet('folio-hidden') === 'false';
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
      lsSet('folio-hidden', String(isHidden));
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
        // Hiding him ends the conversation: drop the current line and
        // anything queued, and clear any in-flight reaction so he
        // isn't mid-squish when summoned back.
        silenceBubble();
        clearReaction();
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
    const wokeAt = Date.now();
    react('startle');
    // Whatever woke him (a click on Quick Add, say) often speaks inside
    // the startle. Announcing "I'm awake!" after it put the lines in
    // reverse order, so the wake line only plays into silence.
    setTimeout(() => {
      setState('greeting', bubbleStartTime >= wokeAt ? null : 'wake-up');
    }, 800);
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
    if (!document.hidden) startTail();
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
  restTail();
  startTail();

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
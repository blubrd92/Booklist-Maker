// Preview deploy mode-picker chip.
//
// Renders a small fixed-position chip on Cloudflare Pages preview hosts
// (`*.pages.dev`) that shows the current mode (public tool vs branded
// library) and lets you switch with one click. Replaces the need to
// remember and type out `?library=<id>` query params manually. The
// chip stays visible even when the body is hidden by the
// `awaiting-library-config` flash-prevention class, so it can be used
// to escape if a library config fails to load (e.g., bad library ID).
//
// Self-gates on hostname: a no-op on every host except `.pages.dev`.
// So this file ships in production but does literally nothing there.
//
// DOCUMENTED INVARIANT EXCEPTION (see CLAUDE.md "Constraints worth
// protecting"): on preview deploys this module makes a single
// Firestore REST call (no Firebase SDK, no auth) to `libraries-public/`
// to fetch the current list of test libraries. This is the ONLY
// network request to Firebase made on previews and it never fires on
// production. If the call fails (offline, CORS change, rules change),
// the panel says so and stays usable through "Used in this browser" and
// "Custom library ID…".
//
// Gated libraries can't be listed (reading them needs a sign-in), so the
// panel remembers every ?library= this browser has opened a preview with
// (localStorage, this browser only) and offers them again. That is how a
// gated library like San Rafael stays one click away.

(function() {
  'use strict';

  if (!window.location.hostname.endsWith('.pages.dev')) return;

  // Public Firebase project config — the API key is the same one
  // exposed in firebase-init.js. Firebase web API keys are not
  // secrets; they identify the project to Google's endpoints. Access
  // is enforced by Firestore rules (libraries-public has
  // `allow read: if true`, so this fetch works without auth).
  const PROJECT_ID = 'booklister-50296';
  const API_KEY = 'AIzaSyCRQahoA79yeWbbFUIEs4-4mft_KSGpjcw';
  const FIRESTORE_URL =
    'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/libraries-public?key=' + API_KEY;

  // The public list comes only from Firestore. There used to be a
  // hardcoded fallback list here; it went stale the moment a library in
  // it was converted to gated (San Rafael, November 2026) and kept
  // labelling it "public branded". An empty answer now means "no public
  // libraries", and a failed fetch is shown as such.
  let chip = null;
  let panel = null;
  let isExpanded = false;
  let libraries = [];
  let listState = 'loading'; // 'loading' | 'loaded' | 'failed'

  // Library IDs this browser has previewed, most recent first. Per-viewer
  // convenience only, so every read and write tolerates blocked storage.
  const RECENT_KEY = 'booklister.previewLibraries';
  const RECENT_MAX = 8;
  function readRecent() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function(id) { return typeof id === 'string' && id; }) : [];
    } catch (e) {
      return [];
    }
  }
  function rememberLibrary(id) {
    if (!id) return;
    try {
      const list = [id].concat(readRecent().filter(function(x) { return x !== id; })).slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* storage blocked; the panel just won't remember */ }
  }

  function getCurrentLibrary() {
    return new URLSearchParams(window.location.search).get('library') || null;
  }

  function buildChip() {
    chip = document.createElement('button');
    chip.className = 'preview-helper-chip';
    chip.type = 'button';
    chip.setAttribute('aria-label', 'Preview deploy mode picker');
    chip.addEventListener('click', toggle);
    updateChipLabel();
    document.body.appendChild(chip);
  }

  function updateChipLabel() {
    const current = getCurrentLibrary();
    chip.textContent = '\u{1F4CD} PREVIEW · ' + (current || 'public');
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'preview-helper-panel';
    panel.setAttribute('role', 'dialog');
    panel.hidden = true;
    document.body.appendChild(panel);
  }

  function rebuildPanelContent() {
    panel.innerHTML = '';

    const heading = document.createElement('h3');
    heading.textContent = 'Preview deploy';
    panel.appendChild(heading);

    const help = document.createElement('p');
    help.className = 'preview-helper-help';
    help.textContent = 'Switch which mode this preview renders as.';
    panel.appendChild(help);

    const list = document.createElement('div');
    list.className = 'preview-helper-options';

    list.appendChild(buildOption(null, 'Public tool', 'mirrors booklister.org'));
    libraries.forEach(function(lib) {
      list.appendChild(buildOption(lib.id, lib.displayName, 'public branded · ?library=' + lib.id));
    });
    if (listState !== 'loaded') {
      const note = document.createElement('p');
      note.className = 'preview-helper-help';
      note.textContent = listState === 'loading'
        ? 'Loading the public library list…'
        : "The public library list didn't load.";
      list.appendChild(note);
    }

    // Libraries this browser has previewed that aren't in the public list:
    // gated ones (which can't be listed without signing in) or typed IDs.
    const publicIds = libraries.map(function(lib) { return lib.id; });
    readRecent().filter(function(id) { return publicIds.indexOf(id) === -1; }).forEach(function(id) {
      list.appendChild(buildOption(id, id, 'used in this browser · gated or custom · ?library=' + id));
    });

    list.appendChild(buildOption('__custom__', 'Custom library ID…', 'paste any ID, e.g. for gated libraries'));

    panel.appendChild(list);
  }

  function buildOption(id, label, sublabel) {
    const row = document.createElement('button');
    row.className = 'preview-helper-option';
    row.type = 'button';
    const current = getCurrentLibrary();
    if (id === current || (id === null && !current)) {
      row.classList.add('preview-helper-option-active');
    }

    const main = document.createElement('span');
    main.className = 'preview-helper-option-main';
    main.textContent = label;
    row.appendChild(main);

    const sub = document.createElement('span');
    sub.className = 'preview-helper-option-sub';
    sub.textContent = sublabel;
    row.appendChild(sub);

    row.addEventListener('click', function() { switchTo(id); });
    return row;
  }

  function switchTo(libraryId) {
    if (libraryId === '__custom__') {
      const v = window.prompt('Library ID:');
      if (!v) return;
      libraryId = v.trim();
      if (!libraryId) return;
    }
    const url = new URL(window.location.href);
    if (libraryId) {
      url.searchParams.set('library', libraryId);
    } else {
      url.searchParams.delete('library');
    }
    window.location.assign(url.toString());
  }

  function toggle() {
    isExpanded = !isExpanded;
    if (isExpanded) {
      rebuildPanelContent();
      panel.hidden = false;
      // Defer so the click that opened the panel doesn't immediately close it.
      setTimeout(function() {
        document.addEventListener('click', onOutsideClick, true);
      }, 0);
    } else {
      panel.hidden = true;
      document.removeEventListener('click', onOutsideClick, true);
    }
  }

  function onOutsideClick(e) {
    if (!panel.contains(e.target) && !chip.contains(e.target)) {
      toggle();
    }
  }

  function fetchLibraries() {
    fetch(FIRESTORE_URL)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(json) {
        if (!json) throw new Error('no list');
        // Firestore omits `documents` when the collection is empty.
        const fresh = (Array.isArray(json.documents) ? json.documents : []).map(function(doc) {
          const parts = doc.name.split('/');
          const id = parts[parts.length - 1];
          const fields = doc.fields || {};
          const dn = fields.displayName ? fields.displayName.stringValue : null;
          return { id: id, displayName: dn || id };
        });
        libraries = fresh;
        listState = 'loaded';
        if (isExpanded) rebuildPanelContent();
      })
      .catch(function() {
        listState = 'failed';
        if (isExpanded) rebuildPanelContent();
      });
  }

  function init() {
    if (!document.body) return;
    rememberLibrary(getCurrentLibrary());
    buildChip();
    buildPanel();
    fetchLibraries();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

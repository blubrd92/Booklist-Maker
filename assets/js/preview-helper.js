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
// the chip falls back to a hardcoded library list and stays usable.

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

  // Fallback list — used immediately while the Firestore fetch is in
  // flight, and stays in place if the fetch fails. Update this when
  // adding a public-branded library if you want it to appear instantly
  // (otherwise it just appears on the next preview load once the REST
  // fetch sees it).
  const FALLBACK_LIBRARIES = [
    { id: 'sanrafael', displayName: 'San Rafael Public Library' }
  ];

  let chip = null;
  let panel = null;
  let isExpanded = false;
  let libraries = FALLBACK_LIBRARIES.slice();

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
        if (!json || !Array.isArray(json.documents)) return;
        const fresh = json.documents.map(function(doc) {
          const parts = doc.name.split('/');
          const id = parts[parts.length - 1];
          const fields = doc.fields || {};
          const dn = fields.displayName ? fields.displayName.stringValue : null;
          return { id: id, displayName: dn || id };
        });
        if (fresh.length > 0) {
          libraries = fresh;
          if (isExpanded) rebuildPanelContent();
        }
      })
      .catch(function() { /* keep hardcoded fallback list */ });
  }

  function init() {
    if (!document.body) return;
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

/**
 * Booklister Helper — content script
 *
 * Runs on BiblioCommons record pages (*.bibliocommons.com/v2/record/*)
 * and list pages (*.bibliocommons.com/v2/list/*). On a 'capture'
 * message from the background service worker (sent when the user
 * clicks the toolbar icon), extracts the bib metadata, fetches the
 * holdings API for branch-specific call number resolution, fetches
 * the cover image, formats one TSV row per book, and copies the
 * result to the clipboard for pasting into Booklister's Quick Add
 * Spreadsheet tab.
 *
 * Two capture modes:
 *
 * Single-record mode (URL = /v2/record/<bibId>): captures the one
 * book on the page. If the user has Accumulate mode enabled in
 * options, the row is appended to a running list in storage and the
 * full accumulated TSV is placed on the clipboard.
 *
 * List-page mode (URL = /v2/list/<...>): captures every book on the
 * curated list in display order, in parallel. Operates independently
 * of Accumulate mode — the list-page TSV always overwrites the
 * clipboard rather than appending. Booklister's Quick Add Spreadsheet
 * handler already truncates over-limit pastes with a partial-success
 * notification, so a 50-book list pastes the first 13-15 (per current
 * MAX_BOOKS) and tells the user how many overflowed.
 *
 * The gateway and Syndetics fetches must run in the content script's
 * page context (not the service worker) for the gateway, but the
 * cover fetch is delegated to the service worker because Syndetics
 * doesn't return CORS headers — the service worker has host_permissions
 * for *.syndetics.com which lets it read the response body regardless.
 */

'use strict';

(function () {
  // ---------------------------------------------------------------------------
  // SSR state + URL utilities
  // ---------------------------------------------------------------------------

  /**
   * BiblioCommons server-renders a Redux state dump into a single JSON
   * <script> element. Same shape across consortiums (verified against
   * MARINet and Sonoma County, both running nerf07 9.35.x).
   */
  function readStateBlob() {
    const node = document.querySelector('script[type="application/json"][data-iso-key="_0"]');
    if (!node || !node.textContent) return null;
    try {
      return JSON.parse(node.textContent);
    } catch {
      return null;
    }
  }

  function getBibIdFromUrl() {
    const m = location.pathname.match(/\/v2\/record\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function getLibraryDomain() {
    const host = location.hostname;
    const m = host.match(/^([^.]+)\.bibliocommons\.com$/);
    return m ? m[1] : null;
  }

  function isListPage() {
    return /\/v2\/list\//.test(location.pathname);
  }

  // ---------------------------------------------------------------------------
  // Field cleaners
  // ---------------------------------------------------------------------------

  /**
   * Strip BiblioCommons' "lifetime dates" suffix from author names so
   * Booklister's flipAuthorName handles the comma-flip correctly.
   * "Styron, William, 1925-2006" → "Styron, William"
   * "Lawson, Jenny, 1973-"      → "Lawson, Jenny"
   * "Smith, John"               → "Smith, John" (unchanged)
   */
  function cleanAuthor(raw) {
    if (!raw) return '';
    return raw.replace(/,\s*\d{3,4}-?\d{0,4}\s*$/, '').trim();
  }

  /**
   * Combine title + subtitle as "Title: Subtitle" since Booklister's
   * title field is single-line. The post-colon word gets capitalized
   * by Booklister's title-case rule.
   */
  function buildTitle(title, subTitle) {
    const t = (title || '').trim();
    const s = (subTitle || '').trim();
    if (!t) return s;
    if (!s) return t;
    return `${t}: ${s}`;
  }

  // ---------------------------------------------------------------------------
  // Bib extraction — produces a normalized brief shape regardless of
  // whether we're on a record page or a list page. Normalized shape:
  //   { bibId, title, subTitle, author, coverUrl, fallbackCallNumber }
  // ---------------------------------------------------------------------------

  /**
   * Extract a normalized brief from a single-record SSR state blob.
   * Reads from state.entities.catalogBibs[bibId] which is keyed
   * differently than the list-page bibs and uses nested fields[] for
   * call numbers.
   */
  function extractRecordBrief(state, bibId) {
    const bib = state?.entities?.catalogBibs?.[bibId];
    if (!bib) return null;

    const brief = bib.brief || {};
    const creators = Array.isArray(brief.creators) ? brief.creators : [];
    const authorRaw = creators.length > 0 ? (creators[0].fullName || '') : '';

    let fallbackCallNumber = '';
    const fields = Array.isArray(bib.fields) ? bib.fields : [];
    for (const cat of fields) {
      if (cat?.category !== 'CALLCLASS') continue;
      for (const item of cat.items || []) {
        if (item?.fieldName !== 'CALLNO_LOCAL') continue;
        const fv = item.fieldValues || [];
        const values = fv[0]?.primary?.values || [];
        if (values.length > 0) {
          fallbackCallNumber = values[0];
          break;
        }
      }
      if (fallbackCallNumber) break;
    }

    const ci = brief.coverImage || {};
    const candidate = ci.large || ci.medium || ci.small || '';
    const coverUrl = (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim()))
      ? candidate.trim()
      : '';

    return {
      bibId,
      title: brief.title || '',
      subTitle: brief.subTitle || '',
      author: cleanAuthor(authorRaw),
      coverUrl,
      fallbackCallNumber,
    };
  }

  /**
   * Extract normalized briefs from a list-page SSR state, in display
   * order. Reads from state.list.bibsByMetadataId (full bib data per
   * book, keyed by metadataId) and state.list.items (an array that
   * preserves the curator's intended order).
   *
   * Returns an array of briefs. Books missing from bibsByMetadataId
   * (rare — happens when a bib was deleted from the catalog after the
   * list was created) are silently skipped.
   */
  function extractListBibs(state) {
    const items = state?.list?.items;
    const bibsByMd = state?.list?.bibsByMetadataId;
    if (!Array.isArray(items) || !bibsByMd || typeof bibsByMd !== 'object') {
      return [];
    }

    const result = [];
    for (const item of items) {
      const id = item?.metadataId;
      if (!id) continue;
      const bib = bibsByMd[id];
      if (!bib) continue;

      const authors = Array.isArray(bib.authors) ? bib.authors : [];
      const authorRaw = authors.length > 0
        ? (typeof authors[0] === 'string' ? authors[0] : (authors[0]?.name || ''))
        : '';

      const imageUrl = (typeof bib.imageUrl === 'string' && /^https?:\/\//i.test(bib.imageUrl.trim()))
        ? bib.imageUrl.trim()
        : '';

      result.push({
        bibId: id,
        title: bib.title || '',
        subTitle: bib.subtitle || '',
        author: cleanAuthor(authorRaw),
        coverUrl: imageUrl,
        fallbackCallNumber: bib.callNumber || '',
      });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Holdings API + branch / call-number selection
  // ---------------------------------------------------------------------------

  async function fetchHoldings(libraryDomain, bibId) {
    const url = `https://gateway.bibliocommons.com/v2/libraries/${encodeURIComponent(libraryDomain)}/bibs/${encodeURIComponent(bibId)}/availability?locale=en-US`;
    try {
      const resp = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  function flattenItems(holdingsResponse) {
    const items = holdingsResponse?.entities?.bibItems;
    if (!items || typeof items !== 'object') return [];
    return Object.values(items).map((it) => ({
      branchName: it.branch?.name || it.branchName || '',
      branchCode: it.branch?.code || '',
      callNumber: it.callNumber || '',
      statusType: it.availability?.statusType || '',
      local: !!it.local,
    }));
  }

  /**
   * Pick the best item for the user's preferred branch:
   *   1. If preferredBranch is set, filter items whose branchName or
   *      branchCode contains it (case-insensitive).
   *   2. Otherwise filter to items where the API marks `local: true`.
   *   3. If either filter yields nothing, fall through to all items.
   *   4. Within the candidate list, prefer AVAILABLE over UNAVAILABLE.
   *   5. Take the first remaining item.
   */
  function pickItem(allItems, preferredBranchSubstring) {
    if (allItems.length === 0) return null;
    const pref = (preferredBranchSubstring || '').trim().toLowerCase();
    let candidates;
    if (pref) {
      candidates = allItems.filter((it) =>
        it.branchName.toLowerCase().includes(pref) ||
        it.branchCode.toLowerCase() === pref
      );
      if (candidates.length === 0) {
        candidates = allItems.filter((it) => it.local);
      }
    } else {
      candidates = allItems.filter((it) => it.local);
    }
    if (candidates.length === 0) candidates = allItems;
    const available = candidates.filter((it) => it.statusType === 'AVAILABLE');
    return available.length > 0 ? available[0] : candidates[0];
  }

  // ---------------------------------------------------------------------------
  // Cover fetch (delegated to the service worker for CORS bypass)
  // ---------------------------------------------------------------------------

  async function fetchCoverAsDataUrl(coverUrl) {
    if (!coverUrl) return '';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'fetch-image-as-data-url',
        url: coverUrl,
      });
      if (resp && resp.ok && typeof resp.dataUrl === 'string') {
        return resp.dataUrl;
      }
    } catch {
      // SW may have been wakened too late; treat as no-cover.
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // Per-book pipeline: brief → TSV row
  // ---------------------------------------------------------------------------

  /**
   * Run the holdings + cover fetches in parallel for one book, pick
   * the best call number per the user's preferred branch, and format
   * a single TSV row. Used by both single-record and list-page modes.
   */
  async function captureOneBibToTsvRow(libraryDomain, brief, preferredBranch) {
    let callNumber = brief.fallbackCallNumber || '';
    const [holdings, coverDataUrl] = await Promise.all([
      fetchHoldings(libraryDomain, brief.bibId),
      fetchCoverAsDataUrl(brief.coverUrl),
    ]);
    if (holdings) {
      const items = flattenItems(holdings);
      const picked = pickItem(items, preferredBranch);
      if (picked && picked.callNumber) callNumber = picked.callNumber;
    }
    const fullTitle = buildTitle(brief.title, brief.subTitle);
    return buildTsvRow(fullTitle, brief.author, callNumber, coverDataUrl);
  }

  function buildTsvRow(title, author, callNumber, coverUrl) {
    const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
    return `${clean(title)}\t${clean(author)}\t${clean(callNumber)}\t${clean(coverUrl)}`;
  }

  // ---------------------------------------------------------------------------
  // Storage helpers (preferences + accumulated list)
  // ---------------------------------------------------------------------------

  async function readPreferredBranch() {
    try {
      const stored = await chrome.storage.sync.get({ preferredBranch: '' });
      return stored.preferredBranch || '';
    } catch {
      return '';
    }
  }

  async function readAccumulateMode() {
    try {
      const stored = await chrome.storage.sync.get({ accumulateMode: false });
      return !!stored.accumulateMode;
    } catch {
      return false;
    }
  }

  async function readAccumulatedRows() {
    try {
      const stored = await chrome.storage.local.get({ accumulatedRows: [] });
      return Array.isArray(stored.accumulatedRows) ? stored.accumulatedRows : [];
    } catch {
      return [];
    }
  }

  async function writeAccumulatedRows(rows) {
    try {
      await chrome.storage.local.set({ accumulatedRows: rows });
    } catch {
      // Storage failures shouldn't break clipboard write; swallow.
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard + toast
  // ---------------------------------------------------------------------------

  async function writeToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  function showToast(message, kind) {
    const existing = document.getElementById('booklister-helper-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'booklister-helper-toast';
    el.textContent = message;
    el.style.cssText = [
      'position:fixed',
      'top:20px',
      'right:20px',
      'z-index:2147483647',
      'padding:12px 16px',
      'border-radius:6px',
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif',
      'font-size:14px',
      'font-weight:500',
      'color:#fff',
      `background:${kind === 'error' ? '#b00020' : kind === 'info' ? '#1565c0' : '#2e7d32'}`,
      'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
      'opacity:0',
      'transition:opacity 200ms ease',
      'max-width:360px',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, kind === 'info' ? 1500 : 2500);
  }

  // ---------------------------------------------------------------------------
  // Mode handlers
  // ---------------------------------------------------------------------------

  async function handleSingleCapture() {
    const bibId = getBibIdFromUrl();
    const libraryDomain = getLibraryDomain();
    if (!bibId || !libraryDomain) {
      showToast('Open a BiblioCommons book record first.', 'error');
      return { ok: false, reason: 'not-on-record-page' };
    }

    const state = readStateBlob();
    const brief = state ? extractRecordBrief(state, bibId) : null;
    if (!brief || !brief.title) {
      showToast("Couldn't read the book's title from the page.", 'error');
      return { ok: false, reason: 'no-bib-metadata' };
    }

    const pref = await readPreferredBranch();
    const row = await captureOneBibToTsvRow(libraryDomain, brief, pref);

    const accumulate = await readAccumulateMode();
    let tsv;
    let toastMessage;

    if (accumulate) {
      const existing = await readAccumulatedRows();
      existing.push(row);
      await writeAccumulatedRows(existing);
      tsv = existing.join('\n');
      toastMessage = `Added — ${existing.length} ${existing.length === 1 ? 'book' : 'books'} in list. Paste into Booklister Quick Add → Spreadsheet.`;
    } else {
      tsv = row;
      toastMessage = 'Copied! Paste into Booklister Quick Add → Spreadsheet tab.';
    }

    const wrote = await writeToClipboard(tsv);
    if (!wrote) {
      showToast('Could not copy to clipboard.', 'error');
      return { ok: false, reason: 'clipboard-failed' };
    }
    showToast(toastMessage, 'success');
    return { ok: true };
  }

  async function handleListCapture(bibIdFilter) {
    const libraryDomain = getLibraryDomain();
    if (!libraryDomain) {
      showToast("Couldn't identify the library from this URL.", 'error');
      return { ok: false, reason: 'no-library' };
    }

    const state = readStateBlob();
    let bibs = state ? extractListBibs(state) : [];
    if (bibs.length === 0) {
      showToast('No books found on this list page.', 'error');
      return { ok: false, reason: 'empty-list' };
    }

    // Optional filter from the popup's selection UI. If provided, keep
    // only the bibs the user checked, in the order they appear on the
    // list page (we use the page-order array, not the selection order
    // — the user's intent is "these N from the list" not "in the order
    // I clicked them").
    if (Array.isArray(bibIdFilter) && bibIdFilter.length > 0) {
      const want = new Set(bibIdFilter);
      bibs = bibs.filter((b) => want.has(b.bibId));
      if (bibs.length === 0) {
        showToast('No matching books found.', 'error');
        return { ok: false, reason: 'no-matches' };
      }
    }

    showToast(`Capturing ${bibs.length} books — this may take a few seconds...`, 'info');

    const pref = await readPreferredBranch();
    const rowPromises = bibs.map((b) => captureOneBibToTsvRow(libraryDomain, b, pref));
    const rows = await Promise.all(rowPromises);

    const tsv = rows.join('\n');
    const wrote = await writeToClipboard(tsv);
    if (!wrote) {
      showToast('Could not copy to clipboard.', 'error');
      return { ok: false, reason: 'clipboard-failed' };
    }

    const noun = rows.length === 1 ? 'book' : 'books';
    showToast(`Copied ${rows.length} ${noun} — paste into Booklister Quick Add → Spreadsheet tab. Booklister will fit as many as your slots allow.`, 'success');
    return { ok: true };
  }

  async function handleCapture() {
    if (isListPage()) return handleListCapture();
    return handleSingleCapture();
  }

  /**
   * Return shallow briefs for the popup's selection UI. Skips the
   * per-book holdings + cover fetches (those run later, only for the
   * books the user actually selects). Cover URL is the raw Syndetics
   * URL — popup's <img> tag loads it directly without the SW proxy
   * (img tags don't need CORS for display).
   */
  function handleListPageBibs() {
    const state = readStateBlob();
    if (!state) return { ok: false, reason: 'no-state' };
    const bibs = extractListBibs(state);
    if (bibs.length === 0) return { ok: false, reason: 'empty-list' };
    return {
      ok: true,
      bibs: bibs.map((b) => ({
        bibId: b.bibId,
        title: b.title,
        subTitle: b.subTitle,
        author: b.author,
        callNumber: b.fallbackCallNumber,
        coverUrl: b.coverUrl,
      })),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'capture') {
      handleCapture().then(sendResponse).catch((err) => {
        console.error('[Booklister Helper] capture failed:', err);
        sendResponse({ ok: false, reason: 'exception' });
      });
      return true; // keep channel open for async response
    }
    if (msg?.type === 'capture-selected-bibs') {
      // Popup → fire-and-forget. The popup window has already closed by
      // the time we get here, so there's no sender to respond to.
      handleListCapture(Array.isArray(msg.bibIds) ? msg.bibIds : []).catch((err) => {
        console.error('[Booklister Helper] selected-capture failed:', err);
      });
      return false;
    }
    if (msg?.type === 'list-page-bibs') {
      // Synchronous reply — no async work, just read the state blob.
      sendResponse(handleListPageBibs());
      return false;
    }
    return false;
  });
})();

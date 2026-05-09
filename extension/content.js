/**
 * Booklister Helper — content script
 *
 * Runs on BiblioCommons record pages (*.bibliocommons.com/v2/record/*).
 * On a message from the background service worker (sent when the user
 * clicks the toolbar icon), extracts the bib metadata, fetches the
 * holdings API for branch-specific call number resolution, formats a
 * single TSV row, and copies it to the clipboard for pasting into
 * Booklister's Quick Add Spreadsheet tab.
 *
 * The fetch must run in the content script (not the background worker)
 * because the BiblioCommons gateway API is CORS-locked to the parent
 * library domain (e.g. access-control-allow-origin:
 * https://marinet.bibliocommons.com). A service-worker fetch would
 * carry the chrome-extension:// origin and be rejected.
 */

'use strict';

(function () {
  // ---------------------------------------------------------------------------
  // Bib metadata extraction (from the SSR JSON state blob)
  // ---------------------------------------------------------------------------

  /**
   * BiblioCommons server-renders a Redux state dump into a single JSON
   * <script> element. Same shape across consortiums (verified against
   * MARINet and Sonoma County, both running nerf07 9.35.x). Returns
   * null if the blob can't be found or parsed; callers fall back to
   * JSON-LD or DOM scraping.
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

  /**
   * Bib ID is the trailing path segment after /v2/record/, e.g.
   * /v2/record/S113C1648997 → "S113C1648997". The leading "S" + library
   * id + "C" + bib id pattern is consistent across deployments but we
   * don't need to parse that — just take the segment.
   */
  function getBibIdFromUrl() {
    const m = location.pathname.match(/\/v2\/record\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /**
   * Library subdomain ("marinet", "sonoma", etc.) for use in the
   * gateway API URL. We could also pull this from the SSR state's
   * app.libraryDomain, but the hostname is simpler and equally reliable.
   */
  function getLibraryDomain() {
    const host = location.hostname;
    const m = host.match(/^([^.]+)\.bibliocommons\.com$/);
    return m ? m[1] : null;
  }

  /**
   * Strip BiblioCommons' "lifetime dates" suffix from author names so
   * Booklister's flipAuthorName helper handles the comma-flip correctly.
   * "Styron, William, 1925-2006" → "Styron, William"
   * "Lawson, Jenny, 1973-"      → "Lawson, Jenny"
   * "Smith, John"               → "Smith, John" (unchanged)
   * Single-comma names go through Booklister's flipAuthorName on add;
   * multi-comma names stay as-is to avoid mangling co-author lists.
   */
  function cleanAuthor(raw) {
    if (!raw) return '';
    return raw.replace(/,\s*\d{3,4}-?\d{0,4}\s*$/, '').trim();
  }

  /**
   * Combine title + subtitle as "Title: Subtitle" since Booklister's
   * title field is single-line. The post-colon word gets capitalized
   * by Booklister's title-case rule (recently fixed) so a subtitle
   * starting with "a", "of", or "with" still looks right.
   */
  function buildTitle(title, subTitle) {
    const t = (title || '').trim();
    const s = (subTitle || '').trim();
    if (!t) return s;
    if (!s) return t;
    return `${t}: ${s}`;
  }

  /**
   * Cover URL from the bib's brief.coverImage. BiblioCommons stores
   * three sizes (small/medium/large), all served from Syndetics with
   * the parent library's Syndetics client param. We take the largest
   * available because Booklister exports at 600 DPI; the smaller sizes
   * pixelate visibly when scaled up for print.
   *
   * The URL is sanity-checked to be http: or https:. The actual fetch
   * + base64 conversion happens in the service worker via
   * fetchCoverAsDataUrl below — this function just picks the URL.
   * Returns empty string if no cover.
   */
  function extractCoverUrl(brief) {
    const ci = brief?.coverImage;
    if (!ci || typeof ci !== 'object') return '';
    const candidate = ci.large || ci.medium || ci.small || '';
    if (!candidate || typeof candidate !== 'string') return '';
    if (!/^https?:\/\//i.test(candidate.trim())) return '';
    return candidate.trim();
  }

  /**
   * Ask the service worker to fetch the cover image and return it as
   * a base64 data URL. Embedding the image bytes (rather than passing
   * a hotlink URL through to Booklister) means:
   *
   *   - PDF export at 600 DPI works regardless of whether the cover
   *     provider returns CORS headers (html2canvas can render
   *     same-origin / data: URLs cleanly; a hotlinked Syndetics URL
   *     might or might not, depending on Syndetics' headers that day).
   *   - Saved .booklist files are self-contained — open one in 5 years
   *     and the cover still works even if Syndetics has changed
   *     domains, dropped the client= param, or gone away entirely.
   *   - No runtime dependency on BiblioCommons / Syndetics being up.
   *
   * Cost is ~30-80 KB of base64 per cover, which is comparable to
   * what Booklister would store anyway via its own image compression
   * (compressImage runs at JPEG 0.92 / max 1600px on uploads).
   *
   * Returns '' on any failure — the caller falls back to no cover.
   */
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
      // Service worker may have been wakened too late, or the fetch
      // failed. Either way, swallow and let the caller use no cover.
    }
    return '';
  }

  /**
   * Pull the bib's brief metadata from the SSR state. Returns
   * { title, subTitle, author, fallbackCallNumber, coverUrl } or null
   * if the state doesn't have this bib (which would be a structural
   * surprise).
   */
  function extractBibBrief(state, bibId) {
    const bib = state?.entities?.catalogBibs?.[bibId];
    if (!bib) return null;

    const brief = bib.brief || {};
    const creators = Array.isArray(brief.creators) ? brief.creators : [];
    const authorRaw = creators.length > 0 ? (creators[0].fullName || '') : '';

    // Fallback call number: first CALLNO_LOCAL value in the bib's
    // categorized fields. Used when the holdings API returns nothing.
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

    return {
      title: brief.title || '',
      subTitle: brief.subTitle || '',
      author: cleanAuthor(authorRaw),
      fallbackCallNumber,
      coverUrl: extractCoverUrl(brief),
    };
  }

  // ---------------------------------------------------------------------------
  // Holdings API + branch / call-number selection
  // ---------------------------------------------------------------------------

  /**
   * Fetch /v2/libraries/{lib}/bibs/{bib}/availability from the gateway.
   * Same-site CORS with credentials (cookies set on .bibliocommons.com),
   * so this runs cleanly from the content script's page context.
   * Returns the parsed JSON or null on any failure — caller falls back
   * to the SSR state's CALLNO_LOCAL.
   */
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

  /**
   * Normalize the holdings response into a flat list of items, each
   * with { branchName, branchCode, collection, callNumber, statusType,
   * libraryStatus, dueDate, local }. Order preserves the API order
   * (which is the order shown in the Availability by location table).
   */
  function flattenItems(holdingsResponse) {
    const items = holdingsResponse?.entities?.bibItems;
    if (!items || typeof items !== 'object') return [];
    return Object.values(items).map((it) => ({
      branchName: it.branch?.name || it.branchName || '',
      branchCode: it.branch?.code || '',
      collection: it.collection || '',
      callNumber: it.callNumber || '',
      statusType: it.availability?.statusType || '',
      libraryStatus: it.availability?.libraryStatus || '',
      dueDate: it.dueDate || null,
      local: !!it.local,
    }));
  }

  /**
   * Pick the best item for the user's preferred branch, with fallbacks.
   *
   * Selection order:
   *   1. If user set a preferred-branch substring, filter to items whose
   *      branchName or branchCode contains it (case-insensitive).
   *   2. If no user preference (or filter empty), filter to items where
   *      the API marks `local: true` (BiblioCommons' own signal for
   *      "this is the user's branch", based on logged-in account / IP).
   *   3. If still empty, take any item.
   *   4. Within the candidate list, prefer AVAILABLE items over
   *      UNAVAILABLE ones (so a user looking at a checked-out local
   *      copy still gets a usable call number from a sister branch).
   *   5. Return the first remaining item, or null if none.
   *
   * Returning null is fine — the caller falls back to the SSR state's
   * CALLNO_LOCAL[0] which is what shows up in the bib's main metadata.
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
        // User's preferred branch isn't represented for this bib —
        // fall through to the local-flag heuristic.
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
  // TSV formatting + clipboard
  // ---------------------------------------------------------------------------

  /**
   * Build a single TSV row matching parseQuickAddTsv's expected columns
   * in Booklister: title <TAB> author <TAB> callNumber <TAB> coverUrl.
   * The 4th column is the BiblioCommons cover image URL, which
   * Booklister stores into customCoverData on add. Empty coverUrl is
   * fine — Booklister falls back to the placeholder cover in that case.
   * Strip embedded tabs/newlines from each field so the row stays
   * single-line.
   */
  function buildTsvRow(title, author, callNumber, coverUrl) {
    const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
    return `${clean(title)}\t${clean(author)}\t${clean(callNumber)}\t${clean(coverUrl)}`;
  }

  /**
   * Write text to the clipboard. Uses the modern Clipboard API first;
   * falls back to a hidden-textarea + execCommand('copy') trick for
   * browsers / contexts that reject the async API. Returns true on
   * success, false otherwise.
   */
  async function writeToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to legacy path
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

  // ---------------------------------------------------------------------------
  // In-page toast (so the user gets visible feedback without a popup UI)
  // ---------------------------------------------------------------------------

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
      `background:${kind === 'error' ? '#b00020' : '#2e7d32'}`,
      'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
      'opacity:0',
      'transition:opacity 200ms ease',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Main handler — invoked when background sends 'capture-bib'
  // ---------------------------------------------------------------------------

  async function handleCapture() {
    const bibId = getBibIdFromUrl();
    const libraryDomain = getLibraryDomain();
    if (!bibId || !libraryDomain) {
      showToast('Open a BiblioCommons book record first.', 'error');
      return { ok: false, reason: 'not-on-record-page' };
    }

    const state = readStateBlob();
    const brief = state ? extractBibBrief(state, bibId) : null;
    if (!brief || !brief.title) {
      showToast("Couldn't read the book's title from the page.", 'error');
      return { ok: false, reason: 'no-bib-metadata' };
    }

    // User preference (if set). Empty string = use API's `local: true`.
    let pref = '';
    try {
      const stored = await chrome.storage.sync.get({ preferredBranch: '' });
      pref = stored.preferredBranch || '';
    } catch {
      // Storage failure is non-fatal — fall through with empty pref.
    }

    // Run the holdings + cover fetches in parallel — they're independent
    // and each takes a few hundred ms. Doing them sequentially would
    // double the user-visible latency for no reason.
    let callNumber = brief.fallbackCallNumber;
    const [holdings, coverDataUrl] = await Promise.all([
      fetchHoldings(libraryDomain, bibId),
      fetchCoverAsDataUrl(brief.coverUrl),
    ]);
    if (holdings) {
      const items = flattenItems(holdings);
      const picked = pickItem(items, pref);
      if (picked && picked.callNumber) callNumber = picked.callNumber;
    }

    const fullTitle = buildTitle(brief.title, brief.subTitle);
    const tsv = buildTsvRow(fullTitle, brief.author, callNumber, coverDataUrl);
    const wrote = await writeToClipboard(tsv);

    if (!wrote) {
      showToast('Could not copy to clipboard.', 'error');
      return { ok: false, reason: 'clipboard-failed' };
    }

    showToast('Copied! Paste into Booklister Quick Add → Spreadsheet tab.', 'success');
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Wire the message listener for background.js
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'capture-bib') return false;
    handleCapture().then(sendResponse).catch((err) => {
      // Defensive: any uncaught error should still return a structured
      // response so background.js's promise resolves.
      console.error('[Booklister Helper] capture failed:', err);
      sendResponse({ ok: false, reason: 'exception' });
    });
    return true; // keep the message channel open for the async response
  });
})();

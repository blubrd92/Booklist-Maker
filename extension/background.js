/**
 * Booklister Helper — background service worker
 *
 * Listens for toolbar icon clicks and forwards a 'capture-bib' message
 * to the active tab's content script. The content script does all the
 * actual work (DOM scraping, API fetch, clipboard write) because the
 * BiblioCommons gateway API only accepts requests from a *.bibliocommons.com
 * origin — a service-worker fetch carrying the chrome-extension:// origin
 * would be CORS-rejected.
 *
 * On non-record pages or non-BiblioCommons domains, surface a small
 * badge ("?") on the toolbar icon for ~2s so the user gets feedback
 * instead of a silent no-op.
 */

'use strict';

const RECORD_PATH_RE = /\/v2\/record\//;

function isBibliocommonsRecordUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('.bibliocommons.com') && RECORD_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Flash the toolbar badge for ~2 seconds with the given text + color.
 * Used for both error feedback (red "?", "X") and quiet success
 * confirmation alongside the in-page toast that the content script shows.
 */
async function flashBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text, tabId });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    }, 2000);
  } catch {
    // Badge API failures aren't worth blocking on.
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (!isBibliocommonsRecordUrl(tab.url)) {
    // User clicked while looking at something other than a bib page.
    // Silent failure isn't great UX; flash a "?" badge so they notice.
    await flashBadge(tab.id, '?', '#b00020');
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: 'capture-bib' });
  } catch (err) {
    // sendMessage rejects when there's no listener — usually means
    // the content script hasn't loaded yet (e.g. user clicked very
    // fast on a still-loading page). Tell them and let them retry.
    console.warn('[Booklister Helper] no content script listening:', err);
    await flashBadge(tab.id, '!', '#b00020');
    return;
  }

  if (response && response.ok) {
    await flashBadge(tab.id, '✓', '#2e7d32');
  } else {
    await flashBadge(tab.id, 'X', '#b00020');
  }
});

// ---------------------------------------------------------------------------
// Image-fetch proxy for the content script
// ---------------------------------------------------------------------------

/**
 * The content script can't reliably fetch cover images directly: cover
 * providers like Syndetics are cross-origin to the BiblioCommons page,
 * and they don't always return CORS headers — a content-script fetch
 * would be blocked. Fetching here in the service worker bypasses CORS
 * because manifest host_permissions grant the extension privileged
 * access to the listed origins (`*.syndetics.com`, etc.).
 *
 * Returns a base64 data URL so the content script can embed it
 * directly in the TSV's coverUrl column. Booklister's customCoverData
 * field accepts both http(s) URLs and data: URLs interchangeably.
 *
 * Service workers in MV3 don't have FileReader, so we convert
 * arrayBuffer → bytes → base64 manually with btoa. The per-byte loop
 * is fine for typical cover sizes (~30-80 KB).
 */
async function fetchImageAsDataUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'invalid-url' };
  }
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) return { ok: false, reason: 'http-' + resp.status };
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) {
      // Defensive: if the server returns text/html (a 200 error page
      // disguised as HTTP success) we'd otherwise embed garbage.
      return { ok: false, reason: 'not-an-image' };
    }
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { ok: true, dataUrl: `data:${blob.type};base64,${base64}` };
  } catch (err) {
    console.warn('[Booklister Helper] cover fetch failed:', err);
    return { ok: false, reason: 'fetch-failed' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'fetch-image-as-data-url') return false;
  fetchImageAsDataUrl(msg.url).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'exception' }));
  return true; // keep the channel open for the async response
});

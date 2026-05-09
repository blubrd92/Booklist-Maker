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

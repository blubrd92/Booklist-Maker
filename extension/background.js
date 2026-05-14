/**
 * Booklister Helper background service worker
 *
 * Two responsibilities:
 *
 * 1. Handle toolbar icon clicks → forward a 'capture' message to the
 *    active tab's content script. The content script does all the
 *    actual work (DOM scraping, API fetch, clipboard write) because
 *    the BiblioCommons gateway API is CORS-locked to *.bibliocommons.com,
 *    so a service-worker fetch carrying chrome-extension:// would be
 *    rejected. Works on both single-record pages (/v2/record/) and
 *    list pages (/v2/list/).
 *
 * 2. Provide a 'fetch-image-as-data-url' RPC for the content script,
 *    used to fetch cover images from Syndetics and embed them as
 *    base64 in the TSV. The service worker's fetch IS allowed to
 *    bypass CORS for hosts in the manifest's host_permissions.
 *
 * Plus: persistent badge maintenance for accumulate mode (shows the
 * running count of staged books on the toolbar icon), and a right-
 * click context menu with "Clear accumulated list" and "Settings".
 * The Settings item opens options/options.html as a small popup
 * window (chrome.windows.create, type: 'popup') instead of relying
 * on the manifest's options_ui, which Chrome would otherwise surface
 * only via an embedded chrome://extensions modal. The selection
 * popup's gear button sends an 'open-options' message that lands
 * here and opens the same window.
 */

'use strict';

const RECORD_PATH_RE = /\/v2\/record\//;
const LIST_PATH_RE = /\/v2\/list\//;

/**
 * Whether the URL is a BiblioCommons page the extension can capture
 * from: either a single book record or a curated list page.
 */
function isBibliocommonsCapturablePage(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.bibliocommons.com')) return false;
    return RECORD_PATH_RE.test(u.pathname) || LIST_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Flash a transient badge for ~2 seconds. Used for one-shot success
 * (✓), error (X, !, ?). When accumulate mode is on, the persistent
 * count badge gets restored after the flash.
 */
async function flashBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => { restorePersistentBadge().catch(() => {}); }, 2000);
  } catch {
    // Badge API failures aren't worth blocking on.
  }
  // tabId param kept for future per-tab use; currently we set globally
  // because the accumulate-count badge spans tabs.
  void tabId;
}

// ---------------------------------------------------------------------------
// Persistent badge (accumulate mode count)
// ---------------------------------------------------------------------------

/**
 * Read the current accumulate state and reflect it on the toolbar
 * badge. If accumulate mode is off, or the list is empty, the badge
 * is cleared. Otherwise the count is shown in green.
 *
 * Called on service-worker startup, on storage changes, and after
 * every transient flash badge expires.
 */
async function restorePersistentBadge() {
  try {
    const sync = await chrome.storage.sync.get({ accumulateMode: false });
    const local = await chrome.storage.local.get({ accumulatedRows: [] });
    const count = Array.isArray(local.accumulatedRows) ? local.accumulatedRows.length : 0;
    if (sync.accumulateMode && count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#1565c0' });
      await chrome.action.setBadgeText({ text: String(count) });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('[Booklister Helper] restorePersistentBadge failed:', err);
  }
}

// Service worker can be restarted at any time; restore badge state
// on every startup so the count survives across SW lifetimes.
chrome.runtime.onStartup.addListener(() => {
  restorePersistentBadge();
  configurePopupForAllTabs();
});
chrome.runtime.onInstalled.addListener(() => {
  restorePersistentBadge();
  ensureContextMenu();
  configurePopupForAllTabs();
});

// React to storage changes from content.js (which mutates accumulatedRows
// when adding to the list) or from the options page (which can toggle
// accumulateMode or clear the list).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'accumulatedRows' in changes) restorePersistentBadge();
  if (area === 'sync' && 'accumulateMode' in changes) restorePersistentBadge();
});

// ---------------------------------------------------------------------------
// Settings window
// ---------------------------------------------------------------------------

/**
 * Open options/options.html as a small standalone popup window. The
 * manifest no longer declares options_ui, so this is the only path
 * to settings: it's reachable from the toolbar's right-click menu
 * and from the gear button in the selection popup. Auto-save in the
 * options page means the user can just close the window when done.
 *
 * If a settings window is already open, focus it instead of stacking
 * a duplicate. The check walks existing windows rather than caching
 * a window id, so it survives service-worker restarts.
 */
async function openOptionsWindow() {
  const optionsUrl = chrome.runtime.getURL('options/options.html');
  try {
    const wins = await chrome.windows.getAll({ populate: true });
    for (const win of wins) {
      const alreadyOpen = (win.tabs || []).some(
        (t) => t.url && t.url.startsWith(optionsUrl),
      );
      if (alreadyOpen) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
    await chrome.windows.create({
      url: optionsUrl,
      type: 'popup',
      width: 500,
      height: 640,
      focused: true,
    });
  } catch (err) {
    console.warn('[Booklister Helper] openOptionsWindow failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Right-click context menus
// ---------------------------------------------------------------------------

// Action context: appears when right-clicking the toolbar icon.
const MENU_ID_CLEAR_LIST = 'booklister-helper-clear-list';
const MENU_ID_SETTINGS = 'booklister-helper-settings';

// Page context: appears when right-clicking inside a BiblioCommons
// record or list page. documentUrlPatterns scopes the visibility so
// the item shows only on those URLs (mirroring how the toolbar icon
// is only useful on those pages).
const MENU_ID_CAPTURE_PAGE = 'booklister-helper-capture-page';

function ensureContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID_CLEAR_LIST,
        title: 'Clear accumulated list',
        contexts: ['action'],
      });
      chrome.contextMenus.create({
        id: MENU_ID_SETTINGS,
        title: 'Settings',
        contexts: ['action'],
      });
      chrome.contextMenus.create({
        id: MENU_ID_CAPTURE_PAGE,
        title: 'Capture for Booklister',
        contexts: ['page'],
        documentUrlPatterns: [
          '*://*.bibliocommons.com/v2/record/*',
          '*://*.bibliocommons.com/v2/list/*',
        ],
      });
    });
  } catch (err) {
    console.warn('[Booklister Helper] context menu setup failed:', err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_ID_CLEAR_LIST) {
    chrome.storage.local.set({ accumulatedRows: [] }).catch(() => {});
    return;
  }

  if (info.menuItemId === MENU_ID_SETTINGS) {
    await openOptionsWindow();
    return;
  }

  if (info.menuItemId === MENU_ID_CAPTURE_PAGE) {
    if (!tab || !tab.id) return;
    // On list pages, prefer to open the popup so the user gets the
    // selection UI (same as a left-click). On record pages (and as
    // a fallback if openPopup isn't supported in this Chrome
    // version), dispatch the capture message directly.
    const looksLikeListPage = tab.url
      ? (() => { try { return LIST_PATH_RE.test(new URL(tab.url).pathname); } catch { return false; } })()
      : false;
    if (looksLikeListPage && chrome.action.openPopup) {
      try {
        await chrome.action.openPopup();
        return;
      } catch {
        // openPopup not available or refused; fall through to direct
        // capture (which on a list page will grab everything).
      }
    }
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'capture' });
    } catch (err) {
      console.warn('[Booklister Helper] no content script listening:', err);
      await flashBadge(tab.id, '!', '#b00020');
      return;
    }
    if (response && response.ok) {
      await flashBadge(tab.id, '✓', '#2e7d32');
    } else {
      await flashBadge(tab.id, 'X', '#b00020');
    }
  }
});

// ---------------------------------------------------------------------------
// Per-tab popup configuration
// ---------------------------------------------------------------------------

/**
 * On /v2/list/ pages, the toolbar icon opens a popup that lets the
 * user select which books to capture (most curated lists are 30+
 * books; users typically want a specific subset of ~13 for a
 * Booklister booklist). On every other URL (including /v2/record/
 * pages) we leave the popup unset so chrome.action.onClicked fires
 * and the existing single-record / accumulate flow runs unchanged.
 *
 * setPopup is per-tab, so we wire it up via tabs.onUpdated and run
 * a one-time sweep of existing tabs on install / startup.
 */
function configurePopupForTab(tabId, url) {
  if (!url || !tabId) return;
  let popup = '';
  try {
    if (LIST_PATH_RE.test(new URL(url).pathname)) {
      popup = 'popup/popup.html';
    }
  } catch {
    // Invalid URL. leave popup empty so onClicked still fires.
  }
  chrome.action.setPopup({ tabId, popup }).catch(() => {});
}

function configurePopupForAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url) configurePopupForTab(tab.id, tab.url);
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // changeInfo.url fires on SPA navigations (BiblioCommons IS an SPA);
  // changeInfo.status === 'complete' covers initial loads. Either is
  // a valid trigger for re-evaluating the popup setting.
  if (changeInfo.url || changeInfo.status === 'complete') {
    configurePopupForTab(tabId, tab.url);
  }
});

// ---------------------------------------------------------------------------
// Toolbar click → 'capture' message to content script
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (!isBibliocommonsCapturablePage(tab.url)) {
    // User clicked while looking at something other than a record or
    // list page. Flash a "?" so they notice.
    await flashBadge(tab.id, '?', '#b00020');
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: 'capture' });
  } catch (err) {
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
 * and they don't always return CORS headers, so a content-script fetch
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
  if (msg?.type === 'fetch-image-as-data-url') {
    fetchImageAsDataUrl(msg.url).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'exception' }));
    return true; // keep the channel open for the async response
  }
  if (msg?.type === 'open-options') {
    // Fire-and-forget: the selection popup sends this then closes
    // itself, so there's no response channel to keep open.
    openOptionsWindow();
    return false;
  }
  return false;
});

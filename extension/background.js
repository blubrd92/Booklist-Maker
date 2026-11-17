/**
 * Booklister Helper background service worker
 *
 * The popup (popup/popup.html) is always-on via action.default_popup and
 * does the user-facing work: it has a context-aware Capture tab and a
 * Settings tab. The content script does the actual scraping, API fetches,
 * and clipboard writes. That leaves this service worker with three small
 * jobs:
 *
 * 1. A 'fetch-image-as-data-url' RPC for the content script. Cover
 *    providers like Syndetics don't return CORS headers, but the service
 *    worker's fetch can read their bytes because the manifest's
 *    host_permissions grant privileged access to those origins.
 *
 * 2. The persistent toolbar badge: when accumulate mode is on, it shows
 *    the running count of staged books. Restored on startup and on every
 *    storage change so it survives service-worker restarts.
 *
 * 3. Two right-click context menu items: "Clear accumulated list" on the
 *    toolbar icon, and "Capture for Booklister" on BiblioCommons pages
 *    (which just opens the popup, the same as clicking the toolbar icon).
 *
 * All extension API calls go through the `browser.*` namespace (the
 * webextension-polyfill provides the promise-based shim in Chrome/Edge;
 * Firefox has it natively), so the same code runs unmodified in every
 * browser.
 */

'use strict';

// Load the cross-browser API polyfill. Chrome/Edge run this file as an
// MV3 service worker, where importScripts is available. Firefox runs it
// as a background-page script and loads the polyfill via the manifest's
// background.scripts array instead, where importScripts doesn't exist,
// hence the typeof guard.
if (typeof importScripts === 'function') {
  importScripts('vendor/browser-polyfill.min.js');
}

// ---------------------------------------------------------------------------
// Persistent badge (accumulate mode count)
// ---------------------------------------------------------------------------

/**
 * Read the current accumulate state and reflect it on the toolbar badge.
 * If accumulate mode is off, or the list is empty, the badge is cleared.
 * Otherwise the running count is shown.
 *
 * Called on service-worker startup and on every storage change so the
 * count survives across service-worker lifetimes.
 */
async function restorePersistentBadge() {
  try {
    const sync = await browser.storage.sync.get({ accumulateMode: false });
    const local = await browser.storage.local.get({ accumulatedRows: [] });
    const count = Array.isArray(local.accumulatedRows) ? local.accumulatedRows.length : 0;
    if (sync.accumulateMode && count > 0) {
      await browser.action.setBadgeBackgroundColor({ color: '#1565c0' });
      await browser.action.setBadgeText({ text: String(count) });
    } else {
      await browser.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('[Booklister Helper] restorePersistentBadge failed:', err);
  }
}

browser.runtime.onStartup.addListener(() => {
  restorePersistentBadge();
  // Re-register the menus on browser startup too, not just onInstalled.
  // Chromium persists menus across restarts, but Firefox's non-persistent
  // background page has been known to lose them; ensureContextMenu is
  // idempotent (removeAll + fixed ids), so re-running it is safe on both.
  ensureContextMenu();
});
browser.runtime.onInstalled.addListener(() => {
  restorePersistentBadge();
  ensureContextMenu();
});

// React to storage changes from content.js (which mutates accumulatedRows
// when adding to the list) or from the popup's Settings tab (which can
// toggle accumulateMode or clear the list).
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'accumulatedRows' in changes) restorePersistentBadge();
  if (area === 'sync' && 'accumulateMode' in changes) restorePersistentBadge();
});

// ---------------------------------------------------------------------------
// Right-click context menus
// ---------------------------------------------------------------------------

// Action context: appears when right-clicking the toolbar icon.
const MENU_ID_CLEAR_LIST = 'booklister-helper-clear-list';

// Page context: appears when right-clicking inside a BiblioCommons record
// or list page. documentUrlPatterns scopes the visibility so the item
// shows only on those URLs.
const MENU_ID_CAPTURE_PAGE = 'booklister-helper-capture-page';

async function ensureContextMenu() {
  // NOTE: removeAll must be awaited, not given a callback. The polyfill
  // wraps it with maxArgs: 0, so passing a callback throws synchronously
  // ("Expected at most 0 arguments") — which previously meant the menus
  // were never created on Chrome/Edge and the catch silently ate it.
  try {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_ID_CLEAR_LIST,
      title: 'Clear accumulated list',
      contexts: ['action'],
    });
    browser.contextMenus.create({
      id: MENU_ID_CAPTURE_PAGE,
      title: 'Capture for Booklister',
      contexts: ['page'],
      documentUrlPatterns: [
        '*://*.bibliocommons.com/v2/record/*',
        '*://*.bibliocommons.com/v2/list/*',
      ],
    });
  } catch (err) {
    console.warn('[Booklister Helper] context menu setup failed:', err);
  }
}

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID_CLEAR_LIST) {
    browser.storage.local.set({ accumulatedRows: [] }).catch(() => {});
    return;
  }

  if (info.menuItemId === MENU_ID_CAPTURE_PAGE) {
    // The popup is always-on now, so "Capture for Booklister" just opens
    // it, the same as clicking the toolbar icon. openPopup needs a recent
    // browser; on older ones the item is a no-op and the user can click
    // the toolbar icon instead.
    if (browser.action.openPopup) {
      browser.action.openPopup().catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// Image-fetch proxy for the content script
// ---------------------------------------------------------------------------

// The cover URL comes from the catalog page's own state blob, which is
// page-controlled data, so this proxy only fetches from the cover hosts
// the manifest already grants (and never the gateway API), only image
// types, and only up to a size no real cover approaches. Plain http is
// still accepted on those hosts because older Syndetics links use it.
const COVER_HOST_SUFFIXES = ['syndetics.com', 'hoopladigital.com', 'bibliocommons.com'];
const BLOCKED_COVER_HOSTS = ['gateway.bibliocommons.com'];
const COVER_TYPES = /^image\/(jpe?g|png|gif|webp)$/i;
const MAX_COVER_BYTES = 5 * 1024 * 1024; // real covers are ~30-500 KB

function isAllowedCoverUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (BLOCKED_COVER_HOSTS.includes(host)) return false;
  return COVER_HOST_SUFFIXES.some((d) => host === d || host.endsWith('.' + d));
}

/**
 * The content script can't reliably fetch cover images directly: cover
 * providers like Syndetics are cross-origin to the BiblioCommons page,
 * and they don't always return CORS headers, so a content-script fetch
 * would be blocked. Fetching here in the service worker bypasses CORS
 * because manifest host_permissions grant the extension privileged
 * access to the listed origins (`*.syndetics.com`, etc.).
 *
 * Returns a base64 data URL so the content script can embed it directly
 * in the TSV's coverUrl column. Booklister's customCoverData field
 * accepts both http(s) URLs and data: URLs interchangeably.
 *
 * Service workers in MV3 don't have FileReader, so we convert
 * arrayBuffer -> bytes -> base64 manually with btoa. The per-byte loop
 * is fine for typical cover sizes (~30-80 KB).
 */
async function fetchImageAsDataUrl(url) {
  if (typeof url !== 'string' || !isAllowedCoverUrl(url)) {
    return { ok: false, reason: 'invalid-url' };
  }
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) return { ok: false, reason: 'http-' + resp.status };
    const declared = Number(resp.headers.get('content-length'));
    if (declared > MAX_COVER_BYTES) return { ok: false, reason: 'too-large' };
    const blob = await resp.blob();
    if (blob.size > MAX_COVER_BYTES) return { ok: false, reason: 'too-large' };
    const mime = blob.type.split(';')[0].trim().toLowerCase();
    if (!COVER_TYPES.test(mime)) {
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
    return { ok: true, dataUrl: `data:${mime};base64,${base64}` };
  } catch (err) {
    console.warn('[Booklister Helper] cover fetch failed:', err);
    return { ok: false, reason: 'fetch-failed' };
  }
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'fetch-image-as-data-url') {
    // Only this extension's own content scripts and pages may use the proxy.
    if (sender?.id !== browser.runtime.id) return false;
    fetchImageAsDataUrl(msg.url).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'exception' }));
    return true; // keep the channel open for the async response
  }
  return false;
});

'use strict';

// The popup is now always-on (action.default_popup), so it has to handle
// every context: a BiblioCommons record page, a BiblioCommons list page,
// or anything else. It has two tabs: Capture (context-aware) and Settings.

// ── Element refs ──
const tabBtns = document.querySelectorAll('.tab');
const paneCapture = document.getElementById('pane-capture');
const paneSettings = document.getElementById('pane-settings');

const captureLoading = document.getElementById('capture-loading');
const captureMessage = document.getElementById('capture-message');
const captureList = document.getElementById('capture-list');
const captureRecord = document.getElementById('capture-record');

// List-mode els
const listEl = document.getElementById('list');
const selectedCountEl = document.getElementById('selected-count');
const captureListBtn = document.getElementById('capture-list-btn');
const selectAllBtn = document.getElementById('select-all');
const firstNBtns = document.querySelectorAll('.first-n-btn');
const selectNoneBtn = document.getElementById('select-none');

// Record-mode els
const recordPreviewEl = document.getElementById('record-preview');
const captureRecordBtn = document.getElementById('capture-record-btn');

// Settings els
const branchInput = document.getElementById('preferred-branch');
const accumulateToggle = document.getElementById('accumulate-mode');
const accumulateCount = document.getElementById('accumulate-count');
const copyBtn = document.getElementById('copy-list');
const clearBtn = document.getElementById('clear-list');
const savedIndicator = document.getElementById('saved');

// A Booklister booklist holds 13-15 titles depending on whether the QR
// and branding blocks are on. The toolbar exposes one button per choice
// (First 13 / 14 / 15) so each click runs the action regardless of state
// — a <select> would only fire `change` on actual value change, leaving
// the user unable to re-apply the value already shown.
const RECORD_PATH_RE = /\/v2\/record\//;
const LIST_PATH_RE = /\/v2\/list\//;

let activeTabId = null;
let books = []; // [{bibId, title, subTitle, author, callNumber, coverUrl}, ...]
let selected = new Set(); // bibIds

// ── Tab switching ──
function showTab(name) {
  for (const btn of tabBtns) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  paneCapture.classList.toggle('hidden', name !== 'capture');
  paneSettings.classList.toggle('hidden', name !== 'settings');
}
for (const btn of tabBtns) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

// Renders one book row. With { selectable: true } it's a <label> with a
// checkbox (the list selection UI); without, it's a plain <div> preview
// (the record-page Capture tab).
function renderBookRow(book, { selectable }) {
  const row = document.createElement(selectable ? 'label' : 'div');
  row.className = 'row';

  if (selectable) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(book.bibId);
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(book.bibId);
      else selected.delete(book.bibId);
      updateCount();
    });
    row.appendChild(cb);
  }

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.alt = '';
  // Raw http(s) cover URL; an <img> tag loads it directly, no CORS needed.
  if (book.coverUrl) thumb.src = book.coverUrl;

  const info = document.createElement('div');
  info.className = 'info';

  const title = document.createElement('div');
  title.className = 'title';
  const fullTitle = book.subTitle ? `${book.title}: ${book.subTitle}` : book.title;
  title.textContent = fullTitle || '(untitled)';
  title.title = fullTitle;

  const author = document.createElement('div');
  author.className = 'author';
  author.textContent = book.author || ' ';

  info.appendChild(title);
  info.appendChild(author);

  if (book.callNumber) {
    const call = document.createElement('div');
    call.className = 'call';
    call.appendChild(document.createTextNode('Call: '));
    const code = document.createElement('code');
    code.textContent = book.callNumber;
    call.appendChild(code);
    info.appendChild(call);
  }

  row.appendChild(thumb);
  row.appendChild(info);
  return row;
}

// Show exactly one of the capture pane's sub-views.
function showCaptureSubview(which) {
  captureLoading.classList.toggle('hidden', which !== 'loading');
  captureMessage.classList.toggle('hidden', which !== 'message');
  captureList.classList.toggle('hidden', which !== 'list');
  captureRecord.classList.toggle('hidden', which !== 'record');
}

// ── Capture pane: list mode ──
function renderList() {
  listEl.replaceChildren();
  for (const book of books) {
    listEl.appendChild(renderBookRow(book, { selectable: true }));
  }
}

function updateCount() {
  const n = selected.size;
  selectedCountEl.textContent = `${n} of ${books.length} selected`;
  captureListBtn.disabled = n === 0;
  captureListBtn.textContent = n === 0
    ? 'Capture selected'
    : `Capture ${n} ${n === 1 ? 'title' : 'titles'}`;
}

selectAllBtn.addEventListener('click', () => {
  selected = new Set(books.map((b) => b.bibId));
  renderList();
  updateCount();
});
// Each First-N button selects that many books. Three separate buttons
// (not one <select>) so the click always runs the action, including
// when the user re-clicks the same N.
for (const btn of firstNBtns) {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.dataset.n, 10);
    if (!n) return;
    selected = new Set(books.slice(0, n).map((b) => b.bibId));
    renderList();
    updateCount();
  });
}
selectNoneBtn.addEventListener('click', () => {
  selected = new Set();
  renderList();
  updateCount();
});

captureListBtn.addEventListener('click', () => {
  if (selected.size === 0 || activeTabId === null) return;
  // Fire-and-forget: the capture pipeline (per-book holdings + cover
  // fetches) runs in the content script and takes several seconds. The
  // popup closes immediately; the content script's in-page toast is the
  // user's progress + completion feedback.
  // .catch() so a tab that navigated away since the popup opened doesn't
  // surface an unhandled rejection; there's no UI left to report into.
  browser.tabs.sendMessage(activeTabId, {
    type: 'capture-selected-bibs',
    bibIds: Array.from(selected),
  }).catch(() => {});
  window.close();
});

async function initListMode() {
  showCaptureSubview('loading');
  let resp;
  try {
    resp = await browser.tabs.sendMessage(activeTabId, { type: 'list-page-bibs' });
  } catch {
    captureMessage.textContent = 'Could not reach the page. Refresh the tab and reopen this popup.';
    showCaptureSubview('message');
    return;
  }
  if (!resp || !resp.ok || !Array.isArray(resp.bibs) || resp.bibs.length === 0) {
    captureMessage.textContent = 'No titles found on this list page.';
    showCaptureSubview('message');
    return;
  }
  books = resp.bibs;
  // Default selection: everything. The All / First N / None controls and
  // the per-row checkboxes let the user narrow it down.
  selected = new Set(books.map((b) => b.bibId));
  renderList();
  updateCount();
  showCaptureSubview('list');
}

// ── Capture pane: record mode ──
captureRecordBtn.addEventListener('click', () => {
  if (activeTabId === null) return;
  // Fire-and-forget, same rationale (and same .catch) as the list
  // capture above.
  browser.tabs.sendMessage(activeTabId, { type: 'capture' }).catch(() => {});
  window.close();
});

async function initRecordMode() {
  showCaptureSubview('loading');
  let resp;
  try {
    resp = await browser.tabs.sendMessage(activeTabId, { type: 'record-page-brief' });
  } catch {
    captureMessage.textContent = 'Could not reach the page. Refresh the tab and reopen this popup.';
    showCaptureSubview('message');
    return;
  }
  if (!resp || !resp.ok || !resp.brief) {
    captureMessage.textContent = "Could not read this title's details from the page.";
    showCaptureSubview('message');
    return;
  }
  recordPreviewEl.replaceChildren();
  recordPreviewEl.appendChild(renderBookRow(resp.brief, { selectable: false }));
  showCaptureSubview('record');
}

// ── Capture pane: entry point ──
async function initCapture() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab && tab.id != null ? tab.id : null;
  // tab.url is available for BiblioCommons tabs via host_permissions; it's
  // undefined for other sites, which is itself enough to route to the
  // "open a BiblioCommons page" message.
  const url = (tab && tab.url) || '';

  if (activeTabId === null) {
    captureMessage.textContent = 'No active tab.';
    showCaptureSubview('message');
    return;
  }
  if (RECORD_PATH_RE.test(url)) {
    await initRecordMode();
  } else if (LIST_PATH_RE.test(url)) {
    await initListMode();
  } else {
    showCaptureSubview('message');
  }
}

// ── Settings pane ──
let savedFadeTimer;
function flashSaved() {
  savedIndicator.classList.add('show');
  clearTimeout(savedFadeTimer);
  savedFadeTimer = setTimeout(() => savedIndicator.classList.remove('show'), 1400);
}

async function refreshAccumulatedCount() {
  try {
    const local = await browser.storage.local.get({ accumulatedRows: [] });
    const n = Array.isArray(local.accumulatedRows) ? local.accumulatedRows.length : 0;
    accumulateCount.textContent = n > 0 ? `${n} ${n === 1 ? 'title' : 'titles'}` : 'Empty';
    copyBtn.disabled = n === 0;
    clearBtn.disabled = n === 0;
  } catch {
    accumulateCount.textContent = 'Empty';
    copyBtn.disabled = true;
    clearBtn.disabled = true;
  }
}

async function loadSettings() {
  try {
    const sync = await browser.storage.sync.get({
      preferredBranch: '',
      accumulateMode: false,
    });
    branchInput.value = sync.preferredBranch || '';
    accumulateToggle.checked = !!sync.accumulateMode;
  } catch {
    // Leave the form at its default empty/unchecked state.
  }
  await refreshAccumulatedCount();
}

// Debounced save for the branch input: persist 400ms after typing stops,
// plus an immediate save on blur and on the popup losing focus, so a
// value typed in the last 400ms isn't lost when the popup closes.
let branchDebounceTimer;
async function saveBranch() {
  try {
    await browser.storage.sync.set({ preferredBranch: branchInput.value.trim() });
    flashSaved();
  } catch {
    // Storage quota / availability failures are rare; nothing actionable.
  }
}
branchInput.addEventListener('input', () => {
  clearTimeout(branchDebounceTimer);
  branchDebounceTimer = setTimeout(saveBranch, 400);
});
branchInput.addEventListener('blur', () => {
  clearTimeout(branchDebounceTimer);
  saveBranch();
});
window.addEventListener('blur', () => {
  // The popup loses window focus right before it closes. Flush any
  // pending branch save so a just-typed value survives.
  clearTimeout(branchDebounceTimer);
  saveBranch();
});

accumulateToggle.addEventListener('change', async () => {
  try {
    await browser.storage.sync.set({ accumulateMode: !!accumulateToggle.checked });
  } catch {
    // Revert the visible toggle if the write failed, so it doesn't lie.
    accumulateToggle.checked = !accumulateToggle.checked;
  }
});

// Re-copy the accumulated list to the clipboard. A BiblioCommons list
// capture overwrites the clipboard with just the list books and leaves
// the accumulated list saved-but-stranded; this is the way to get it
// back onto the clipboard without doing another single-book capture.
let copyResetTimer;
copyBtn.addEventListener('click', async () => {
  try {
    const local = await browser.storage.local.get({ accumulatedRows: [] });
    const rows = Array.isArray(local.accumulatedRows) ? local.accumulatedRows : [];
    if (rows.length === 0) return;
    await navigator.clipboard.writeText(rows.join('\n'));
    copyBtn.textContent = 'Copied!';
  } catch {
    copyBtn.textContent = 'Failed';
  }
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
});

clearBtn.addEventListener('click', async () => {
  await browser.storage.local.set({ accumulatedRows: [] });
  await refreshAccumulatedCount();
});

// Keep the accumulated count fresh if a capture happens in another tab
// while this popup is open.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'accumulatedRows' in changes) {
    refreshAccumulatedCount();
  }
});

// ── Init ──
showTab('capture');
initCapture();
loadSettings();

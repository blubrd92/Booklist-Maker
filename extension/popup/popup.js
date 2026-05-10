'use strict';

const listEl = document.getElementById('list');
const metaEl = document.getElementById('meta');
const selectedCountEl = document.getElementById('selected-count');
const captureBtn = document.getElementById('capture');
const statusEl = document.getElementById('status');
const selectAllBtn = document.getElementById('select-all');
const selectFirst13Btn = document.getElementById('select-first-13');
const selectNoneBtn = document.getElementById('select-none');

const FIRST_N_DEFAULT = 13; // matches Booklister's typical full-feature slot count

let books = []; // [{bibId, title, subTitle, author, callNumber, coverUrl}, ...]
let selected = new Set(); // bibIds

function updateCount() {
  const n = selected.size;
  selectedCountEl.textContent = n === 0
    ? 'none selected'
    : `${n} selected`;
  captureBtn.disabled = n === 0;
  captureBtn.textContent = n === 0
    ? 'Capture selected'
    : `Capture ${n} ${n === 1 ? 'book' : 'books'}`;
}

function renderRow(book) {
  const row = document.createElement('label');
  row.className = 'row';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = selected.has(book.bibId);
  cb.addEventListener('change', () => {
    if (cb.checked) selected.add(book.bibId);
    else selected.delete(book.bibId);
    updateCount();
  });

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.alt = '';
  // Cover URL is the raw http(s) Syndetics URL; popup can load it
  // directly via <img src> without needing the service worker proxy
  // (img tags don't require CORS for display).
  if (book.coverUrl) thumb.src = book.coverUrl;

  const info = document.createElement('div');
  info.className = 'info';

  const title = document.createElement('div');
  title.className = 'title';
  const fullTitle = book.subTitle
    ? `${book.title}: ${book.subTitle}`
    : book.title;
  title.textContent = fullTitle || '(untitled)';
  title.title = fullTitle;

  const author = document.createElement('div');
  author.className = 'author';
  author.textContent = book.author || ' ';

  const call = document.createElement('div');
  call.className = 'call';
  if (book.callNumber) {
    call.innerHTML = `Call: <code>${escapeHtml(book.callNumber)}</code>`;
  }

  info.appendChild(title);
  info.appendChild(author);
  if (book.callNumber) info.appendChild(call);

  row.appendChild(cb);
  row.appendChild(thumb);
  row.appendChild(info);
  return row;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderList() {
  listEl.innerHTML = '';
  if (books.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No books found on this list page.';
    listEl.appendChild(empty);
    return;
  }
  for (const book of books) {
    listEl.appendChild(renderRow(book));
  }
}

selectAllBtn.addEventListener('click', () => {
  selected = new Set(books.map((b) => b.bibId));
  renderList();
  updateCount();
});

selectFirst13Btn.addEventListener('click', () => {
  selected = new Set(books.slice(0, FIRST_N_DEFAULT).map((b) => b.bibId));
  renderList();
  updateCount();
});

selectNoneBtn.addEventListener('click', () => {
  selected = new Set();
  renderList();
  updateCount();
});

captureBtn.addEventListener('click', async () => {
  if (selected.size === 0) return;

  captureBtn.disabled = true;
  statusEl.style.color = '#555';
  statusEl.textContent = 'Capturing…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusEl.style.color = '#b00020';
    statusEl.textContent = 'No active tab.';
    captureBtn.disabled = false;
    return;
  }

  try {
    // Fire-and-forget: the actual capture pipeline (per-book holdings
    // + cover fetches) takes 5-10s for a 13-book selection. The popup
    // closes immediately after dispatching; the content script's
    // in-page toast tells the user when it's done.
    chrome.tabs.sendMessage(tab.id, {
      type: 'capture-selected-bibs',
      bibIds: Array.from(selected),
    });
    window.close();
  } catch (err) {
    statusEl.style.color = '#b00020';
    statusEl.textContent = 'Capture failed: ' + (err && err.message ? err.message : 'unknown');
    captureBtn.disabled = false;
  }
});

async function loadBooks() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    metaEl.textContent = 'No active tab.';
    return;
  }

  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, { type: 'list-page-bibs' });
  } catch {
    metaEl.textContent = 'Open this on a BiblioCommons list page.';
    listEl.innerHTML = '<div class="empty">Couldn’t reach the page (was it just opened?). Try refreshing the tab and clicking the icon again.</div>';
    return;
  }

  if (!resp || !resp.ok || !Array.isArray(resp.bibs)) {
    metaEl.textContent = resp && resp.reason ? `Couldn’t read the list: ${resp.reason}` : 'No books found.';
    listEl.innerHTML = '<div class="empty">No books found on this list page.</div>';
    return;
  }

  books = resp.bibs;
  // Default selection: all selected. User clicks "First 13" or "None"
  // to change quickly, or unchecks individual books.
  selected = new Set(books.map((b) => b.bibId));
  metaEl.textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'} on this list`;
  renderList();
  updateCount();
}

loadBooks();

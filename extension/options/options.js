'use strict';

const branchInput = document.getElementById('preferred-branch');
const accumulateToggle = document.getElementById('accumulate-mode');
const accumulateCount = document.getElementById('accumulate-count');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear-list');
const statusEl = document.getElementById('status');
const clearStatusEl = document.getElementById('clear-status');

async function loadPrefs() {
  const sync = await chrome.storage.sync.get({
    preferredBranch: '',
    accumulateMode: false,
  });
  branchInput.value = sync.preferredBranch || '';
  accumulateToggle.checked = !!sync.accumulateMode;
  await updateAccumulateCount();
}

async function updateAccumulateCount() {
  try {
    const local = await chrome.storage.local.get({ accumulatedRows: [] });
    const n = Array.isArray(local.accumulatedRows) ? local.accumulatedRows.length : 0;
    accumulateCount.textContent = n > 0 ? `(${n} ${n === 1 ? 'book' : 'books'} in list)` : '';
  } catch {
    accumulateCount.textContent = '';
  }
}

async function savePrefs() {
  const branch = (branchInput.value || '').trim();
  const accumulate = !!accumulateToggle.checked;
  await chrome.storage.sync.set({
    preferredBranch: branch,
    accumulateMode: accumulate,
  });
  statusEl.textContent = 'Saved.';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

async function clearAccumulated() {
  await chrome.storage.local.set({ accumulatedRows: [] });
  await updateAccumulateCount();
  clearStatusEl.textContent = 'Cleared.';
  setTimeout(() => { clearStatusEl.textContent = ''; }, 2000);
}

saveBtn.addEventListener('click', savePrefs);
branchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') savePrefs();
});
clearBtn.addEventListener('click', clearAccumulated);

// Live-update the count if a capture happens while the options page is
// open in another tab.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'accumulatedRows' in changes) {
    updateAccumulateCount();
  }
});

loadPrefs();

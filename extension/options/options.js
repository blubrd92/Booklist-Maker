'use strict';

const branchInput = document.getElementById('preferred-branch');
const accumulateToggle = document.getElementById('accumulate-mode');
const accumulateCount = document.getElementById('accumulate-count');
const clearBtn = document.getElementById('clear-list');
const savedIndicator = document.getElementById('saved');

let savedFadeTimer;
function flashSaved() {
  savedIndicator.classList.add('show');
  clearTimeout(savedFadeTimer);
  savedFadeTimer = setTimeout(() => {
    savedIndicator.classList.remove('show');
  }, 1400);
}

async function loadPrefs() {
  const sync = await chrome.storage.sync.get({
    preferredBranch: '',
    accumulateMode: false,
  });
  branchInput.value = sync.preferredBranch || '';
  accumulateToggle.checked = !!sync.accumulateMode;
  await refreshAccumulatedCount();
}

async function refreshAccumulatedCount() {
  try {
    const local = await chrome.storage.local.get({ accumulatedRows: [] });
    const n = Array.isArray(local.accumulatedRows) ? local.accumulatedRows.length : 0;
    accumulateCount.textContent = n > 0
      ? `${n} ${n === 1 ? 'book' : 'books'}`
      : 'Empty';
    clearBtn.disabled = n === 0;
  } catch {
    accumulateCount.textContent = 'Empty';
    clearBtn.disabled = true;
  }
}

// Debounced save for the text input. Persist 400ms after typing stops, plus
// an immediate save on blur so leaving the field never loses the value.
let branchDebounceTimer;
async function saveBranch() {
  await chrome.storage.sync.set({
    preferredBranch: branchInput.value.trim(),
  });
  flashSaved();
}
branchInput.addEventListener('input', () => {
  clearTimeout(branchDebounceTimer);
  branchDebounceTimer = setTimeout(saveBranch, 400);
});
branchInput.addEventListener('blur', () => {
  clearTimeout(branchDebounceTimer);
  saveBranch();
});

// The toggle is auto-save too; the visible slider movement is its own
// confirmation so we don't flash the "Saved" indicator on toggle.
accumulateToggle.addEventListener('change', async () => {
  await chrome.storage.sync.set({
    accumulateMode: !!accumulateToggle.checked,
  });
});

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ accumulatedRows: [] });
  await refreshAccumulatedCount();
});

// Keep the count fresh if a capture happens in another tab while the
// options page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'accumulatedRows' in changes) {
    refreshAccumulatedCount();
  }
});

loadPrefs();

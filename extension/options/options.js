'use strict';

const input = document.getElementById('preferred-branch');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

async function load() {
  const stored = await chrome.storage.sync.get({ preferredBranch: '' });
  input.value = stored.preferredBranch || '';
}

async function save() {
  const value = (input.value || '').trim();
  await chrome.storage.sync.set({ preferredBranch: value });
  statusEl.textContent = value ? `Saved: "${value}"` : 'Saved (no preference set)';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

saveBtn.addEventListener('click', save);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') save();
});

load();

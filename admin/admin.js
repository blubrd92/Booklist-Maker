// Booklister Admin Console (ES module).
//
// Separate app served at admin.booklister.org (via GitHub Pages custom
// domain) from the /admin/ directory of this repo. Uses the same
// Firebase project as the main tool, but with its own authentication
// (Google sign-in), its own UI, and write access to Firestore gated by
// an `admins/{uid}` document check in the security rules.
//
// The main tool's firebase-init.js is NOT reused here — this is a
// completely independent Firebase initialization that runs without the
// host-gating logic the main tool has.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Font list copied from the main tool's CONFIG.FONTS. Kept in sync
// manually. If you change the font list in assets/js/config.js, remember
// to update this too.
const FONTS = [
  { value: "'Anton', sans-serif", label: 'Anton' },
  { value: "'Arvo', serif", label: 'Arvo' },
  { value: "'Bangers', system-ui", label: 'Bangers' },
  { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
  { value: "'Bungee', system-ui", label: 'Bungee' },
  { value: "'Calibri', sans-serif", label: 'Calibri' },
  { value: "'Cinzel', serif", label: 'Cinzel' },
  { value: "'Crimson Text', serif", label: 'Crimson Text' },
  { value: "'EB Garamond', serif", label: 'EB Garamond' },
  { value: "'Georgia', serif", label: 'Georgia' },
  { value: "'Helvetica', sans-serif", label: 'Helvetica' },
  { value: "'Lato', sans-serif", label: 'Lato' },
  { value: "'Libre Baskerville', serif", label: 'Libre Baskerville' },
  { value: "'Merriweather', serif", label: 'Merriweather' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: "'Oswald', sans-serif", label: 'Oswald' },
  { value: "'Playfair Display', serif", label: 'Playfair Display' },
  { value: "'Poppins', sans-serif", label: 'Poppins' },
  { value: "'Raleway', sans-serif", label: 'Raleway' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Roboto Slab', serif", label: 'Roboto Slab' },
  { value: "'Source Sans 3', sans-serif", label: 'Source Sans 3' },
  { value: "'Staatliches', system-ui", label: 'Staatliches' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
];

const DEFAULT_LIBRARY = {
  displayName: '',
  brandingImagePath: '',
  defaultCoverFont: "'Oswald', sans-serif",
  defaultBookFont: "'Lato', sans-serif",
  defaultCoverLayout: 'classic',
  defaultExtendedMode: false,
  primaryColor: '#5c6bc0',
  accentColor: '#e53935',
};

// Same Firebase project as the main tool. This config is NOT a secret —
// it's safe to include in client code; Firestore security rules are what
// actually protect the data.
const firebaseConfig = {
  apiKey: 'AIzaSyCRQahoA79yeWbbFUIEs4-4mft_KSGpjcw',
  authDomain: 'booklister-50296.firebaseapp.com',
  projectId: 'booklister-50296',
  storageBucket: 'booklister-50296.firebasestorage.app',
  messagingSenderId: '682630183367',
  appId: '1:682630183367:web:6a4a71476fcf3432b181e2',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Persist sign-in across browser restarts so you don't have to re-auth
// on every visit.
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (err) {
  console.warn('[admin] auth persistence setup failed:', err);
}

// ---------------------------------------------------------------------------
// UI state machine
// ---------------------------------------------------------------------------

const sections = {
  loading: document.getElementById('admin-loading'),
  signin: document.getElementById('admin-signin'),
  denied: document.getElementById('admin-denied'),
  app: document.getElementById('admin-app'),
};

function showSection(name) {
  for (const [key, el] of Object.entries(sections)) {
    if (el) el.hidden = key !== name;
  }
}

function showSignInError(message) {
  const el = document.getElementById('admin-signin-error');
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
}

function clearSignInError() {
  const el = document.getElementById('admin-signin-error');
  if (el) {
    el.textContent = '';
    el.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Admin check
// ---------------------------------------------------------------------------

// Reads admins/<uid>. Returns true if the doc exists, false otherwise.
// A permission-denied or network error counts as "not admin" because
// either way the user can't get past this gate.
async function isUserAdmin(user) {
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch (err) {
    console.warn('[admin] failed to read admins/' + user.uid + ':', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  clearSignInError();
  try {
    const provider = new GoogleAuthProvider();
    // Force the Google account chooser every time, so you can switch
    // accounts without signing out of Google.
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
    // onAuthStateChanged below picks up the new user.
  } catch (err) {
    console.warn('[admin] sign-in failed:', err);
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
      return; // User bailed. Silent.
    }
    if (err.code === 'auth/unauthorized-domain') {
      showSignInError(
        'This domain is not authorized for sign-in. In the Firebase console, go to ' +
        'Authentication → Settings → Authorized domains and add this host.'
      );
      return;
    }
    if (err.code === 'auth/popup-blocked') {
      showSignInError('Popup was blocked by the browser. Allow popups for this site and try again.');
      return;
    }
    showSignInError('Sign-in failed: ' + (err.message || err.code || 'unknown error'));
  }
});

async function handleSignOut() {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[admin] sign-out failed:', err);
  }
}

document.getElementById('admin-signout-btn').addEventListener('click', handleSignOut);
document.getElementById('admin-denied-signout-btn').addEventListener('click', handleSignOut);

// ---------------------------------------------------------------------------
// Auth state driver
// ---------------------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    document.getElementById('admin-user-info').hidden = true;
    showSection('signin');
    return;
  }

  // Signed in — populate the header with user info.
  document.getElementById('admin-user-email').textContent =
    user.email || user.displayName || user.uid;
  document.getElementById('admin-user-info').hidden = false;

  // Check admin status against Firestore.
  showSection('loading');
  const admin = await isUserAdmin(user);

  if (!admin) {
    document.getElementById('admin-denied-email').textContent = user.email || user.uid;
    document.getElementById('admin-denied-uid').textContent = user.uid;
    showSection('denied');
    return;
  }

  // Authorized admin — populate font selects (idempotent), load the
  // libraries list, and reveal the app section.
  populateFontSelects();
  showSection('app');
  await loadLibraries();
});

// ---------------------------------------------------------------------------
// Libraries CRUD
// ---------------------------------------------------------------------------

// In-memory cache of all libraries (both public and gated). Populated
// by loadLibraries() and used by the edit/delete flows to avoid an
// extra Firestore read when opening the form.
let librariesCache = [];

// Which library is currently being edited, or null for "create new".
let editingLibrary = null;

const LIBRARY_ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function populateFontSelects() {
  for (const id of ['admin-field-cover-font', 'admin-field-book-font']) {
    const sel = document.getElementById(id);
    if (!sel || sel.options.length > 0) continue;
    for (const font of FONTS) {
      const opt = document.createElement('option');
      opt.value = font.value;
      opt.textContent = font.label;
      sel.appendChild(opt);
    }
  }
}

// Fetch both collections and build a combined list of libraries. Each
// entry is annotated with `type` ("public" or "gated") so the UI can
// render the badge and the edit flow knows which collection to write to.
async function loadLibraries() {
  const loadingEl = document.getElementById('admin-libraries-loading');
  const errorEl = document.getElementById('admin-libraries-error');
  const emptyEl = document.getElementById('admin-libraries-empty');
  const tableEl = document.getElementById('admin-libraries-table');

  loadingEl.hidden = false;
  errorEl.hidden = true;
  emptyEl.hidden = true;
  tableEl.hidden = true;

  try {
    const [publicSnap, gatedSnap] = await Promise.all([
      getDocs(collection(db, 'libraries-public')),
      getDocs(collection(db, 'libraries')),
    ]);

    const libs = [];
    publicSnap.forEach((docSnap) => {
      libs.push({ id: docSnap.id, type: 'public', data: docSnap.data() });
    });
    gatedSnap.forEach((docSnap) => {
      libs.push({ id: docSnap.id, type: 'gated', data: docSnap.data() });
    });

    // Sort alphabetically by ID for stable display.
    libs.sort((a, b) => a.id.localeCompare(b.id));
    librariesCache = libs;

    loadingEl.hidden = true;
    if (libs.length === 0) {
      emptyEl.hidden = false;
    } else {
      renderLibrariesTable(libs);
      tableEl.hidden = false;
    }
  } catch (err) {
    console.warn('[admin] loadLibraries failed:', err);
    loadingEl.hidden = true;
    errorEl.textContent = 'Failed to load libraries: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

function renderLibrariesTable(libs) {
  const tbody = document.getElementById('admin-libraries-tbody');
  tbody.innerHTML = '';
  for (const lib of libs) {
    const tr = document.createElement('tr');

    const tdId = document.createElement('td');
    tdId.className = 'admin-lib-id';
    tdId.textContent = lib.id;
    tr.appendChild(tdId);

    const tdName = document.createElement('td');
    tdName.className = 'admin-lib-name';
    tdName.textContent = lib.data.displayName || '(no display name)';
    tr.appendChild(tdName);

    const tdType = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'admin-badge admin-badge-' + lib.type;
    badge.textContent = lib.type;
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    const tdActions = document.createElement('td');
    tdActions.className = 'admin-actions-col';
    const actions = document.createElement('div');
    actions.className = 'admin-row-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'admin-row-btn';
    editBtn.type = 'button';
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit';
    editBtn.addEventListener('click', () => openLibraryModal(lib));
    actions.appendChild(editBtn);

    const previewBtn = document.createElement('button');
    previewBtn.className = 'admin-row-btn';
    previewBtn.type = 'button';
    previewBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Preview';
    previewBtn.addEventListener('click', () => {
      window.open('https://' + lib.id + '.booklister.org', '_blank', 'noopener');
    });
    actions.appendChild(previewBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'admin-row-btn admin-row-btn-danger';
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i> Delete';
    deleteBtn.addEventListener('click', () => openDeleteModal(lib));
    actions.appendChild(deleteBtn);

    tdActions.appendChild(actions);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------------
// Library form modal (create + edit)
// ---------------------------------------------------------------------------

function openLibraryModal(lib) {
  editingLibrary = lib; // null for create, library object for edit

  const modal = document.getElementById('admin-library-modal');
  const title = document.getElementById('admin-library-modal-title');
  const idInput = document.getElementById('admin-field-library-id');
  const typeRadios = document.querySelectorAll('input[name="library-type"]');
  const nameInput = document.getElementById('admin-field-display-name');
  const brandingInput = document.getElementById('admin-field-branding-path');
  const coverFontSel = document.getElementById('admin-field-cover-font');
  const bookFontSel = document.getElementById('admin-field-book-font');
  const layoutSel = document.getElementById('admin-field-layout');
  const extendedCb = document.getElementById('admin-field-extended');
  const primaryInput = document.getElementById('admin-field-primary-color');
  const accentInput = document.getElementById('admin-field-accent-color');
  const errorEl = document.getElementById('admin-library-form-error');

  errorEl.hidden = true;
  errorEl.textContent = '';

  if (lib) {
    // Edit mode
    title.textContent = 'Edit Library: ' + lib.id;
    idInput.value = lib.id;
    idInput.disabled = true; // ID is immutable
    for (const r of typeRadios) {
      r.checked = r.value === lib.type;
      r.disabled = true; // Type is immutable (would require a collection move)
    }
    const d = lib.data || {};
    nameInput.value = d.displayName || '';
    brandingInput.value = d.brandingImagePath || '';
    coverFontSel.value = d.defaultCoverFont || DEFAULT_LIBRARY.defaultCoverFont;
    bookFontSel.value = d.defaultBookFont || DEFAULT_LIBRARY.defaultBookFont;
    layoutSel.value = d.defaultCoverLayout || DEFAULT_LIBRARY.defaultCoverLayout;
    extendedCb.checked = !!d.defaultExtendedMode;
    primaryInput.value = d.primaryColor || DEFAULT_LIBRARY.primaryColor;
    accentInput.value = d.accentColor || DEFAULT_LIBRARY.accentColor;
  } else {
    // Create mode
    title.textContent = 'Add Library';
    idInput.value = '';
    idInput.disabled = false;
    for (const r of typeRadios) {
      r.disabled = false;
      r.checked = r.value === 'public';
    }
    nameInput.value = '';
    brandingInput.value = '';
    coverFontSel.value = DEFAULT_LIBRARY.defaultCoverFont;
    bookFontSel.value = DEFAULT_LIBRARY.defaultBookFont;
    layoutSel.value = DEFAULT_LIBRARY.defaultCoverLayout;
    extendedCb.checked = DEFAULT_LIBRARY.defaultExtendedMode;
    primaryInput.value = DEFAULT_LIBRARY.primaryColor;
    accentInput.value = DEFAULT_LIBRARY.accentColor;
  }

  // Memberships section: only visible when editing an existing gated
  // library. Public libraries don't use memberships, and you can't add
  // members to a library before its doc exists.
  const membershipsSection = document.getElementById('admin-memberships-section');
  if (lib && lib.type === 'gated') {
    membershipsSection.hidden = false;
    loadMemberships(lib.id);
  } else {
    membershipsSection.hidden = true;
  }

  modal.hidden = false;
  // Focus the first editable field
  (lib ? nameInput : idInput).focus();
}

function closeLibraryModal() {
  document.getElementById('admin-library-modal').hidden = true;
  editingLibrary = null;
  // Hide memberships section so it doesn't flash when opening create mode next
  document.getElementById('admin-memberships-section').hidden = true;
}

function showLibraryFormError(msg) {
  const el = document.getElementById('admin-library-form-error');
  el.textContent = msg;
  el.hidden = false;
}

async function handleLibraryFormSubmit(evt) {
  evt.preventDefault();

  const idInput = document.getElementById('admin-field-library-id');
  const nameInput = document.getElementById('admin-field-display-name');
  const brandingInput = document.getElementById('admin-field-branding-path');
  const coverFontSel = document.getElementById('admin-field-cover-font');
  const bookFontSel = document.getElementById('admin-field-book-font');
  const layoutSel = document.getElementById('admin-field-layout');
  const extendedCb = document.getElementById('admin-field-extended');
  const primaryInput = document.getElementById('admin-field-primary-color');
  const accentInput = document.getElementById('admin-field-accent-color');
  const saveBtn = document.getElementById('admin-library-save-btn');

  const libraryId = idInput.value.trim().toLowerCase();
  const type = document.querySelector('input[name="library-type"]:checked').value;
  const displayName = nameInput.value.trim();
  const brandingImagePath = brandingInput.value.trim();

  // Validation
  if (!libraryId) {
    showLibraryFormError('Library ID is required.');
    return;
  }
  if (!LIBRARY_ID_RE.test(libraryId)) {
    showLibraryFormError('Library ID must be lowercase letters, numbers, and hyphens only, and cannot start or end with a hyphen.');
    return;
  }
  if (!displayName) {
    showLibraryFormError('Display name is required.');
    return;
  }
  if (!brandingImagePath) {
    showLibraryFormError('Branding image path is required.');
    return;
  }

  // On create: check for ID collision with an existing library.
  if (!editingLibrary) {
    const collision = librariesCache.find((l) => l.id === libraryId);
    if (collision) {
      showLibraryFormError('A ' + collision.type + ' library with ID "' + libraryId + '" already exists.');
      return;
    }
  }

  const data = {
    displayName,
    brandingImagePath,
    defaultCoverFont: coverFontSel.value,
    defaultBookFont: bookFontSel.value,
    defaultCoverLayout: layoutSel.value,
    defaultExtendedMode: !!extendedCb.checked,
    primaryColor: primaryInput.value,
    accentColor: accentInput.value,
  };

  const collectionName = type === 'public' ? 'libraries-public' : 'libraries';

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    await setDoc(doc(db, collectionName, libraryId), data);
    closeLibraryModal();
    await loadLibraries();
  } catch (err) {
    console.warn('[admin] setDoc failed:', err);
    showLibraryFormError('Save failed: ' + (err.message || err.code || 'unknown error'));
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// ---------------------------------------------------------------------------
// Delete modal
// ---------------------------------------------------------------------------

let deletingLibrary = null;

function openDeleteModal(lib) {
  deletingLibrary = lib;
  document.getElementById('admin-delete-library-name').textContent =
    (lib.data.displayName || lib.id) + ' (' + lib.id + ')';
  document.getElementById('admin-delete-error').hidden = true;
  document.getElementById('admin-delete-modal').hidden = false;
}

function closeDeleteModal() {
  document.getElementById('admin-delete-modal').hidden = true;
  deletingLibrary = null;
}

async function handleDeleteConfirm() {
  if (!deletingLibrary) return;
  const confirmBtn = document.getElementById('admin-delete-confirm-btn');
  const errorEl = document.getElementById('admin-delete-error');
  const collectionName = deletingLibrary.type === 'public' ? 'libraries-public' : 'libraries';

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting…';
  try {
    await deleteDoc(doc(db, collectionName, deletingLibrary.id));
    closeDeleteModal();
    await loadLibraries();
  } catch (err) {
    console.warn('[admin] deleteDoc failed:', err);
    errorEl.textContent = 'Delete failed: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete library';
  }
}

// ---------------------------------------------------------------------------
// Wire up static event listeners (these elements exist on page load)
// ---------------------------------------------------------------------------

document.getElementById('admin-add-library-btn').addEventListener('click', () => openLibraryModal(null));
document.getElementById('admin-library-modal-close').addEventListener('click', closeLibraryModal);
document.getElementById('admin-library-cancel-btn').addEventListener('click', closeLibraryModal);
document.getElementById('admin-library-form').addEventListener('submit', handleLibraryFormSubmit);
document.getElementById('admin-delete-cancel-btn').addEventListener('click', closeDeleteModal);
document.getElementById('admin-delete-confirm-btn').addEventListener('click', handleDeleteConfirm);

// Close modal on Escape or click outside
for (const modalId of ['admin-library-modal', 'admin-delete-modal']) {
  const overlay = document.getElementById(modalId);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (modalId === 'admin-library-modal') closeLibraryModal();
      else closeDeleteModal();
    }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('admin-library-modal').hidden) closeLibraryModal();
    if (!document.getElementById('admin-delete-modal').hidden) closeDeleteModal();
  }
});

// ---------------------------------------------------------------------------
// Memberships (embedded in the gated-library edit modal)
// ---------------------------------------------------------------------------

// Firebase Auth UIDs are 28 characters of [A-Za-z0-9], though the spec
// technically allows any printable characters up to 128 chars. Be
// lenient: accept anything non-empty that isn't obviously garbage.
// Reject whitespace since that's almost always a copy-paste mistake.
const UID_RE = /^[A-Za-z0-9]{20,128}$/;

async function loadMemberships(libraryId) {
  const loadingEl = document.getElementById('admin-memberships-loading');
  const errorEl = document.getElementById('admin-memberships-error');
  const emptyEl = document.getElementById('admin-memberships-empty');
  const listEl = document.getElementById('admin-memberships-list');

  loadingEl.hidden = false;
  errorEl.hidden = true;
  emptyEl.hidden = true;
  listEl.hidden = true;
  listEl.innerHTML = '';

  try {
    const q = query(collection(db, 'memberships'), where('libraryId', '==', libraryId));
    const snap = await getDocs(q);
    loadingEl.hidden = true;

    if (snap.empty) {
      emptyEl.hidden = false;
      return;
    }

    snap.forEach((docSnap) => {
      const li = document.createElement('li');

      const uidSpan = document.createElement('span');
      uidSpan.className = 'admin-membership-uid';
      uidSpan.textContent = docSnap.id;
      li.appendChild(uidSpan);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'admin-row-btn admin-row-btn-danger';
      removeBtn.type = 'button';
      removeBtn.innerHTML = '<i class="fa-solid fa-user-minus" aria-hidden="true"></i> Remove';
      removeBtn.addEventListener('click', () => removeMembership(docSnap.id, libraryId));
      li.appendChild(removeBtn);

      listEl.appendChild(li);
    });
    listEl.hidden = false;
  } catch (err) {
    console.warn('[admin] loadMemberships failed:', err);
    loadingEl.hidden = true;
    errorEl.textContent = 'Failed to load memberships: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

async function handleAddMembership(evt) {
  evt.preventDefault();
  if (!editingLibrary) return; // Shouldn't happen — the form is only visible in edit mode

  const uidInput = document.getElementById('admin-add-membership-uid');
  const errorEl = document.getElementById('admin-add-membership-error');
  const uid = uidInput.value.trim();

  errorEl.hidden = true;
  errorEl.textContent = '';

  if (!uid) {
    errorEl.textContent = 'Paste a Firebase Auth UID.';
    errorEl.hidden = false;
    return;
  }
  if (!UID_RE.test(uid)) {
    errorEl.textContent = 'That doesn\'t look like a valid UID. Firebase Auth UIDs are 20+ alphanumeric characters.';
    errorEl.hidden = false;
    return;
  }

  // Check if a membership for this UID already exists (in any library).
  // If yes, either they're already in this library (noop) or they're in
  // a different one (conflict — single-library-per-user policy).
  try {
    const existing = await getDoc(doc(db, 'memberships', uid));
    if (existing.exists()) {
      const existingLib = existing.data().libraryId;
      if (existingLib === editingLibrary.id) {
        errorEl.textContent = 'That user already has access to this library.';
      } else {
        errorEl.textContent = 'That user already has a membership for "' + existingLib +
          '". Remove it from that library first, or use a different account.';
      }
      errorEl.hidden = false;
      return;
    }

    await setDoc(doc(db, 'memberships', uid), { libraryId: editingLibrary.id });
    uidInput.value = '';
    await loadMemberships(editingLibrary.id);
  } catch (err) {
    console.warn('[admin] add membership failed:', err);
    errorEl.textContent = 'Failed to add membership: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

async function removeMembership(uid, libraryId) {
  try {
    await deleteDoc(doc(db, 'memberships', uid));
    await loadMemberships(libraryId);
  } catch (err) {
    console.warn('[admin] remove membership failed:', err);
    const errorEl = document.getElementById('admin-memberships-error');
    errorEl.textContent = 'Failed to remove membership: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

document.getElementById('admin-add-membership-form').addEventListener('submit', handleAddMembership);

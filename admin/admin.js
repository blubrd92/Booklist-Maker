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

import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Libraries hold only the fields that are genuinely per-library:
// displayName (shown in the tab title + header credit),
// brandingImagePath (the logo image on the back cover), and
// autoDraftDescriptionsDefault (whether the Search-tab auto-draft
// toggle defaults on or off for this library's staff when they
// haven't set their own preference yet). Everything else — fonts,
// layout, extended mode, colors — starts from the Booklister defaults
// and is per-user, not per-library.
const DEFAULT_LIBRARY = {
  displayName: '',
  brandingImagePath: '',
  autoDraftDescriptionsDefault: true,
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
// Role detection
// ---------------------------------------------------------------------------

// The admin console supports two kinds of admins:
//
// 1. Super-admin — has a doc in the `admins` collection. Can see all
//    libraries, create/edit/delete libraries, manage any memberships,
//    and promote/demote library admins.
//
// 2. Library admin — has a doc in `memberships` with role == "admin".
//    Can see ONLY their library, manage only that library's staff
//    memberships (not admin-role memberships), and cannot touch
//    library config fields.
//
// Everyone else (including regular staff with role "staff") gets the
// access-denied screen.

// Populated by resolveUserRole(). Used throughout the UI to decide
// which buttons to show and which views to render.
let currentUserRole = 'none'; // 'super-admin' | 'library-admin' | 'none'
let currentLibraryAdminLibraryId = null; // string or null; only set when currentUserRole === 'library-admin'

// Reads admins/<uid>. Returns true if the doc exists, false otherwise.
// A permission-denied or network error counts as "not admin" because
// either way the user can't get past this gate.
async function isUserSuperAdmin(user) {
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch (err) {
    console.warn('[admin] failed to read admins/' + user.uid + ':', err);
    return false;
  }
}

// Reads memberships/<uid>. Returns { libraryId, role } if the doc
// exists, else null. Used to detect library admins and to show the
// right scoped view.
async function readOwnMembership(user) {
  try {
    const snap = await getDoc(doc(db, 'memberships', user.uid));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.warn('[admin] failed to read memberships/' + user.uid + ':', err);
    return null;
  }
}

// Resolve the role for a signed-in user. Writes to the module-level
// currentUserRole and currentLibraryAdminLibraryId state. Returns the
// role string so callers can branch on it.
async function resolveUserRole(user) {
  // Super-admin takes precedence. If the user is in the admins
  // collection, we don't need to look at memberships.
  if (await isUserSuperAdmin(user)) {
    currentUserRole = 'super-admin';
    currentLibraryAdminLibraryId = null;
    return currentUserRole;
  }
  // Not a super-admin — check for a library-admin membership.
  const membership = await readOwnMembership(user);
  if (membership && membership.role === 'admin' && typeof membership.libraryId === 'string') {
    currentUserRole = 'library-admin';
    currentLibraryAdminLibraryId = membership.libraryId;
    return currentUserRole;
  }
  currentUserRole = 'none';
  currentLibraryAdminLibraryId = null;
  return currentUserRole;
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

// Email/password sign-in (for library admins). Library staff use this
// with their existing library credentials — the same ones they'd use
// on <library>.booklister.org. After sign-in, resolveUserRole checks
// their memberships doc and either lands them on the library-admin
// view or the access-denied screen.
document.getElementById('admin-email-signin-form').addEventListener('submit', async (evt) => {
  evt.preventDefault();
  clearSignInError();
  const emailInput = document.getElementById('admin-email-signin-email');
  const passwordInput = document.getElementById('admin-email-signin-password');
  const submitBtn = document.getElementById('admin-email-signin-submit');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showSignInError('Enter your email and password.');
    return;
  }
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Signing in…';
  try {
    await signInWithEmailAndPassword(auth, email, password);
    passwordInput.value = '';
  } catch (err) {
    console.warn('[admin] email sign-in failed:', err);
    const code = err && err.code;
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-email'
    ) {
      showSignInError('Incorrect email or password.');
    } else if (code === 'auth/too-many-requests') {
      showSignInError('Too many attempts. Try again later.');
    } else if (code === 'auth/network-request-failed') {
      showSignInError('Network error. Check your connection and try again.');
    } else {
      showSignInError('Sign-in failed: ' + (err.message || code || 'unknown error'));
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

// Password visibility toggle on the email sign-in form — same pattern
// as the main tool's library sign-in modal.
(function wireSigninPasswordToggle() {
  const toggle = document.getElementById('admin-email-signin-password-toggle');
  const input = document.getElementById('admin-email-signin-password');
  if (!toggle || !input) return;
  toggle.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(isHidden));
    toggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    const icon = toggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-eye', !isHidden);
      icon.classList.toggle('fa-eye-slash', isHidden);
    }
    input.focus();
  });
})();

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
    // Clear the cached email label and hide the header user block.
    // Clearing the text defensively means there's no stale value
    // lingering in the DOM if the block ever gets re-shown.
    document.getElementById('admin-user-email').textContent = '';
    document.getElementById('admin-user-info').hidden = true;
    // Also drop role-mode classes so the next sign-in starts clean.
    document.body.classList.remove('admin-mode-super', 'admin-mode-library');
    // Close any modals that might still be open. Library admins sign
    // out from inside an always-open modal; leaving it open would
    // cover the sign-in screen with a dimmed backdrop.
    document.getElementById('admin-library-modal').hidden = true;
    document.getElementById('admin-delete-modal').hidden = true;
    editingLibrary = null;
    deletingLibrary = null;
    showSection('signin');
    return;
  }

  // Signed in — populate the header with user info.
  document.getElementById('admin-user-email').textContent =
    user.email || user.displayName || user.uid;
  document.getElementById('admin-user-info').hidden = false;

  // Resolve role against Firestore.
  showSection('loading');
  const role = await resolveUserRole(user);

  if (role === 'super-admin') {
    // Full admin UI: all libraries visible and editable.
    document.body.classList.add('admin-mode-super');
    document.body.classList.remove('admin-mode-library');
    showSection('app');
    await loadLibraries();
    return;
  }

  if (role === 'library-admin') {
    // Restricted UI: only their library, only the memberships section,
    // no library config editing, no other libraries visible.
    document.body.classList.remove('admin-mode-super');
    document.body.classList.add('admin-mode-library');
    showSection('app');
    await openLibraryAdminView(currentLibraryAdminLibraryId);
    return;
  }

  // No role match — access denied. Show their UID so they (or the
  // super-admin) can bootstrap access if they should have it.
  document.body.classList.remove('admin-mode-super', 'admin-mode-library');
  document.getElementById('admin-denied-email').textContent = user.email || user.uid;
  document.getElementById('admin-denied-uid').textContent = user.uid;
  showSection('denied');
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

// Open the library-admin-only view for a specific library. This runs
// instead of loadLibraries() when the signed-in user is a library
// admin. It reads the one library doc they have access to and opens
// the edit modal in a locked-down mode (no library config editing,
// no other libraries visible, just the memberships section).
async function openLibraryAdminView(libraryId) {
  // Hide the all-libraries table UI elements (CSS does most of this via
  // .admin-mode-library on body, but clear explicit hidden state too).
  document.getElementById('admin-libraries-loading').hidden = true;
  document.getElementById('admin-libraries-error').hidden = true;
  document.getElementById('admin-libraries-empty').hidden = true;
  document.getElementById('admin-libraries-table').hidden = true;

  try {
    // Library admins have read access to libraries/<their-library>
    // because they're a member (per the Firestore rules).
    const snap = await getDoc(doc(db, 'libraries', libraryId));
    if (!snap.exists()) {
      // Library admin's library config is missing. Shouldn't happen in
      // practice (the super-admin creates the library first, then
      // promotes a staff to library admin), but handle it gracefully.
      const errorEl = document.getElementById('admin-libraries-error');
      errorEl.textContent =
        'Your library (' + libraryId + ') is not set up yet. Ask the Booklister admin to create it.';
      errorEl.hidden = false;
      return;
    }
    const libObject = { id: libraryId, type: 'gated', data: snap.data() };
    openLibraryModal(libObject);
  } catch (err) {
    console.warn('[admin] openLibraryAdminView failed:', err);
    const errorEl = document.getElementById('admin-libraries-error');
    errorEl.textContent =
      'Failed to load your library: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

// Fetch both collections and build a combined list of libraries. Each
// entry is annotated with `type` ("public" or "gated") so the UI can
// render the badge and the edit flow knows which collection to write to.
async function loadLibraries() {
  // Defensive guard: loadLibraries must never be called in library-admin
  // mode. It would try to list libraries-public (allowed) and libraries
  // (denied for anything but the admin's own), mixing success and
  // failure. The auth state driver already routes library admins to
  // openLibraryAdminView instead.
  if (currentUserRole === 'library-admin') return;
  const loadingEl = document.getElementById('admin-libraries-loading');
  const errorEl = document.getElementById('admin-libraries-error');
  const emptyEl = document.getElementById('admin-libraries-empty');
  const tableEl = document.getElementById('admin-libraries-table');

  loadingEl.hidden = false;
  errorEl.hidden = true;
  emptyEl.hidden = true;
  tableEl.hidden = true;

  try {
    // Parallel fetch: both library collections plus the memberships
    // collection. We use memberships here only to compute which gated
    // libraries currently have zero admins so we can surface a
    // warning badge on those rows. Super-admin rules allow reading
    // any membership, so this query is fine for super-admin views
    // (library-admin views don't call loadLibraries at all).
    const [publicSnap, gatedSnap, membershipsSnap] = await Promise.all([
      getDocs(collection(db, 'libraries-public')),
      getDocs(collection(db, 'libraries')),
      getDocs(collection(db, 'memberships')),
    ]);

    // Build a set of libraryIds that have at least one user with
    // role == 'admin'. Used below to flag gated libraries without
    // any library admins.
    const librariesWithAdmins = new Set();
    membershipsSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d && d.role === 'admin' && typeof d.libraryId === 'string') {
        librariesWithAdmins.add(d.libraryId);
      }
    });

    const libs = [];
    publicSnap.forEach((docSnap) => {
      libs.push({ id: docSnap.id, type: 'public', data: docSnap.data() });
    });
    gatedSnap.forEach((docSnap) => {
      libs.push({
        id: docSnap.id,
        type: 'gated',
        data: docSnap.data(),
        // Surfaced in the libraries table as a warning badge. Only
        // meaningful for gated libraries — public libraries don't
        // have memberships.
        hasNoAdmins: !librariesWithAdmins.has(docSnap.id),
      });
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
    // Gated libraries with zero admins get a warning badge next to
    // their name — a soft nudge that staff management currently
    // requires the super-admin, with no self-service delegation.
    if (lib.type === 'gated' && lib.hasNoAdmins) {
      const warn = document.createElement('span');
      warn.className = 'admin-no-admin-warning';
      warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> No library admins';
      warn.title = 'This gated library has no library admins. Staff management currently requires the super-admin.';
      tdName.appendChild(warn);
    }
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

// Canonical branding-image path for a given library ID. The convention
// is that every library's logo lives at
// `assets/img/libraries/<id>/logo.png` in the Booklister repo. The
// admin form displays this derived value as a readonly field so the
// super-admin sees the exact path they need to commit the file to.
function brandingPathFromId(libraryId) {
  if (!libraryId) return '';
  return 'assets/img/libraries/' + libraryId + '/logo.png';
}

function openLibraryModal(lib) {
  editingLibrary = lib; // null for create, library object for edit

  const modal = document.getElementById('admin-library-modal');
  const title = document.getElementById('admin-library-modal-title');
  const idInput = document.getElementById('admin-field-library-id');
  const typeRadios = document.querySelectorAll('input[name="library-type"]');
  const nameInput = document.getElementById('admin-field-display-name');
  const brandingInput = document.getElementById('admin-field-branding-path');
  const autoDraftInput = document.getElementById('admin-field-auto-draft-default');
  const disableAutodrafterInput = document.getElementById('admin-field-disable-autodrafter');
  const requireSourceTextInput = document.getElementById('admin-field-require-source-text');
  const requireSourceTextRow = document.getElementById('admin-require-source-text-row');
  const autoDraftDefaultRow = document.getElementById('admin-auto-draft-default-row');
  const errorEl = document.getElementById('admin-library-form-error');

  errorEl.hidden = true;
  errorEl.textContent = '';

  const convertBtn = document.getElementById('admin-library-convert-btn');
  const convertTargetSpan = document.getElementById('admin-library-convert-target');

  if (lib) {
    // Edit mode
    if (currentUserRole === 'library-admin') {
      // Library admins see a friendlier title — they don't need to
      // think about the library ID, they just care about their library.
      title.textContent = 'Staff at ' + (lib.data.displayName || lib.id);
    } else {
      title.textContent = 'Edit Library: ' + lib.id;
    }
    idInput.value = lib.id;
    idInput.disabled = true; // ID is immutable
    for (const r of typeRadios) {
      r.checked = r.value === lib.type;
      // The radios stay disabled in edit mode — switching public/gated
      // requires a collection move, which the convert button below
      // handles via a confirmation modal. Super-admins only.
      r.disabled = true;
    }
    if (convertBtn && convertTargetSpan) {
      if (currentUserRole === 'super-admin') {
        convertTargetSpan.textContent = lib.type === 'public' ? 'gated' : 'public';
        convertBtn.hidden = false;
      } else {
        convertBtn.hidden = true;
      }
    }
    const d = lib.data || {};
    nameInput.value = d.displayName || '';
    // Branding path is derived from the library ID, not stored in the
    // Firestore doc's displayed form. Always regenerate to enforce the
    // canonical path convention, even if the stored doc has something
    // different (older libraries may have had manually-entered paths).
    brandingInput.value = brandingPathFromId(lib.id);
    // Auto-draft default: if the doc doesn't have the field (older
    // libraries that predate this setting), default to true — matches
    // the behavior the library had before the toggle existed.
    autoDraftInput.checked = d.autoDraftDescriptionsDefault !== false;
    disableAutodrafterInput.checked = !!d.disableAutodrafter;
    requireSourceTextInput.checked = !!d.requireSourceText;
    // Hide dependent rows when the autodrafter is entirely disabled.
    const drafterOff = !!d.disableAutodrafter;
    if (autoDraftDefaultRow) autoDraftDefaultRow.hidden = drafterOff || !!d.requireSourceText;
    if (requireSourceTextRow) requireSourceTextRow.hidden = drafterOff;
  } else {
    // Create mode
    title.textContent = 'Add Library';
    idInput.value = '';
    idInput.disabled = false;
    for (const r of typeRadios) {
      r.disabled = false;
      r.checked = r.value === 'public';
    }
    if (convertBtn) convertBtn.hidden = true;
    nameInput.value = '';
    brandingInput.value = '';
    autoDraftInput.checked = true;
    disableAutodrafterInput.checked = true;
    requireSourceTextInput.checked = false;
    if (autoDraftDefaultRow) autoDraftDefaultRow.hidden = true;
    if (requireSourceTextRow) requireSourceTextRow.hidden = true;
  }

  function updateDrafterRowVisibility() {
    const drafterOff = disableAutodrafterInput.checked;
    const sourceRequired = requireSourceTextInput.checked;
    if (requireSourceTextRow) requireSourceTextRow.hidden = drafterOff;
    if (autoDraftDefaultRow) autoDraftDefaultRow.hidden = drafterOff || sourceRequired;
  }
  disableAutodrafterInput.onchange = updateDrafterRowVisibility;
  requireSourceTextInput.onchange = updateDrafterRowVisibility;

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
  const autoDraftInput = document.getElementById('admin-field-auto-draft-default');
  const disableAutodrafterInput = document.getElementById('admin-field-disable-autodrafter');
  const requireSourceTextInput = document.getElementById('admin-field-require-source-text');
  const saveBtn = document.getElementById('admin-library-save-btn');

  const libraryId = idInput.value.trim().toLowerCase();
  const type = document.querySelector('input[name="library-type"]:checked').value;
  const displayName = nameInput.value.trim();
  const brandingImagePath = brandingPathFromId(libraryId);
  const autoDraftDescriptionsDefault = autoDraftInput.checked;
  const disableAutodrafter = disableAutodrafterInput.checked;
  const requireSourceText = requireSourceTextInput.checked;

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
    autoDraftDescriptionsDefault,
    disableAutodrafter,
    requireSourceText,
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
// Convert library type modal (super-admin only)
//
// The public/gated distinction is which collection a library's doc lives
// in (libraries-public vs libraries), not a field on the doc. Switching
// modes therefore means moving the document between collections. The
// admin UI gates this behind a confirmation; the actual security
// boundary is the Firestore rules, which only allow super-admins to
// write to either collection.
// ---------------------------------------------------------------------------

let convertingLibrary = null;

function openConvertModal(lib) {
  if (currentUserRole !== 'super-admin' || !lib) return;
  convertingLibrary = lib;

  const targetType = lib.type === 'public' ? 'gated' : 'public';
  const titleEl = document.getElementById('admin-convert-modal-title');
  const summaryEl = document.getElementById('admin-convert-modal-summary');
  const warningEl = document.getElementById('admin-convert-modal-warning');
  const errorEl = document.getElementById('admin-convert-error');
  const confirmBtn = document.getElementById('admin-convert-confirm-btn');

  titleEl.textContent = 'Convert to ' + targetType + '?';
  summaryEl.innerHTML = '';
  const summaryStrong = document.createElement('strong');
  summaryStrong.textContent = (lib.data.displayName || lib.id) + ' (' + lib.id + ')';
  summaryEl.appendChild(document.createTextNode('Convert '));
  summaryEl.appendChild(summaryStrong);
  summaryEl.appendChild(document.createTextNode(' from ' + lib.type + ' to ' + targetType + '?'));

  if (targetType === 'gated') {
    warningEl.textContent =
      'After this change, visitors will be required to sign in with a member account. ' +
      'Add staff in this modal’s Staff section after converting. Until at least one ' +
      'membership exists, nobody will be able to access the library.';
  } else {
    warningEl.textContent =
      'After this change, anyone with the URL can access the library without signing in. ' +
      'Existing memberships are kept so you can convert back to gated later without losing ' +
      'the staff list, but they have no effect while the library is public.';
  }

  errorEl.hidden = true;
  errorEl.textContent = '';
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Convert to ' + targetType;

  document.getElementById('admin-convert-modal').hidden = false;
}

function closeConvertModal() {
  document.getElementById('admin-convert-modal').hidden = true;
  convertingLibrary = null;
}

async function handleConvertConfirm() {
  if (!convertingLibrary) return;
  if (currentUserRole !== 'super-admin') return;

  const lib = convertingLibrary;
  const sourceCollection = lib.type === 'public' ? 'libraries-public' : 'libraries';
  const targetCollection = lib.type === 'public' ? 'libraries' : 'libraries-public';
  const targetType = lib.type === 'public' ? 'gated' : 'public';

  const confirmBtn = document.getElementById('admin-convert-confirm-btn');
  const errorEl = document.getElementById('admin-convert-error');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Converting…';
  errorEl.hidden = true;

  try {
    // Re-read the source doc right before the move so the write reflects
    // the latest persisted state (in case another super-admin edited the
    // displayName since this modal was opened).
    const sourceRef = doc(db, sourceCollection, lib.id);
    const sourceSnap = await getDoc(sourceRef);
    if (!sourceSnap.exists()) {
      throw new Error('Source library document no longer exists.');
    }
    const data = sourceSnap.data();

    const batch = writeBatch(db);
    batch.set(doc(db, targetCollection, lib.id), data);
    batch.delete(sourceRef);
    await batch.commit();

    // The library object the edit modal was opened with is now stale
    // (wrong collection). Close both modals and reload the list so the
    // user sees the conversion reflected.
    closeConvertModal();
    closeLibraryModal();
    await loadLibraries();
  } catch (err) {
    console.warn('[admin] convert library type failed:', err);
    errorEl.textContent = 'Convert failed: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Convert to ' + targetType;
  }
}

// ---------------------------------------------------------------------------
// Wire up static event listeners (these elements exist on page load)
// ---------------------------------------------------------------------------

document.getElementById('admin-add-library-btn').addEventListener('click', () => openLibraryModal(null));

// Live-update the branding path preview as the super-admin types a
// library ID in create mode. In edit mode the ID input is disabled so
// this listener never fires there.
document.getElementById('admin-field-library-id').addEventListener('input', (e) => {
  const brandingInput = document.getElementById('admin-field-branding-path');
  if (!brandingInput) return;
  brandingInput.value = brandingPathFromId(e.target.value.trim().toLowerCase());
});
document.getElementById('admin-library-modal-close').addEventListener('click', closeLibraryModal);
document.getElementById('admin-library-cancel-btn').addEventListener('click', closeLibraryModal);
document.getElementById('admin-library-form').addEventListener('submit', handleLibraryFormSubmit);
document.getElementById('admin-delete-cancel-btn').addEventListener('click', closeDeleteModal);
document.getElementById('admin-delete-confirm-btn').addEventListener('click', handleDeleteConfirm);

document.getElementById('admin-library-convert-btn').addEventListener('click', () => {
  if (editingLibrary) openConvertModal(editingLibrary);
});
document.getElementById('admin-convert-cancel-btn').addEventListener('click', closeConvertModal);
document.getElementById('admin-convert-confirm-btn').addEventListener('click', handleConvertConfirm);

// Close modal on Escape or click outside — but only for super-admins.
// Library admins can't dismiss the library modal because it IS their
// entire admin UI; dismissing it would leave them staring at a blank
// page. To exit, they sign out via the header button.
for (const modalId of ['admin-library-modal', 'admin-delete-modal', 'admin-convert-modal', 'admin-move-staff-modal']) {
  const overlay = document.getElementById(modalId);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (modalId === 'admin-library-modal') {
        if (currentUserRole === 'library-admin') return;
        closeLibraryModal();
      } else if (modalId === 'admin-delete-modal') {
        closeDeleteModal();
      } else if (modalId === 'admin-convert-modal') {
        closeConvertModal();
      } else {
        closeMoveStaffModal();
      }
    }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Inner modals (convert, move-staff) are layered above the library
    // modal — close them first so the underlying library modal stays
    // visible.
    if (!document.getElementById('admin-move-staff-modal').hidden) {
      closeMoveStaffModal();
      return;
    }
    if (!document.getElementById('admin-convert-modal').hidden) {
      closeConvertModal();
      return;
    }
    if (!document.getElementById('admin-library-modal').hidden) {
      if (currentUserRole !== 'library-admin') closeLibraryModal();
    }
    if (!document.getElementById('admin-delete-modal').hidden) closeDeleteModal();
  }
});

// ---------------------------------------------------------------------------
// Memberships (embedded in the gated-library edit modal)
// ---------------------------------------------------------------------------

// Loose email sanity check. Firebase's createUserWithEmailAndPassword
// will reject malformed addresses with auth/invalid-email anyway, but
// a client-side check catches the most obvious cases without a round
// trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generate a strong random password. Used internally as the initial
// password for newly-invited staff — they never see or use it, because
// we immediately send them a password reset email so they set their own.
// We still make it strong in case Firebase tightens its password policy
// in a future SDK update.
function generateRandomPassword() {
  // Ambiguous characters (0, O, 1, l, I) intentionally excluded so if
  // this ever gets logged somewhere and a human has to read it, it's
  // less error-prone.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) {
    out += alphabet[b % alphabet.length];
  }
  return out;
}

// Create a Firebase Auth user WITHOUT disrupting the admin's current
// session. Client-side createUserWithEmailAndPassword normally signs
// you in as the new user, logging you out of your admin session. The
// workaround is to initialize a secondary Firebase app instance and
// do the user creation on that isolated auth context, then sign out
// of the secondary instance and discard it.
async function createAuthUserViaSecondaryApp(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, 'admin-user-creation-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    // Sign out so the secondary instance isn't holding a session for the
    // newly-created user. Not strictly required (deleteApp discards it
    // either way), but defensive.
    try { await signOut(secondaryAuth); } catch { /* non-fatal */ }
    return cred.user.uid;
  } finally {
    try { await deleteApp(secondaryApp); } catch { /* non-fatal */ }
  }
}

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

    // Sort: admins first, then staff. Within each group, sort
    // alphabetically by the display label (email if known, else UID).
    const rows = [];
    snap.forEach((docSnap) => {
      rows.push({ uid: docSnap.id, data: docSnap.data() || {} });
    });
    rows.sort((a, b) => {
      const aIsAdmin = a.data.role === 'admin';
      const bIsAdmin = b.data.role === 'admin';
      if (aIsAdmin !== bIsAdmin) return aIsAdmin ? -1 : 1;
      const aLabel = (a.data.email || a.uid).toLowerCase();
      const bLabel = (b.data.email || b.uid).toLowerCase();
      return aLabel.localeCompare(bLabel);
    });

    const currentUid = auth.currentUser ? auth.currentUser.uid : null;

    for (const row of rows) {
      const li = document.createElement('li');
      const isAdminRow = row.data.role === 'admin';
      const isSelf = row.uid === currentUid;

      // Left side: identity block (email + UID) + role badge + "you"
      // indicator if it's the current user.
      const leftWrap = document.createElement('div');
      leftWrap.className = 'admin-membership-left';

      const identWrap = document.createElement('div');
      identWrap.className = 'admin-membership-ident';

      if (row.data.email) {
        const emailSpan = document.createElement('span');
        emailSpan.className = 'admin-membership-email';
        emailSpan.textContent = row.data.email;
        identWrap.appendChild(emailSpan);
      }

      const uidSpan = document.createElement('span');
      uidSpan.className = 'admin-membership-uid';
      // If no email on this doc (legacy invite or manual Firestore
      // creation), make the UID the prominent label instead of a
      // secondary line.
      if (!row.data.email) {
        uidSpan.classList.add('admin-membership-uid-primary');
      }
      uidSpan.textContent = row.uid;
      identWrap.appendChild(uidSpan);

      leftWrap.appendChild(identWrap);

      const roleBadge = document.createElement('span');
      roleBadge.className = 'admin-role-badge admin-role-badge-' + (isAdminRow ? 'admin' : 'staff');
      roleBadge.textContent = isAdminRow ? 'Admin' : 'Staff';
      leftWrap.appendChild(roleBadge);

      if (isSelf) {
        const youBadge = document.createElement('span');
        youBadge.className = 'admin-role-badge admin-role-badge-you';
        youBadge.textContent = 'You';
        leftWrap.appendChild(youBadge);
      }

      li.appendChild(leftWrap);

      // Right side: action buttons. What's visible depends on WHO is
      // looking and WHAT row this is.
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'admin-membership-actions';

      // Promote / Demote button — super-admin only.
      if (currentUserRole === 'super-admin' && !isSelf) {
        if (!isAdminRow) {
          // Staff row: offer Promote
          const promoteBtn = document.createElement('button');
          promoteBtn.className = 'admin-row-btn';
          promoteBtn.type = 'button';
          promoteBtn.innerHTML = '<i class="fa-solid fa-user-shield" aria-hidden="true"></i> Promote';
          promoteBtn.title = 'Promote this user to library admin';
          promoteBtn.addEventListener('click', () => promoteToAdmin(row.uid, libraryId));
          actionsWrap.appendChild(promoteBtn);
        } else {
          // Admin row: offer Demote
          const demoteBtn = document.createElement('button');
          demoteBtn.className = 'admin-row-btn';
          demoteBtn.type = 'button';
          demoteBtn.innerHTML = '<i class="fa-solid fa-user-minus" aria-hidden="true"></i> Demote';
          demoteBtn.title = 'Demote this library admin back to staff';
          demoteBtn.addEventListener('click', () => demoteToStaff(row.uid, libraryId));
          actionsWrap.appendChild(demoteBtn);
        }
      }

      // Move-to-another-library button — super-admin only. Updates the
      // membership doc's libraryId in place rather than going through
      // remove + re-invite, which would fail with email-already-in-use
      // because removing a membership doesn't delete the Firebase Auth
      // account.
      if (currentUserRole === 'super-admin' && !isSelf) {
        const otherLibCount = librariesCache.filter((l) => l.id !== libraryId).length;
        const moveBtn = document.createElement('button');
        moveBtn.className = 'admin-row-btn';
        moveBtn.type = 'button';
        moveBtn.innerHTML = '<i class="fa-solid fa-arrow-right-arrow-left" aria-hidden="true"></i> Move';
        if (otherLibCount === 0) {
          moveBtn.disabled = true;
          moveBtn.title = 'No other libraries to move this user to';
        } else {
          moveBtn.title = 'Move this user to a different library (demotes to staff)';
          moveBtn.addEventListener('click', () => openMoveStaffModal(row, libraryId));
        }
        actionsWrap.appendChild(moveBtn);
      }

      // Remove button — visibility rules:
      //   - Super-admin: can remove any row EXCEPT their own (they
      //     shouldn't accidentally sign themselves out, and they're
      //     a super-admin anyway so this row would only be for
      //     bookkeeping).
      //   - Library admin: can remove STAFF rows in their library only.
      //     Cannot remove themselves, cannot remove other admins.
      //   - Anyone else: wouldn't be here.
      const canRemove =
        !isSelf &&
        (currentUserRole === 'super-admin'
          || (currentUserRole === 'library-admin' && !isAdminRow));

      if (canRemove) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'admin-row-btn admin-row-btn-danger';
        removeBtn.type = 'button';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove';
        removeBtn.addEventListener('click', () => removeMembership(row.uid, libraryId));
        actionsWrap.appendChild(removeBtn);
      }

      li.appendChild(actionsWrap);
      listEl.appendChild(li);
    }
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

  const emailInput = document.getElementById('admin-add-membership-email');
  const addBtn = document.getElementById('admin-add-membership-btn');
  const errorEl = document.getElementById('admin-add-membership-error');
  const successEl = document.getElementById('admin-add-membership-success');
  const email = emailInput.value.trim().toLowerCase();

  errorEl.hidden = true;
  errorEl.textContent = '';
  successEl.hidden = true;
  successEl.textContent = '';

  if (!email) {
    errorEl.textContent = 'Enter an email address.';
    errorEl.hidden = false;
    return;
  }
  if (!EMAIL_RE.test(email)) {
    errorEl.textContent = 'That doesn\'t look like a valid email address.';
    errorEl.hidden = false;
    return;
  }

  addBtn.disabled = true;
  const originalBtnHTML = addBtn.innerHTML;
  addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Inviting…';

  let newUid = null;
  let authUserCreated = false;

  try {
    // Step 1: create the Firebase Auth user via a secondary app so we
    // don't disrupt the admin's session. The password is random and
    // throwaway — they'll reset it immediately via the emailed link.
    const throwawayPassword = generateRandomPassword();
    try {
      newUid = await createAuthUserViaSecondaryApp(email, throwawayPassword);
      authUserCreated = true;
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        errorEl.textContent =
          'An account with that email already exists in Firebase Auth. ' +
          'If they currently belong to another library, open that library ' +
          'and use the Move button on their row to move them here (this ' +
          'preserves their password and demotes them to staff). If they ' +
          'have no current library membership but the Auth account lingers, ' +
          'delete the user from Firebase Console → Authentication → Users ' +
          'first, then retry. The admin console cannot delete Auth users ' +
          'directly.';
        errorEl.hidden = false;
        return;
      }
      if (err.code === 'auth/invalid-email') {
        errorEl.textContent = 'Firebase rejected that email address. Check for typos.';
        errorEl.hidden = false;
        return;
      }
      if (err.code === 'auth/operation-not-allowed') {
        errorEl.textContent =
          'Email/password sign-in is disabled in Firebase Auth. Enable it in ' +
          'Firebase Console → Authentication → Sign-in method → Email/Password.';
        errorEl.hidden = false;
        return;
      }
      throw err;
    }

    // Step 2: create the memberships/<uid> doc pointing at this library.
    // New invites always land as role="staff". Promoting to admin is a
    // separate explicit action available only to super-admins. The
    // email is cached in the doc as a display label for the staff list
    // — the client SDK can't look it up by UID later, so we stash it
    // now while we know it.
    // If this fails, the auth user is created but has no membership —
    // the admin can't clean that up from this UI (no Admin SDK), so
    // they'd have to delete the auth user from the Firebase Auth console.
    // We surface this clearly in the error message.
    try {
      await setDoc(doc(db, 'memberships', newUid), {
        libraryId: editingLibrary.id,
        role: 'staff',
        email: email,
      });
    } catch (err) {
      console.warn('[admin] memberships setDoc failed after auth user creation:', err);
      errorEl.textContent =
        'Created the auth user, but failed to set their membership: ' +
        (err.message || err.code || 'unknown error') +
        '. To clean up, delete this user from the Firebase Auth console and retry. ' +
        'Orphaned UID: ' + newUid;
      errorEl.hidden = false;
      return;
    }

    // Step 3: send the password reset email. This doubles as the invite —
    // the new user clicks the link, sets a password, and they're in.
    // If this step fails (rare), the user + membership are already in
    // place, so they can still get in by clicking "Forgot password?" on
    // the library's sign-in modal themselves. Non-fatal.
    try {
      await sendPasswordResetEmail(auth, email);
      successEl.textContent =
        'Invite sent to ' + email + '. They\'ll receive an email with a link to set their password.';
      successEl.hidden = false;
    } catch (resetErr) {
      console.warn('[admin] password reset email failed:', resetErr);
      successEl.textContent =
        'User created and added to this library, but the invite email failed to send (' +
        (resetErr.code || 'unknown error') + '). Ask the user to visit the library sign-in page ' +
        'and click "Forgot password?" to trigger a reset themselves.';
      successEl.hidden = false;
    }

    emailInput.value = '';
    await loadMemberships(editingLibrary.id);
  } catch (err) {
    console.warn('[admin] add membership failed:', err);
    let msg = 'Failed to add member: ' + (err.message || err.code || 'unknown error');
    if (authUserCreated && newUid) {
      msg += ' (Auth user was created with UID ' + newUid +
        ' — clean up from the Firebase Auth console if needed.)';
    }
    errorEl.textContent = msg;
    errorEl.hidden = false;
  } finally {
    addBtn.disabled = false;
    addBtn.innerHTML = originalBtnHTML;
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

// Promote a staff member to library admin. Super-admin only — the UI
// only shows the Promote button when currentUserRole === 'super-admin'
// and the Firestore rules reject the write otherwise. Uses updateDoc
// so libraryId stays intact even if the schema ever grows.
async function promoteToAdmin(uid, libraryId) {
  const errorEl = document.getElementById('admin-memberships-error');
  errorEl.hidden = true;
  try {
    await updateDoc(doc(db, 'memberships', uid), { role: 'admin' });
    await loadMemberships(libraryId);
  } catch (err) {
    console.warn('[admin] promote failed:', err);
    errorEl.textContent = 'Failed to promote: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

// Demote a library admin back to staff. Super-admin only.
async function demoteToStaff(uid, libraryId) {
  const errorEl = document.getElementById('admin-memberships-error');
  errorEl.hidden = true;
  try {
    await updateDoc(doc(db, 'memberships', uid), { role: 'staff' });
    await loadMemberships(libraryId);
  } catch (err) {
    console.warn('[admin] demote failed:', err);
    errorEl.textContent = 'Failed to demote: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Move a staff member to another library (super-admin only)
//
// Updates memberships/<uid>'s libraryId in place and forces role back to
// 'staff' — moving across libraries is treated as starting fresh, so any
// prior library-admin status doesn't follow the user. Promote them again
// in the new library if you want them to be a library admin there.
//
// This avoids the email-already-in-use trap that bites a remove +
// re-invite workflow: removing a membership doesn't delete the Firebase
// Auth account, so re-inviting the same email fails. By updating in
// place we keep the existing Auth UID and credentials.
// ---------------------------------------------------------------------------

let movingStaff = null; // { uid, fromLibraryId, email }

function openMoveStaffModal(row, fromLibraryId) {
  if (currentUserRole !== 'super-admin') return;
  movingStaff = {
    uid: row.uid,
    fromLibraryId,
    email: row.data.email || null,
  };

  const nameEl = document.getElementById('admin-move-staff-name');
  const targetSelect = document.getElementById('admin-move-staff-target');
  const errorEl = document.getElementById('admin-move-staff-error');
  const confirmBtn = document.getElementById('admin-move-staff-confirm-btn');

  nameEl.textContent = row.data.email || row.uid;

  // Populate the dropdown with every library other than the current
  // one, sorted by display name. Show display name + (id) so the
  // super-admin can disambiguate libraries with similar names.
  targetSelect.innerHTML = '';
  const otherLibs = librariesCache
    .filter((l) => l.id !== fromLibraryId)
    .slice()
    .sort((a, b) => {
      const an = (a.data.displayName || a.id).toLowerCase();
      const bn = (b.data.displayName || b.id).toLowerCase();
      return an.localeCompare(bn);
    });
  for (const lib of otherLibs) {
    const opt = document.createElement('option');
    opt.value = lib.id;
    opt.textContent = (lib.data.displayName || lib.id) + ' (' + lib.id + ', ' + lib.type + ')';
    targetSelect.appendChild(opt);
  }

  errorEl.hidden = true;
  errorEl.textContent = '';
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Move';

  document.getElementById('admin-move-staff-modal').hidden = false;
  targetSelect.focus();
}

function closeMoveStaffModal() {
  document.getElementById('admin-move-staff-modal').hidden = true;
  movingStaff = null;
}

async function handleMoveStaffConfirm() {
  if (!movingStaff) return;
  if (currentUserRole !== 'super-admin') return;

  const targetSelect = document.getElementById('admin-move-staff-target');
  const errorEl = document.getElementById('admin-move-staff-error');
  const confirmBtn = document.getElementById('admin-move-staff-confirm-btn');
  const newLibraryId = targetSelect.value;

  if (!newLibraryId) {
    errorEl.textContent = 'Pick a target library.';
    errorEl.hidden = false;
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Moving…';
  errorEl.hidden = true;

  const { uid, fromLibraryId } = movingStaff;

  try {
    // Always demote to staff on move. The rules permit this for
    // super-admins; library admins can't see the Move button.
    await updateDoc(doc(db, 'memberships', uid), {
      libraryId: newLibraryId,
      role: 'staff',
    });
    closeMoveStaffModal();
    // Refresh the staff list of the library we're still editing —
    // the moved user should now disappear from this list.
    await loadMemberships(fromLibraryId);
  } catch (err) {
    console.warn('[admin] move staff failed:', err);
    errorEl.textContent = 'Move failed: ' + (err.message || err.code || 'unknown error');
    errorEl.hidden = false;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Move';
  }
}

document.getElementById('admin-add-membership-form').addEventListener('submit', handleAddMembership);
document.getElementById('admin-move-staff-cancel-btn').addEventListener('click', closeMoveStaffModal);
document.getElementById('admin-move-staff-confirm-btn').addEventListener('click', handleMoveStaffConfirm);

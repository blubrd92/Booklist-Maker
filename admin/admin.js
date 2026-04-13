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
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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

  // Authorized admin — show the main app area. CRUD UI goes here in
  // substep C.
  showSection('app');
});

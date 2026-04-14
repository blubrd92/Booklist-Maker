// Per-library config loader (ES module).
//
// Flow:
//   1. Import auth/db/libraryOverride from firebase-init.js.
//   2. If auth or db is null (public tool), set LIBRARY_CONFIG = null,
//      dispatch 'library-config-ready', and stop. Nothing else happens.
//   3. Otherwise, derive libraryId from the hostname (or from the
//      ?library= override on localhost).
//   4. Try to read libraries-public/<libraryId> first. If it exists this
//      is an unauthenticated branded instance — dispatch
//      'library-config-ready' with LIBRARY_REQUIRES_AUTH = false. No
//      login modal is ever shown.
//   5. If libraries-public has no doc for this id, this is a gated
//      instance. Set LIBRARY_REQUIRES_AUTH = true and watch auth state:
//        - If a user is already signed in (persisted session), go
//          directly to step 6.
//        - Otherwise dispatch 'library-config-needs-auth' so auth.js can
//          open the login modal.
//   6. Once the user is signed in, fetch libraries/<libraryId>. On
//      success dispatch 'library-config-ready'. On failure dispatch
//      'library-config-failed' with the error on event.detail.

import { auth, db, libraryOverride } from './firebase-init.js';

function deriveLibraryId(hostname) {
  // "sanrafael.booklister.org" -> "sanrafael"
  const parts = (hostname || '').split('.');
  return parts[0] || null;
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

(async function initLibraryConfig() {
  // Public tool: fire the ready event with a null config so any listeners
  // can continue with their default behavior. This is the no-op path.
  if (!auth || !db) {
    window.LIBRARY_CONFIG = null;
    window.LIBRARY_REQUIRES_AUTH = false;
    dispatch('library-config-ready', { config: null });
    return;
  }

  // Branded instance: pull in Firestore + Auth helpers from the CDN. These
  // imports only happen on branded hosts so the public tool never fetches
  // a single byte of Firebase SDK code.
  const { doc, getDoc } = await import(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'
  );
  const { onAuthStateChanged } = await import(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
  );

  const libraryId = libraryOverride || deriveLibraryId(window.location.hostname);
  window.LIBRARY_ID = libraryId;

  if (!libraryId) {
    dispatch('library-config-failed', {
      error: new Error('Could not determine library ID from hostname or override.')
    });
    return;
  }

  // Fetch the gated config. Called after sign-in completes (or on page
  // load if the user already has a persisted session). Also reads the
  // current user's memberships doc so the main tool can show role-aware
  // UI (e.g. the Admin link in the header, visible only to library admins).
  async function loadGatedConfig() {
    try {
      const snap = await getDoc(doc(db, 'libraries', libraryId));
      if (!snap.exists()) {
        dispatch('library-config-failed', {
          error: new Error('Library config not found for "' + libraryId + '".')
        });
        return;
      }
      window.LIBRARY_CONFIG = snap.data();

      // Best-effort: read the signed-in user's own memberships doc to
      // surface their role. Permission-denied or missing doc both fall
      // back to 'staff' silently — the Admin link just won't appear, but
      // the tool still loads.
      window.LIBRARY_USER_ROLE = 'staff';
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const memSnap = await getDoc(
            doc(db, 'memberships', currentUser.uid)
          );
          if (memSnap.exists()) {
            const data = memSnap.data();
            if (data && data.role === 'admin') {
              window.LIBRARY_USER_ROLE = 'admin';
            }
          }
        }
      } catch (roleErr) {
        console.warn('[library-config] could not read own membership:', roleErr);
      }

      dispatch('library-config-ready', {
        config: snap.data(),
        role: window.LIBRARY_USER_ROLE
      });
    } catch (err) {
      dispatch('library-config-failed', { error: err });
    }
  }

  // Try libraries-public/<id> first. This is the unauthenticated path.
  try {
    const publicSnap = await getDoc(doc(db, 'libraries-public', libraryId));
    if (publicSnap.exists()) {
      window.LIBRARY_CONFIG = publicSnap.data();
      window.LIBRARY_REQUIRES_AUTH = false;
      dispatch('library-config-ready', { config: publicSnap.data() });
      return;
    }
  } catch (err) {
    // A permission-denied here usually just means this library isn't in
    // the public collection — fall through to the gated path. Only log;
    // don't fail outright.
    console.warn(
      '[library-config] libraries-public read threw, falling through to gated path:',
      err
    );
  }

  // Gated path: show the login modal or use a persisted session.
  window.LIBRARY_REQUIRES_AUTH = true;

  // onAuthStateChanged fires once immediately with the current user (which
  // may be null), and again whenever auth state changes. This lets us
  // handle persisted sessions from a prior visit without forcing the
  // user to sign in again.
  let firstAuthCallback = true;
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Signed in — either persisted or a fresh sign-in from auth.js.
      await loadGatedConfig();
    } else if (firstAuthCallback) {
      // First callback with no user: prompt auth.js to open the modal.
      dispatch('library-config-needs-auth', { libraryId });
    }
    firstAuthCallback = false;
  });
})();

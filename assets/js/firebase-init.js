// Firebase initialization (ES module).
//
// This file is the single entry point that decides whether Firebase runs at
// all for the current page load. On the public Booklister tool it is a no-op:
// nothing from Firebase is imported, initialized, or fetched. On branded
// library subdomains (e.g. sanrafael.booklister.org) it dynamically imports
// the Firebase SDK from the gstatic CDN, initializes the app, and exposes
// `auth` and `db` instances for the other modules to consume.
//
// Constraint: this project has no build step. We use the Firebase JS SDK v10
// modular syntax via direct CDN URLs inside dynamic `import()` calls so that
// the public tool never downloads a single byte of Firebase code.

// Hosts where Firebase must NEVER initialize. This is the guard that keeps
// the public tool identical to its current behavior.
const PUBLIC_HOSTS = new Set([
  'booklister.org',
  'www.booklister.org',
  'blubrd92.github.io',
  'localhost',
  '127.0.0.1'
]);

// Cloudflare Pages serves preview deploys at `<branch>.<project>.pages.dev`
// (and per-deploy at `<commit>.<project>.pages.dev`). Treat any `.pages.dev`
// host as public so non-production previews render the public tool, never
// the gated library login modal. Mirror this rule in the inline head script
// in index.html so the body doesn't flash hidden before this module runs.
function isPagesDevHost(host) {
  return typeof host === 'string' && host.endsWith('.pages.dev');
}

const hostname = window.location.hostname;
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

// Local-dev override: `?library=sanrafael` on localhost makes the page behave
// as if it were loaded on sanrafael.booklister.org. The override is ignored
// on any real domain so nobody can force a config load on the public tool.
const urlParams = new URLSearchParams(window.location.search);
const libraryOverride = isLocalHost ? urlParams.get('library') : null;

const isPublicHost = PUBLIC_HOSTS.has(hostname) || isPagesDevHost(hostname);
const isBrandedInstance = !isPublicHost || (isLocalHost && !!libraryOverride);

let app = null;
let auth = null;
let db = null;

if (isBrandedInstance) {
  // Dynamic imports: these network requests only happen on branded hosts.
  const { initializeApp } = await import(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
  );
  const { getAuth, setPersistence, browserLocalPersistence } = await import(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
  );
  const { getFirestore } = await import(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'
  );

  // Firebase project config (from the Firebase console).
  const firebaseConfig = {
    apiKey: 'AIzaSyCRQahoA79yeWbbFUIEs4-4mft_KSGpjcw',
    authDomain: 'booklister-50296.firebaseapp.com',
    projectId: 'booklister-50296',
    storageBucket: 'booklister-50296.firebasestorage.app',
    messagingSenderId: '682630183367',
    appId: '1:682630183367:web:6a4a71476fcf3432b181e2'
  };

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Keep the user signed in across browser restarts. If this fails for any
  // reason (e.g. storage disabled), auth still works for the current tab.
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn('[firebase-init] Auth persistence setup failed:', err);
  }

  // Expose instances on window so the other (module) files can reach them
  // and so IIFE code in app.js can do simple presence checks later.
  window.firebaseAuth = auth;
  window.firebaseDb = db;
}

export { app, auth, db, isBrandedInstance, libraryOverride };

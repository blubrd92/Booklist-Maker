// Login UI + sign-out for gated library instances (ES module).
//
// On the public tool (auth === null) this module does nothing.
// On public branded instances (libraries-public config) the modal never
// opens because we only render it in response to the
// 'library-config-needs-auth' event dispatched by library-config.js.
// On gated branded instances the flow is:
//   1. library-config.js dispatches 'library-config-needs-auth'.
//   2. We reveal the #auth-modal that's already in the DOM (hidden).
//   3. User signs in. We call signInWithEmailAndPassword.
//   4. On success we hide the modal. library-config.js's
//      onAuthStateChanged picks up the new user, fetches libraries/<id>,
//      and dispatches 'library-config-ready'.
//   5. On any later 'library-config-ready' we keep the modal hidden and
//      reveal the sign-out button in the header.

import { auth } from './firebase-init.js';

if (auth) {
  // Lazy-cached Firebase Auth import. We don't await at module top-level
  // so 'library-config-needs-auth' / 'library-config-ready' listeners are
  // attached synchronously before library-config.js can dispatch.
  const authModPromise = import(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
  );

  // Map Firebase auth error codes to user-facing messages.
  function mapAuthError(err) {
    const code = err && err.code;
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-email'
    ) {
      return 'Incorrect email or password';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many attempts, try again later';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error, check your connection';
    }
    return 'Sign-in failed, please try again';
  }

  let modalWired = false;

  function wireModalOnce(modalEl) {
    if (modalWired) return;
    modalWired = true;

    const form = modalEl.querySelector('#auth-signin-form');
    const emailInput = modalEl.querySelector('#auth-email-input');
    const passwordInput = modalEl.querySelector('#auth-password-input');
    const submitBtn = modalEl.querySelector('#auth-signin-submit');
    const forgotLink = modalEl.querySelector('#auth-forgot-link');
    const errorEl = modalEl.querySelector('#auth-error');
    const resetOkEl = modalEl.querySelector('#auth-reset-confirm');
    const passwordToggle = modalEl.querySelector('#auth-password-toggle');

    // Password visibility toggle. Flips the input between type="password"
    // and type="text" and swaps the Font Awesome eye icon accordingly.
    if (passwordToggle) {
      passwordToggle.addEventListener('click', () => {
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        passwordToggle.setAttribute('aria-pressed', String(isHidden));
        passwordToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        const icon = passwordToggle.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-eye', !isHidden);
          icon.classList.toggle('fa-eye-slash', isHidden);
        }
        passwordInput.focus();
      });
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
    function clearError() {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
    function showResetOk(msg) {
      resetOkEl.textContent = msg;
      resetOkEl.hidden = false;
    }
    function clearResetOk() {
      resetOkEl.textContent = '';
      resetOkEl.hidden = true;
    }

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      clearError();
      clearResetOk();
      submitBtn.disabled = true;
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      try {
        const { signInWithEmailAndPassword } = await authModPromise;
        await signInWithEmailAndPassword(auth, email, password);
        // Hide the modal. library-config.js will pick up the auth state
        // change and fetch the gated config.
        modalEl.hidden = true;
        passwordInput.value = '';
      } catch (err) {
        console.warn('[auth] sign-in failed:', err);
        showError(mapAuthError(err));
      } finally {
        submitBtn.disabled = false;
      }
    });

    forgotLink.addEventListener('click', async (evt) => {
      evt.preventDefault();
      clearError();
      clearResetOk();
      const email = emailInput.value.trim();
      if (!email) {
        showError('Enter your email address above, then click "Forgot password?" again.');
        return;
      }
      try {
        const { sendPasswordResetEmail } = await authModPromise;
        await sendPasswordResetEmail(auth, email);
        showResetOk('Password reset email sent. Check your inbox.');
      } catch (err) {
        console.warn('[auth] password reset failed:', err);
        showError(mapAuthError(err));
      }
    });
  }

  function openModal() {
    const modalEl = document.getElementById('auth-modal');
    if (!modalEl) {
      console.warn('[auth] #auth-modal not found in DOM');
      return;
    }
    wireModalOnce(modalEl);
    modalEl.hidden = false;
    const emailInput = modalEl.querySelector('#auth-email-input');
    if (emailInput) emailInput.focus();
  }

  function hideModal() {
    const modalEl = document.getElementById('auth-modal');
    if (modalEl) modalEl.hidden = true;
  }

  // Map a library-config load error to a user-facing message. The error
  // may be a FirebaseError (permission-denied from security rules, network
  // failure, etc.) or a plain Error from library-config.js itself (e.g.
  // "Library config not found for '<id>'." when the doc is missing).
  function mapConfigError(err) {
    const code = (err && err.code) || '';
    const message = (err && err.message) || '';
    if (code === 'permission-denied' || /permission|insufficient/i.test(message)) {
      return 'Signed in, but this account is not authorized for this library. Contact your library admin.';
    }
    if (code === 'not-found' || /not found|not exist/i.test(message)) {
      return 'Library configuration is missing. Contact your library admin.';
    }
    if (code === 'unavailable' || /network|offline/i.test(message)) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    return 'Could not load library configuration. Please try again, or contact your library admin.';
  }

  // Show a config-load error inside the auth modal. Re-opens the modal
  // if it was closed (the typical sequence is: user signs in successfully
  // -> we hide the modal -> library-config.js tries libraries/<id> and
  // fails -> this runs).
  function showConfigError(err) {
    console.warn('[auth] library-config failed:', err);
    openModal();
    const errorEl = document.getElementById('auth-error');
    const resetOkEl = document.getElementById('auth-reset-confirm');
    if (errorEl) {
      errorEl.textContent = mapConfigError(err);
      errorEl.hidden = false;
    }
    if (resetOkEl) {
      resetOkEl.textContent = '';
      resetOkEl.hidden = true;
    }
  }

  // Synchronously attach listeners — no top-level await above this point.
  window.addEventListener('library-config-needs-auth', openModal);
  window.addEventListener('library-config-failed', (evt) => {
    showConfigError(evt && evt.detail && evt.detail.error);
  });
  window.addEventListener('library-config-ready', () => {
    // Hide the modal and, if this is a gated instance and the user is
    // signed in, reveal the sign-out button in the header.
    hideModal();
    if (window.LIBRARY_REQUIRES_AUTH && auth.currentUser) {
      const btn = document.getElementById('auth-signout-button');
      if (btn) btn.hidden = false;
    }
  });

  // Sign-out button wiring. The button is already in the DOM (hidden).
  function wireSignOutButton() {
    const btn = document.getElementById('auth-signout-button');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        const { signOut } = await authModPromise;
        await signOut(auth);
      } catch (err) {
        console.warn('[auth] sign-out failed:', err);
      }
      window.location.reload();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSignOutButton);
  } else {
    wireSignOutButton();
  }
}

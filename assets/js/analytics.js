// Cloudflare Web Analytics loader.
//
// Injects the Cloudflare Web Analytics beacon, which is cookieless:
// it sets no cookies, writes nothing to localStorage, does no
// fingerprinting, and builds no cross-site identifier. It reports page
// views, referrer, browser/OS/device class, country, and page-load
// timings. See the "Analytics" section of privacy.html, which is the
// user-facing description of exactly this file's behavior — if you
// change what loads here, that section has to change with it.
//
// Self-gates on hostname: a no-op everywhere except the public
// production site. In particular it does NOT run on:
//
//   - branded library subdomains (`<library>.booklister.org`), which
//     serve these same HTML files. privacy.html promises libraries no
//     usage analytics and no telemetry on their instances, and this
//     gate is what keeps that promise true.
//   - `admin.booklister.org` (which never loads these pages anyway).
//   - Cloudflare Pages previews (`*.pages.dev`) and localhost, so dev
//     and preview traffic stays out of the production numbers.
//
// Deliberately NOT reusing the `PUBLIC_HOSTS` list from the inline head
// script / firebase-init.js. That list is broader than this one (it
// includes localhost and the github.io mirror, neither of which should
// report analytics), so the two are unrelated and there's no sync
// burden between them.
//
// The `data-cf-beacon` token is not a secret. Every Cloudflare Web
// Analytics install exposes it in client-side HTML by design; it
// identifies the site to Cloudflare and grants no access to anything.

(function() {
  'use strict';

  const ANALYTICS_HOSTS = ['booklister.org', 'www.booklister.org'];
  const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
  const BEACON_TOKEN = '{"token": "6fc3654fd6894bbf937d6625edb25d24"}';

  if (ANALYTICS_HOSTS.indexOf(window.location.hostname) === -1) return;

  const script = document.createElement('script');
  script.type = 'module';
  script.defer = true;
  script.src = BEACON_SRC;
  script.setAttribute('data-cf-beacon', BEACON_TOKEN);
  document.head.appendChild(script);
})();

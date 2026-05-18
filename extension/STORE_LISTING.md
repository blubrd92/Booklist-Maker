# Booklister Helper: store re-submission notes

The initial Chrome / Firefox / Edge listings (descriptions, single-purpose statement, permission justifications, icons, screenshots) were entered once on the `1.0.0` submission and live on the stores now. This file is what you need for **subsequent** uploads: the version bump rule, the release notes for the current version, the re-zip + upload steps, and the common metadata you may still need to reconfirm.

---

## Bumping the version

**Every re-upload requires a new `version` in `extension/manifest.json`.** Stores reject any re-upload that carries the same version string, even if the package contents differ.

**Pair the version bump with a release-notes update in this file (the "Release notes" section below).** Stores ask for "what's new in this version" on every upload, and the text in that section is what you paste in. Bumping the manifest without updating the release notes leaves you scrambling for words at submission time.

SemVer convention:
- `1.0.x` — bug fixes, store-validator workarounds, copy tweaks, single-string changes (e.g. a new cover provider added to `host_permissions`).
- `1.x.0` — new user-facing capability (a new capture mode, a new setting, etc.).
- `2.0.0` — breaking changes to the TSV format the extension emits, or to anything Booklister's Quick Add depends on.

---

## Release notes

Paste the section for the current version into each store's "What's new" / "Version notes" / "Release notes" field on upload.

### 1.0.2 (current)

Firefox compatibility fix. No user-visible changes.

- Pair `background.service_worker` with a `background.scripts` fallback so Firefox loads the background as a non-persistent page. Without it, Firefox AMO now rejects the upload outright (previously this was a warning).

### 1.0.1

Reliability and store-warning cleanup. No new user-facing features.

- Recover gracefully from clipboard write failures. If you switch tabs while a list capture is running, the browser blocks the clipboard write because the page is no longer focused. The extension now stashes the captured rows and shows a click-to-copy banner so you can finish the handoff when you return to the tab.
- The "Capturing N titles" status now reminds you to stay on the tab until the confirmation lands, so the fallback above is rarely needed.
- Internal cleanup to clear Firefox add-on validator warnings: removed dynamic `innerHTML` use in the popup, bumped the Firefox minimum version to 140 to match the `data_collection_permissions` declaration.

### 1.0.0

Initial release. See store listing page for the feature description.

---

## Re-zip + upload steps

1. Bump `version` in `extension/manifest.json`.
2. Update the "Release notes" section above with a new entry for the version you're about to ship.
3. From inside the `extension/` directory, zip its **contents** (not the directory itself) so `manifest.json` sits at the root of the archive. Same ZIP uploads to all three stores.
4. Name the ZIP `booklister-helper-<version>.zip` (e.g. `booklister-helper-1.0.2.zip`). The version comes straight from `manifest.json`. This is just so you can tell uploads apart on disk; the stores rename it on receipt.
5. Chrome Web Store → developer dashboard → Booklister Helper → Package → Upload new package.
6. Firefox Add-ons (AMO) → Developer Hub → Booklister Helper → Upload new version.
7. Microsoft Edge Add-ons → Partner Center → Booklister Helper → Update → New package.
8. Paste the matching release-notes block into each store's "What's new" field.

---

## Common metadata (in case a store asks again)

- Privacy policy: `https://booklister.org/privacy.html`
- Homepage: `https://booklister.org/extension.html`
- Support URL: `https://booklister.org/contact.html`
- Category: Productivity
- Display name: `Booklister Helper`

---

## Per-store gotchas to remember

The same ZIP uploads to all three stores. Things that have bitten past submissions:

- **Chrome Web Store**: $5 one-time developer fee already paid on this account. Review typically 1-3 days.
- **Firefox Add-ons (AMO)**: free. As of 2026 AMO **requires** `background.scripts` to be paired with `background.service_worker` for any MV3 extension. Without the `scripts` fallback the upload is rejected outright (this used to be a warning; it escalated to an error). The current manifest declares both keys. Review typically <24 hours.
- **Microsoft Edge Add-ons**: free. Edge's MV3 validator rejected `background.scripts` on the 1.0.0 submission, which is why 1.0.1 only had `service_worker`. 1.0.2 had to add `scripts` back to satisfy Firefox. **If Edge rejects 1.0.2 for the same reason as 1.0.0, the only fix is per-browser builds** (a Firefox-only zip with `scripts`, a Chrome/Edge zip with only `service_worker`). Try the unified upload first; if rejected, see the "Per-browser builds (only if Edge rejects)" section below. Review typically 24-72 hours.

---

## Background manifest: why both keys are declared

The `background` block in `manifest.json` declares both `service_worker` and `scripts`:

```json
"background": {
  "service_worker": "background.js",
  "scripts": ["vendor/browser-polyfill.min.js", "background.js"]
}
```

Each browser picks the key it understands:

- **Chrome / Edge** use `service_worker` and ignore `scripts`. The service worker runs `background.js` directly; the polyfill is loaded inside that file via `importScripts('vendor/browser-polyfill.min.js')` (guarded by `typeof importScripts === 'function'` so it only fires in the service-worker context).
- **Firefox** uses `scripts` (loaded as a non-persistent background page) and ignores `service_worker`. The polyfill is loaded as the first entry in the `scripts` array because Firefox background pages don't have `importScripts`.

If you ever need to refactor `background.js`, keep the `typeof importScripts` guard around the polyfill load — without it, Firefox will throw a ReferenceError on startup.

---

## Per-browser builds (only if Edge rejects)

If a future Edge submission rejects the unified ZIP because of `background.scripts`, the workaround is two zips:

1. **Chrome/Edge ZIP**: same as the Firefox ZIP but with the `scripts` line removed from `background`. Upload to Chrome Web Store and to Edge Add-ons.
2. **Firefox ZIP**: the unified manifest as-is (both keys). Upload to AMO.

To do this by hand: zip the `extension/` contents as-is for Firefox, then duplicate the ZIP, open the duplicate, and edit `manifest.json` inside it to remove the `"scripts": [...]` line and its trailing comma. Upload that one to Chrome and Edge.

This is documented as a fallback, not the default, because a single ZIP is much easier to maintain. Edge accepted `service_worker` alone on 1.0.0, and Mozilla's now-mandated dual-key pattern is widely used in the ecosystem, so Edge may well accept it on 1.0.2. Try the unified upload first.

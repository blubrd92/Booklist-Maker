# Booklister Helper: store re-submission notes

The initial Chrome / Firefox / Edge listings (descriptions, single-purpose statement, permission justifications, icons, screenshots) were entered once on the `1.0.0` submission and live on the stores now. This file is what you need for **subsequent** uploads: the version bump rule, the release notes for the current version, the build + upload steps, and the common metadata you may still need to reconfirm.

---

## Quick reference

> **Developer reminder:** the developer does not have a local checkout. After bumping `manifest.json` and adding a release-notes entry, **ask Claude** to "build and send the extension zips for v\<version\>." Do not try to run the build yourself; there's nowhere to run it. Without that ask, no zips exist.
>
> **Claude reminder:** when you see that request (or any "ship the extension" / "package the extension" wording), the developer is blocked until you produce the artifacts. Your job is two steps, in order:
>
> 1. Run `npm run package:extension` from the repo root. This produces `dist/booklister-helper-<version>-firefox.zip` and `dist/booklister-helper-<version>-chromium.zip`.
> 2. **Immediately call `SendUserFile`** with both zip paths. The sandbox is the only place these files exist; if you skip this step, the developer cannot upload to any store. Do not assume they can fetch them from anywhere else.
>
> If the version in `manifest.json` doesn't match what the developer asked for, stop and ask before building.

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

### 1.0.3 (current)

Edge compatibility fix. No user-visible changes.

- Ship Chrome / Edge with a Chromium-specific manifest that omits `background.scripts`. Edge's MV3 validator rejects that field outright, so we now build two ZIPs from the same source: one for Firefox (both background keys) and one for Chromium browsers (service worker only). Same code, same behavior, two manifests.

### 1.0.2

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

## Build + upload steps

The repo doesn't live on the developer's local machine; the developer edits on GitHub and asks Claude to produce the store-ready zips. Process:

1. **Developer** bumps `version` in `extension/manifest.json` via the GitHub web editor.
2. **Developer** adds a new entry to the "Release notes" section above describing what's in this version.
3. **Developer** asks Claude to "build and send the extension zips for v\<version\>."
4. **Claude** (whoever's reading this) pulls the latest main, runs `npm run package:extension` from the repo root, and delivers both zips to the developer via `SendUserFile`. Output lives in `dist/` (gitignored), so the zips never get committed. The build script (`extension/build-zips.mjs`) reads `manifest.json` and emits:

   - `booklister-helper-<version>-firefox.zip` — keeps both `background.service_worker` and `background.scripts`. AMO requires the pairing.
   - `booklister-helper-<version>-chromium.zip` — `background.scripts` stripped. Edge rejects that field; Chrome accepts either form, so this single zip goes to both Chromium stores.

   The script handles the manifest difference; do not hand-edit either zip.

5. **Developer** uploads each zip to its store:

   - **Chrome Web Store** → developer dashboard → Booklister Helper → Package → Upload new package → upload `*-chromium.zip`.
   - **Microsoft Edge Add-ons** → Partner Center → Booklister Helper → Update → New package → upload `*-chromium.zip` (same file as Chrome).
   - **Firefox Add-ons (AMO)** → Developer Hub → Booklister Helper → Upload new version → upload `*-firefox.zip`.

6. **Developer** pastes the matching release-notes block into each store's "What's new" field.

(The "Quick reference" callout at the top of this file is the authoritative reminder for the build + delivery handoff between Developer and Claude.)

---

## Common metadata (in case a store asks again)

- Privacy policy: `https://booklister.org/privacy.html`
- Homepage: `https://booklister.org/extension.html`
- Support URL: `https://booklister.org/contact.html`
- Category: Productivity
- Display name: `Booklister Helper`

---

## Per-store gotchas to remember

- **Chrome Web Store**: $5 one-time developer fee already paid on this account. Accepts the Chromium zip. Review typically 1-3 days.
- **Firefox Add-ons (AMO)**: free. Requires both `background.service_worker` and `background.scripts`; the Firefox zip carries both. Review typically <24 hours.
- **Microsoft Edge Add-ons**: free. Rejects `background.scripts` in MV3 with the exact error `The background.scripts field cannot be used with manifest version 3`. The Chromium zip strips that field. Review typically 24-72 hours.

---

## Background manifest: why two builds are needed

The canonical `manifest.json` in the repo declares both `background.service_worker` and `background.scripts`:

```json
"background": {
  "service_worker": "background.js",
  "scripts": ["vendor/browser-polyfill.min.js", "background.js"]
}
```

Each browser picks the key it understands, but the two main stores disagree on whether the other key is allowed to coexist:

- **Firefox** uses `scripts` (loaded as a non-persistent background page) and ignores `service_worker`. The polyfill is loaded as the first entry in the `scripts` array because Firefox background pages don't have `importScripts`. AMO **requires** `scripts` to be present.
- **Chrome** uses `service_worker` and ignores `scripts`. Chrome accepts the dual-key form too.
- **Edge** uses `service_worker` but **rejects** `scripts` outright at validation time.

`extension/build-zips.mjs` reconciles this by producing one ZIP with both keys (for Firefox) and a second ZIP with `background.scripts` deleted (for Chrome and Edge). The `background.js` file is unchanged in both: the `typeof importScripts === 'function'` guard at the top picks the right code path for whichever runtime is loading it.

If you ever need to refactor `background.js`, keep the `typeof importScripts` guard around the polyfill load. Without it, Firefox will throw a ReferenceError on startup.

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

### 1.0.1 (current)

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
4. Chrome Web Store → developer dashboard → Booklister Helper → Package → Upload new package.
5. Firefox Add-ons (AMO) → Developer Hub → Booklister Helper → Upload new version.
6. Microsoft Edge Add-ons → Partner Center → Booklister Helper → Update → New package.
7. Paste the matching release-notes block into each store's "What's new" field.

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
- **Firefox Add-ons (AMO)**: free. Will emit one informational warning about `background.service_worker` being "ignored by Firefox" — this is incorrect (Firefox 121+ treats it as a non-persistent background page per MDN) and the warning is harmless. Do **not** add a `background.scripts` fallback to silence it; that re-triggers the Edge rejection below. Review typically <24 hours.
- **Microsoft Edge Add-ons**: free. Strict MV3 validator. Rejects any MV2-style background keys (`background.scripts`, `background.page`). The manifest uses only `background.service_worker` for this reason. Review typically 24-72 hours.

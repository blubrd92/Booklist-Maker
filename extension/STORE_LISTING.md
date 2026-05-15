# Browser-Store Listing Copy

Reference text for the Booklister Helper store submissions. The descriptions and the single-purpose statement are the only things stores genuinely require copy for; the rest is guidance for the form fields that come up during submission.

Common metadata to provide on every store:

- Privacy policy: `https://booklister.org/privacy.html`
- Homepage: `https://booklister.org/extension.html`
- Support URL: `https://booklister.org/contact.html`
- Category: Productivity
- Display name: `Booklister Helper`

---

## Short description

Use the same one on every store. Chrome's hard limit is 132 characters; Firefox and Edge accept similar lengths.

> Capture titles from your BiblioCommons library catalog into Booklister's printable booklist tool. Free and private.

---

## Long description

Booklister Helper is a small, free browser extension that captures titles from your library's online catalog into Booklister. Open a title's record page on your library's catalog, click the extension icon, and the title, author, call number, and cover image all land on your clipboard, ready to paste into Booklister's Quick Add.

**Works with BiblioCommons catalogs only.** BiblioCommons is a software platform many North American public libraries use as the front-end of their catalog. To check whether your library uses it, open any title's page on your library's catalog and look at the URL. If it contains `bibliocommons.com`, you're set.

If your library is on a different catalog system, this extension won't help today. Other catalog platforms may be supported in the future.

Three workflows:

1. **One title at a time.** Open a title's record page, click the extension, paste into Booklister's Quick Add Multiple titles tab.
2. **Multiple titles from a BiblioCommons list.** Open any BiblioCommons list page and click the extension. A popup lets you pick which titles to capture, then copies the selected rows to your clipboard.
3. **Running list while you browse.** Turn on accumulate mode in the settings and each toolbar click appends to a running list. Paste into Booklister whenever you have enough titles.

**Privacy.** Booklister Helper runs only on BiblioCommons pages. Nothing about your use of it is sent to me, to Booklister, or to any server I operate. No analytics, no telemetry, no tracking. Full privacy details at `https://booklister.org/privacy.html`.

Booklister itself is a free web tool for making printable booklists for library displays, available at `https://booklister.org`. The Booklister Helper extension is an optional companion to that tool.

---

## Single-purpose statement (Chrome's required field)

> Booklister Helper has one purpose: capturing title records (title, author, call number, and cover image) from BiblioCommons library catalog pages and writing them as tab-separated values to the user's clipboard for pasting into Booklister's Quick Add tool.

---

## Permission justifications (Chrome asks per-permission)

Chrome's submission form asks for a 1-2 sentence justification for each permission and host permission. Use these answers.

- `storage` — to remember the user's settings (preferred branch, accumulate mode) and the running list of captured rows between browser sessions. Stored locally; nothing is transmitted.
- `scripting` — so the content script can run on BiblioCommons pages to read title metadata for capture.
- `contextMenus` — to add right-click items for capturing on BiblioCommons pages and for clearing the accumulated list.
- Host permissions on the BiblioCommons catalog domains and the cover image source those catalogs use — to read title metadata from catalog pages, query the availability API for branch-specific call numbers, and fetch the cover thumbnail the catalog page already displays.

---

## Data usage disclosure (Chrome's privacy practices form)

Chrome asks a structured yes/no questionnaire about what data the extension collects. Most categories are No. The one Yes is **Website content**: the extension reads title metadata from BiblioCommons catalog pages when the user explicitly invokes it. It is used only for the extension's core function and is not sold, shared, or transferred to anyone.

Check all three of the standard certifications:

- I do not sell or transfer user data to third parties outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Per-store notes

The same ZIP uploads to all three stores. The extension calls the `browser.*` API namespace through the bundled `webextension-polyfill` (`extension/vendor/`); Firefox has `browser.*` natively, Chromium gets the promise-based shim. The manifest uses one MV3 `background.service_worker` key for all three browsers (Firefox 121+ supports `service_worker` natively, treating it as an event page). `browser_specific_settings.gecko` carries the Firefox extension id and the `data_collection_permissions: { required: ["none"] }` declaration. No per-browser builds.

- **Chrome Web Store**: $5 one-time developer fee. Submission ZIP is the contents of `extension/` (without a wrapping directory). Review typically 1-3 days.
- **Firefox Add-ons**: free. `strict_min_version` is `121.0` (the version where Firefox started supporting MV3 `background.service_worker`). Review typically <24 hours.
- **Microsoft Edge Add-ons**: free. Strict MV3 validator — rejects MV2-style keys like `background.scripts`. Accepts the same package as Chrome. Review typically 24-72 hours.

Submit in the order above; after each store goes live, swap the corresponding "link coming soon" placeholder in `extension.html` for the real install URL.

---

## Icons

SVG masters live at `extension/icons/icon.svg` and `extension/icons/icon-promo.svg`. Rasterize the main icon to PNG at 16, 48, and 128 pixels with whatever tool you prefer (rsvg-convert, Inkscape, a design app), drop the PNGs alongside the SVGs, and the manifest paths resolve. Stores require PNG for the in-extension icons; the SVG is just the source you edit when iterating on the design.

The promo tile (`icon-promo.svg`) renders to a 440×280 PNG for Chrome's small promo slot on the store listing page.

---

## Screenshots

Chrome requires at least one screenshot at 1280×800 or 640×400; Firefox and Edge accept similar. Most useful set, in order:

1. Selection popup with a real BiblioCommons list loaded.
2. A single-title capture in progress (toolbar icon visible on a BiblioCommons record page).
3. The captured TSV pasted into Booklister's Quick Add Multiple titles tab.

The options page and the right-click menu are optional fourth and fifth shots if you want a longer reel. Use the same set across all three stores.

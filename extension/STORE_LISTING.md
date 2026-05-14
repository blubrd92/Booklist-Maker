# Browser-Store Listing Copy

Reference document with the exact text to paste into each store's submission form when publishing Booklister Helper. Each store asks for slightly different fields, but the underlying copy is shared. Update this file when the extension's behavior changes.

Privacy policy URL (use the same for every store):
`https://booklister.org/privacy.html`

Homepage URL:
`https://booklister.org/extension.html`

Support email: use your contact email of choice (the same one behind the Booklister contact form).

Category: **Productivity** on Chrome, **Productivity** on Firefox, **Productivity** on Edge.

---

## Display name

`Booklister Helper`

(Keep the same name across all three stores for brand consistency. Chrome lets you pick a URL slug separately; suggest `booklister-helper`.)

---

## Short description

Use the same one everywhere. Chrome's hard limit is 132 characters; Firefox and Edge accept similar lengths.

**Primary (116 chars)**:
> Capture books from your BiblioCommons library catalog into Booklister's printable booklist tool. Free and private.

**Alternate (109 chars)**:
> One-click capture of books from BiblioCommons library catalogs into Booklister's printable booklist tool.

---

## Long description

Rich text. Copy-paste exactly as written. Adapt formatting (bold, lists) to each store's editor.

---

Booklister Helper is a small, free browser extension that captures books straight from your library's online catalog into Booklister. Open a book's record page on your library's catalog, click the extension icon, and the title, author, call number, and cover image all land on your clipboard, ready to paste into Booklister's Quick Add. No retyping, no copy-paste juggling, no hunting for cover images.

**Works with BiblioCommons catalogs only.** BiblioCommons is a software platform that many North American public libraries use as the front-end of their catalog. To check whether your library uses it, open any book's record page on your library's catalog and look at the URL. If it contains `bibliocommons.com`, you're set.

If your library is on a different catalog system, this extension won't help today. Other catalog platforms may be supported in the future if there's enough demand.

**Three workflows depending on what you're doing:**

1. **One book at a time.** Open a book's record page, click the extension icon, and paste the resulting row into Booklister's Quick Add Spreadsheet tab. Done.

2. **Multiple books from a BiblioCommons list.** Open any BiblioCommons list page (staff picks, themed reading lists, your own lists, or any patron's public list) and click the extension icon. A popup opens showing every book on the list with a cover thumbnail and a checkbox. Pick the books you want (use the All / First 13 / None buttons for quick presets) and click Capture. The selected rows go to your clipboard.

3. **Running list while you browse.** Turn on accumulate mode in the extension's options. Each time you click the extension on a book's record page, it appends to a running list. The toolbar badge shows the count. Paste into Booklister whenever you have enough books.

**Branch selection.** In consortium catalogs where the same book has different call numbers at different libraries, the extension picks one for you. By default it uses BiblioCommons's own "your local branch" detection (which works automatically when you're signed in to your library account or browsing from your library's IP range). You can also pin a specific branch in the extension's options for outreach booklists, school visits, or pop-up displays.

**Right-click access.** On any BiblioCommons record or list page you can right-click and pick "Capture for Booklister" from the menu instead of clicking the toolbar icon. The menu item only appears on BiblioCommons pages, so it doesn't clutter the right-click menu on other sites.

**Privacy.** Booklister Helper is designed to collect as little as possible:

- Doesn't send anything to me or to any server I control. The captured row goes from the catalog page straight to your clipboard, locally, in your browser.
- Doesn't run on any site other than BiblioCommons library catalog pages. The extension has no permission to read anything you browse elsewhere.
- Doesn't track you. No analytics, no telemetry, no usage logging.
- Doesn't load any code from the internet. The extension ships as a fixed bundle of files and runs entirely from your computer once installed.
- Doesn't use cookies or accounts.

Full privacy details at `https://booklister.org/privacy.html`.

**About Booklister.** Booklister is a free web tool for making printable booklists for library displays. You arrange books on a two-page bifold layout, generate a cover collage, add your library's branding, and export a print-ready PDF. Built by a Bay Area librarian. Open the tool at `https://booklister.org`. The Booklister Helper extension is a companion to that tool, not a replacement.

---

## Single-purpose description (Chrome-specific, required field)

> Booklister Helper has one purpose: capturing book records (title, author, call number, and cover image) from BiblioCommons library catalog pages and writing them as tab-separated values to the user's clipboard for pasting into Booklister's Quick Add tool. The extension does not perform any other function beyond this capture-and-clipboard workflow.

---

## Permission justifications (Chrome's per-permission form fields)

Chrome's submission form asks for a 1-2 sentence justification for each permission and each host permission. Paste these into the matching fields.

### `storage`

> Required to remember the user's settings (an optional preferred-branch substring and an on/off toggle for accumulate mode) and the running list of captured book rows when accumulate mode is on. All values are stored locally in the user's own browser; nothing is transmitted.

### `scripting`

> Required so the extension's content script can run on BiblioCommons book record and curated list pages, where it reads the page's book metadata (title, author, call number) and copies the resulting tab-separated row to the user's clipboard.

### `contextMenus`

> Required to add two right-click menu items: "Capture for Booklister" on BiblioCommons catalog pages, so users can capture without reaching for the toolbar icon, and "Clear accumulated list" on the extension's toolbar icon, so users can reset the running list when accumulate mode is on.

### `host_permissions: *://*.bibliocommons.com/*`

> Required to read book metadata from BiblioCommons-powered library catalog pages. Reading these pages is the extension's sole purpose.

### `host_permissions: *://gateway.bibliocommons.com/*`

> Required to query the BiblioCommons availability API for branch-specific call numbers. This is the same API the BiblioCommons catalog page itself calls when a user clicks "Availability by location" on a book's record.

### `host_permissions: *://*.syndetics.com/*`

> Required so the extension's service worker can fetch cover images from Syndetics (the most common cover image provider for BiblioCommons catalogs) and embed them as base64 in the captured row. Embedding the cover keeps the saved booklist self-contained even if the original cover URL changes or expires later.

---

## Data usage disclosure (Chrome Web Store privacy practices form)

Chrome requires you to answer a structured form about what data the extension collects. Use the following answers:

- **Personally identifiable information**: No
- **Health information**: No
- **Financial and payment information**: No
- **Authentication information**: No
- **Personal communications**: No
- **Location**: No
- **Web history**: No
- **User activity (clicks, browsing patterns, etc.)**: No
- **Website content (text, images, sounds, videos, or hyperlinks)**: **Yes**
  - Used for: **App functionality**
  - Sold to or shared with third parties: **No**
  - Used for purposes other than the item's single purpose: **No**
  - Determines creditworthiness or used for lending purposes: **No**

For "Website content," in the optional explanation field:

> The extension reads book record metadata (title, author, call number, cover image) from BiblioCommons library catalog pages only when the user explicitly clicks the extension or selects "Capture for Booklister" from the right-click menu. The captured data is written to the user's clipboard and is not transmitted to any third party.

Three certification checkboxes Chrome requires (all should be checked):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Firefox-specific notes

Firefox Add-ons (AMO) accepts the same package as Chrome. The Firefox-specific `browser_specific_settings.gecko` block is already in `manifest.json`:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "booklister-helper@booklister.org",
    "strict_min_version": "109.0"
  }
}
```

`109.0` is the minimum Firefox version that supports Manifest V3 service workers. Don't lower it.

AMO doesn't require permission justifications per-field like Chrome does; reviewers read the privacy policy and source code directly. Make sure the `addons.mozilla.org` listing's "Privacy Policy URL" points at `https://booklister.org/privacy.html`.

AMO also asks for a "support URL" — use `https://booklister.org/contact.html`.

---

## Microsoft Edge Add-ons notes

Edge accepts Chromium MV3 packages without modification. The form asks for similar permission justifications as Chrome but is less strict; you can typically paste the same text used for Chrome.

Edge does not require the `gecko` block, but its presence in the manifest is harmless.

---

## Screenshot list (you'll need to capture these)

Chrome requires at least 1 screenshot, recommends 3-5, at either 1280×800 or 640×400. Firefox and Edge accept similar sizes.

Recommended set (in submission order):

1. **Selection popup with a real BiblioCommons list loaded.** This is the most visually compelling shot and the one that demonstrates the multi-book workflow. Use a staff picks list with covers visible.
2. **Single-book capture in progress.** Toolbar icon visible in browser chrome, BiblioCommons book record page open behind it.
3. **Options page.** Shows preferred-branch and accumulate-mode toggles. Cleanly explains what the user can configure.
4. **The captured TSV pasted into Booklister's Quick Add Spreadsheet tab.** Closes the loop by showing what the user does with the captured data.
5. **(Optional) Right-click menu on a BiblioCommons page** showing "Capture for Booklister" highlighted in the contextual menu.

Use the same set across all three stores so the listing is visually consistent.

---

## Icon assets (you'll need to provide these)

The manifest currently points at `icons/icon-16.png`, `icons/icon-48.png`, and `icons/icon-128.png`. Create those three files and drop them into `extension/icons/`. They must be valid PNGs; SVGs are not accepted.

Chrome additionally needs a **440×280 promotional tile** for the store listing (separate from the in-extension icons). Firefox and Edge ask for similar tile sizes.

Design suggestion: lean on the Booklister favicon (blue book with three stacked covers and a red bar) so the extension visually pairs with the main tool. The promotional tile can have more space for the "Booklister Helper" wordmark.

---

## Submission order (suggested)

1. **Chrome Web Store** ($5 one-time developer fee, 1-3 day review). Once approved, copy the listing URL into the install bullets on `https://booklister.org/extension.html`.
2. **Firefox Add-ons** (free, often <24h review). Same package, no code changes.
3. **Microsoft Edge Add-ons** (free, 24-72h review). Same package.

After each store goes live, also update the `<a href>` on the install bullets in `extension.html` to point at the real store URLs and drop the "link coming soon" placeholder.

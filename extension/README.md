# Booklister Helper (browser extension)

A small browser extension that captures a book record from a BiblioCommons library catalog page and copies it as a tab-separated row, ready to paste into [Booklister](https://booklister.org)'s Quick Add → Spreadsheet tab.

**Supported sites**: BiblioCommons-powered library catalogs only (`*.bibliocommons.com`). This covers most North American public-library consortiums (MARINet, Sonoma County Library, San Mateo County, Pima County, etc.) but does not work with Aspen Discovery, Vega, Polaris LEAP, Encore, Sierra OPAC, or other non-BiblioCommons platforms.

**What it does**:

1. You're on a BiblioCommons book page (URL contains `/v2/record/`).
2. You click the Booklister Helper toolbar icon.
3. The extension reads the title, subtitle, author, and call number from the page (and from BiblioCommons' availability API for the per-branch breakdown).
4. The extension copies a single TSV row to your clipboard: `Title<TAB>Author<TAB>Call Number`.
5. You paste it into Booklister's Quick Add → Spreadsheet tab.

The icon flashes a green ✓ on success or a red badge if something went wrong.

## Install (development)

1. Clone the [Booklist-Maker repo](https://github.com/blubrd92/Booklist-Maker).
2. Open Chrome (or any Chromium-based browser like Edge or Brave) and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle at top right).
4. Click **Load unpacked** and select the `extension/` folder from the cloned repo.
5. The Booklister Helper icon appears in your toolbar.

For Firefox: go to `about:debugging` → **This Firefox** → **Load Temporary Add-on**, then pick the `manifest.json` file inside `extension/`.

## Configuration

Right-click the toolbar icon → **Options** (or visit `chrome://extensions` → Booklister Helper → **Extension options**).

There's one setting:

- **Preferred branch** (optional): a substring of your branch name as it appears in BiblioCommons' Availability table (or the branch code, like `SR`). When set, the extension picks that branch's call number when a book has multiple branches with different call numbers. Leave blank to use BiblioCommons' own "local branch" detection — which works automatically when you're signed in to your library account or browsing from your library's IP range.

## How the call number gets picked

When a book has multiple physical copies across branches with different call numbers (very common in consortium catalogs), the extension chooses one in this order:

1. If you set a **Preferred branch**, items whose branch name (or code) matches it.
2. Otherwise, items where BiblioCommons marks `local: true` (it figures this out from your login or IP).
3. Otherwise, all items.
4. Within the chosen subset, prefer items currently AVAILABLE over checked-out / on-hold ones.
5. Take the first remaining item's call number.

If the availability API can't be reached for any reason, the extension falls back to the first call number listed in the page's main metadata block.

## What it does NOT collect or transmit

The extension makes one network call: the same `/v2/libraries/{library}/bibs/{bib}/availability` request your library's catalog page itself makes when you click "Availability by location." That call goes to BiblioCommons' own gateway with your existing browser cookies; nothing is sent anywhere else, including to Booklister.

There is no analytics. No tracking. No data sent to any server I control. The TSV row goes from the page directly to your clipboard, in the browser, locally.

## Privacy posture

- `host_permissions` are limited to `*.bibliocommons.com` and `gateway.bibliocommons.com`. The extension cannot read any other site.
- The content script only runs on URLs matching `*://*.bibliocommons.com/v2/record/*` (BiblioCommons book record pages).
- The only `chrome.storage` key written is `preferredBranch` (your typed substring), in `sync` storage so it follows you across Chrome installs if you're signed into Chrome.
- No remote-loaded code. The extension ships as a fixed bundle of static JS files.

## Known limitations

- **BiblioCommons-only**, on purpose. Adding adapters for other catalog systems would be a separate extension or a separate adapter file.
- **Single-record capture only** for v1. Multi-select on a search results or list page is a planned v2.
- **Manual install**, no Chrome Web Store / Firefox Add-ons listing yet. Once the v1 stabilizes I'll publish it.
- **Brittle to BiblioCommons redesigns.** They run a single SaaS codebase, so this is rare in practice (~1-2 times a year), but selectors / API shapes may need a refresh occasionally.

## License

ISC, same as the parent Booklister project.

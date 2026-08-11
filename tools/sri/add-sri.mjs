// Subresource Integrity (SRI) stamper for the CDN tags in our HTML.
//
//   npm run sri          fetch each pinned CDN file, hash it, write the
//                        integrity attributes into the HTML
//   npm run sri -- --check   verify the committed hashes still match what
//                        the CDN serves; writes nothing, exits 1 on drift
//
// WHY: index.html loads four JS libraries and a stylesheet from cdnjs, and
// every content page loads the same stylesheet. Pinning a version (which we
// do) protects against the maintainer publishing a new release. It does NOT
// protect against the bytes at that exact URL changing, whether through a CDN
// compromise or an account takeover. jsPDF and html2canvas run with full DOM
// access over the user's booklist and uploaded images, so a swapped file
// would be able to read everything the user has in the tool. `integrity`
// closes that: the browser hashes what it received and refuses to execute a
// mismatch.
//
// GOOGLE FONTS IS DELIBERATELY EXCLUDED and must stay that way. The CSS at
// fonts.googleapis.com/css2 is generated per request: Google inspects the
// User-Agent and serves different @font-face blocks (woff2 vs woff, different
// unicode-range splits) to different browsers. There is no single correct
// hash, so an integrity attribute there would break fonts for whichever
// browsers didn't match the machine that generated the hash. This script
// skips those URLs on purpose and reports them as skipped, not as missed.
//
// Node builtins only, like extension/build-zips.mjs. Nothing here runs on
// install, in CI, or at page load. Re-run it after bumping any CDN version.

import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Hosts whose responses are byte-stable per URL, so a hash is meaningful.
const SRI_HOSTS = ['cdnjs.cloudflare.com'];
// Hosts that vary their response per request. Never stamp these.
const VARIABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/** Pull the src/href out of a single <script>/<link> tag. */
function tagUrl(tag) {
  const m = tag.match(/\s(?:src|href)\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null; // relative path (assets/...), not our business
  }
}

/**
 * Rewrite every SRI-eligible tag in `html` to carry the hash from `hashes`.
 *
 * Pure and exported so the rewrite can be unit-tested without a network:
 * the fetching is the only untestable part and it fails loudly.
 *
 * Idempotent. An existing integrity attribute is replaced rather than
 * duplicated, so re-running after a version bump updates the hash in place.
 *
 * @param {string} html
 * @param {Record<string,string>} hashes  url -> "sha384-<base64>"
 * @returns {{html: string, applied: string[], skipped: string[], missing: string[]}}
 */
export function applySri(html, hashes) {
  const applied = [];
  const skipped = [];
  const missing = [];

  const out = html.replace(/<(script|link)\b[^>]*>/gi, (tag) => {
    const url = tagUrl(tag);
    if (!url) return tag;

    const host = hostOf(url);
    if (!host) return tag;

    if (VARIABLE_HOSTS.includes(host)) {
      // preconnect/dns-prefetch hints have no body to hash either; both are
      // correctly ignored here.
      skipped.push(url);
      return tag;
    }
    if (!SRI_HOSTS.includes(host)) return tag;

    const hash = hashes[url];
    if (!hash) {
      missing.push(url);
      return tag;
    }

    // Drop any existing integrity/crossorigin so re-runs replace rather
    // than stack, then re-add both before the tag's closing bracket.
    let cleaned = tag
      .replace(/\s+integrity\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+crossorigin\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+crossorigin(?=[\s>])/gi, '');

    const selfClosing = /\/>$/.test(cleaned);
    const body = cleaned.replace(/\s*\/?>$/, '');
    applied.push(url);
    return `${body} integrity="${hash}" crossorigin="anonymous"${selfClosing ? ' />' : '>'}`;
  });

  return { html: out, applied, skipped, missing };
}

/** Every .html at the repo root, plus admin/index.html. */
async function htmlFiles() {
  const rootEntries = await readdir(ROOT, { withFileTypes: true });
  const files = rootEntries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => path.join(ROOT, e.name));
  files.push(path.join(ROOT, 'admin', 'index.html'));
  return files.sort();
}

function collectUrls(html) {
  const urls = new Set();
  for (const tag of html.match(/<(script|link)\b[^>]*>/gi) || []) {
    const url = tagUrl(tag);
    if (url && SRI_HOSTS.includes(hostOf(url))) urls.add(url);
  }
  return urls;
}

async function hashUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

async function main() {
  const check = process.argv.includes('--check');
  const files = await htmlFiles();

  const contents = new Map();
  const urls = new Set();
  for (const f of files) {
    const html = await readFile(f, 'utf8');
    contents.set(f, html);
    for (const u of collectUrls(html)) urls.add(u);
  }

  if (urls.size === 0) {
    console.log('No CDN resources found that need integrity hashes.');
    return;
  }

  console.log(`Hashing ${urls.size} CDN resource(s)...\n`);
  const hashes = {};
  for (const url of [...urls].sort()) {
    try {
      hashes[url] = await hashUrl(url);
      console.log(`  ok  ${hashes[url].slice(0, 24)}...  ${url}`);
    } catch (err) {
      console.error(`\nFailed to fetch ${url}\n  ${err.message}`);
      console.error('\nNo files were modified. Fix connectivity and re-run.');
      process.exit(1);
    }
  }

  let changed = 0;
  const skippedAll = new Set();
  for (const f of files) {
    const before = contents.get(f);
    const { html, applied, skipped, missing } = applySri(before, hashes);
    skipped.forEach((s) => skippedAll.add(hostOf(s)));
    if (missing.length) {
      console.error(`\nNo hash for: ${missing.join(', ')}`);
      process.exit(1);
    }
    if (html !== before) {
      changed++;
      const rel = path.relative(ROOT, f);
      if (check) {
        console.error(`\nDRIFT: ${rel} has integrity attributes that do not match the CDN.`);
      } else {
        await writeFile(f, html, 'utf8');
        console.log(`\n  updated ${rel} (${applied.length} tag${applied.length === 1 ? '' : 's'})`);
      }
    }
  }

  if (skippedAll.size) {
    console.log(`\nSkipped by design (response varies per request, no stable hash): ${[...skippedAll].join(', ')}`);
  }

  if (check) {
    if (changed) {
      console.error('\n--check failed: committed hashes are stale or missing.');
      process.exit(1);
    }
    console.log('\n--check passed: every committed hash matches the CDN.');
  } else {
    console.log(changed ? `\nDone. ${changed} file(s) updated.` : '\nDone. Already up to date.');
  }
}

// Only run when invoked directly, so the test can import applySri cleanly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Cache-busting stamper for the site's own CSS and JS.
//
//   npm run stamp            hash every local stylesheet/script the HTML
//                            pages load and write ?v=<hash> onto their tags
//   npm run stamp -- --check verify the committed tokens are current;
//                            writes nothing, exits 1 on drift
//
// WHY: the pages load assets/css/styles.css and friends at fixed URLs, so
// after a deploy a returning visitor's browser can pair the new HTML with a
// stale cached stylesheet or script. That once made a new disclosure's hint
// render at plain paragraph size until a hard refresh. A ?v= token that
// changes whenever the file does makes the browser fetch a fresh copy.
//
// The token is a hash of the file's contents, not a date, so it can be
// CHECKED: tests/asset-version.test.js recomputes every token and fails when
// one no longer matches its file. A date could only be remembered, and a
// forgotten bump is exactly the failure this exists to prevent. Per-file
// tokens also mean a change to styles.css does not force a re-download of
// app.js.
//
// firebase-init.js IS DELIBERATELY NEVER STAMPED. auth.js and
// library-config.js import it as './firebase-init.js'. ES modules are keyed
// by full URL, so a tag reading firebase-init.js?v=... would load it as a
// second module alongside the imported copy and initialize Firebase twice.
//
// Node builtins only, like tools/sri. Nothing here runs on install, in CI,
// or at page load. Run it after editing any stylesheet or script.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URLSearchParams } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Every HTML page that loads local assets, relative to the repo root. */
export const HTML_FILES = [
  'index.html',
  'about.html',
  'for-libraries.html',
  'extension.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'admin/index.html',
];

/** Repo-relative asset paths that must never carry a token (see header). */
export const UNVERSIONED = ['assets/js/firebase-init.js'];

/**
 * Short content hash used as the ?v= token. Line endings are normalized
 * first so a Windows checkout with autocrlf computes the same token as the
 * LF bytes the server actually deploys.
 * @param {Buffer|string} content
 * @returns {string} 10 hex characters
 */
export function assetHash(content) {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);
}

/** A same-origin relative .css/.js reference, with any existing query. */
function parseLocalAsset(url) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) return null; // absolute, protocol-relative, root
  const [file, query = ''] = url.split('?');
  if (!/\.(css|js)$/i.test(file)) return null;
  return { file, query };
}

/**
 * Rewrite every local <link>/<script> reference in `html` to carry the
 * token `versionFor` returns for it. Pure, so it is unit-tested without
 * touching disk; the caller resolves paths and hashes files.
 *
 * Idempotent: an existing ?v= is replaced, never appended to. A null token
 * means "must be bare", and strips any ?v= already there.
 *
 * @param {string} html
 * @param {(file: string) => string|null} versionFor  file as written in the tag
 * @returns {{html: string, stamped: string[], bare: string[]}}
 */
export function applyAssetVersions(html, versionFor) {
  const stamped = [];
  const bare = [];
  const out = html.replace(/<(script|link)\b[^>]*>/gi, (tag) => {
    return tag.replace(/(\s(?:src|href)\s*=\s*)(["'])([^"']+)\2/i, (whole, pre, quote, url) => {
      const asset = parseLocalAsset(url);
      if (!asset) return whole;
      const params = new URLSearchParams(asset.query);
      params.delete('v');
      const version = versionFor(asset.file);
      if (version) {
        params.set('v', version);
        stamped.push(asset.file);
      } else {
        bare.push(asset.file);
      }
      const query = params.toString();
      return pre + quote + asset.file + (query ? '?' + query : '') + quote;
    });
  });
  return { html: out, stamped, bare };
}

/**
 * Stamp one HTML file's contents using the real files on disk.
 * @param {string} htmlRel  repo-relative path of the page
 * @param {string} html     its current contents
 * @returns {Promise<{html: string, stamped: string[], bare: string[], missing: string[]}>}
 */
export async function stampHtml(htmlRel, html, root = ROOT) {
  const dir = path.posix.dirname(htmlRel);
  const refs = [];
  applyAssetVersions(html, (file) => { refs.push(file); return null; });

  const tokens = new Map();
  const missing = [];
  for (const file of refs) {
    const repoRel = path.posix.normalize(path.posix.join(dir, file));
    if (UNVERSIONED.includes(repoRel)) { tokens.set(file, null); continue; }
    try {
      tokens.set(file, assetHash(await readFile(path.join(root, repoRel))));
    } catch {
      missing.push(repoRel);
      tokens.set(file, null);
    }
  }
  return { ...applyAssetVersions(html, (file) => tokens.get(file)), missing };
}

async function main() {
  const check = process.argv.includes('--check');
  let drift = 0;
  let missingTotal = 0;
  for (const rel of HTML_FILES) {
    const before = await readFile(path.join(ROOT, rel), 'utf8');
    const { html, stamped, missing } = await stampHtml(rel, before);
    missing.forEach((m) => { console.error(`  ${rel}: references ${m}, which does not exist`); });
    missingTotal += missing.length;
    if (html === before) {
      console.log(`  ${rel}: current (${stamped.length} stamped)`);
      continue;
    }
    drift++;
    if (check) {
      console.log(`  ${rel}: STALE`);
    } else {
      await writeFile(path.join(ROOT, rel), html);
      console.log(`  ${rel}: updated (${stamped.length} stamped)`);
    }
  }
  if (missingTotal) process.exitCode = 1;
  if (check && drift) {
    console.error(`\n${drift} page(s) carry stale ?v= tokens. Run: npm run stamp`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

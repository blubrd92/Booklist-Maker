import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyAssetVersions, assetHash, stampHtml, HTML_FILES, UNVERSIONED,
} from '../tools/asset-version/stamp.mjs';

describe('applyAssetVersions', () => {
  const v = () => 'abc123';

  it('stamps local stylesheets and scripts', () => {
    const html = '<link rel="stylesheet" href="assets/css/styles.css"/><script src="assets/js/app.js"></script>';
    expect(applyAssetVersions(html, v).html).toBe(
      '<link rel="stylesheet" href="assets/css/styles.css?v=abc123"/><script src="assets/js/app.js?v=abc123"></script>'
    );
  });

  it('replaces an existing token instead of appending a second one', () => {
    const html = '<script src="assets/js/app.js?v=2026-09-22"></script>';
    expect(applyAssetVersions(html, v).html).toBe('<script src="assets/js/app.js?v=abc123"></script>');
  });

  it('strips the token when the file must stay bare', () => {
    const html = '<script type="module" src="assets/js/firebase-init.js?v=old"></script>';
    const out = applyAssetVersions(html, () => null);
    expect(out.html).toBe('<script type="module" src="assets/js/firebase-init.js"></script>');
    expect(out.bare).toEqual(['assets/js/firebase-init.js']);
  });

  it('leaves CDN, protocol-relative, root-relative and non-asset URLs alone', () => {
    const html = [
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/x/1.0/x.min.js"></script>',
      '<link href="//fonts.googleapis.com/css2?family=Inter" rel="stylesheet">',
      '<script src="/abs/app.js"></script>',
      '<link rel="canonical" href="https://booklister.org/">',
      '<link rel="icon" href="favicon.png">',
    ].join('');
    expect(applyAssetVersions(html, v).html).toBe(html);
  });

  it('keeps other query parameters', () => {
    expect(applyAssetVersions('<script src="a.js?x=1&v=old"></script>', v).html)
      .toBe('<script src="a.js?x=1&v=abc123"></script>');
  });
});

describe('assetHash', () => {
  it('is 10 hex characters and ignores CRLF vs LF', () => {
    expect(assetHash('a\nb')).toMatch(/^[0-9a-f]{10}$/);
    expect(assetHash('a\r\nb')).toBe(assetHash('a\nb'));
  });

  it('changes when the content changes', () => {
    expect(assetHash('body{color:red}')).not.toBe(assetHash('body{color:blue}'));
  });
});

// The safety net: every page's committed ?v= tokens must match the files
// they point at right now. Editing a stylesheet or script without running
// `npm run stamp` fails here, which is what stops a returning visitor from
// getting new markup with a stale cached asset.
describe('committed cache-busting tokens', () => {
  const root = resolve(__dirname, '..');

  it.each(HTML_FILES)('%s is stamped and current (run `npm run stamp` if this fails)', async (rel) => {
    const html = readFileSync(resolve(root, rel), 'utf8');
    const { html: expected, missing } = await stampHtml(rel, html, root);
    expect(missing).toEqual([]);
    expect(html).toBe(expected);
  });

  it('never versions a module another module imports by its bare name', () => {
    const index = readFileSync(resolve(root, 'index.html'), 'utf8');
    UNVERSIONED.forEach((file) => {
      expect(index).toContain(`src="${file}"`);
      expect(index).not.toContain(`${file}?`);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { applySri } from '../tools/sri/add-sri.mjs';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js';
const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
const HASHES = {
  [CDN]: 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  [FA]: 'sha384-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
};

describe('applySri', () => {
  it('stamps a script tag with integrity and crossorigin', () => {
    const { html, applied } = applySri(`<script src="${CDN}"></script>`, HASHES);
    expect(html).toBe(
      `<script src="${CDN}" integrity="${HASHES[CDN]}" crossorigin="anonymous"></script>`
    );
    expect(applied).toEqual([CDN]);
  });

  it('stamps a stylesheet link tag', () => {
    const { html } = applySri(`<link rel="stylesheet" href="${FA}">`, HASHES);
    expect(html).toContain(`integrity="${HASHES[FA]}"`);
    expect(html).toContain('crossorigin="anonymous"');
  });

  it('preserves a self-closing slash', () => {
    const { html } = applySri(`<link rel="stylesheet" href="${FA}" />`, HASHES);
    expect(html.endsWith('/>')).toBe(true);
    expect(html).toContain(`integrity="${HASHES[FA]}"`);
  });

  it('is idempotent: a second pass produces identical output', () => {
    const once = applySri(`<script src="${CDN}"></script>`, HASHES).html;
    const twice = applySri(once, HASHES).html;
    expect(twice).toBe(once);
    expect((twice.match(/integrity=/g) || []).length).toBe(1);
  });

  it('replaces a stale hash rather than appending a second one', () => {
    const stale = `<script src="${CDN}" integrity="sha384-OLDOLDOLD" crossorigin="anonymous"></script>`;
    const { html } = applySri(stale, HASHES);
    expect(html).toContain(HASHES[CDN]);
    expect(html).not.toContain('OLDOLDOLD');
    expect((html.match(/crossorigin=/g) || []).length).toBe(1);
  });

  it('never stamps Google Fonts, whose CSS varies by User-Agent', () => {
    const gf = '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">';
    const { html, skipped, applied } = applySri(gf, HASHES);
    expect(html).toBe(gf);
    expect(applied).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it('leaves same-origin assets untouched', () => {
    const local = '<script src="assets/js/app.js"></script>';
    expect(applySri(local, HASHES).html).toBe(local);
  });

  it('reports a CDN url it has no hash for instead of silently skipping', () => {
    const other = '<script src="https://cdnjs.cloudflare.com/ajax/libs/thing/1.0.0/t.js"></script>';
    const { missing, html } = applySri(other, HASHES);
    expect(missing).toHaveLength(1);
    expect(html).toBe(other);
  });

  it('handles attributes in any order', () => {
    const { html } = applySri(`<script defer src="${CDN}" data-x="1"></script>`, HASHES);
    expect(html).toContain('defer');
    expect(html).toContain('data-x="1"');
    expect(html).toContain(`integrity="${HASHES[CDN]}"`);
  });
});

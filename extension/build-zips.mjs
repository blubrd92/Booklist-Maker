#!/usr/bin/env node
/**
 * Build per-browser ZIPs of the extension for store upload.
 *
 * Why two ZIPs:
 * - Firefox AMO requires background.scripts to be paired with
 *   background.service_worker for any MV3 extension. Without scripts,
 *   AMO rejects the upload.
 * - Microsoft Edge's MV3 validator rejects background.scripts outright
 *   ("The background.scripts field cannot be used with manifest
 *   version 3"). Without service_worker alone, Edge rejects the upload.
 *
 * The Chromium and Edge stores agree on service_worker alone; only
 * Firefox needs scripts. So we ship two ZIPs:
 *   booklister-helper-<version>-firefox.zip   (manifest.json keeps both)
 *   booklister-helper-<version>-chromium.zip  (background.scripts stripped)
 *
 * Chrome accepts either form, but uploading the chromium zip there keeps
 * the codebase Chrome and Edge see identical.
 *
 * Run with: npm run package:extension
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EXTENSION_DIR, '..');
const DIST_DIR = resolve(REPO_ROOT, 'dist');
const BUILD_DIR = resolve(REPO_ROOT, 'dist', '.build');

const manifestPath = resolve(EXTENSION_DIR, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`manifest.json not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version;
if (!version) {
  console.error('manifest.json has no version');
  process.exit(1);
}

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });
mkdirSync(BUILD_DIR, { recursive: true });

function buildVariant(label, transform) {
  const variantDir = resolve(BUILD_DIR, label);
  cpSync(EXTENSION_DIR, variantDir, {
    recursive: true,
    filter: (src) => !src.includes('build-zips.mjs') && !src.endsWith('.md'),
  });

  const variantManifestPath = resolve(variantDir, 'manifest.json');
  const variantManifest = JSON.parse(readFileSync(variantManifestPath, 'utf8'));
  transform(variantManifest);
  writeFileSync(variantManifestPath, JSON.stringify(variantManifest, null, 2) + '\n');

  const zipName = `booklister-helper-${version}-${label}.zip`;
  const zipPath = resolve(DIST_DIR, zipName);
  execSync(`zip -r -X "${zipPath}" .`, { cwd: variantDir, stdio: 'pipe' });
  return zipName;
}

const firefoxZip = buildVariant('firefox', () => {
  // Firefox needs both background keys; leave the manifest as-is.
});

const chromiumZip = buildVariant('chromium', (m) => {
  // Edge rejects background.scripts in MV3; strip it. Chrome accepts
  // either form, so we upload the same chromium zip to both stores.
  if (m.background && Array.isArray(m.background.scripts)) {
    delete m.background.scripts;
  }
});

rmSync(BUILD_DIR, { recursive: true, force: true });

console.log(`Built version ${version}:`);
console.log(`  Firefox (AMO):       dist/${firefoxZip}`);
console.log(`  Chrome + Edge:       dist/${chromiumZip}`);

#!/usr/bin/env node
/**
 * Render the Booklister promo video: a one-minute tour of the tool,
 * narrated by Folio, to dist/promo-video/booklister-tour.mp4.
 *
 * Run with:
 *   npm install --no-save playwright-core sortablejs@1.15.0 jspdf@2.5.1 \
 *     html2canvas@1.4.1 qrcodejs@1.0.0 @fortawesome/fontawesome-free@6.4.0
 *   FFMPEG=/path/to/ffmpeg node tools/promo-video/build.mjs
 *
 * Options:
 *   --stills 3.2,18,41.5   write PNG stills at those times and stop
 *   --audio-only           write soundtrack.wav (and cues.json) and stop
 *   --capture-only         film the real app into dist/promo-video/capture/ and stop
 *   --reuse-capture        skip filming and use the last capture
 *   --no-audio             skip the soundtrack
 *
 * NOTHING ON THE SITE NEEDS THIS. Like tools/og-image it is an on-demand
 * utility, kept out of package.json so a clean checkout never pays for
 * it. It needs the npm packages above (installed --no-save; all but
 * playwright-core are the app's own CDN libraries, at the versions
 * index.html pins), a Chromium binary, an ffmpeg built with libx264 and
 * aac (the one Playwright bundles is VP8-only), and the network once, to
 * fetch fonts.
 *
 * How it works, in three passes:
 * 1. Film. capture.mjs drives the real tool (index.html from this
 *    checkout) through the story with real clicks and keystrokes and
 *    saves a screenshot after each change, plus the position of every
 *    control it used. Every screen of the app in the video is one of
 *    these; none is redrawn.
 * 2. Compose. scene.html plays that footage in a window beside Folio,
 *    with a camera, a cursor and callouts placed from the recorded
 *    positions. window.renderAt(t) draws the frame at time t with no CSS
 *    animation anywhere, so every frame is deterministic.
 * 3. Render. This script steps t at 30 fps, screenshots each frame and
 *    pipes the JPEGs into ffmpeg. The page also reports its own cue
 *    sheet (every syllable Folio "says", every click, pop and whoosh),
 *    which audio.mjs turns into the soundtrack, so picture and sound
 *    come from one timeline and cannot drift apart.
 *
 * The books are invented and the cover art is abstract, on purpose, for
 * the same reason as the share card: no fabricated jackets for real
 * titles.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderAudio } from './audio.mjs';
import { captureApp } from './capture.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'dist', 'promo-video');
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2'
  + '?family=Caveat:wght@500;600;700'
  + '&family=Inter:wght@400;500;600;700;800'
  + '&family=EB+Garamond:ital,wght@0,500;1,400;1,500'
  + '&family=Playfair+Display:ital,wght@0,700;0,900;1,700'
  + '&family=Lora:ital,wght@0,600;0,700;1,400;1,700'
  + '&family=Bebas+Neue&family=Pacifico&family=Abril+Fatface'
  + '&family=Fredoka:wght@500;600&family=Josefin+Sans:wght@600;700'
  + '&family=Oswald:wght@500;600&family=Cinzel:wght@600;700'
  + '&family=Special+Elite&family=Libre+Baskerville:wght@700'
  + '&display=block';
const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function curl(url, binary) {
  // curl rather than fetch: it honours HTTPS_PROXY without extra wiring.
  const out = execFileSync('curl', ['-sSfL', '-A', CHROME_UA, url], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return binary ? out : out.toString('utf8');
}

// Google Fonts CSS with every latin woff2 inlined as a data URL, cached
// in dist/ so re-renders don't refetch. Other subsets are dropped: the
// script is English and they would only bloat the page.
function fontFaces() {
  const cache = join(OUT_DIR, 'fonts.css');
  if (existsSync(cache)) return readFileSync(cache, 'utf8');
  const css = curl(FONT_CSS_URL, false);
  const blocks = css.split(/(?=\/\* [a-z-]+ \*\/)/);
  const latin = blocks.filter((b) => b.startsWith('/* latin */'));
  const inlined = latin.map((b) => b.replace(/url\((https:[^)]+)\)/g, (_, url) => {
    const b64 = curl(url, true).toString('base64');
    return `url(data:font/woff2;base64,${b64})`;
  })).join('\n');
  writeFileSync(cache, inlined);
  return inlined;
}

// The tool's default fonts are Calibri (authors, descriptions, the QR
// blurb) and Georgia (titles). They ship with Windows, Office and macOS,
// not with Linux, where the browser falls back to wider faces and the
// filmed pages stop matching what most people see: text runs longer and
// spills out of its boxes. Carlito and Gelasio are free fonts drawn to
// the same letter widths, so the capture registers them under the
// original names. Only the filmed page gets them; the site is untouched.
function systemFontStandIns() {
  const cache = join(OUT_DIR, 'fonts-standins.css');
  if (existsSync(cache)) return readFileSync(cache, 'utf8');
  const out = [];
  for (const [family, as] of [['Carlito', 'Calibri'], ['Gelasio', 'Georgia']]) {
    const css = curl(`https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,400;0,700;1,400;1,700&display=block`, false);
    css.split(/(?=\/\* [a-z-]+ \*\/)/).filter((b) => b.startsWith('/* latin */')).forEach((b) => {
      out.push(b.replace(/font-family: '[^']+'/, `font-family: '${as}'`)
        .replace(/url\((https:[^)]+)\)/g, (_, url) => `url(data:font/woff2;base64,${curl(url, true).toString('base64')})`));
    });
  }
  const css = out.join('\n');
  writeFileSync(cache, css);
  return css;
}

function findFfmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
  for (const bin of candidates) {
    try {
      const enc = execFileSync(bin, ['-hide_banner', '-encoders'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      if (enc.includes('libx264')) return bin;
    } catch { /* try the next one */ }
  }
  console.error('\nNo ffmpeg with libx264 found. Set FFMPEG to one, for example:\n'
    + '  pip install imageio-ffmpeg\n'
    + '  FFMPEG=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())") node tools/promo-video/build.mjs\n');
  process.exit(1);
}

async function launch() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('\nplaywright-core is not installed. Run:\n  npm install --no-save playwright-core\n');
    process.exit(1);
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM
    || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return chromium.launch({ executablePath });
}

async function main() {
  const args = process.argv.slice(2);
  const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
  const withAudio = !args.includes('--no-audio');
  const audioOnly = args.includes('--audio-only');
  const captureOnly = args.includes('--capture-only');
  const reuseCapture = args.includes('--reuse-capture');
  const CAP_DIR = join(OUT_DIR, 'capture');
  mkdirSync(CAP_DIR, { recursive: true });

  const template = readFileSync(join(TOOL_DIR, 'scene.html'), 'utf8')
    .replace('/*__FONT_FACES__*/', () => fontFaces());
  // The scene page is written into the capture folder so it can load the
  // shots by relative path.
  const built = join(CAP_DIR, 'scene.built.html');
  const browser = await launch();

  // 1. Film the real app, using covers drawn by the scene's own art.
  let manifest;
  const manifestFile = join(CAP_DIR, 'shots.json');
  if (reuseCapture && existsSync(manifestFile)) {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } else {
    writeFileSync(built, template.replace('/*__SHOTS__*/', 'window.SHOTS = null;'));
    const prep = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    prep.on('pageerror', (e) => console.error('page error:', e.message));
    await prep.goto(pathToFileURL(built).href);
    await prep.waitForFunction(() => window.sceneReady === true, null, { timeout: 30000 });
    const data = await prep.evaluate(() => window.getCastData());
    const covers = [];
    for (let i = 0; i < data.books.length; i++) {
      await prep.evaluate((n) => window.showCoverForCapture(n), i);
      covers.push(await prep.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 600, height: 900 } }));
    }
    await prep.evaluate(() => window.showLogoForCapture());
    const logo = await prep.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1500, height: 450 } });
    await prep.close();
    console.log('filming the real app...');
    manifest = await captureApp(browser, {
      root: REPO_ROOT, outDir: CAP_DIR, books: data.books, covers, logo, search: data.search, pasted: data.pasted,
      fontCss: systemFontStandIns(),
      log: (m) => console.log(m),
    });
  }
  if (captureOnly) { await browser.close(); return; }
  writeFileSync(built, template.replace('/*__SHOTS__*/', () => `window.SHOTS = ${JSON.stringify(manifest)};`));

  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(pathToFileURL(built).href);
  await page.waitForFunction(() => window.sceneReady === true, null, { timeout: 60000 });
  const duration = await page.evaluate(() => window.SCENE_DURATION);

  if (stillsArg) {
    for (const s of stillsArg.split(',').map(Number)) {
      await page.evaluate((t) => window.renderAt(t), s);
      const file = join(OUT_DIR, `still-${s.toFixed(2)}.png`);
      await page.screenshot({ path: file, type: 'png' });
      console.log('wrote', file);
    }
    await browser.close();
    return;
  }

  const cues = await page.evaluate(() => window.getCues());
  writeFileSync(join(OUT_DIR, 'cues.json'), JSON.stringify(cues, null, 1));
  const wav = join(OUT_DIR, 'soundtrack.wav');
  if (withAudio) {
    console.log('synthesizing soundtrack...');
    writeFileSync(wav, renderAudio(cues));
  }
  if (audioOnly) {
    await browser.close();
    console.log('wrote', wav);
    return;
  }

  const ffmpeg = findFfmpeg();
  const out = join(OUT_DIR, 'booklister-tour.mp4');
  const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
  if (withAudio) ffArgs.push('-i', wav);
  ffArgs.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-movflags', '+faststart');
  if (withAudio) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  ffArgs.push(out);
  const ff = spawn(ffmpeg, ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg exited ' + code)))));

  const frames = Math.round(duration * FPS);
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 150 === 0) {
      const secs = (Date.now() - started) / 1000;
      console.log(`frame ${f}/${frames}  (${secs.toFixed(0)}s elapsed)`);
    }
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log('wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

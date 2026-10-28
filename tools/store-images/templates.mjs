/**
 * Data and page designs for tools/store-images/build.mjs.
 *
 * Edit this file to change the images: the titles on the sample list,
 * the abstract cover art, the captions, and the layout of each image.
 * build.mjs only captures the real UI and renders what is defined here.
 *
 * Everything shown is invented on purpose, the same rule as
 * tools/og-image: no fabricated jacket art for real books, and the
 * catalog page is an unbranded "Your Library" mock rather than an
 * imitation of any vendor's design. The images also never name
 * BiblioCommons (owner's call); the store descriptions do, so a library
 * on another catalog system knows before installing that it won't work.
 */

/* [title, subtitle, author as catalogued, call number]. Twenty, because
   a curated list page is usually longer than a booklist; the screenshots
   show the popup picking the first 13. */
export const BOOKS = [
  ['The Salt Harvest', '', 'Delacroix, Mira', 'FIC DELACROIX'],
  ['Nightjar', '', 'Petrakis, Owen', 'FIC PETRAKIS'],
  ['The Cartographer of Ash', '', 'Lindqvist, Beatriz', 'FIC LINDQVIST'],
  ['Small Hours', 'Stories', 'Nwosu, Ada', 'FIC NWOSU'],
  ['The Weight of Bees', 'A Beekeeper\'s Decade', 'Halloran, Tomas', '638.1 HALLORAN'],
  ['Riverwork', '', 'Achebe, Simone', 'FIC ACHEBE'],
  ['A Field Guide to Leaving', '', 'Okonkwo, Ruth', '910.4 OKONKWO'],
  ['The Lantern Rooms', '', 'Bergstrom, Yusuf', 'FIC BERGSTROM'],
  ['Understory', 'Listening Beneath the Forest', 'Mbeki, Clara', '577.3 MBEKI'],
  ['The Quiet Machinery', '', 'Reyes, Anton', 'FIC REYES'],
  ['Winter Count', '', 'Lindgren, Hana', 'FIC LINDGREN'],
  ['The Borrowed Coast', '', 'Aturu, Femi', 'FIC ATURU'],
  ['Paper Lanterns', '', 'Castellanos, Inés', 'FIC CASTELLANOS'],
  ['What the Orchard Knew', '', 'Feld, Miriam', 'FIC FELD'],
  ['Night Ferry', '', 'Sato, Kenji', 'MYS SATO'],
  ['The Long Table', 'Recipes from a Shared Kitchen', 'Haddad, Leila', '641.59 HADDAD'],
  ['Glass Season', '', 'Moreau, Julien', 'FIC MOREAU'],
  ['Rootbound', '', 'Okafor, Chidi', 'FIC OKAFOR'],
  ['The Archivist\'s Daughter', '', 'Whitcombe, Elena', 'FIC WHITCOMBE'],
  ['Small Weathers', '', 'Tanaka, Rei', '811.6 TANAKA'],
];

/* "Last, First" -> "First Last", the way the catalog page displays it. */
export const displayName = (a) => {
  const p = a.split(',');
  return p.length === 2 ? `${p[1].trim()} ${p[0].trim()}` : a;
};

/* Muted, print-like cover palette, one per title: [bg, dark, ink]. */
export const PALETTE = [
  ['#3f4d8a', '#2b3663', '#e7eaf7'], ['#8c5a3c', '#6a4029', '#f6e7d8'],
  ['#3f6b63', '#2b4c46', '#dcefe9'], ['#7a3f4e', '#5b2c38', '#f7dfe4'],
  ['#c49a3c', '#8f6e24', '#fbf3df'], ['#6d6a3f', '#4e4c2c', '#f0eeda'],
  ['#37474f', '#25323a', '#dde4e8'], ['#b4654a', '#874632', '#fbe9e1'],
  ['#4a5b8f', '#34436d', '#e4e8f5'], ['#5f4470', '#442e51', '#ece2f2'],
  ['#356070', '#234550', '#dbecf3'], ['#8a4a3c', '#673529', '#f7e2da'],
  ['#2f5d50', '#1f4037', '#e0f0ea'], ['#a85d6e', '#7d4250', '#fbe6eb'],
  ['#2c3e66', '#1c2a49', '#dfe6f5'], ['#9a7b4f', '#735a36', '#f6eddf'],
  ['#5b7c99', '#405b73', '#e6eef5'], ['#6b4d3a', '#4d3627', '#f3e6dc'],
  ['#4f5d75', '#38435a', '#e5e9f0'], ['#7c8b5a', '#5b673f', '#eef2e1'],
];

/* Runs in the browser (passed to page.evaluate): abstract cover art at a
   0.68 aspect, five motifs, no text. Returns JPEG data URLs. */
export function drawCovers(palette) {
  return palette.map(([bg, dark, ink], i) => {
    const c = document.createElement('canvas');
    c.width = 540; c.height = 800;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 540, 800);
    const style = i % 5;
    if (style === 0) {
      x.fillStyle = ink; x.fillRect(80, 120, 380, 28); x.fillRect(80, 176, 250, 28);
      x.globalAlpha = 0.9; x.fillStyle = dark;
      x.beginPath(); x.arc(270, 470, 150, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1; x.fillStyle = ink; x.fillRect(80, 690, 176, 16);
    } else if (style === 1) {
      x.strokeStyle = ink; x.lineWidth = 7; x.strokeRect(84, 150, 372, 300);
      x.fillStyle = ink; x.fillRect(84, 540, 300, 30);
      x.fillStyle = dark; x.fillRect(84, 606, 168, 20);
    } else if (style === 2) {
      x.fillStyle = dark; x.fillRect(0, 300, 540, 72);
      x.fillStyle = ink; x.fillRect(80, 470, 200, 18);
      x.fillRect(80, 524, 372, 30); x.fillRect(80, 578, 230, 26);
    } else if (style === 3) {
      for (let k = 0; k < 6; k++) {
        x.fillStyle = k % 2 ? dark : ink; x.globalAlpha = k % 2 ? 1 : 0.22;
        x.beginPath(); x.moveTo(0, 520 + k * 46);
        x.quadraticCurveTo(270, 430 + k * 46, 540, 520 + k * 46);
        x.lineTo(540, 800); x.lineTo(0, 800); x.fill();
      }
      x.globalAlpha = 1; x.fillStyle = ink;
      x.fillRect(80, 110, 330, 30); x.fillRect(80, 166, 210, 22);
    } else {
      x.fillStyle = dark; x.fillRect(60, 60, 420, 680);
      x.fillStyle = bg; x.fillRect(84, 84, 372, 632);
      x.fillStyle = ink; x.fillRect(130, 300, 280, 26); x.fillRect(170, 350, 200, 20);
      x.fillStyle = dark; x.fillRect(240, 230, 60, 6); x.fillRect(240, 420, 60, 6);
    }
    // a little lighting at the spine so they read as objects, not swatches
    const g = x.createLinearGradient(0, 0, 540, 0);
    g.addColorStop(0, 'rgba(0,0,0,.18)'); g.addColorStop(0.06, 'rgba(255,255,255,.10)');
    g.addColorStop(0.12, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.06)');
    x.fillStyle = g; x.fillRect(0, 0, 540, 800);
    return c.toDataURL('image/jpeg', 0.9);
  });
}

/**
 * The store images, keyed by output filename. Each is { w, h, html },
 * rendered at exactly w x h CSS pixels.
 *
 * Sizes (checked against each store's docs, October 2026):
 *   440x280    Chrome small promo tile (required); Edge small tile (optional)
 *   1400x560   Chrome marquee (needed to be featured); Edge large tile
 *   1280x800   screenshots, accepted by Chrome, Edge (max 6) and Firefox
 * Firefox has no promo tile slots.
 *
 * `shots` holds data URLs of the real UI captured by build.mjs.
 */
export function storeImages({ shots, covers, fonts, iconSvg }) {
  const icon = (size) => iconSvg.replace('<svg ', `<svg width="${size}" height="${size}" `);

  /* The og card's slate + indigo glow, so the store and the site match. */
  const BASE_CSS = `
${fonts}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
.bg { position: absolute; inset: 0; overflow: hidden;
  background:
    radial-gradient(110% 140% at 80% 40%, rgba(92,107,192,.34) 0%, rgba(92,107,192,0) 60%),
    radial-gradient(80% 110% at 6% 4%, rgba(120,144,156,.18) 0%, rgba(120,144,156,0) 60%),
    linear-gradient(158deg, #2c3a41 0%, #222d33 45%, #182025 100%); }
.rules { position: absolute; inset: 0;
  background-image: repeating-linear-gradient(to bottom, rgba(255,255,255,.03) 0 1px, rgba(255,255,255,0) 1px 40px);
  mask-image: linear-gradient(to bottom, transparent 0, #000 15%, #000 85%, transparent 100%); }
em { font-style: italic; color: #b3bcf0; }
`;
  const BG = '<div class="bg"><div class="rules"></div></div>';

  /* A generic browser window: no Chrome / Firefox / Edge branding, since
     the same screenshots go to all three stores. */
  const BROWSER_CSS = `
.win { position: absolute; background: #fff; border-radius: 12px 12px 0 0; overflow: hidden;
  box-shadow: 0 40px 90px -20px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.08); }
.chrome { height: 46px; background: #eef0f3; border-bottom: 1px solid #d9dde3;
  display: flex; align-items: center; gap: 14px; padding: 0 16px; }
.dots { display: flex; gap: 7px; }
.dots i { width: 11px; height: 11px; border-radius: 50%; background: #cfd4db; display: block; }
.url { flex: 1; height: 30px; border-radius: 15px; background: #fff; border: 1px solid #dde1e7;
  display: flex; align-items: center; padding: 0 14px; gap: 8px; font-size: 13.5px; color: #5b6472; }
.url b { color: #1f2630; font-weight: 500; }
.lock { width: 10px; height: 12px; border: 1.6px solid #8a93a0; border-radius: 2px; position: relative; top: 2px; }
.ext { position: relative; width: 32px; height: 32px; border-radius: 7px; display: grid; place-items: center; }
.ext.on { background: #dfe3f6; }
.ext .badge { position: absolute; right: -5px; bottom: -3px; background: #5c6bc0; color: #fff;
  font-size: 10.5px; font-weight: 700; border-radius: 8px; padding: 1px 5px; border: 1.5px solid #eef0f3; }
.page { position: absolute; top: 46px; left: 0; right: 0; bottom: 0; overflow: hidden; }
.popup { position: absolute; background: #fff; border-radius: 10px; overflow: hidden;
  box-shadow: 0 24px 60px -10px rgba(15,23,42,.45), 0 4px 14px rgba(15,23,42,.18), 0 0 0 1px rgba(15,23,42,.08); }
.popup img { display: block; width: 100%; }
`;
  const toolbar = (url, { badge, on } = {}) => `
  <div class="chrome">
    <div class="dots"><i></i><i></i><i></i></div>
    <div class="url"><span class="lock"></span><span>${url}</span></div>
    <div class="ext ${on ? 'on' : ''}">${icon(22)}${badge ? `<span class="badge">${badge}</span>` : ''}</div>
  </div>`;

  /* A generic, unbranded library catalog. */
  const CAT_CSS = `
.cat { color: #24303b; background: #f6f7f8; height: 100%; }
.cat-top { background: #1f4e5f; color: #fff; display: flex; align-items: center; gap: 22px; padding: 0 34px; height: 64px; }
.cat-logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; letter-spacing: -.01em; }
.cat-logo span { width: 26px; height: 26px; border-radius: 6px; background: #f2b84b; display: block; }
.cat-search { flex: 1; max-width: 460px; height: 36px; border-radius: 6px; background: #fff; color: #7b8590;
  display: flex; align-items: center; padding: 0 14px; font-size: 14px; }
.cat-nav { margin-left: auto; display: flex; gap: 22px; font-size: 14px; color: #d6e6ec; }
.cat-body { padding: 26px 34px; }
.crumb { font-size: 13px; color: #6b7682; margin-bottom: 8px; }
.cat h2 { font-size: 28px; font-weight: 700; letter-spacing: -.015em; margin-bottom: 4px; }
.meta { font-size: 14px; color: #6b7682; margin-bottom: 18px; }
.items { display: flex; flex-direction: column; gap: 10px; }
.item { display: flex; gap: 18px; background: #fff; border: 1px solid #e3e6ea; border-radius: 8px; padding: 14px 16px; align-items: flex-start; }
.item img { width: 62px; height: 92px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.item .t { font-weight: 600; font-size: 16px; color: #1f4e5f; }
.item .a { font-size: 14px; color: #4b5560; margin-top: 2px; }
.f { font-size: 13px; color: #6b7682; margin-top: 6px; }
.pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 10px; margin-top: 8px; }
.pill.ok { background: #e3f3e8; color: #22663a; }
.pill.out { background: #fbefe0; color: #8a5414; }
.rec { display: flex; gap: 34px; }
.rec img { width: 220px; height: 326px; object-fit: cover; border-radius: 4px; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
.rec h2 { font-size: 34px; }
.rec .by { font-size: 17px; color: #1f4e5f; font-weight: 500; margin-bottom: 14px; }
.rec .f { font-size: 14px; }
.rec p { font-size: 15px; line-height: 1.6; color: #3c4650; max-width: 520px; margin-top: 16px; }
.hold { display: inline-block; margin-top: 18px; background: #1f4e5f; color: #fff; font-weight: 600; font-size: 14px; padding: 10px 22px; border-radius: 6px; }
`;
  const catTop = `<div class="cat-top"><div class="cat-logo"><span></span>Your Library</div>
  <div class="cat-search">Search the catalog</div>
  <div class="cat-nav"><span>Catalog</span><span>Lists</span><span>Events</span><span>My Account</span></div></div>`;
  const avail = (i) => (i % 4 === 2
    ? '<span class="pill out">All copies in use</span>'
    : '<span class="pill ok">Available</span>');
  const listPage = `<div class="cat">${catTop}<div class="cat-body">
  <div class="crumb">Lists &rsaquo; Staff Picks</div>
  <h2>Fall Fiction: Staff Picks</h2>
  <div class="meta">A list by Central Library staff &middot; ${BOOKS.length} titles</div>
  <div class="items">${BOOKS.slice(0, 6).map(([t, s, a, c], i) => `
    <div class="item"><img src="${covers[i]}"><div>
      <div class="t">${s ? `${t}: ${s}` : t}</div><div class="a">${displayName(a)}</div>
      <div class="f">Book &middot; ${c}</div>${avail(i)}</div></div>`).join('')}</div></div></div>`;
  const recordPage = `<div class="cat">${catTop}<div class="cat-body">
  <div class="crumb">Search results &rsaquo; ${BOOKS[1][0]}</div>
  <div class="rec"><img src="${covers[1]}"><div>
    <h2>${BOOKS[1][0]}</h2><div class="by">${displayName(BOOKS[1][2])}</div>
    <div class="f">Book &middot; 2025 &middot; ${BOOKS[1][3]}</div>
    ${avail(0)}
    <p>A rural veterinarian starts hearing a bird that no field guide lists, and following the sound costs her far more than a season.</p>
    <div class="hold">Place hold</div></div></div></div></div>`;

  /* Screenshot frame: a caption above, a browser window bleeding off the
     bottom edge. Square corners and full bleed, per Chrome's guidance. */
  const SHOT_CSS = `
.cap { position: absolute; left: 80px; top: 44px; right: 80px; color: #fff; }
.cap .k { font-size: 15px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #9fabe8; margin-bottom: 12px; }
.cap h1 { font-family: 'EB Garamond', serif; font-weight: 400; font-size: 48px; line-height: 1.05; letter-spacing: -.01em; }
.cap p { margin-top: 10px; font-size: 20px; line-height: 1.45; color: rgba(255,255,255,.72); max-width: 900px; }
`;
  const WIN = 'left:80px;top:212px;width:1120px;height:620px';
  const shot = ({ step, h1, sub, body }) => ({
    w: 1280, h: 800,
    html: `<style>${BASE_CSS}${BROWSER_CSS}${CAT_CSS}${SHOT_CSS}</style>${BG}
  <div class="cap"><div class="k">${step}</div><h1>${h1}</h1><p>${sub}</p></div>
  ${body}`,
  });

  /* The marquee's design: wordmark, headline and line on the left; the
     real popup over a real front cover on the right. Sizes and positions
     are per image (px); the sheet keeps the panel's 1056x1632 aspect. */
  const hero = ({ w, h, copy, icon: iconPx, name, h1, sub, subWidth, pop, sheet }) => ({
    w, h,
    html: `<style>${BASE_CSS}
.copy { position: absolute; left: ${copy.left}px; top: 0; height: ${h}px; width: ${copy.width}px;
  display: flex; flex-direction: column; justify-content: center; }
.brand { display: flex; align-items: center; gap: ${Math.round(iconPx * 0.28)}px; margin-bottom: ${Math.round(h1 * 0.47)}px; }
.brand .ico { width: ${iconPx}px; height: ${iconPx}px; border-radius: ${Math.round(iconPx * 0.24)}px; background: #fff; display: grid; place-items: center; }
.brand .nm { font-family: 'EB Garamond', serif; font-size: ${name}px; color: #fff; letter-spacing: -.01em; }
.brand .nm span { font-style: italic; color: #b3bcf0; }
h1 { font-family: 'EB Garamond', serif; font-weight: 400; font-size: ${h1}px; line-height: 1.04; color: #fff; letter-spacing: -.012em; }
.sub { margin-top: ${Math.round(sub * 1)}px; font-size: ${sub}px; line-height: 1.45; color: rgba(255,255,255,.72); max-width: ${subWidth}px; }
.sheet { position: absolute; left: ${sheet.left}px; top: ${sheet.top}px; width: ${sheet.width}px; height: ${sheet.height}px; transform: rotate(4.5deg);
  background: #fff; box-shadow: 0 34px 70px -18px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.06); }
.sheet img { display: block; width: 100%; height: 100%; }
.pop { position: absolute; left: ${pop.left}px; top: ${pop.top}px; width: ${pop.width}px; border-radius: 10px; overflow: hidden; transform: rotate(-2deg);
  box-shadow: 0 40px 80px -16px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.08); }
.pop img { display: block; width: 100%; }
</style>${BG}
<div class="copy">
  <div class="brand"><div class="ico">${icon(Math.round(iconPx * 0.83))}</div><div class="nm">Booklister <span>Helper</span></div></div>
  <h1>From your catalog<br>to a <em>printed booklist</em>.</h1>
  <p class="sub">Capture titles, authors, call numbers and covers from your library&rsquo;s catalog.</p>
</div>
<div class="sheet"><img src="${shots.panelCover}"></div>
<div class="pop"><img src="${shots.popupList}"></div>`,
  });

  return {
    /* Wordmark only: Chrome's guidance is to avoid text in promo tiles
       and to make sure they still read at half size. */
    'small-promo-tile-440x280.png': {
      w: 440, h: 280,
      html: `<style>${BASE_CSS}
.wrap { position: absolute; inset: 0; display: flex; align-items: center; gap: 22px; padding: 0 34px; }
.ico { width: 116px; height: 116px; border-radius: 26px; background: #fff; display: grid; place-items: center;
  box-shadow: 0 18px 40px -12px rgba(0,0,0,.55); flex: none; }
.n1 { font-family: 'EB Garamond', serif; font-size: 50px; line-height: .95; color: #fff; letter-spacing: -.01em; }
.n2 { font-family: 'EB Garamond', serif; font-style: italic; font-size: 44px; line-height: 1; color: #b3bcf0; margin-top: 2px; }
</style>${BG}
<div class="wrap"><div class="ico">${icon(96)}</div>
  <div><div class="n1">Booklister</div><div class="n2">Helper</div></div></div>`,
    },

    'marquee-promo-tile-1400x560.png': hero({
      w: 1400, h: 560,
      copy: { left: 90, width: 640 }, icon: 58, name: 38, h1: 64, sub: 24, subWidth: 560,
      pop: { left: 760, top: 66, width: 330 },
      sheet: { left: 1000, top: 46, width: 300, height: 464 },
    }),

    /* The marquee recomposed for the 1.6:1 screenshot slot, so a store
       that shows no promo tile (Firefox) still gets it, as the lead
       screenshot. Same design through hero(); only the numbers differ. */
    'screenshot-0-overview-1280x800.png': hero({
      w: 1280, h: 800,
      copy: { left: 84, width: 560 }, icon: 66, name: 42, h1: 70, sub: 26, subWidth: 520,
      pop: { left: 628, top: 160, width: 360 },
      sheet: { left: 915, top: 125, width: 320, height: 495 },
    }),

    'screenshot-1-capture-a-list-1280x800.png': shot({
      step: 'Capture a list',
      h1: 'Pick titles straight from your <em>library&rsquo;s catalog</em>.',
      sub: 'Check the ones you want, sort them, and capture. First 13, 14 or 15 matches a booklist&rsquo;s slots.',
      body: `<div class="win" style="${WIN}">${toolbar('<b>catalog.yourlibrary.org</b>/lists/&hellip;', { on: true })}
  <div class="page">${listPage}</div></div>
  <div class="popup" style="left:784px;top:256px;width:400px"><img src="${shots.popupList}"></div>`,
    }),

    'screenshot-2-paste-into-booklister-1280x800.png': shot({
      step: 'Paste into Booklister',
      h1: 'Covers and call numbers <em>come along</em>.',
      sub: 'Paste into Quick Add and every title lands in its slot, author names flipped and titles cased.',
      body: `<div class="win" style="${WIN}">${toolbar('<b>booklister.org</b>')}
  <div class="page"><img src="${shots.app}" style="width:1120px;display:block"></div></div>`,
    }),

    'screenshot-3-capture-one-title-1280x800.png': shot({
      step: 'Capture one title',
      h1: 'Or grab titles <em>one at a time</em>.',
      sub: 'On any title page, one click copies it. Turn on accumulate to build a list as you browse.',
      body: `<div class="win" style="${WIN}">${toolbar('<b>catalog.yourlibrary.org</b>/titles/&hellip;', { on: true, badge: '7' })}
  <div class="page">${recordPage}</div></div>
  <div class="popup" style="left:744px;top:258px;width:440px"><img src="${shots.popupRecord}"></div>`,
    }),

    'screenshot-4-settings-1280x800.png': shot({
      step: 'Settings',
      h1: 'Your branch, <em>your shelves</em>.',
      sub: 'Pin call numbers to your own branch, and keep a running list across title pages.',
      body: `<div class="win" style="${WIN}">${toolbar('<b>catalog.yourlibrary.org</b>/titles/&hellip;', { on: true, badge: '7' })}
  <div class="page">${recordPage}</div></div>
  <div class="popup" style="left:744px;top:258px;width:440px"><img src="${shots.popupSettings}"></div>`,
    }),
  };
}

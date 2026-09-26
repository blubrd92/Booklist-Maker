/**
 * The promo video's soundtrack, synthesized from scratch: no samples, no
 * downloads. renderAudio(cues) takes the cue sheet scene.html reports
 * (every syllable Folio speaks, every sound effect, the scene changes)
 * and returns a 48 kHz stereo 16-bit WAV as a Buffer.
 *
 * Three layers:
 * - Music: a small lullaby in F major at 100 bpm. Music-box melody over a
 *   soft pad, a plucked (Karplus-Strong) bass walking F-A-Bb-C, brushed
 *   percussion, and a final Fmaj9 roll timed to land as the video ends.
 *   It ducks a little whenever Folio talks.
 * - Folio's voice: a soft marimba note on each word, in the music's key,
 *   so his lines play as a small melody in the rhythm of the words on
 *   screen instead of a synthetic voice.
 * - Effects: clicks, pops, whooshes, the printer, the paper flip and fold.
 */

const SR = 48000;

function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function rng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stereo bus: dry left/right plus a reverb send.
function makeBus(n) {
  return { L: new Float32Array(n), R: new Float32Array(n), S: new Float32Array(n) };
}
function mix(bus, i, v, pan, send) {
  if (i < 0 || i >= bus.L.length) return;
  const a = (pan + 1) * Math.PI / 4;
  bus.L[i] += v * Math.cos(a);
  bus.R[i] += v * Math.sin(a);
  bus.S[i] += v * send;
}

// RBJ biquad, coefficients updatable per block.
function biquad() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  return {
    set(type, f, q) {
      const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
      let nb0, nb1, nb2;
      if (type === 'bp') { nb0 = al; nb1 = 0; nb2 = -al; } else if (type === 'lp') { nb0 = (1 - cs) / 2; nb1 = 1 - cs; nb2 = (1 - cs) / 2; } else { nb0 = (1 + cs) / 2; nb1 = -(1 + cs); nb2 = (1 + cs) / 2; }
      const a0 = 1 + al;
      b0 = nb0 / a0; b1 = nb1 / a0; b2 = nb2 / a0; a1 = (-2 * cs) / a0; a2 = (1 - al) / a0;
    },
    run(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Instruments                                                         */
/* ------------------------------------------------------------------ */

function bell(bus, t0, midi, amp, o) {
  const opt = Object.assign({ pan: 0.15, send: 0.35, decay: 1, dur: 2.2, tine: 1 }, o || {});
  const f = mtof(midi);
  const start = Math.round(t0 * SR), n = Math.round(opt.dur * SR);
  const tau = (0.5 + 70 / f) * opt.decay;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const att = 1 - Math.exp(-t / 0.0015);
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau)
      + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / (tau * 0.4))
      + 0.12 * Math.sin(2 * Math.PI * 3 * f * t) * Math.exp(-t / (tau * 0.25))
      + 0.07 * opt.tine * Math.sin(2 * Math.PI * 5.4 * f * t) * Math.exp(-t / (tau * 0.12));
    mix(bus, start + i, v * att * amp, opt.pan, opt.send);
  }
}

function padChord(bus, t0, dur, notes, amp) {
  const start = Math.round(t0 * SR), n = Math.round((dur + 0.9) * SR);
  notes.forEach((m, ni) => {
    const pan = -0.35 + 0.7 * ni / Math.max(1, notes.length - 1);
    [-1, 1].forEach((det) => {
      const f = mtof(m) * Math.pow(2, det * 5 / 1200);
      const ph = ni * 1.3 + det;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.5) * (t > dur ? Math.exp(-(t - dur) / 0.35) : 1);
        let v = 0;
        for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * f * k * t + ph * k) / Math.pow(k, 1.7);
        v *= 1 + 0.08 * Math.sin(2 * Math.PI * 0.35 * t + ni);
        mix(bus, start + i, v * env * amp, pan, 0.55);
      }
    });
  });
}

function pluck(bus, t0, midi, amp, o) {
  const opt = Object.assign({ pan: 0, send: 0.12, decay: 0.9965, dur: 1.8, seed: 1 }, o || {});
  const f = mtof(midi);
  const N = Math.max(2, Math.round(SR / f));
  const r = rng(opt.seed + midi * 31);
  const d = new Float32Array(N);
  let prev = 0;
  for (let i = 0; i < N; i++) { const x = r() * 2 - 1; prev = prev * 0.6 + x * 0.4; d[i] = prev; }
  const start = Math.round(t0 * SR), n = Math.round(opt.dur * SR);
  for (let i = 0; i < n; i++) {
    const idx = i % N;
    const out = d[idx];
    d[idx] = opt.decay * 0.5 * (d[idx] + d[(idx + 1) % N]);
    const env = i > n - 2400 ? (n - i) / 2400 : 1;
    mix(bus, start + i, out * amp * env, opt.pan, opt.send);
  }
}

function kick(bus, t0, amp) {
  const start = Math.round(t0 * SR), n = Math.round(0.3 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 70 * Math.exp(-t / 0.03);
    ph += 2 * Math.PI * f / SR;
    mix(bus, start + i, Math.sin(ph) * Math.exp(-t / 0.11) * amp, 0, 0.02);
  }
}

function noiseHit(bus, t0, dur, amp, o) {
  const opt = Object.assign({ type: 'bp', f0: 3000, f1: null, q: 1, pan: 0, send: 0.1, attack: 0.002, shape: 'exp', seed: 7 }, o || {});
  const r = rng(opt.seed);
  const bq = biquad();
  bq.set(opt.type, opt.f0, opt.q);
  const start = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let i = 0; i < n; i++) {
    const u = i / n, t = i / SR;
    if (opt.f1 && i % 32 === 0) bq.set(opt.type, typeof opt.f1 === 'function' ? opt.f1(u) : opt.f0 + (opt.f1 - opt.f0) * u, opt.q);
    let env;
    if (opt.shape === 'exp') env = Math.min(1, t / opt.attack) * Math.exp(-t / (dur * 0.3));
    else env = Math.sin(Math.PI * u) ** 1.5;
    const pan = typeof opt.pan === 'function' ? opt.pan(u) : opt.pan;
    mix(bus, start + i, bq.run(r() * 2 - 1) * env * amp, pan, opt.send);
  }
}

function sweepTone(bus, t0, dur, f0, f1, amp, o) {
  const opt = Object.assign({ pan: 0, send: 0.15, decay: 0.3 }, o || {});
  const start = Math.round(t0 * SR), n = Math.round(dur * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, t = i / SR;
    const f = f0 * Math.pow(f1 / f0, Math.min(1, u * 1.5));
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / 0.003) * Math.exp(-u / opt.decay);
    mix(bus, start + i, Math.sin(ph) * env * amp, opt.pan, opt.send);
  }
}

/* ------------------------------------------------------------------ */
/* Folio's voice                                                       */
/* ------------------------------------------------------------------ */

// Folio "speaks" in soft marimba notes, one per word, so his lines are a
// little melody instead of a synthetic voice. The notes come from F major
// pentatonic, the lullaby's own key, so whatever chord is under him they
// sit inside the music. His mouth still moves on every syllable.
const VOICE_SCALE = [60, 62, 65, 67, 69, 72, 74, 77, 79];
function voiceNote(bus, t0, midi, amp, pan) {
  const f = mtof(midi);
  const start = Math.round(t0 * SR), n = Math.round(0.7 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.24);
    const v = Math.sin(2 * Math.PI * f * t)
      + 0.16 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / 0.07)
      + 0.05 * Math.sin(2 * Math.PI * 3.93 * f * t) * Math.exp(-t / 0.025);
    mix(bus, start + i, v * env * amp, pan, 0.3);
  }
}
function folioVoice(bus, syllables, panAt) {
  const noteFor = (s, shift) => {
    let idx = Math.round(4 + s.pitch * 0.55) + (shift || 0);
    if (s.glide) idx += 2;
    return VOICE_SCALE[Math.max(0, Math.min(VOICE_SCALE.length - 1, idx))];
  };
  syllables.forEach((s) => {
    const amp = 0.19 * (s.emph ? 1.2 : 1);
    if (s.w) voiceNote(bus, s.t, noteFor(s), amp, panAt(s.t));
    // longer words get a quiet grace note on their second syllable
    else if (s.k === 1 && s.n >= 3) voiceNote(bus, s.t, noteFor(s, s.pitch > 0 ? -1 : 1), amp * 0.45, panAt(s.t));
  });
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

function sfx(bus, e) {
  const g = e.gain == null ? 1 : e.gain;
  const pan = e.pan || 0;
  const t = e.t;
  switch (e.type) {
    case 'type': {
      const r = rng(100 + (e.seed || 0));
      noiseHit(bus, t, 0.025, 0.09 * g, { type: 'hp', f0: 2500 + r() * 1500, q: 0.7, pan, seed: 11 + (e.seed || 0) });
      sweepTone(bus, t, 0.02, 1900 + r() * 400, 1700, 0.03 * g, { pan, decay: 0.2 });
      break;
    }
    case 'click':
      sweepTone(bus, t, 0.018, 3400, 2800, 0.055 * g, { pan, decay: 0.2, send: 0.05 });
      noiseHit(bus, t, 0.012, 0.065 * g, { type: 'hp', f0: 4000, q: 0.7, pan, send: 0.05 });
      break;
    case 'grab':
      sweepTone(bus, t, 0.06, 320, 220, 0.12 * g, { pan, decay: 0.4 });
      noiseHit(bus, t, 0.01, 0.05, { type: 'hp', f0: 4000, pan });
      break;
    case 'drop':
      sweepTone(bus, t, 0.08, 260, 180, 0.16 * g, { pan, decay: 0.3 });
      noiseHit(bus, t, 0.02, 0.05, { type: 'bp', f0: 1800, q: 1, pan });
      break;
    case 'tick': {
      const f = 1500 * Math.pow(2, (e.pitch || 0) / 12);
      sweepTone(bus, t, 0.05, f, f * 0.98, 0.07 * g, { pan, decay: 0.18, send: 0.15 });
      sweepTone(bus, t, 0.03, f * 2.4, f * 2.4, 0.02 * g, { pan, decay: 0.15 });
      break;
    }
    case 'toggle':
      sfx(bus, { t, type: 'tick', pan, pitch: 0, gain: g });
      sfx(bus, { t: t + 0.06, type: 'tick', pan, pitch: 5, gain: g });
      break;
    case 'pop': {
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      const f = 520 * Math.pow(2, steps[(e.pitch || 0) % steps.length] / 12);
      sweepTone(bus, t, 0.09, f * 1.6, f, 0.12 * g, { pan, decay: 0.35, send: 0.2 });
      break;
    }
    case 'swish':
      noiseHit(bus, t, 0.24, 0.1 * g, { type: 'bp', f0: 700, f1: 3200, q: 1.4, pan, shape: 'sin', send: 0.1 });
      break;
    case 'whoosh':
      noiseHit(bus, t, 0.62, 0.22 * g, { type: 'bp', f1: (u) => 350 + 2400 * Math.sin(Math.PI * u), f0: 350, q: 0.9, pan: (u) => pan - 0.5 + u, shape: 'sin', send: 0.25 });
      break;
    case 'open':
      sweepTone(bus, t, 0.14, 330, 760, 0.1 * g, { pan, decay: 0.6, send: 0.25 });
      bell(bus, t + 0.05, 88, 0.025 * g, { pan, dur: 0.8 });
      break;
    case 'close':
      sweepTone(bus, t, 0.12, 700, 320, 0.09 * g, { pan, decay: 0.5, send: 0.2 });
      break;
    case 'keycap':
      sfx(bus, { t, type: 'click', pan, gain: 0.9 });
      sfx(bus, { t: t + 0.09, type: 'click', pan, gain: 1.1 });
      break;
    case 'paper':
      noiseHit(bus, t, 0.32, 0.06 * g, { type: 'bp', f0: 2600, f1: 4200, q: 0.8, pan, shape: 'sin', send: 0.1 });
      break;
    case 'twinkle':
      [84, 88, 91].forEach((m, i) => bell(bus, t + i * 0.055, m, 0.045 * g, { pan, dur: 0.9, decay: 0.45 }));
      break;
    case 'sparkle': {
      const r = rng(Math.round(t * 100));
      const scale = [96, 98, 100, 103, 105, 108];
      for (let i = 0; i < 7; i++) bell(bus, t + i * 0.055 + r() * 0.02, scale[Math.floor(r() * scale.length)], 0.022 * g, { pan: pan + (r() - 0.5) * 0.6, dur: 0.7, decay: 0.35, send: 0.5 });
      break;
    }
    case 'chime':
      (e.notes || [72, 76, 79, 84]).forEach((m, i) => bell(bus, t + i * 0.09, m, 0.06 * g, { pan, dur: 2.2, decay: 1.1, send: 0.55 }));
      break;
    case 'hearts':
      [79, 84, 88, 91].forEach((m, i) => bell(bus, t + i * 0.16, m, 0.035 * g, { pan: pan + i * 0.1, dur: 1.4, decay: 0.8, send: 0.6 }));
      break;
    case 'shuffle': {
      for (let i = 0; i < 7; i++) noiseHit(bus, t + i * 0.05, 0.03, 0.16 * g, { type: 'bp', f0: 2200 + i * 150, q: 1.2, pan, seed: 40 + i });
      noiseHit(bus, t, 0.4, 0.14 * g, { type: 'bp', f0: 900, f1: 2600, q: 1, pan, shape: 'sin' });
      break;
    }
    case 'qr':
      for (let i = 0; i < 22; i++) sfx(bus, { t: t + i * 0.05, type: 'tick', pan, pitch: i * 0.7, gain: 0.6 });
      break;
    case 'rise':
      sweepTone(bus, t, 0.5, 80, 150, 0.08 * g, { pan, decay: 0.8, send: 0.1 });
      noiseHit(bus, t, 0.45, 0.05 * g, { type: 'bp', f0: 400, f1: 1500, q: 1, pan, shape: 'sin' });
      break;
    case 'print': {
      const dur = e.dur || 1.7;
      const start = Math.round(t * SR), n = Math.round(dur * SR);
      const r = rng(77);
      const bq = biquad(); bq.set('bp', 1700, 1.3);
      for (let i = 0; i < n; i++) {
        const tt = i / SR, u = i / n;
        const ramp = Math.min(1, tt / 0.08) * Math.min(1, (dur - tt) / 0.12);
        const hum = (Math.sin(2 * Math.PI * 118 * tt) + 0.4 * Math.sin(2 * Math.PI * 236 * tt)) * 0.035;
        const chk = bq.run(r() * 2 - 1) * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 13 * tt)), 8) * 0.45;
        mix(bus, start + i, (hum + chk) * ramp * g * 0.7 * (0.9 + 0.1 * Math.sin(u * 20)), pan, 0.08);
      }
      break;
    }
    case 'stamp':
      sweepTone(bus, t, 0.2, 130, 55, 0.4 * g, { pan, decay: 0.35, send: 0.15 });
      noiseHit(bus, t, 0.08, 0.12 * g, { type: 'lp', f0: 1200, q: 0.7, pan });
      break;
    case 'flip': {
      for (let k = 0; k < 3; k++) noiseHit(bus, t + k * 0.09, 0.16, 0.13 * g, { type: 'bp', f0: 1500 + k * 600, f1: 3500, q: 0.9, pan, shape: 'sin', seed: 60 + k });
      noiseHit(bus, t, 0.6, 0.06 * g, { type: 'bp', f0: 500, f1: (u) => 500 + 1800 * Math.sin(Math.PI * u), q: 0.8, pan, shape: 'sin', send: 0.2 });
      break;
    }
    case 'fold': {
      const r = rng(5);
      for (let k = 0; k < 9; k++) noiseHit(bus, t + 0.35 + r() * 0.2, 0.012, 0.16 * g, { type: 'hp', f0: 3000, q: 0.7, pan, seed: 80 + k });
      noiseHit(bus, t, 0.55, 0.16 * g, { type: 'bp', f0: 800, f1: 2500, q: 0.8, pan, shape: 'sin' });
      sweepTone(bus, t + 0.55, 0.1, 180, 120, 0.12 * g, { pan, decay: 0.3 });
      break;
    }
    case 'peek':
      voiceNote(bus, t, 72, 0.08, pan);
      voiceNote(bus, t + 0.13, 77, 0.08, pan);
      break;
    case 'hop':
      noiseHit(bus, t, 0.2, 0.07 * g, { type: 'bp', f0: 600, f1: 2200, q: 1.2, pan, shape: 'sin' });
      break;
    case 'land':
      sweepTone(bus, t, 0.1, 150, 85, 0.22 * g, { pan, decay: 0.35, send: 0.05 });
      noiseHit(bus, t, 0.05, 0.05 * g, { type: 'lp', f0: 900, q: 0.7, pan });
      break;
    case 'purr': {
      const dur = e.dur || 2.2;
      const start = Math.round(t * SR), n = Math.round(dur * SR);
      const r = rng(21);
      const lp = biquad(); lp.set('lp', 320, 0.8);
      for (let i = 0; i < n; i++) {
        const tt = i / SR;
        const pulse = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 24 * tt), 2);
        const breath = 0.6 + 0.4 * Math.sin(2 * Math.PI * tt / 1.1);
        const v = (lp.run(r() * 2 - 1) * 2.2 + Math.sin(2 * Math.PI * 48 * tt) * 0.5) * pulse * breath;
        const env = Math.min(1, tt / 0.3) * Math.min(1, (dur - tt) / 0.5);
        mix(bus, start + i, v * env * 0.14 * g, pan, 0.05);
      }
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Music                                                               */
/* ------------------------------------------------------------------ */

const BEAT = 0.6, BAR = 2.4;
const CHORDS = [
  { pad: [53, 57, 60, 64], root: 41, tones: [65, 69, 72, 76] },   // Fmaj7
  { pad: [57, 60, 64, 67], root: 45, tones: [69, 72, 76, 79] },   // Am7
  { pad: [58, 62, 65, 69], root: 46, tones: [70, 74, 77, 81] },   // Bbmaj7
  { pad: [55, 60, 64, 69], root: 48, tones: [67, 72, 76, 79] },   // C6
];
const MELODY = [
  [81, 0, 84, 0, 81, 79, 77, 0], [76, 0, 79, 0, 81, 0, 0, 0], [77, 0, 81, 0, 74, 0, 77, 76], [76, 0, 0, 79, 0, 0, 72, 0],
  [84, 0, 81, 0, 77, 0, 79, 81], [79, 0, 76, 0, 72, 0, 76, 0], [77, 0, 74, 0, 77, 0, 81, 0], [79, 0, 0, 0, 76, 0, 0, 0],
];

function music(bus, duration) {
  const bars = Math.floor((duration - 2.4) / BAR);  // leave the last bar for the ending
  for (let b = 0; b < bars; b++) {
    const t0 = b * BAR;
    const ch = CHORDS[b % 4];
    padChord(bus, t0, BAR, ch.pad, b < 2 ? 0.006 + 0.003 * b : 0.0095);
    if (b < 2) {
      // Intro: the chord broken slowly on the music box.
      ch.tones.forEach((m, i) => bell(bus, t0 + i * BEAT, m + 12, 0.028, { pan: 0.2, decay: 0.9 }));
      continue;
    }
    pluck(bus, t0, ch.root, 0.42, { pan: -0.05, dur: 1.2 });
    pluck(bus, t0 + 2 * BEAT, ch.root + (b % 2 ? 7 : 12), 0.3, { pan: -0.05, dur: 1.1 });
    kick(bus, t0, 0.28);
    kick(bus, t0 + 2 * BEAT, 0.2);
    for (let k = 0; k < 8; k++) {
      noiseHit(bus, t0 + k * BEAT / 2, 0.06, k % 2 ? 0.022 : 0.012, { type: 'hp', f0: 6000, q: 0.7, pan: 0.3, send: 0.05, seed: b * 8 + k });
    }
    // off-beat comping, a quiet pizzicato
    [1, 3].forEach((beat) => pluck(bus, t0 + beat * BEAT, ch.tones[beat % 4] - 12, 0.1, { pan: 0.35, decay: 0.993, dur: 0.6, seed: b }));
    const mel = MELODY[(b - 2) % 8];
    const second = b >= 10 && b < 18;
    mel.forEach((m, k) => {
      if (!m) return;
      const tt = t0 + k * BEAT / 2;
      bell(bus, tt, m, 0.05, { pan: 0.12 });
      if (second) bell(bus, tt + 0.004, m - 12, 0.018, { pan: -0.2, decay: 0.8 });
    });
  }
  // Ending: an Fmaj9 roll that rings to the last frame.
  const te = bars * BAR;
  padChord(bus, te, duration - te - 0.3, [53, 57, 60, 64, 67], 0.009);
  pluck(bus, te, 41, 0.45, { dur: 2.4 });
  kick(bus, te, 0.25);
  [65, 69, 72, 76, 79, 84].forEach((m, i) => bell(bus, te + 0.1 + i * 0.11, m, 0.05, { pan: -0.3 + i * 0.12, dur: 2.4, decay: 1.4, send: 0.6 }));
}

/* ------------------------------------------------------------------ */
/* Reverb (small Freeverb) and mixdown                                 */
/* ------------------------------------------------------------------ */

function reverb(input, n, offset) {
  const out = new Float32Array(n);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => {
    const len = Math.round((d + offset) * SR / 44100);
    return { buf: new Float32Array(len), i: 0, store: 0 };
  });
  const aps = [556, 441, 341].map((d) => ({ buf: new Float32Array(Math.round((d + offset) * SR / 44100)), i: 0 }));
  const fb = 0.8, damp = 0.3;
  for (let s = 0; s < n; s++) {
    const x = input[s] * 0.03;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * fb;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = y + b * 0.5;
      y = b - y;
      a.i = (a.i + 1) % a.buf.length;
    }
    out[s] = y;
  }
  return out;
}

function speechEnvelope(syllables, n) {
  const e = new Float32Array(n);
  syllables.forEach((s) => {
    const a = Math.round((s.t - 0.05) * SR), b = Math.round((s.t + s.dur + 0.05) * SR);
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) e[i] = 1;
  });
  let v = 0;
  for (let i = 0; i < n; i++) {
    const k = e[i] > v ? 1 - Math.exp(-1 / (0.04 * SR)) : 1 - Math.exp(-1 / (0.35 * SR));
    v += (e[i] - v) * k;
    e[i] = v;
  }
  return e;
}

function wav(L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

export function renderAudio(cues) {
  const duration = cues.duration;
  const n = Math.round(duration * SR);
  const mus = makeBus(n), voice = makeBus(n), fx = makeBus(n);

  music(mus, duration);
  const pans = cues.folioPan || [[0, 0]];
  const folioPan = (t) => pans.reduce((p, [pt, v]) => (t >= pt ? v : p), 0);
  folioVoice(voice, cues.syllables, folioPan);
  cues.sfx.forEach((e) => sfx(fx, e));
  // a soft swell of shimmer into each scene change
  cues.transitions.forEach((t) => noiseHit(fx, t - 0.3, 0.7, 0.025, { type: 'bp', f0: 3000, f1: 7000, q: 0.7, shape: 'sin', send: 0.4 }));

  const duck = speechEnvelope(cues.syllables, n);
  const send = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = 1 - 0.3 * duck[i];
    mus.L[i] *= d; mus.R[i] *= d;
    send[i] = mus.S[i] * d + voice.S[i] + fx.S[i];
  }
  const revL = reverb(send, n, 0), revR = reverb(send, n, 23);
  const L = new Float32Array(n), R = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.4) * Math.min(1, (duration - t) / 0.5);
    L[i] = (mus.L[i] * 0.9 + voice.L[i] + fx.L[i] + revL[i]) * fade;
    R[i] = (mus.R[i] * 0.9 + voice.R[i] + fx.R[i] + revR[i]) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = 0.89 / (peak || 1);
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * gain * 1.05) / Math.tanh(1.05); R[i] = Math.tanh(R[i] * gain * 1.05) / Math.tanh(1.05); }
  return wav(L, R);
}

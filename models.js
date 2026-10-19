/** Waveguide and modal synthesis. Returns a mono Float32Array at `sr`. */

const TAU = Math.PI * 2;

class FracDelay {
  constructor(max) {
    this.buf = new Float32Array(max);
    this.w = 0;
    this.max = max;
  }

  push(x) {
    this.buf[this.w] = x;
    this.w += 1;
    if (this.w >= this.max) this.w = 0;
  }

  read(samplesAgo) {
    let r = this.w - samplesAgo;
    r %= this.max;
    if (r < 0) r += this.max;
    const i0 = Math.floor(r);
    const frac = r - i0;
    const i1 = (i0 + 1) % this.max;
    const a = this.buf[i0];
    return a + (this.buf[i1] - a) * frac;
  }
}

function dcBlock(out) {
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < out.length; i += 1) {
    const x = out[i];
    const y = x - x1 + 0.995 * y1;
    x1 = x;
    y1 = y;
    out[i] = y;
  }
}

function normalize(out, peak = 0.7) {
  let max = 1e-8;
  for (let i = 0; i < out.length; i += 1) max = Math.max(max, Math.abs(out[i]));
  const g = peak / max;
  for (let i = 0; i < out.length; i += 1) {
    const y = out[i] * g;
    out[i] = Math.tanh(y);
  }
}

function biquadPeaking(sr, freq, q, gainDb) {
  const A = 10 ** (gainDb / 40);
  const w = TAU * Math.min(freq, sr * 0.45) / sr;
  const sn = Math.sin(w);
  const cs = Math.cos(w);
  const alpha = sn / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cs;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cs;
  const a2 = 1 - alpha / A;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function biquadBandpass(sr, freq, q) {
  const w = TAU * Math.min(freq, sr * 0.45) / sr;
  const sn = Math.sin(w);
  const cs = Math.cos(w);
  const alpha = sn / (2 * q);
  const b0 = alpha;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cs;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: 0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(out, coeff) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < out.length; i += 1) {
    const x = out[i];
    const y = coeff.b0 * x + coeff.b1 * x1 + coeff.b2 * x2 - coeff.a1 * y1 - coeff.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
}

const BODIES = {
  guitar: [[98, 1.1, 7], [210, 2.2, 5], [390, 3, 2]],
  cello: [[180, 1.4, 6], [360, 2, 3.5], [700, 1.5, 1.5]],
  harp: [[140, 1.2, 4], [320, 2, 2]],
  flute: [[800, 1.6, 3], [1800, 1.2, 2]],
  piano: [[90, 0.9, 5], [250, 1.4, 3]],
};

function body(out, sr, kind) {
  for (const [freq, q, db] of BODIES[kind] || []) applyBiquad(out, biquadPeaking(sr, freq, q, db));
}

function finish(out, sr, kind, peak = 0.62) {
  if (kind) body(out, sr, kind);
  dcBlock(out);
  normalize(out, peak);
  return out;
}

/** Karplus–Strong string with loop filter, stiffness allpass, and a pick-position comb. */
export function pluck(sr, freq, dur, opt = {}) {
  const f = Math.max(40, freq);
  const period = Math.max(2, sr / f);
  const seconds = Math.min(4.5, Math.max(0.4, dur + (opt.ring ?? 1.5)));
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const delay = new FracDelay(Math.ceil(period) + 16);
  const excite = Math.floor(period);
  for (let i = 0; i < excite; i += 1) {
    const window = Math.sin(Math.PI * i / excite);
    delay.push((Math.random() * 2 - 1) * window);
  }
  const bright = opt.bright ?? 0.62;
  const trip = opt.trip ?? 0.994;
  const gain = trip ** (1 / period);
  const stiff = opt.stiff ?? 0.12;
  const ap = stiff / (1 + stiff);
  const pick = Math.max(1, period * (opt.pick ?? 0.17));
  let last = 0;
  let apState = 0;
  let apIn = 0;
  for (let i = 0; i < n; i += 1) {
    const x = delay.read(period);
    const filtered = (1 - bright) * last + bright * x;
    last = x;
    const dispersed = ap * (filtered - apState) + apIn;
    apIn = filtered;
    apState = dispersed;
    const y = dispersed * gain;
    delay.push(y);
    const comb = y - 0.28 * delay.read(pick);
    out[i] = comb;
  }
  return finish(out, sr, opt.body || "guitar", opt.peak ?? 0.6);
}

/** Two-delay bowed string. Bow velocity drops after `dur`, then the string rings. */
export function bow(sr, freq, dur, opt = {}) {
  const f = Math.max(50, freq);
  const period = Math.max(8, sr / f);
  const seconds = Math.min(8, Math.max(0.2, dur + 0.45));
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const bowAt = Math.min(0.45, Math.max(0.07, opt.position ?? 0.14));
  const nutLen = Math.max(2, period * bowAt);
  const bridgeLen = Math.max(2, period * (1 - bowAt));
  const nut = new FracDelay(Math.ceil(nutLen) + 8);
  const bridge = new FracDelay(Math.ceil(bridgeLen) + 8);
  const pressure = opt.pressure ?? 0.75;
  const bowSpeed = opt.velocity ?? 0.22;
  const bright = opt.brightness ?? 0.4;
  const pole = 0.2 + (1 - bright) * 0.45;
  const on = Math.floor(sr * Math.max(0.06, dur));
  let low = 0;
  for (let i = 0; i < n; i += 1) {
    const attack = Math.min(1, i / (sr * 0.035));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.09));
    const gate = attack * release;
    const fromNut = nut.read(nutLen);
    const fromBridge = bridge.read(bridgeLen);
    const stringVel = fromNut + fromBridge;
    const delta = bowSpeed * gate - stringVel;
    const slope = 0.8 + pressure * 6;
    const table = (slope * delta) / (1 + Math.abs(slope * delta));
    const force = table * (0.35 + pressure) * (0.25 + 0.75 * gate);
    nut.push((-fromBridge + force) * 0.992);
    const towardBridge = fromNut + force;
    low = (1 - pole) * towardBridge + pole * low;
    bridge.push(-low * 0.996);
    out[i] = low;
  }
  return finish(out, sr, opt.body || "cello", 0.55);
}

/** Jet-driven cylindrical bore. Pitch is the round-trip delay. */
export function flute(sr, freq, dur, opt = {}) {
  const f = Math.max(80, freq);
  const period = Math.max(8, sr / f);
  const seconds = Math.min(8, Math.max(0.15, dur + 0.28));
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const bore = new FracDelay(Math.ceil(period) + 16);
  const on = Math.floor(sr * Math.max(0.05, dur));
  const vib = opt.vib ?? 5.1;
  const breath = opt.breath ?? 0.62;
  let tone = 0;
  for (let i = 0; i < n; i += 1) {
    const attack = Math.min(1, i / (sr * 0.04));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.07));
    const gate = attack * release;
    const vibDelay = period / (1 + 0.006 * Math.sin((TAU * vib * i) / sr));
    const y = bore.read(vibDelay);
    const noise = (Math.random() * 2 - 1) * 0.05 * gate;
    const jetIn = breath * gate + noise - 0.42 * y;
    const jet = Math.tanh(2.2 * jetIn);
    bore.push(jet * 0.48 + y * 0.5);
    tone = tone * 0.62 + y * 0.38;
    out[i] = tone;
  }
  return finish(out, sr, "flute", 0.58);
}

const MODE_PRESETS = {
  bar: [1, 2.756, 5.404, 8.933],
  membrane: [1, 1.594, 2.136, 2.296, 2.653, 2.918],
  metal: [1, 1.42, 1.93, 2.47, 2.88, 3.36, 3.79, 4.5],
  bowl: [1, 2.0, 2.71, 5.15, 8.43],
  glass: [1, 2.32, 4.25, 6.63, 9.38],
  wood: [1, 2.572, 4.644],
  tine: [1, 5.9, 13.5],
};

/** Struck resonator. Each mode is a pair of slightly detuned exponentials plus a noise strike. */
export function modal(sr, freq, dur, opt = {}) {
  const f0 = Math.max(30, freq);
  const ratios = opt.modes || MODE_PRESETS.bar;
  const q = opt.q ?? 280;
  const seconds = Math.min(6, Math.max(0.2, dur + (opt.ring ?? 2.2)));
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const amps = ratios.map((_, k) => (opt.amps ? opt.amps[k] ?? 0 : 1 / (1 + k)));
  const ampSum = amps.reduce((a, b) => a + b, 0) || 1;
  ratios.forEach((ratio, k) => {
    const f = f0 * ratio;
    if (f > sr * 0.45) return;
    const qk = Array.isArray(q) ? q[k] ?? q[q.length - 1] : q / (1 + k * 0.18);
    const tau = Math.max(0.012, Math.min(5, qk / (Math.PI * f)));
    const beat = 0.4 + (k % 3) * 0.35;
    const amp = amps[k] / ampSum;
    const d1 = TAU * f / sr;
    const d2 = TAU * (f + beat) / sr;
    const decay = Math.exp(-1 / (sr * tau));
    const hitDecay = Math.exp(-1 / (sr * 0.004));
    let p1 = 0;
    let p2 = 0;
    let env = 1;
    let hit = 1;
    for (let i = 0; i < n; i += 1) {
      out[i] += amp * env * (Math.sin(p1) * 0.82 + Math.sin(p2) * 0.18);
      if (k === 0) out[i] += (Math.random() * 2 - 1) * hit * 0.15;
      p1 += d1;
      p2 += d2;
      if (p1 > TAU) p1 -= TAU;
      if (p2 > TAU) p2 -= TAU;
      env *= decay;
      hit *= hitDecay;
    }
  });
  if (opt.pitchDrop) {
    // Re-render the fundamental with a short downward chirp mixed in.
    const drop = opt.pitchDrop;
    for (let i = 0; i < Math.min(n, Math.floor(sr * 0.2)); i += 1) {
      const t = i / sr;
      const f = f0 * (1 + drop * Math.exp(-t / 0.05));
      out[i] += Math.sin(TAU * f * t) * Math.exp(-t / 0.12) * 0.8;
    }
  }
  return finish(out, sr, null, opt.peak ?? 0.6);
}

/** Inharmonic stiff string, hammer noise, and a short soundboard resonance. */
export function piano(sr, freq, dur) {
  const B = freq < 120 ? 0.00015 : 0.0004;
  const modes = [];
  for (let k = 1; k <= 18; k += 1) {
    const ratio = k * Math.sqrt(1 + B * k * k);
    if (freq * ratio > sr * 0.45) break;
    modes.push(ratio);
  }
  const q = modes.map((_, k) => 180 + 900 / (k + 1));
  const amps = modes.map((_, k) => 1 / (k + 1) ** 0.85);
  const out = modal(sr, freq, dur, { modes, q, amps, ring: 2.4, peak: 0.7 });
  return finish(out, sr, "piano", 0.62);
}

const VOWELS = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
  e: [400, 1600, 2700],
  i: [270, 2140, 2950],
};

/** Glottal pulse into parallel vowel formants. */
export function choir(sr, freq, dur, vowel = "a") {
  const f = Math.max(70, freq);
  const seconds = Math.min(8, Math.max(0.2, dur + 0.35));
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const formants = (VOWELS[vowel] || VOWELS.a).map((ff, k) => biquadBandpass(sr, ff, 8 - k * 2));
  const gains = [1, 0.55, 0.22];
  const states = formants.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  const open = 0.42;
  let phase = 0;
  const on = Math.floor(sr * dur);
  for (let i = 0; i < n; i += 1) {
    const attack = Math.min(1, i / (sr * 0.06));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.1));
    phase += f / sr;
    if (phase >= 1) phase -= 1;
    const glottal = phase < open ? 0.5 * (1 - Math.cos(Math.PI * phase / open)) : 0;
    let y = 0;
    formants.forEach((coeff, k) => {
      const s = states[k];
      const v = coeff.b0 * glottal + coeff.b1 * s.x1 + coeff.b2 * s.x2 - coeff.a1 * s.y1 - coeff.a2 * s.y2;
      s.x2 = s.x1;
      s.x1 = glottal;
      s.y2 = s.y1;
      s.y1 = v;
      y += v * gains[k];
    });
    out[i] = y * attack * release;
  }
  return finish(out, sr, null, 0.55);
}

function tone(sr, freq, dur, partials) {
  const n = Math.floor(sr * Math.min(8, Math.max(0.2, dur + 0.4)));
  const out = new Float32Array(n);
  const on = Math.floor(sr * dur);
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const attack = Math.min(1, i / (sr * 0.03));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.12));
    let y = 0;
    for (const p of partials) y += p.amp * Math.sin(TAU * freq * p.ratio * t + (p.phase || 0));
    out[i] = y * attack * release;
  }
  return finish(out, sr, null, 0.5);
}

function cohFreq(freq, fx) {
  if (!fx || fx.coh == null || fx.coh >= 0.98) return freq;
  const hash = Math.sin(freq * 12.9898) * 43758.5453;
  const unit = hash - Math.floor(hash);
  return freq * 2 ** ((unit - 0.5) * (1 - fx.coh) * 0.06);
}

function meow(sr) {
  const n = Math.floor(sr * 0.55);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const env = Math.sin(Math.min(Math.PI, (Math.PI * t) / 0.55)) ** 0.7;
    const f = 480 + 320 * Math.sin((Math.PI * t) / 0.55);
    phase += TAU * f / sr;
    out[i] = Math.sin(phase) * env * (0.65 + 0.35 * Math.sin(TAU * 1300 * t));
  }
  return finish(out, sr, null, 0.45);
}

function burst(sr, dur, colorHz, q = 1.2) {
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.random() * 2 - 1;
  applyBiquad(out, biquadBandpass(sr, colorHz, q));
  for (let i = 0; i < n; i += 1) out[i] *= Math.exp(-i / (sr * dur * 0.35));
  return finish(out, sr, null, 0.5);
}

export function renderVoice(sr, freq, dur, voice, fx = {}) {
  const d = Math.max(0.05, dur);
  const f = cohFreq(freq, fx);
  if (voice === "sample") {
    const kind = fx.sample || "static";
    if (kind === "cat") return meow(sr);
    if (kind === "geiger") return burst(sr, 0.03, 5200, 3);
    if (kind === "whoosh") return burst(sr, Math.min(1.5, d + 0.3), 650, 0.45);
    return burst(sr, Math.min(1.3, d + 0.15), 1500, 0.7);
  }
  switch (voice) {
    case "guitar":
      return pluck(sr, f, d, { bright: 0.78, trip: 0.996, stiff: 0.18, pick: 0.22, body: "guitar", ring: 2.2 });
    case "harp":
      return pluck(sr, f, d, { bright: 0.7, trip: 0.993, stiff: 0.08, pick: 0.12, body: "harp", ring: 1.8 });
    case "pizz":
    case "pluck":
      return pluck(sr, f, Math.min(d, 0.7), { bright: 0.84, trip: 0.988, stiff: 0.22, pick: 0.28, body: "cello", ring: 0.9 });
    case "bass":
      return pluck(sr, f, d, { bright: 0.28, trip: 0.997, stiff: 0.45, pick: 0.15, body: "cello", ring: 1.2 });
    case "kalimba":
      return modal(sr, f, d, { modes: MODE_PRESETS.tine, q: [420, 90, 40], amps: [1, 0.22, 0.05], ring: 1.4 });
    case "strings":
      return bow(sr, f, d, { pressure: 0.62, position: 0.16, brightness: 0.48, body: "cello" });
    case "cello":
      return bow(sr, f, d, { pressure: 0.85, position: 0.12, velocity: 0.18, brightness: 0.32, body: "cello" });
    case "bowedmetal":
      return bow(sr, f, d, { pressure: 0.45, position: 0.22, velocity: 0.3, brightness: 0.8, body: "flute" });
    case "winds":
      return flute(sr, f, d, { breath: 0.7, vib: 5.2 });
    case "organ":
      return flute(sr, f, d, { breath: 0.5, vib: 0.2 });
    case "theremin":
      return tone(sr, f, d, [{ ratio: 1, amp: 0.9 }, { ratio: 2, amp: 0.08 }, { ratio: 1.003, amp: 0.25, phase: 0.4 }]);
    case "pilot":
      return tone(sr, f, d, [{ ratio: 1, amp: 0.85 }, { ratio: 0.5, amp: 0.2 }]);
    case "glass":
      return modal(sr, f, d, { modes: [1, 1.004, 2.01, 3], q: [900, 900, 400, 200], amps: [1, 0.8, 0.15, 0.05], ring: 2 });
    case "piano":
    case "epiano":
      return piano(sr, f, d);
    case "vibes":
      return modal(sr, f, d, { modes: MODE_PRESETS.bar, q: [700, 320, 160, 90], amps: [1, 0.22, 0.07, 0.03], ring: 2.6 });
    case "marimba":
    case "celesta":
      return modal(sr, f, d, { modes: MODE_PRESETS.bar, q: voice === "celesta" ? [500, 180, 70, 40] : [220, 40, 18, 10], amps: [1, 0.35, 0.08, 0.02], ring: voice === "celesta" ? 1.8 : 0.7 });
    case "glassbell":
      return modal(sr, f, d, { modes: MODE_PRESETS.glass, q: 640, ring: 3 });
    case "gong":
      return modal(sr, f, d, { modes: MODE_PRESETS.metal, q: 500, ring: 3.5 });
    case "bowl":
      return modal(sr, f, d, { modes: MODE_PRESETS.bowl, q: [1100, 800, 600, 400, 280], ring: 4 });
    case "choir":
      return choir(sr, f, d, fx.vowel || "a");
    case "reverse": {
      const bowed = bow(sr, f, Math.max(0.4, d), { pressure: 0.7, brightness: 0.5 });
      bowed.reverse();
      return bowed;
    }
    case "kick":
    case "thump":
      return modal(sr, 52, 0.4, { modes: [1, 1.6, 2.2], q: [16, 10, 7], amps: [1, 0.3, 0.1], ring: 0.35, pitchDrop: 1.1, peak: 0.75 });
    case "snare":
      return modal(sr, 190, 0.25, { modes: MODE_PRESETS.membrane, q: 18, ring: 0.3 });
    case "tom":
      return modal(sr, f, 0.45, { modes: MODE_PRESETS.membrane, q: 28, ring: 0.55, pitchDrop: 0.2 });
    case "hat":
      return modal(sr, fx.open ? 2600 : 3400, fx.open ? 0.32 : 0.08, { modes: MODE_PRESETS.metal, q: fx.open ? 90 : 40, ring: fx.open ? 0.45 : 0.1, peak: 0.4 });
    case "clave":
    case "woodblock":
      return modal(sr, voice === "clave" ? 2100 : f, 0.2, { modes: MODE_PRESETS.wood, q: [70, 30, 16], ring: 0.25 });
    case "tick":
      return burst(sr, 0.02, 4200, 2.4);
    case "shaker":
      return burst(sr, 0.09, 6000, 0.7);
    case "noise":
      return burst(sr, Math.min(2, d + 0.2), Math.max(200, f), 0.8);
    case "ksdrum":
      return modal(sr, f, 0.4, { modes: MODE_PRESETS.membrane, q: 20, ring: 0.5, pitchDrop: 0.4 });
    default:
      return null;
  }
}

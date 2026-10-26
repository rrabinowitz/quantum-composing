/**
 * Physical models, rendered to a mono Float32Array at `sr`.
 *
 * Strings: Morse stiff-string partials (Fletcher & Rossing)
 *   f_k = k f0 sqrt(1 + B k^2), B = π² E d² / (64 ρ L⁴ f²),
 *   with the Jaffe & Smith (1983) two-point loop loss |cos(π f / sr)|.
 *   Pluck amplitudes are the Fourier series sin(k π β) / k².
 * Piano: the same transverse modes, a feedforward hammer whose contact
 *   shortens from about 5 ms to 2 ms with strike speed (Askenfelt & Jansson),
 *   one/two/three strings with a small unison detune, and longitudinal
 *   partials at c_L / (2L), c_L = sqrt(E/ρ). That is the published modal
 *   piano (Bank, AES e-brief), not a fitted commercial hammer curve.
 * Bow: Smith (1986) after McIntyre, Schumacher & Woodhouse (1983),
 *   with the Cook/Scavone bow table and the Maestre violin-body biquads.
 * Flute: Cook jet polynomial x³ − x, jet delay, and a reflection filter.
 *   Faust fluteModel is marked out of tune in physmodels.lib. A direct port
 *   locks about an octave sharp, or goes silent, so winds stays the Cook jet.
 * Organ: open-pipe partials k·f0. A single Cook jet was measured and does
 *   not stay on the fundamental across a rank.
 * Bars, glass, bowls: Essl & Cook banded-waveguide presets from STK.
 *   Round-trip gain G decays as sigma = −ln(G)·f.
 * Marimba: Faust marimbaBarModel, the mesh2faust modes of a C2 bar.
 *   Ratios and position-0 gains are the library tables. T60 is
 *   0.1·(1 − ratio/195.955)^5, so the bar is quiet after about a tenth
 *   of a second. The resonator tube under that bar does not keep the
 *   written pitch across this compass, so the sounding model is the bar.
 * Membranes, cantilevers, bells: analytic modal frequencies.
 * No waveshaping. Peak scaling is linear.
 */

const TAU = Math.PI * 2;
const STEEL_E = 2.0e11;
const STEEL_RHO = 7800;

const BAR = [1, 2.756538, 5.403917, 8.932951];
const MEMBRANE = [1, 1.593340, 2.135548, 2.295417, 2.653066, 2.917295];
const CANTILEVER = [1, 6.266893, 17.54748, 34.38606];
const BELL = [0.5, 1, 1.189207, 1.498307, 2, 2.5, 3, 4];
// Essl & Cook / STK BandedWG presets.
const TUNED_BAR = [1, 4.0198391420, 10.7184986595, 18.0697050938];
const GLASS_HARMONICA = [1, 2.32, 4.25, 6.63, 9.38];
// Tibetan prayer bowl, STK BandedWG preset 3 (ICMC 2002). Gains of 1 are the
// source values; the comments there are numbers so close to 1 that they are 1 in JS.
const TIBETAN_BOWL = [0.996108344, 1.0038916562, 2.979178, 2.99329767, 5.704452, 5.704452, 8.9982, 9.01549726, 12.83303, 12.807382, 17.2808219, 21.97602739726];
const BOWL_GAINS = [0.999925960128219, 0.999925960128219, 0.999982774366897, 0.999982774366897, 1, 1, 1, 1, 0.999965497558225, 0.999965497558225, 1, 1];
const BOWL_EXC = [1.1900357, 1.1900357, 1.0914886, 1.0914886, 4.2995041, 4.2995041, 4.0063034, 4.0063034, 0.7063034, 0.7063034, 5.7063034, 5.7063034];
const LONGITUDINAL = Math.sqrt(STEEL_E / STEEL_RHO);

const STRINGS = {
  guitar: { L: 0.648, fRef: 329.63, d: 2.54e-4, beta: 1 / 5 },
  harp: { L: 1.0, fRef: 220, d: 8.0e-4, beta: 1 / 7 },
  pizz: { L: 0.69, fRef: 65.41, d: 4.0e-4, beta: 1 / 6 },
  bass: { L: 0.864, fRef: 41.2, d: 5.0e-4, beta: 0.2 },
  piano: { L: 0.62, fRef: 261.63, d: 9.5e-4, beta: 1 / 8, contact: 0.0025 },
};

function inharmonicity(spec, freq) {
  const L = freq >= spec.fRef ? spec.L * spec.fRef / freq : spec.L;
  const f = freq >= spec.fRef ? spec.fRef : freq;
  return (Math.PI ** 2 * STEEL_E * spec.d ** 2) / (64 * STEEL_RHO * L ** 4 * f * f);
}

/** Jaffe & Smith two-point average, S = 1/2. Amplitude decay rate of a partial. */
function loopSigma(sr, f0, fk) {
  const g = Math.abs(Math.cos(Math.PI * fk / sr));
  if (g > 0.999999) return 0;
  if (g < 1e-4) return 1e4;
  return -f0 * Math.log(g);
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

function fadeTail(out, sr) {
  const n = Math.min(out.length, Math.floor(sr * 0.015));
  for (let i = 0; i < n; i += 1) out[out.length - 1 - i] *= i / n;
}

function peakScale(out, peak = 0.45) {
  let max = 1e-8;
  for (let i = 0; i < out.length; i += 1) max = Math.max(max, Math.abs(out[i]));
  const g = peak / max;
  for (let i = 0; i < out.length; i += 1) out[i] *= g;
  return out;
}

function finish(out, sr, peak = 0.45) {
  dcBlock(out);
  fadeTail(out, sr);
  return peakScale(out, peak);
}

function biquadBandpass(sr, freq, q) {
  const w = TAU * Math.min(freq, sr * 0.45) / sr;
  const sn = Math.sin(w);
  const cs = Math.cos(w);
  const alpha = sn / (2 * q);
  const a0 = 1 + alpha;
  return { b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: (-2 * cs) / a0, a2: (1 - alpha) / a0 };
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

function modalSum(sr, n, modes, { strike = false, chirp = 0 } = {}) {
  const out = new Float32Array(n);
  const states = modes.map((mode) => ({ ...mode, phase: 0 }));
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    let y = 0;
    for (let k = 0; k < states.length; k += 1) {
      const mode = states[k];
      const bend = chirp ? 1 + chirp * Math.exp(-t / 0.05) : 1;
      const env = mode.sigma > 0 ? Math.exp(-mode.sigma * t) : 1;
      y += mode.amp * env * (strike ? Math.sin(mode.phase) : Math.cos(mode.phase));
      mode.phase += TAU * mode.freq * bend / sr;
      if (mode.phase > TAU) mode.phase -= TAU;
    }
    out[i] = y;
  }
  return out;
}

function stiffString(sr, freq, dur, spec) {
  const f0 = Math.max(30, freq);
  const B = inharmonicity(spec, f0);
  const seconds = Math.min(6, Math.max(0.35, dur + 1.4));
  const n = Math.floor(sr * seconds);
  const beta = spec.beta;
  const modes = [];
  for (let k = 1; k <= 48; k += 1) {
    if (B * k * k > 25) break;
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk >= sr * 0.45) break;
    let amp = Math.sin(k * Math.PI * beta) / (k * k);
    if (spec.contact) {
      const x = Math.PI * fk * spec.contact;
      amp *= x < 1e-4 ? 1 : Math.sin(x) / x;
    }
    modes.push({ freq: fk, amp, sigma: loopSigma(sr, f0, fk) });
  }
  return finish(modalSum(sr, n, modes, { strike: !!spec.contact }), sr, 0.45);
}

export function pluck(sr, freq, dur) {
  return stiffString(sr, freq, dur, STRINGS.guitar);
}

/**
 * Modal piano. Unison cents are a voicing of about one cent: the published
 * model asks for slightly detuned copies, and does not publish the cents.
 * Longitudinal decay gets an extra 4/s so the clang sits in the attack.
 */
function pianoNote(sr, freq, dur, strike) {
  const spec = STRINGS.piano;
  const v = Math.max(0, Math.min(1, strike ?? 0.6));
  const contact = 0.005 - 0.003 * v;
  const f0 = Math.max(30, freq);
  const cents = f0 < 65 ? [0] : f0 < 131 ? [-0.8, 0.8] : [-1.2, 0, 1.3];
  const seconds = Math.min(6, Math.max(0.35, dur + 1.6));
  const n = Math.floor(sr * seconds);
  const modes = [];
  for (let s = 0; s < cents.length; s += 1) {
    const fString = f0 * 2 ** (cents[s] / 1200);
    const B = inharmonicity(spec, fString);
    for (let k = 1; k <= 40; k += 1) {
      if (B * k * k > 25) break;
      const fk = k * fString * Math.sqrt(1 + B * k * k);
      if (fk >= sr * 0.45) break;
      let amp = Math.sin(k * Math.PI * spec.beta) / (k * k);
      const x = Math.PI * fk * contact;
      amp *= x < 1e-4 ? 1 : Math.sin(x) / x;
      modes.push({ freq: fk, amp, sigma: loopSigma(sr, fString, fk) });
    }
  }
  const L = f0 >= spec.fRef ? spec.L * spec.fRef / f0 : spec.L;
  const fL = LONGITUDINAL / (2 * L);
  const longAmp = 0.1 * v * v;
  for (let mult = 1; mult <= 2; mult += 1) {
    const fk = fL * mult;
    if (fk >= sr * 0.45 || fk < 30) continue;
    const x = Math.PI * fk * contact;
    const sinc = x < 1e-4 ? 1 : Math.sin(x) / x;
    modes.push({ freq: fk, amp: (longAmp * sinc) / mult, sigma: loopSigma(sr, f0, fk) + 4 });
  }
  return finish(modalSum(sr, n, modes, { strike: true }), sr, 0.45);
}

// Faust physmodels.lib marimbaBarModel, excitation position 0 (the library default).
const MARIMBA_RATIOS = [1, 3.31356, 3.83469, 8.06313, 9.44778, 14.1169, 18.384, 21.0102, 26.1775, 28.9944, 37.0728, 37.8703, 40.0634, 47.6439, 51.019, 52.43, 58.286, 63.5486, 65.3628, 66.9587, 74.5301, 78.692, 80.8375, 89.978, 92.9661, 95.1914, 97.4807, 110.62, 112.069, 113.826, 119.356, 127.045, 129.982, 132.259, 133.477, 144.549, 149.438, 152.033, 153.166, 155.597, 158.183, 168.105, 171.863, 174.464, 178.937, 181.482, 185.398, 190.369, 192.19, 195.505];
const MARIMBA_GAINS = [1, 0.776725, 0.625723, 0.855223, 0.760159, 0.698373, 0.768011, 0.641127, 0.244034, 0.707754, 0.634013, 0.247527, 0.660849, 0.450396, 0.567783, 0.106361, 0.716814, 0.66392, 0.291208, 0.310599, 0.801495, 0.635292, 0.307435, 0.874124, 0.497668, 0.487088, 0.459115, 0.733455, 0.541818, 0.441318, 0.31392, 0.40309, 0.685353, 0.60314, 0.400552, 0.453511, 0.634386, 0.291547, 0.131605, 0.368507, 0.839907, 0.60216, 0.288296, 0.57967, 0.0242493, 0.262746, 0.368588, 0.890284, 0.408963, 0.556072];

/** Faust marimbaBarModel at excitation position 0. The tube is not used. */
function faustMarimba(sr, freq, dur) {
  const f0 = Math.max(45, freq);
  const seconds = Math.min(2, Math.max(0.2, dur + 0.15));
  const n = Math.floor(sr * seconds);
  const modes = [];
  for (let i = 0; i < MARIMBA_RATIOS.length; i += 1) {
    const fk = f0 * MARIMBA_RATIOS[i];
    if (fk >= sr * 0.45) continue;
    const base = 1 - MARIMBA_RATIOS[i] / 195.955;
    const t60 = 0.1 * (base > 0 ? base ** 5 : 0.01);
    modes.push({ freq: fk, amp: MARIMBA_GAINS[i], sigma: Math.log(1000) / Math.max(0.01, t60) });
  }
  return finish(modalSum(sr, n, modes, { strike: true }), sr, 0.45);
}

/** Essl & Cook loop: one pass around a mode of frequency f multiplies by G. */
function loopModes(sr, freq, dur, ratios, gains, ring, exc) {
  const f0 = Math.min(1568, Math.max(40, freq));
  const seconds = Math.min(6, Math.max(0.1, dur + ring));
  const n = Math.floor(sr * seconds);
  const modes = [];
  for (let i = 0; i < ratios.length; i += 1) {
    const fk = f0 * ratios[i];
    if (fk >= sr * 0.45 || fk < 20) continue;
    const amp = exc ? exc[i] : 1;
    if (!amp) continue;
    const G = Math.min(0.99999, Math.max(0.5, gains[i]));
    modes.push({ freq: fk, amp, sigma: -Math.log(G) * fk });
  }
  return finish(modalSum(sr, n, modes, { strike: true }), sr, 0.45);
}

function tunedBar(sr, freq, dur, baseGain, ring) {
  const gains = TUNED_BAR.map((_, i) => baseGain ** (i + 1));
  return loopModes(sr, freq, dur, TUNED_BAR, gains, ring);
}

function openPipe(sr, freq, dur) {
  const f0 = Math.max(40, freq);
  const seconds = Math.min(8, Math.max(0.2, dur + 0.28));
  const n = Math.floor(sr * seconds);
  const modes = [];
  for (let k = 1; k <= 16; k += 1) {
    const fk = k * f0;
    if (fk >= sr * 0.45) break;
    modes.push({ freq: fk, amp: 1 / k ** 1.15, sigma: 0 });
  }
  const out = modalSum(sr, n, modes);
  const on = Math.floor(sr * Math.max(0.05, dur));
  const attackN = Math.max(1, Math.floor(sr * 0.02));
  let seed = 0x12345678;
  for (let i = 0; i < n; i += 1) {
    let env;
    if (i < attackN) env = i / attackN;
    else if (i < on) env = 1;
    else env = Math.exp(-(i - on) / (sr * 0.12));
    let chiff = 0;
    if (i < sr * 0.035) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      chiff = (seed / 4294967296 * 2 - 1) * 0.4 * Math.exp(-i / (sr * 0.01));
    }
    out[i] = (out[i] + chiff) * env;
  }
  return finish(out, sr, 0.45);
}

class Line {
  constructor(maxDelay) {
    this.n = Math.ceil(maxDelay) + 8;
    this.buf = new Float32Array(this.n);
    this.w = 0;
    this.last = 0;
  }

  lastOut() { return this.last; }

  tick(input, delay) {
    const d = Math.min(this.n - 4, Math.max(2, delay));
    let r = this.w - d;
    r %= this.n;
    if (r < 0) r += this.n;
    const i0 = Math.floor(r);
    const frac = r - i0;
    const at = (k) => this.buf[(i0 + k + this.n) % this.n];
    const xm = at(-1);
    const x0 = at(0);
    const x1 = at(1);
    const x2 = at(2);
    const y = (-frac * (frac - 1) * (frac - 2) / 6) * xm
      + ((frac + 1) * (frac - 1) * (frac - 2) / 2) * x0
      + (-(frac + 1) * frac * (frac - 2) / 2) * x1
      + ((frac + 1) * frac * (frac - 1) / 6) * x2;
    this.buf[this.w] = input;
    this.w += 1;
    if (this.w >= this.n) this.w = 0;
    this.last = y;
    return y;
  }
}

class OnePole {
  constructor(pole, gain) {
    this.b0 = gain * (pole > 0 ? 1 - pole : 1 + pole);
    this.pole = pole;
    this.y1 = 0;
  }

  tick(x) {
    const y = this.b0 * x + this.pole * this.y1;
    this.y1 = y;
    return y;
  }
}

function onePolePhaseDelay(pole, freq, sr) {
  const w = TAU * freq / sr;
  const arg = -Math.atan2(pole * Math.sin(w), 1 - pole * Math.cos(w));
  return -arg / w;
}

/** Smith bow table: reflection coefficient from differential velocity. */
function bowTable(delta, slope, offset) {
  const x = Math.abs((delta + offset) * slope) + 0.75;
  return Math.min(0.98, Math.max(0.01, x ** -4));
}

const VIOLIN_BODY = [
  [1, 1.5667, 0.3133, -0.5509, -0.3925],
  [1, -1.9537, 0.9542, -1.6357, 0.8697],
  [1, -1.6683, 0.8852, -1.7674, 0.8735],
  [1, -1.8585, 0.9653, -1.8498, 0.9516],
  [1, -1.9299, 0.9621, -1.9354, 0.959],
  [1, -1.98, 0.9888, -1.9867, 0.9923],
];

function biquadTick(s, x) {
  const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
  s.x2 = s.x1;
  s.x1 = x;
  s.y2 = s.y1;
  s.y1 = y;
  return y;
}

export function bow(sr, freq, dur, opt = {}) {
  const f = Math.max(40, freq);
  const pole = 0.75 - (0.2 * 22050 / sr);
  const filterDelay = onePolePhaseDelay(pole, f, sr);
  const roundTrip = Math.max(8, sr / f - filterDelay);
  const beta = opt.position ?? 0.127236;
  const seconds = Math.min(8, Math.max(0.25, dur + 0.6));
  const n = Math.floor(sr * seconds);
  const neck = new Line(roundTrip + 8);
  const bridge = new Line(roundTrip + 8);
  const loss = new OnePole(pole, 0.95);
  const body = VIOLIN_BODY.map(([b0, b1, b2, a1, a2]) => ({ b0, b1, b2, a1, a2, x1: 0, x2: 0, y1: 0, y2: 0 }));
  const slope = opt.slope ?? 3;
  const offset = 0.001;
  const maxVelocity = 0.03 + 0.2 * (opt.velocity ?? 1);
  const out = new Float32Array(n);
  const on = Math.floor(sr * Math.max(0.05, dur));
  for (let i = 0; i < n; i += 1) {
    const attack = Math.min(1, i / (sr * 0.02));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.05));
    const bowVelocity = maxVelocity * attack * release;
    const bridgeReflection = -loss.tick(bridge.lastOut());
    const nutReflection = -neck.lastOut();
    const delta = bowVelocity - (bridgeReflection + nutReflection);
    const reflected = bowVelocity > 0 ? delta * bowTable(delta, slope, offset) : 0;
    neck.tick(bridgeReflection + reflected, roundTrip * (1 - beta));
    bridge.tick(nutReflection + reflected, roundTrip * beta);
    let y = bridge.lastOut();
    for (let k = 0; k < body.length; k += 1) y = biquadTick(body[k], y);
    out[i] = 0.1248 * y;
  }
  return finish(out, sr, 0.45);
}

function jet(x) {
  const y = x * (x * x - 1);
  return y > 1 ? 1 : y < -1 ? -1 : y;
}

/** Cook flue-pipe jet. boreRatio 2/3 overblows a flute; 1 speaks at the written pitch for an organ flue. */
export function flute(sr, freq, dur, opt = {}) {
  const fWritten = Math.max(60, freq);
  const boreRatio = opt.boreRatio ?? 1;
  const fBore = fWritten * boreRatio;
  const jetRatio = opt.jetRatio ?? 0.32;
  // A fixed reflection lowpass (cutoff near 2.6 kHz) lets a long pipe's upper modes outgrow
  // the fundamental. Scale the cutoff with the pipe, the way radiation loss scales with a rank.
  const pole = opt.cutoffRatio
    ? Math.exp(-TAU * opt.cutoffRatio * fBore / sr)
    : 0.7 - (0.1 * 22050 / sr);
  // The jet travel sits in the same loop as the bore, so the sounding period is bore + jet.
  const delay = Math.max(8, (sr / fBore - onePolePhaseDelay(pole, fBore, sr) - 1) / (1 + jetRatio));
  const seconds = Math.min(8, Math.max(0.2, dur + 0.35));
  const n = Math.floor(sr * seconds);
  const bore = new Line(delay + 8);
  const jetLine = new Line(delay + 8);
  const reflect = new OnePole(pole, 1);
  const out = new Float32Array(n);
  const on = Math.floor(sr * Math.max(0.05, dur));
  const noiseGain = opt.noise ?? 0.15;
  const vibHz = opt.vib ?? 5.925;
  const vibGain = opt.vibGain ?? 0.05;
  const pressure = opt.pressure ?? 0.9;
  const attack = opt.attack ?? 0.03;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const env = Math.min(1, t / attack) * (i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.06)));
    let breath = pressure * env;
    breath += breath * (noiseGain * (Math.random() * 2 - 1) + vibGain * Math.sin(TAU * vibHz * t));
    const reflected = -reflect.tick(bore.lastOut());
    const jetIn = jetLine.tick(breath - 0.5 * reflected, delay * jetRatio);
    const afterJet = jet(jetIn);
    const blocked = afterJet - x1 + 0.995 * y1;
    x1 = afterJet;
    y1 = blocked;
    out[i] = 0.3 * bore.tick(blocked + 0.5 * reflected, delay);
  }
  return finish(out, sr, 0.45);
}

function resonator(sr, freq, dur, ratios, q, { amps, strike = true, chirp = 0, ring = 1.2, peak = 0.45 } = {}) {
  const f0 = Math.max(20, freq);
  const seconds = Math.min(6, Math.max(0.08, dur + ring));
  const n = Math.floor(sr * seconds);
  const qList = Array.isArray(q) ? q : null;
  const modes = [];
  for (let k = 0; k < ratios.length; k += 1) {
    const fk = f0 * ratios[k];
    if (fk >= sr * 0.45 || fk < 15) continue;
    const qk = qList ? qList[k] ?? qList[qList.length - 1] : q;
    const tau = qk / (Math.PI * fk);
    modes.push({
      freq: fk,
      amp: amps ? amps[k] ?? 0 : 1 / (k + 1),
      sigma: tau > 0 ? 1 / tau : 0,
    });
  }
  return finish(modalSum(sr, n, modes, { strike, chirp }), sr, peak);
}

function cantilever(sr, freq, dur, q, ring) {
  return resonator(sr, freq, dur, CANTILEVER, q, { ring, amps: CANTILEVER.map((_, k) => 1 / (k + 1) ** 2) });
}

const VOWELS = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [270, 2290, 3010],
  o: [570, 840, 2410],
  u: [300, 870, 2240],
};
const FORMANT_BW = [60, 90, 150];

/** Rosenberg (1971) glottal pulse, model B, into Peterson & Barney formants. */
function choir(sr, freq, dur, vowel = "a") {
  const f = Math.max(70, freq);
  const seconds = Math.min(8, Math.max(0.2, dur + 0.35));
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const centers = VOWELS[vowel] || VOWELS.a;
  const formants = centers.map((ff, k) => biquadBandpass(sr, ff, ff / FORMANT_BW[k]));
  const gains = [1, 0.55, 0.22];
  const states = formants.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  const on = Math.floor(sr * dur);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const attack = Math.min(1, i / (sr * 0.04));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.08));
    phase += f / sr;
    if (phase >= 1) phase -= 1;
    let glottal = 0;
    if (phase < 0.4) {
      const x = phase / 0.4;
      glottal = 3 * x * x - 2 * x * x * x;
    } else if (phase < 0.56) {
      const x = (phase - 0.4) / 0.16;
      glottal = 1 - x * x;
    }
    let y = 0;
    for (let k = 0; k < formants.length; k += 1) {
      const coeff = formants[k];
      const s = states[k];
      const v = coeff.b0 * glottal + coeff.b1 * s.x1 + coeff.b2 * s.x2 - coeff.a1 * s.y1 - coeff.a2 * s.y2;
      s.x2 = s.x1;
      s.x1 = glottal;
      s.y2 = s.y1;
      s.y1 = v;
      y += v * gains[k];
    }
    out[i] = y * attack * release;
  }
  return finish(out, sr, 0.45);
}

function tone(sr, freq, dur, partials) {
  const n = Math.floor(sr * Math.min(8, Math.max(0.2, dur + 0.4)));
  const out = new Float32Array(n);
  const on = Math.floor(sr * dur);
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const attack = Math.min(1, i / (sr * 0.02));
    const release = i < on ? 1 : Math.max(0, 1 - (i - on) / (sr * 0.08));
    let y = 0;
    for (let k = 0; k < partials.length; k += 1) {
      const p = partials[k];
      y += p.amp * Math.sin(TAU * freq * p.ratio * t);
    }
    out[i] = y * attack * release;
  }
  return finish(out, sr, 0.4);
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
    out[i] = Math.sin(phase) * env;
  }
  return finish(out, sr, 0.4);
}

function burst(sr, dur, colorHz, q = 1.2) {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.random() * 2 - 1;
  applyBiquad(out, biquadBandpass(sr, colorHz, q));
  for (let i = 0; i < n; i += 1) out[i] *= Math.exp(-i / (sr * dur * 0.35));
  return finish(out, sr, 0.4);
}

function snare(sr) {
  const drum = resonator(sr, 190, 0.25, MEMBRANE, 18, { ring: 0.3, peak: 1 });
  const wires = burst(sr, 0.22, 3500, 1.4);
  const n = Math.min(drum.length, wires.length);
  const out = new Float32Array(drum.length);
  for (let i = 0; i < n; i += 1) out[i] = drum[i] + 0.45 * wires[i];
  return finish(out, sr, 0.45);
}

const LOUDNESS = {
  winds: 0.423, kick: 0.536, thump: 0.536, glass: 0.895, organ: 1.067,
  theremin: 0.493, kalimba: 0.604,   vibes: 0.876, pilot: 0.568, celesta: 1.045,
  marimba: 3.616, bowl: 0.941, piano: 0.599, glassbell: 0.895, woodblock: 0.846,
  choir: 0.576, epiano: 0.612, gong: 0.704, strings: 0.547, bowedmetal: 0.547,
  tom: 1.519, reverse: 0.547, ksdrum: 1.769, noise: 1.159, bass: 0.647,
  pizz: 0.695, pluck: 0.695, guitar: 0.630, snare: 1.316, cello: 0.547,
  clave: 1.920, harp: 0.752, shaker: 1.663, tick: 1.861, hat: 1.130, "hat:open": 0.830,
  "sample:cat": 0.495, "sample:static": 1.193, "sample:whoosh": 1.206, "sample:geiger": 1.956,
};

function level(wave, voice, fx) {
  const key = voice === "sample"
    ? `sample:${fx.sample || "static"}`
    : voice === "hat" && fx.open ? "hat:open" : voice;
  const trim = LOUDNESS[key] ?? 1;
  if (trim === 1) return wave;
  const out = new Float32Array(wave.length);
  for (let i = 0; i < wave.length; i += 1) out[i] = wave[i] * trim;
  return out;
}

function synthesize(sr, freq, dur, voice, fx = {}) {
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
      return stiffString(sr, f, d, STRINGS.guitar);
    case "harp":
      return stiffString(sr, f, d, STRINGS.harp);
    case "pizz":
    case "pluck":
      return stiffString(sr, f, Math.min(d, 0.7), STRINGS.pizz);
    case "bass":
      return stiffString(sr, f, d, STRINGS.bass);
    case "piano":
      return pianoNote(sr, f, d, fx.strike);
    case "epiano":
      return cantilever(sr, f, d, 280, 1.2);
    case "kalimba":
      return cantilever(sr, f, d, 350, 1.4);
    case "strings":
    case "cello":
    case "bowedmetal":
      return bow(sr, f, d, { position: 0.127236, slope: 3, velocity: 1 });
    case "winds":
      return flute(sr, f, d, { noise: 0.15, vib: 5.925, vibGain: 0.05, pressure: 0.85, attack: 0.04 });
    case "choir":
      return choir(sr, f, d, fx.vowel || "a");
    case "organ":
      return openPipe(sr, f, d);
    case "theremin":
      return tone(sr, f, d, [{ ratio: 1, amp: 1 }]);
    case "pilot":
      return tone(sr, f, d, [{ ratio: 1, amp: 0.85 }, { ratio: 0.5, amp: 0.2 }]);
    case "reverse": {
      const waved = bow(sr, f, Math.max(0.4, d), { position: 0.127236, slope: 3, velocity: 1 });
      waved.reverse();
      return waved;
    }
    case "vibes":
      // STK tuned-bar frequencies. 0.999 is that preset's round-trip gain.
      return tunedBar(sr, f, d, 0.999, 2.8);
    case "marimba":
      return faustMarimba(sr, f, d);
    case "celesta":
      return tunedBar(sr, f, d, 0.996, 1.6);
    case "glass":
    case "glassbell":
      return loopModes(sr, f, d, GLASS_HARMONICA, GLASS_HARMONICA.map((_, i) => 0.999 ** (i + 1)), 2.2);
    case "bowl":
      return loopModes(sr, f, d, TIBETAN_BOWL, BOWL_GAINS, 3.4, BOWL_EXC);
    case "gong":
      return resonator(sr, f, d, BELL, 400, { ring: 2.4 });
    case "kick":
    case "thump":
      return resonator(sr, 52, 0.4, MEMBRANE, 14, { ring: 0.35, chirp: 0.8, amps: [1, 0.35, 0.15, 0.08, 0.05, 0.03], peak: 0.55 });
    case "snare":
      return snare(sr);
    case "tom":
      return resonator(sr, f, 0.45, MEMBRANE, 22, { ring: 0.5, chirp: 0.15 });
    case "hat":
      return resonator(sr, fx.open ? 2600 : 3400, fx.open ? 0.32 : 0.08, BELL, fx.open ? 650 : 270, { ring: fx.open ? 0.45 : 0.12, peak: 0.4 });
    case "clave":
    case "woodblock":
      return resonator(sr, voice === "clave" ? 2100 : f, 0.2, BAR, 40, { ring: 0.2, amps: [1, 0.3, 0.08, 0.03] });
    case "tick":
      return burst(sr, 0.02, 4200, 2.4);
    case "shaker":
      return burst(sr, 0.09, 6000, 0.7);
    case "noise":
      return burst(sr, Math.min(2, d + 0.2), Math.max(200, f), 0.8);
    case "ksdrum":
      return resonator(sr, f, 0.4, MEMBRANE, 16, { ring: 0.45, chirp: 0.35 });
    default:
      return null;
  }
}

export function renderVoice(sr, freq, dur, voice, fx = {}) {
  const wave = synthesize(sr, freq, dur, voice, fx);
  return wave && level(wave, voice, fx);
}

export function modal(sr, freq, dur, opt = {}) {
  const ratios = opt.modes || BAR;
  const q = opt.q ?? 200;
  return resonator(sr, freq, dur, ratios, q, {
    ring: opt.ring ?? 1.2,
    amps: opt.amps,
    chirp: opt.pitchDrop || 0,
    peak: opt.peak ?? 0.45,
  });
}

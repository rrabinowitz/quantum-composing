// Amplitudes you can hear: interference, pitch width, temperature halos,
// overlap with a spectrum, a sum over lengths, and a commutator.
import { degMidi, op, SPECTRA, LATTICE } from "./world.js";
import { nodeOf, nameOf } from "./lattice.js";

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export function phasorSum(parts) {
  let re = 0;
  let im = 0;
  let power = 0;
  for (const p of parts) {
    if (!p || !(p.mag > 0)) continue;
    const a = ((p.phase || 0) * Math.PI) / 180;
    re += p.mag * Math.cos(a);
    im += p.mag * Math.sin(a);
    power += p.mag;
  }
  const mag = Math.hypot(re, im);
  const cancel = power > 0 ? 1 - mag / power : 0;
  return {
    mag,
    beatHz: cancel > 0.12 ? 1.2 + 5 * cancel : 0,
    beatDepth: cancel > 0.12 ? Math.min(0.65, cancel) : 0,
  };
}

/** Pitches within `cents` semitones share one oscillator. members are spectrum indexes. */
export function groupPitches(items, cents = 0.2) {
  const groups = [];
  for (const item of items) {
    const hit = groups.find((g) => Math.abs(g.midi - item.midi) <= cents);
    if (hit) {
      hit.midi = (hit.midi * hit.members.length + item.midi) / (hit.members.length + 1);
      if (!hit.members.includes(item.index)) hit.members.push(item.index);
    } else groups.push({ midi: item.midi, members: [item.index] });
  }
  return groups;
}

function scenic(n) {
  return n && n.role !== "fx" && n.role !== "drum" && n.voice !== "sample" && n.voice !== "tick";
}

function mergeCluster(cluster) {
  if (cluster.length === 1) return cluster[0];
  let re = 0;
  let im = 0;
  let midi = 0;
  let weight = 0;
  let dur = 0;
  for (const n of cluster) {
    const ph = (((n.fx && n.fx.phase) || 0) * Math.PI) / 180;
    re += n.vel * Math.cos(ph);
    im += n.vel * Math.sin(ph);
    midi += n.midi * Math.max(n.vel, 1e-6);
    weight += Math.max(n.vel, 1e-6);
    dur = Math.max(dur, n.dur || 0);
  }
  const vel = Math.hypot(re, im);
  const base = cluster[0];
  const freqs = cluster.map((n) => mtof(n.midi));
  const df = Math.max(...freqs) - Math.min(...freqs);
  const fx = { ...(base.fx || {}) };
  if (df > 0.4) fx.beatHz = Math.min(14, df);
  fx.phase = (Math.atan2(im, re) * 180) / Math.PI;
  if (vel < 0.004) return null;
  return { ...base, midi: weight ? midi / weight : base.midi, vel, dur, fx };
}

/** Notes that share a pitch, a voice, a role, and an onset add as complex amplitudes. */
export function interfere(notes) {
  const musical = [];
  const other = [];
  notes.forEach((n) => (scenic(n) ? musical : other).push(n));
  const taken = new Array(musical.length).fill(false);
  const out = [];
  for (let i = 0; i < musical.length; i++) {
    if (taken[i]) continue;
    const cluster = [musical[i]];
    taken[i] = true;
    for (let j = i + 1; j < musical.length; j++) {
      if (taken[j]) continue;
      const a = musical[i];
      const b = musical[j];
      if (a.voice !== b.voice || a.role !== b.role) continue;
      if (Math.abs(a.t - b.t) > 0.05) continue;
      // A syntonic comma is about 0.215 semitone. Closer than 8 cents is one partial; a comma stays two.
      if (Math.abs(a.midi - b.midi) > 0.08) continue;
      cluster.push(b);
      taken[j] = true;
    }
    const merged = mergeCluster(cluster);
    if (merged) out.push(merged);
  }
  return out.concat(other);
}

const pool = [];
for (let d = -20; d <= 32; d++) pool.push(degMidi(d));
pool.sort((a, b) => a - b);

export function neighborMidis(midi, steps) {
  const below = pool.filter((m) => m < midi - 0.35);
  const above = pool.filter((m) => m > midi + 0.35);
  const out = [];
  for (let i = 0; i < steps; i++) {
    if (below.length > i) out.push(below[below.length - 1 - i]);
    if (above.length > i) out.push(above[i]);
  }
  return out;
}

/**
 * Short tones occupy neighboring ratios. A high watching value chops the duration,
 * which widens the pitch. hold is how long this instrument actually rings.
 */
export function widen(midi, dur, hold, watching = 0) {
  const d = watching > 0 ? Math.max(0.06, dur * (1 - 0.72 * watching)) : dur;
  const sounding = Math.min(d, hold || d);
  const steps = sounding < 0.16 ? 2 : sounding < 0.45 ? 1 : 0;
  return { dur: d, midis: steps ? neighborMidis(midi, steps) : [] };
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** Tenney distance log2(n·d) of an octave-reduced ratio. The fraction is the closest one with n, d ≤ 96. */
export function tenneyHd(ratio) {
  let x = Math.abs(ratio);
  if (!(x > 0) || !Number.isFinite(x)) return 99;
  while (x >= 2) x /= 2;
  while (x < 1) x *= 2;
  let best = 99;
  let err = 1e9;
  for (let n = 1; n <= 96; n++) {
    for (let d = 1; d <= 96; d++) {
      if (gcd(n, d) !== 1) continue;
      const r = n / d;
      if (r < 1 || r >= 2) continue;
      const cents = Math.abs(1200 * Math.log2(r / x));
      if (cents < err) { err = cents; best = Math.log2(n * d); }
    }
  }
  return best;
}

/**
 * Halo loudness is 1 / log2(n·d) of the interval from the chosen pitch.
 * A cold temperature (T ≤ 0.05) drops the halo. Leap size is not part of this weight.
 */
export function tenneyHalo(chosenMidi, candMidis, T, keep = 2) {
  if (!(T > 0.05) || !candMidis || !candMidis.length) return [];
  return candMidis
    .map((midi) => {
      const hd = tenneyHd(2 ** ((midi - chosenMidi) / 12));
      return { midi, hd, w: hd > 0.05 ? 1 / hd : 0 };
    })
    .filter((x) => x.w > 0 && Math.abs(x.midi - chosenMidi) > 0.04)
    .sort((a, b) => a.hd - b.hd)
    .slice(0, keep);
}

export function nearMisses(cands, E, T, chosen, keep = 2) {
  if (!cands.length) return [];
  const e = cands.map(E);
  const i0 = cands.findIndex((c) => Math.abs(c - chosen) < 1e-6);
  if (i0 < 0) return [];
  const hot = Math.max(0.05, T);
  return cands
    .map((c, i) => ({ c, w: Math.exp(-(e[i] - e[i0]) / hot) }))
    .filter((x) => Math.abs(x.c - chosen) > 0.04 && x.w >= 0.18 && x.w < 0.995)
    .sort((a, b) => b.w - a.w)
    .slice(0, keep);
}

export function overlap(midi, toneMidis) {
  if (!toneMidis || !toneMidis.length) return 0;
  let best = 99;
  for (const t of toneMidis) {
    const raw = Math.abs(t - midi) % 12;
    best = Math.min(best, Math.min(raw, 12 - raw));
  }
  if (best >= 0.5) return 0;
  return 1 - best / 0.5;
}

export function nearestMidi(midi, toneMidis) {
  let best = toneMidis[0];
  let bd = 99;
  for (const t of toneMidis) {
    for (let o = -3; o <= 3; o++) {
      const m = t + 12 * o;
      const d = Math.abs(m - midi);
      if (d < bd) { bd = d; best = m; }
    }
  }
  return best;
}

export function splitOverlap(midi, vel, toneMidis) {
  const ov = overlap(midi, toneMidis);
  const nearest = nearestMidi(midi, toneMidis);
  const beat = Math.abs(mtof(midi) - mtof(nearest));
  return {
    overlap: ov,
    inside: ov > 0.08 ? vel * ov : 0,
    outside: ov < 0.92 ? vel * (1 - ov) : 0,
    beatHz: beat > 0.3 ? Math.min(14, beat) : 0,
  };
}

/**
 * Every length sounds up to the measured cut. Bars that every length shares add in phase.
 * Bars that only some lengths reach take each length's phase, so they can cancel.
 */
export function lengthSuperposition(barNotes, options, chosenBars) {
  const out = [];
  let cut = false;
  const n = options.length || 1;
  barNotes.forEach((notes, k) => {
    if (k >= chosenBars) { cut = true; return; }
    const live = options.map((o, i) => ({ o, i })).filter(({ o }) => o.bars > k);
    if (!live.length) return;
    const everyone = live.length === n;
    for (const { i, o } of live) {
      const phase = everyone ? 0 : (i * 360) / n;
      const amp = Math.sqrt(o.p || 0) || 0;
      for (const note of notes) {
        out.push({ ...note, vel: note.vel * amp, fx: { ...(note.fx || {}), phase } });
      }
    }
  });
  if (options.some((o) => o.bars > chosenBars)) cut = true;
  return { notes: out, cut };
}

export function commuteTheme(theme) {
  const ab = op(op(theme, "excite"), "mirror");
  const ba = op(op(theme, "mirror"), "excite");
  return {
    line: ab.map((d, i) => (d === ba[i] ? null : d)),
    extra: ba.map((d, i) => (d !== ab[i] && d != null ? d : null)),
  };
}

const LATTICE_STEPS = ["fifth", "third", "quality"];
export const latticeStep = (kind) => LATTICE_STEPS.includes(kind);

function latticeIndex(a, b, q) {
  return LATTICE.findIndex((n) => SPECTRA[n].a === a && SPECTRA[n].b === b && SPECTRA[n].q === q);
}

function stepNeighbors(i, kind) {
  const s = SPECTRA[LATTICE[i]];
  const want = kind === "fifth"
    ? [[s.a + 1, s.b, s.q], [s.a - 1, s.b, s.q]]
    : kind === "third"
      ? [[s.a, s.b + 1, s.q], [s.a, s.b - 1, s.q]]
      : [[s.a, s.b, s.q === "+" ? "−" : "+"]];
  return want.map(([a, b, q]) => latticeIndex(a, b, q)).filter((j) => j >= 0);
}

function stepCoord(i, kind) {
  const s = SPECTRA[LATTICE[i]];
  if (kind === "fifth") return s.a;
  if (kind === "third") return s.b;
  return s.q === "+" ? 1 : -1;
}

/**
 * [X, H] for one lattice step. X is the fifth, the third, or the quality.
 * A node that does not move is silent. Its neighbors sound, weighted by how far the coordinate jumped.
 */
export function latticeResidue(spec, kind) {
  const N = LATTICE.length;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (const s of spec) {
    const i = nodeOf(s.name);
    if (i < 0) continue;
    const a = ((s.phase || 0) * Math.PI) / 180;
    re[i] += (s.mag || 0) * Math.cos(a);
    im[i] += (s.mag || 0) * Math.sin(a);
  }
  const outRe = new Float64Array(N);
  const outIm = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    if (re[j] === 0 && im[j] === 0) continue;
    const xj = stepCoord(j, kind);
    for (const i of stepNeighbors(j, kind)) {
      const w = xj - stepCoord(i, kind);
      outRe[i] += w * re[j];
      outIm[i] += w * im[j];
    }
  }
  const out = [];
  for (let i = 0; i < N; i++) {
    const mag = Math.hypot(outRe[i], outIm[i]);
    if (mag < 1e-6) continue;
    out.push({ name: nameOf(i), mag, phase: (Math.atan2(outIm[i], outRe[i]) * 180) / Math.PI });
  }
  return out;
}

/** |HZ|0⟩ − ZH|0⟩| on one qubit. The surviving weight is the state that moved. */
export function hzResidue() {
  const r2 = Math.SQRT1_2;
  const hz = [r2, r2];
  const zh = [r2, -r2];
  return hz.map((re, k) => ({ k, mag: Math.abs(re - zh[k]) }));
}

/** Close basis states beat at their frequency difference. Far ones pulse with their phase difference. */
export function nearestBeat(notes) {
  for (const n of notes) {
    let best = null;
    let bd = 1e9;
    for (const m of notes) {
      if (m === n) continue;
      const d = Math.abs(m.midi - n.midi);
      if (d > 0.02 && d < bd) { bd = d; best = m; }
    }
    if (!best) continue;
    const df = Math.abs(mtof(n.midi) - mtof(best.midi));
    const dph = Math.abs((((n.fx && n.fx.phase) || 0) - ((best.fx && best.fx.phase) || 0)) * Math.PI / 180);
    const ang = Math.min(dph, 2 * Math.PI - dph);
    n.fx = n.fx || {};
    n.fx.beatHz = df >= 0.4 && df <= 14 ? df : 0.6 + 6 * (ang / Math.PI);
  }
  return notes;
}

// Orchestration after Rimsky-Korsakov: tessitura, balance, doubling,
// how long a voice can hold, spacing of the chord, and rescoring.
import { S } from "./world.js";

/** good = the register where the tone is characteristic. possible = it can speak. hold = seconds a single attack lasts. carry = how easily it covers another part. */
const T = {
  organ: { good: [48, 79], possible: [36, 96], hold: 8, carry: 1, double: "pizz", held: "organ" },
  strings: { good: [55, 81], possible: [43, 93], hold: 8, carry: 0.95, double: "winds", held: "strings" },
  cello: { good: [36, 62], possible: [28, 74], hold: 8, carry: 0.85, double: "winds", held: "cello" },
  bowedmetal: { good: [55, 81], possible: [43, 93], hold: 8, carry: 0.9, double: "winds", held: "strings" },
  winds: { good: [60, 81], possible: [48, 93], hold: 8, carry: 0.7, double: "strings", held: "winds" },
  choir: { good: [48, 72], possible: [40, 81], hold: 8, carry: 0.9, double: "strings", held: "choir" },
  theremin: { good: [55, 86], possible: [40, 96], hold: 8, carry: 0.6, double: "strings", held: "theremin" },
  glass: { good: [67, 91], possible: [53, 98], hold: 2, carry: 0.65, double: "strings", held: "glass" },
  glassbell: { good: [67, 91], possible: [53, 98], hold: 2, carry: 0.45, double: "strings", held: "glass" },
  bowl: { good: [46, 70], possible: [36, 82], hold: 3.2, carry: 0.75, double: "cello", held: "cello" },
  gong: { good: [36, 60], possible: [28, 72], hold: 2.4, carry: 0.8, double: "cello", held: "cello" },
  piano: { good: [36, 84], possible: [24, 96], hold: 2, carry: 0.55, double: "strings", held: "strings" },
  epiano: { good: [48, 84], possible: [36, 96], hold: 1.2, carry: 0.5, double: "winds", held: "strings" },
  harp: { good: [48, 84], possible: [36, 91], hold: 1.4, carry: 0.4, double: "winds", held: "strings" },
  guitar: { good: [50, 76], possible: [40, 84], hold: 1.2, carry: 0.4, double: "winds", held: "strings" },
  pizz: { good: [48, 74], possible: [38, 86], hold: 0.8, carry: 0.3, double: "organ", held: "strings" },
  pluck: { good: [48, 74], possible: [38, 86], hold: 0.8, carry: 0.3, double: "organ", held: "strings" },
  vibes: { good: [58, 88], possible: [46, 96], hold: 2.5, carry: 0.45, double: "winds", held: "glass" },
  celesta: { good: [72, 96], possible: [60, 103], hold: 1.2, carry: 0.4, double: "winds", held: "glass" },
  kalimba: { good: [60, 84], possible: [48, 91], hold: 0.6, carry: 0.28, double: "harp", held: "glass" },
  marimba: { good: [55, 79], possible: [40, 88], hold: 0.1, carry: 0.25, double: "organ", held: "organ" },
  bass: { good: [28, 48], possible: [24, 55], hold: 1.6, carry: 0.7, double: "cello", held: "cello" },
  reverse: { good: [55, 81], possible: [43, 93], hold: 8, carry: 0.85, double: "glass", held: "strings" },
  pilot: { good: [55, 86], possible: [40, 96], hold: 8, carry: 0.55, double: "strings", held: "theremin" },
  woodblock: { good: [60, 84], possible: [48, 96], hold: 0.12, carry: 0.2, double: "organ", held: "organ" },
  clave: { good: [60, 90], possible: [48, 100], hold: 0.08, carry: 0.15, double: "organ", held: "organ" },
  thump: { good: [30, 48], possible: [24, 60], hold: 0.3, carry: 0.4, double: "cello", held: "cello" },
};

export const READOUT_VOICES = ["bowl", "gong", "vibes", "celesta", "woodblock", "clave", "thump"];
export const SCORE_VOICES = Object.keys(T).filter((k) => k !== "woodblock" && k !== "clave" && k !== "thump");

const info = (voice) => T[voice];

function copy(n) {
  return { ...n, fx: n.fx ? { ...n.fx } : n.fx };
}

function scenic(n) {
  return n && n.role !== "fx" && n.role !== "drum" && n.voice !== "sample" && n.voice !== "tick";
}

function tuneRole(n) {
  return n.role === "mel" || (n.role === "theme" && n.line !== "B");
}

function innerRole(n) {
  return n.role === "ctr" || n.role === "cp" || n.role === "chord" || (n.role === "theme" && n.line === "B");
}

/** Fold midi by octaves into [lo, hi]. */
export function fold(midi, lo, hi) {
  let m = midi;
  let guard = 0;
  while (m < lo - 0.4 && guard < 8) { m += 12; guard += 1; }
  while (m > hi + 0.4 && guard < 16) { m -= 12; guard += 1; }
  return m;
}

function fitPitch(n) {
  const band = info(n.voice);
  if (!band || n.fx?.octaveCopy) return n.midi;
  const wide = n.world != null;
  const [lo, hi] = !wide && tuneRole(n) ? band.good : band.possible;
  let m = fold(n.midi, lo, hi);
  if (n.role === "bass") {
    while (m - 12 >= band.possible[0] && m > 52) m -= 12;
  }
  return m;
}

function overlaps(a, b) {
  return a.t < b.t + b.dur - 0.01 && b.t < a.t + a.dur - 0.01;
}

function space(notes) {
  const basses = notes.filter((n) => n.role === "bass");
  const chords = notes.filter((n) => n.role === "chord");
  for (const n of chords) {
    const under = basses.filter((b) => overlaps(b, n));
    if (!under.length) continue;
    const floor = Math.min(...under.map((b) => b.midi));
    const hi = info(n.voice)?.possible[1] ?? 108;
    while (n.midi < floor + 11.5 && n.midi + 12 <= hi + 0.4) n.midi += 12;
  }
  for (const n of notes) {
    if (!tuneRole(n)) continue;
    const over = chords.filter((c) => overlaps(c, n));
    if (!over.length) continue;
    const top = Math.max(...over.map((c) => c.midi));
    const hi = info(n.voice)?.possible[1] ?? 108;
    while (n.midi <= top + 0.4 && n.midi + 12 <= hi + 0.4) n.midi += 12;
  }
}

function rescoreVoice(n) {
  const mode = S.orch.rescore;
  if (!scenic(n) || mode === "score") return n.voice;
  const map = mode === "hand" ? S.orch.hand : S.orch.palette;
  if (!map) return n.voice;
  if (tuneRole(n)) return map.mel || n.voice;
  if (n.role === "ctr" || (n.role === "theme" && n.line === "B")) return map.ctr || n.voice;
  if (n.role === "cp") return map.cp || n.voice;
  if (n.role === "chord") return map.chord || n.voice;
  if (n.role === "bass") return map.bass || n.voice;
  return n.voice;
}

function holdOf(voice) {
  return info(voice)?.hold ?? 8;
}

function applyLength(n) {
  const hold = holdOf(n.voice);
  if (!scenic(n) || n.dur <= hold + 0.03) return [n];
  if (S.orch.longNotes === "held") {
    const next = info(n.voice)?.held || "organ";
    const swapped = next === n.voice ? n : { ...n, voice: next };
    const again = holdOf(swapped.voice);
    if (swapped.dur <= again + 0.03) return [swapped];
    return slice(swapped, again);
  }
  return slice(n, hold);
}

function slice(n, hold) {
  const step = Math.max(0.08, hold);
  const out = [];
  let t = n.t;
  const end = n.t + n.dur;
  while (t < end - 0.02) {
    const dur = Math.min(step, end - t);
    out.push({ ...n, t, dur });
    t += dur;
  }
  return out.length ? out : [n];
}

function balance(notes) {
  const o = S.orch;
  const gain = { tune: o.tune / 80, inner: o.inner / 80, bass: o.bass / 80 };
  for (const n of notes) {
    if (!scenic(n)) continue;
    const key = n.role === "bass" ? "bass" : tuneRole(n) ? "tune" : innerRole(n) ? "inner" : null;
    if (!key) continue;
    if (key !== "tune") {
      const tunes = notes.filter((m) => tuneRole(m) && overlaps(m, n) && !m.double);
      if (tunes.length) {
        const melCarry = Math.min(...tunes.map((m) => info(m.voice)?.carry ?? 0.5));
        const mine = info(n.voice)?.carry ?? 0.5;
        if (mine > melCarry) n.vel *= Math.max(0.5, melCarry / mine);
        if (tunes.some((m) => m.voice === n.voice)) n.vel *= 0.6;
      }
    } else {
      const c = info(n.voice)?.carry ?? 0.5;
      if (c < 0.5) n.vel *= Math.min(1.25, 0.45 / c);
    }
    n.vel *= gain[key];
    if (n.vel > 0.45) n.vel = 0.45;
  }
}

function partner(voice) {
  const named = info(voice)?.double;
  if (named && named !== voice) return named;
  return voice === "winds" ? "strings" : "winds";
}

function doubleOf(n) {
  const key = n.role === "bass" ? "bassDouble" : tuneRole(n) ? "tuneDouble" : innerRole(n) ? "innerDouble" : null;
  const kind = key ? S.orch[key] : "bare";
  if (!scenic(n) || n.double || !kind || kind === "bare") return null;
  const voice = partner(n.voice);
  let midi = n.midi;
  if (kind === "octave") {
    const band = info(voice);
    const up = n.midi + 12;
    const down = n.midi - 12;
    if (band && up <= band.possible[1] + 0.4 && up >= band.possible[0] - 0.4) midi = up;
    else if (band && down >= band.possible[0] - 0.4) midi = down;
    else midi = up;
  }
  return {
    ...n,
    midi,
    voice,
    vel: n.vel * 0.72,
    double: true,
    fx: { ...(n.fx || {}), pan: n.fx && n.fx.pan ? -n.fx.pan * 0.5 : 0.35 },
  };
}

function admitted(n, total) {
  if (S.orch.chairs !== "grow" || !total) return true;
  if (!scenic(n) && n.role !== "drum") return true;
  const p = n.t / total;
  const stage = p < 0.25 ? 1 : p < 0.5 ? 2 : p < 0.75 ? 3 : 4;
  if (n.role === "bass" || n.role === "chord") return stage >= 1;
  if (n.role === "ctr" || n.role === "cp" || (n.role === "theme" && n.line === "B")) return stage >= 2;
  if (tuneRole(n)) return stage >= 3;
  if (n.role === "drum") return stage >= 4;
  return true;
}

/**
 * Dress a note list.
 * opt.rescore, opt.spacing, opt.chairs, opt.balance, opt.doubling, opt.length, opt.tessitura default on.
 * opt.total is the length of the piece, used when chairs admit one by one.
 */
export function dress(notes, opt = {}) {
  const total = opt.total ?? notes.reduce((m, n) => Math.max(m, n.t + (n.dur || 0)), 0);
  let list = notes.map(copy);
  if (opt.rescore !== false) list.forEach((n) => { n.voice = rescoreVoice(n); });
  if (opt.tessitura !== false) list.forEach((n) => { if (scenic(n)) n.midi = fitPitch(n); });
  if (opt.spacing !== false) space(list.filter(scenic));
  if (opt.length !== false) list = list.flatMap((n) => (scenic(n) ? applyLength(n) : [n]));
  const musical = list.some((n) => scenic(n) && n.role !== "readout");
  if (opt.chairs !== false && musical) list = list.filter((n) => admitted(n, total));
  if (opt.balance !== false) balance(list);
  if (opt.doubling !== false) {
    const extra = [];
    for (const n of list) {
      const d = doubleOf(n);
      if (d) extra.push(d);
    }
    list = list.concat(extra);
  }
  return list;
}

export function dressRegister(notes, total) {
  return dress(notes, { total, rescore: false, spacing: false, chairs: false });
}

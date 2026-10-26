// The bar-by-bar composer and the interpretation's sonic colouring.
import { S, pal, tonesOf, voicing, degMidi, rToMidi, op, contains } from "./world.js";
import { odds, draw, look, rand, born, pass, entropy } from "./ket.js";
import { Walk, nameOf, nodeOf } from "./lattice.js";
import { vary, counterVoice, rhythmFor } from "./boltzmann.js";

const pack = (name, w = 1) => ({ name, w, tones: tonesOf(name) });
const VOW = ["o", "a", "e", "u"];
const CP_RANGE = [[45, 60], [38, 52], [60, 74], [64, 80]];
const STATIC = ["D+", "G+", "A+", "D+"];

// nearest-motion voice leading for the upper voices
export function lead(prev, tones, lo = 50, hi = 74) {
  const want = tones.slice(0, 3).map(rToMidi);
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  let best = null, bc = 1e9;
  for (const p of perms) {
    const v = prev.map((f, k) => { let m = want[p[k]]; while (m - f > 6) m -= 12; while (f - m > 6) m += 12; while (m < lo) m += 12; while (m > hi) m -= 12; return m; });
    const cost = v.reduce((a, m, k) => a + Math.abs(m - prev[k]), 0);
    if (cost < bc) { bc = cost; best = v; }
  }
  return best.sort((a, b) => a - b);
}
const bassOf = (prev, tones) => { let m = rToMidi(tones[0]) - 24; while (m - prev > 6) m -= 12; while (prev - m > 6) m += 12; while (m < 34) m += 12; while (m > 50) m -= 12; return m; };

export function composer(bar0, src = S.hsrc, totalBars = 16) {
  const Q = S.q, mode = Q.mode, P = pal();
  const walk = src === "lattice" ? new Walk(S.spec) : null;
  let upper = [57, 62, 66], bass = 38, b = 0, last = null, since = 9;
  const cpPrev = [55, 45, 66, 70], melPrev = [74], belief = new Map();
  const nameFor = walk ? nameOf : (i) => S.spec[i].name;
  const probs = () => (walk ? walk.probs() : odds(S.spec));
  let future = null;
  if (mode === "transactional" && src !== "static") {
    // the confirmation wave: compose from the final spectrum backwards
    future = [];
    if (walk) { const p0 = walk.probs(); let k = p0.indexOf(Math.max(...p0)); const back = new Walk([{ name: nameOf(k), mag: 1, phase: 0 }]); for (let i = 0; i < totalBars; i++) { future.push(pack(nameOf(k))); back.evolve(S.spread); k = draw(back.probs()); back.collapse(k); } }
    else { const p = odds(S.spec), home = p.indexOf(Math.max(...p)); for (let i = 0; i < totalBars; i++) future.push(pack(S.spec[i ? draw(p) : home].name)); }
    future.reverse();
  }
  function harmony(c, collapsing) {
    if (src === "static") return [pack(STATIC[b % 4])];
    if (future) return [future[Math.min(b, future.length - 1)]];
    if (walk) { walk.evolve(mode === "zeno" ? S.spread * (1 - Q.zeno) : S.spread); if (mode === "decoherence") walk.dephase(1 - c); }
    let p = probs();
    if (mode === "relational" || mode === "qbism") {
      if (mode === "qbism") { const tot = [...belief.values()].reduce((a, x) => a + x, 0); if (tot) p = p.map((x, i) => 0.45 * x + 0.55 * ((belief.get(i) || 0) / tot)); }
      const k = draw(p); if (walk) walk.collapse(k); belief.set(k, (belief.get(k) || 0) + 1);
      const r = pack(nameFor(k)); if (mode === "relational") r.obs = { mel: pack(nameFor(draw(p))), cp: pack(nameFor(draw(p))) };
      return [r];
    }
    const all = () => p.map((w, i) => ({ i, w })).filter((x) => x.w > 0.05).sort((x, y) => y.w - x.w).slice(0, 4);
    const one = () => { const k = mode === "zeno" ? look(p, last) : draw(p); last = k; if (walk) walk.collapse(k); return [{ i: k, w: 1 }]; };
    let h;
    if (mode === "mwi") h = all();
    else if (mode === "grw") h = collapsing ? one() : !walk && last != null ? [{ i: last, w: 1 }] : all();
    else if (mode === "decoherence") { const k = draw(p); if (c < 0.3) { if (walk) walk.collapse(k); h = [{ i: k, w: 1 }]; } else h = all().map((x) => ({ i: x.i, w: c * x.w + (1 - c) * (x.i === k ? 1 : 0) })); }
    else h = one();
    const tot = h.reduce((a, x) => a + x.w, 0) || 1;
    return h.map((x) => pack(nameFor(x.i), x.w / tot));
  }

  return function next(A8, B8, t0, barLen) {
    const bar = barLen || bar0, e8 = bar / 8;
    const c = mode === "decoherence" ? Math.exp(-Q.gamma * b) : 1;
    const collapsing = mode === "grw" && rand() < Q.grw;
    since = collapsing ? 0 : since + 1;
    const W = mode === "mwi" ? Math.min(4, 1 + Math.floor(b / 2)) : 1;
    const h = harmony(c, collapsing), main = h.reduce((a, x) => (x.w > a.w ? x : a));
    const T = { copenhagen: 0.35, mwi: 0.9, zeno: 0.25, decoherence: 0.15 + 2.4 * c, pilot: 0.5, grw: collapsing ? 0.2 : Math.min(2.5, 0.4 + 0.5 * since), relational: 0.6, qbism: 1.2 / (1 + 0.25 * b), transactional: 0.45 }[mode];
    const melH = main.obs ? main.obs.mel : main, cpH = main.obs ? main.obs.cp : main, stick = mode === "zeno" ? Q.zeno : 0;
    const cold = mode === "decoherence" && c < 0.3, fx = (x = {}) => (mode === "decoherence" ? { coh: c, ...x } : x);
    const melV = cold ? "harp" : P.mel, cpV = cold ? "harp" : P.cp, notes = [];
    const cantus = new Array(8).fill(null);
    for (let k = 0; k < W; k++) {
      const reg = [0, 12, -12, 24][k], vel = 0.16 / Math.sqrt(W), world = W > 1 ? k : undefined;
      if (A8) vary(A8, melH.tones, T, stick).forEach((d, s) => {
        if (d == null) return; const m = degMidi(d) + 12 + reg; if (!k) cantus[s] = m;
        notes.push({ midi: m, t: t0 + s * e8, dur: e8 * 0.92, voice: melV, vel, role: "mel", world, fx: fx({ vowel: VOW[k], pan: W > 1 ? -0.8 + (1.6 * k) / (W - 1) : 0 }) });
      });
      else {
        const g = counterVoice({ cantus: null, tones: melH.tones, rhythm: rhythmFor(mode === "copenhagen" ? "pilot" : mode, { world: k + 1, c, collapsing, since }), prev: melPrev[0] + reg, range: [70 + reg, 88 + reg], T, stick });
        if (!k) melPrev[0] = g.last;
        g.notes.forEach((n) => { if (!k) for (let s = n.s; s < n.s + n.len; s++) cantus[s] = n.midi; notes.push({ midi: n.midi, t: t0 + n.s * e8, dur: n.len * e8 * 0.95, voice: melV, vel, role: "mel", world, fx: fx({ vowel: VOW[k], pan: W > 1 ? -0.8 + (1.6 * k) / (W - 1) : 0 }) }); });
      }
    }
    if (B8) vary(B8, main.tones, T, stick).forEach((d, s) => { if (d != null) notes.push({ midi: degMidi(d), t: t0 + s * e8, dur: e8 * 0.92, voice: P.ctr, vel: 0.1, role: "ctr", fx: fx({ vowel: "o", pan: 0.3 }) }); });
    const nCp = mode === "mwi" ? W : mode === "grw" && collapsing ? 2 : 1;
    for (let k = 0; k < nCp; k++) {
      const contour = mode === "pilot" ? (s) => 56 + 8 * Math.sin((2 * Math.PI * (b * 8 + s)) / 20) : null;
      const g = counterVoice({ cantus, tones: cpH.tones, rhythm: rhythmFor(mode, { world: k, c, collapsing, since }), prev: cpPrev[k], range: CP_RANGE[k], T, stick, contour });
      cpPrev[k] = g.last;
      g.notes.forEach((n) => notes.push({ midi: n.midi, t: t0 + n.s * e8, dur: n.len * e8 * (mode === "zeno" ? 1.05 : 0.95), voice: cpV, vel: 0.1 / Math.sqrt(nCp), role: "cp", fx: fx({ vowel: VOW[(k + 1) % 4], glide: mode === "pilot" ? n.from : undefined, pan: -0.3 }) }));
    }
    // accompaniment
    const branches = h.map((x) => ({ ...x, v: lead(upper, x.tones) }));
    upper = lead(upper, main.tones); bass = bassOf(bass, main.tones);
    const ch = (m, t, dur, vel, extra = {}, voice = P.chord) => notes.push({ midi: m, t, dur, voice, vel, role: "chord", ...extra });
    const bs = (m, t, dur, vel, voice = P.bass, f) => notes.push({ midi: m, t, dur, voice, vel, role: "bass", fx: f });
    const fifth = bass + 12 * Math.log2(3 / 2);
    if (mode === "copenhagen") { [0, 1, 2, 1, 0, 1, 2, 1].forEach((v, s) => ch(upper[v], t0 + s * e8, e8 * 1.5, 0.05)); bs(bass, t0, bar * 0.48, 0.12); bs(fifth, t0 + bar / 2, bar * 0.45, 0.1); }
    else if (mode === "mwi") { branches.forEach((x, i) => x.v.forEach((m) => ch(m, t0, bar * 1.02, 0.05 * Math.sqrt(x.w), { fx: { pan: [-0.7, 0.7, 0, -0.35][i % 4] } }))); bs(bass, t0, bar, 0.1); }
    else if (mode === "zeno") { [0, 4].forEach((s) => upper.forEach((m) => ch(m, t0 + s * e8, bar * 0.55, 0.045))); bs(bass, t0, bar * 1.05, 0.1); }
    else if (mode === "decoherence") {
      if (rand() < c) for (let s = 0; s < 16; s++) { const x = branches[Math.floor(rand() * branches.length)]; ch(x.v[Math.floor(rand() * 3)] + (rand() - 0.5) * c, t0 + s * (bar / 16), bar / 8, 0.04 * Math.sqrt(x.w), { fx: fx() }); }
      else [0, 1, 2, 1].forEach((v, q) => ch(upper[v], t0 + q * 2 * e8, e8 * 1.8, 0.06, { fx: fx() }, cold ? "harp" : P.chord));
      bs(bass, t0, bar * 0.95, 0.1, cold ? "cello" : P.bass, fx());
    } else if (mode === "pilot") { [0, 1, 2, 1, 0, 2, 1, 2].forEach((v, s) => ch(upper[v] + (s === 3 ? 12 : 0), t0 + s * e8, e8 * 2, 0.05)); bs(bass, t0, bar * 0.9, 0.12); }
    else if (mode === "grw") {
      if (collapsing) { notes.push({ midi: 36, t: t0, dur: 0.3, voice: "thump", vel: 0.13, role: "fx" }); upper.forEach((m) => ch(m - 12, t0, bar, 0.07, {}, "gong")); }
      else branches.forEach((x) => x.v.forEach((m) => ch(m, t0, bar * 1.05, 0.045 * Math.sqrt(x.w), { fx: { smear: Math.min(1, since / 3) } })));
      bs(bass, t0, bar * 0.95, collapsing ? 0.13 : 0.07);
    } else if (mode === "relational") {
      [[0, 1], [3, -1], [4, 1], [6, -1]].forEach(([s, dir]) => { const v = [bass + 12, ...upper]; (dir > 0 ? v : v.reverse()).forEach((m, j) => ch(m, t0 + s * e8 + j * 0.02, e8 * 2.4, s % 4 ? 0.04 : 0.055)); });
      bs(bass, t0, bar * 0.48, 0.1); bs(bass, t0 + bar / 2, bar * 0.45, 0.08);
    } else if (mode === "qbism") { const conf = Math.min(1, 0.4 + b * 0.08); [0, 3, 6].forEach((s) => upper.forEach((m) => ch(m, t0 + s * e8, e8 * 2.2, 0.04 * conf))); bs(bass, t0, bar * 0.6, 0.1); bs(fifth, t0 + 5 * e8, bar * 0.3, 0.07); }
    else if (mode === "transactional") { upper.forEach((m) => ch(m, t0, bar * 0.6, 0.06)); bs(bass, t0, bar * 0.95, 0.1); }
    b++;
    notes.forEach((n) => (n.gen = true));
    return { notes, h, info: { c, W, collapsing, T, obs: main.obs } };
  };
}

// A lighter harmony stream (one entry per bar; more than one = still superposed)
export function stream() {
  let b = 0, last = null;
  return () => {
    const Q = S.q, p = odds(S.spec), all = () => p.map((w, i) => ({ i, w })).filter((x) => x.w > 0.03);
    let r;
    if (Q.mode === "mwi") r = all();
    else if (Q.mode === "zeno") { last = look(p, last); r = [{ i: last, w: 1 }]; }
    else if (Q.mode === "decoherence") { const c = Math.exp(-Q.gamma * b), k = draw(p); r = p.map((w, i) => ({ i, w: c * w + (1 - c) * (i === k ? 1 : 0) })).filter((x) => x.w > 0.03); }
    else if (Q.mode === "grw") { if (last == null || rand() < Q.grw) last = draw(p); r = [{ i: last, w: 1 }]; }
    else r = [{ i: draw(p), w: 1 }];
    b++;
    return r.map((x) => ({ name: S.spec[x.i].name, w: x.w }));
  };
}
export const hLabel = (h) => h.map((x) => x.name + (h.length > 1 ? " " + Math.round(x.w * 100) + "%" : "")).join(" ⊕ ");

export function bed(h, t, dur, out, vel = 0.06) {
  h.forEach(({ name, w }) => voicing(name).forEach((m, j) => out.push({ midi: m, t, dur, voice: j ? pal().chord : pal().bass, vel: (j ? vel : vel * 1.6) * Math.sqrt(w), role: "chord" })));
  return out;
}

// ---- the interpretation's colour on plain (non-generated) notes ---------------------------
// Pair lines share one vibrato and sit mirrored in space; a pending Bell pair makes them orbit together or opposite.
export function color(notes, { bar, total, offset = 0, bell = null, ticks = false }) {
  const Q = S.q, mode = Q.mode, out = [];
  notes.forEach((n) => {
    if (n.gen) { out.push(n); return; }
    const f = { ...(n.fx || {}) };
    if (n.role === "theme") {
      const T = n.t + offset, side = n.line === "A" ? -1 : 1;
      if (bell) { const s = 0.75 * Math.sin((2 * Math.PI * T) / (bar * 2)); f.pan = n.line === "A" || bell.type === "phi" ? s : -s; }
      else f.pan = side * (S.linked ? 0.55 : 0.2);
      f.vib = S.linked ? "shared" : n.line === "A" ? 4.3 : 6.2;
    }
    const x = { ...n, fx: f };
    if (mode === "copenhagen") { f.smear = n.role === "chord" ? 0.5 : 0.3; out.push(x); }
    else if (mode === "mwi" && n.role === "theme") { const W = Math.min(5, 1 + Math.floor((n.t + offset) / (bar * 2))); for (let k = 0; k < W; k++) out.push({ ...x, t: n.t + k * k * 0.018, midi: n.midi + [0, 12, -12, 0, 24][k], vel: n.vel / Math.sqrt(W), fx: { ...f, pan: W > 1 ? -0.9 + (1.8 * k) / (W - 1) : f.pan, detune: (k - (W - 1) / 2) * 7 } }); }
    else if (mode === "zeno" && n.role === "theme") { const z = Q.zeno, k = 1 + Math.round(z * 3); for (let i = 0; i < k; i++) out.push({ ...x, t: n.t + (i * n.dur) / k, dur: n.dur / k, vel: n.vel * (i ? 0.6 : 1) }); }
    else if (mode === "decoherence") { const c = Math.exp(-Q.gamma * ((n.t + offset) / bar)); out.push({ ...x, fx: { ...f, coh: c, detune: (rand() - 0.5) * 40 * c } }); }
    else if (mode === "grw") { out.push({ ...x, fx: { ...f, smear: rand() < Q.grw ? 0 : 0.7 } }); }
    else if (mode === "transactional" && n.role === "theme") { out.push({ ...x, voice: "reverse" }); }
    else out.push(x);
  });
  if (ticks && mode !== "zeno") for (let t = 0; t < total; t += bar) out.push({ midi: 100, t, dur: 0.01, voice: "tick", vel: 0.04, role: "fx" });
  return out;
}

// the sound of one collapse onto a spectrum (or a split, under Many-Worlds)
export function collapseSound(h) {
  const out = [], mode = S.q.mode;
  h.forEach(({ name, w }, i) => voicing(name).forEach((m, j) => out.push({ midi: m + (j ? 12 : 0), t: j * 0.03 + i * 0.05, dur: 1.6, voice: pal().chord, vel: 0.09 * Math.sqrt(w), fx: { smear: mode === "copenhagen" ? 0.4 : 0, pan: h.length > 1 ? -0.7 + (1.4 * i) / Math.max(1, h.length - 1) : 0 } })));
  out.push({ midi: 100, t: 0, dur: 0.01, voice: mode === "grw" ? "thump" : "tick", vel: 0.06 });
  return out;
}

// ---- builders for export -----------------------------------------------------------------
export function buildSpectra(bars = 8) {
  pass(3);
  const bar = 240 / S.bpm, next = composer(bar, "spectra"), notes = [];
  for (let k = 0; k < bars; k++) notes.push(...next(S.links.pairToSpec ? S.A.slice((k % 2) * 8, (k % 2) * 8 + 8) : null, null, k * bar).notes);
  return { notes: color(notes, { bar, total: bars * bar }), total: bars * bar, bpm: S.bpm };
}
export function pairBranches(A, B, bell) {
  if (!bell) return [[A, B]];
  const tA = op(A, bell.t), tB = op(B, S.rule[bell.t]);
  if (S.q.mode === "mwi") return bell.type === "phi" ? [[A, B], [tA, tB]] : [[A, tB], [tA, B]];
  const a = draw([1, 1]), b = bell.type === "phi" ? a : 1 - a;
  return [[a ? tA : A, b ? tB : B]];
}
export function pairNotes(branches, t0, e8, hs) {
  const out = [];
  branches.forEach(([A, B]) => { for (let s = 0; s < 16; s++) { const t = t0 + s * e8, v = 0.16 / Math.sqrt(branches.length);
    if (A[s] != null) out.push({ midi: degMidi(A[s]) + 12, t, dur: e8 * 0.92, voice: pal().mel, vel: v, role: "theme", line: "A" });
    if (B[s] != null) out.push({ midi: degMidi(B[s]), t, dur: e8 * 0.92, voice: pal().ctr, vel: v, role: "theme", line: "B" }); } });
  if (hs) for (let k = 0; k < 2; k++) bed(hs(), t0 + k * 8 * e8, 8 * e8 * 0.95, out);
  return out;
}
export function buildPair(cycles = 4) {
  pass(2);
  const e8 = 30 / S.bpm, hs = S.links.specToPair ? stream() : null, notes = [];
  for (let c = 0; c < cycles; c++) notes.push(...pairNotes(pairBranches(S.A, S.B, S.bell), c * 16 * e8, e8, hs));
  const total = cycles * 16 * e8;
  return { notes: color(notes, { bar: 8 * e8, total, ticks: !!S.bell, bell: S.q.mode === "mwi" ? S.bell : null }), total, bpm: S.bpm };
}
export { entropy, born, contains, nodeOf };

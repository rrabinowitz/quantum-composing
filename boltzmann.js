// Counterpoint as statistical mechanics: every candidate pitch has an energy
// (harmonic distance from what sounds with it + the effort of the leap), and is drawn
// from the Boltzmann distribution exp(−E/T). Hot = wild, cold = strict.
import { degMidi, rToMidi, DEG_MIN, DEG_MAX } from "./world.js";
import { rand } from "./ket.js";
import { tenneyHalo } from "./physics.js";

const RAT = [];
for (let n = 1; n <= 32; n++) for (let d = 1; d <= 32; d++) { const r = n / d; if (r >= 1 && r < 2 && gcd(n, d) === 1) RAT.push([1200 * Math.log2(r), Math.log2(n * d)]); }
RAT.push([1200, 1]);
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
const memo = new Map();
// Tenney harmonic distance of an interval in semitones (octave-reduced, tolerant by a few cents)
export function hd(semis) {
  const c = Math.round(((Math.abs(semis) * 100) % 1200));
  if (memo.has(c)) return memo.get(c);
  let best = 99; for (const [rc, h] of RAT) best = Math.min(best, h + Math.abs(rc - c) / 6);
  memo.set(c, best); return best;
}
const roughness = (m, tones) => Math.min(...tones.map((t) => hd(m - t)));
function boltzmann(cands, E, T) {
  const e = cands.map(E), lo = Math.min(...e), w = e.map((x) => Math.exp(-(x - lo) / Math.max(0.05, T)));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return cands[i]; }
  return cands[cands.length - 1];
}

// quantum variation of a theme slice: each degree may tunnel to a neighbour
export function vary(degs, tones, T, stick = 0) {
  const tm = tones.map(rToMidi);
  return degs.map((d) => {
    if (d == null) return { d: null, halo: [] };
    if (stick && rand() < stick) return { d, halo: [] };
    const c = []; for (let k = -2; k <= 2; k++) if (d + k >= DEG_MIN && d + k <= DEG_MAX) c.push(d + k);
    const E = (x) => 0.55 * roughness(degMidi(x), tm) + 1.1 * Math.abs(x - d);
    const chosen = boltzmann(c, E, T);
    return { d: chosen, halo: tenneyHalo(degMidi(chosen), c.filter((x) => x !== chosen).map((d) => degMidi(d)), T) };
  });
}

// a generated counter-voice over (or under) a cantus
export function counterVoice({ cantus, tones, rhythm, prev, range, T, stick = 0, contour = null }) {
  const tm = tones.map(rToMidi), pool = new Set();
  for (let d = -16; d <= 24; d++) pool.add(+degMidi(d).toFixed(3));
  tm.forEach((m) => { for (let o = -36; o <= 36; o += 12) pool.add(+(m + o).toFixed(3)); });
  const cands = [...pool].filter((m) => m >= range[0] && m <= range[1]);
  const notes = []; let p = prev;
  for (const { s, len } of rhythm) {
    const cf = cantus ? cantus[s] : null;
    const E = (x) => 0.6 * roughness(x, tm) + (cf != null ? 0.45 * hd(x - cf) + (Math.abs(x - cf) < 0.3 ? 4 : 0) : 0) +
      Math.abs(x - p) / 2.5 + (contour ? Math.abs(x - contour(s)) / 3 : 0);
    const stuck = stick && rand() < stick;
    const m = stuck ? p : boltzmann(cands, E, T);
    const halo = stuck ? [] : tenneyHalo(m, cands, T);
    notes.push({ s, len, midi: m, from: p, halo }); p = m;
  }
  return { notes, last: p };
}

// rhythm of a generated line inside one bar of 8 eighths, per interpretation
export function rhythmFor(mode, { world = 0, c = 1, collapsing = false, since = 0 } = {}) {
  const R = (...a) => a.map(([s, len]) => ({ s, len }));
  switch (mode) {
    case "mwi": return [R([0, 4], [4, 4]), R([0, 2], [2, 2], [4, 2], [6, 2]), R([0, 3], [3, 3], [6, 2]), R([0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2])][world % 4];
    case "zeno": return R([0, 4], [4, 4]);
    case "decoherence": if (c < 0.3) return R([0, 2], [2, 2], [4, 2], [6, 2]); { const o = []; let s = 0; while (s < 8) { const l = Math.min(8 - s, 1 + Math.floor(rand() * 3)); o.push({ s, len: l }); s += l; } return o; }
    case "pilot": return R([0, 3], [3, 2], [5, 3]);
    case "grw": if (collapsing) return R([0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]); return since > 2 ? R([0, 8]) : R([0, 4], [4, 4]);
    case "relational": return R([0, 1], [1, 2], [3, 1], [4, 2], [6, 2]);
    case "qbism": return R([0, 2], [2, 1], [3, 1], [4, 2], [6, 2]);
    case "transactional": return R([0, 3], [3, 2], [5, 3]);
    default: return R([0, 2], [2, 2], [4, 2], [6, 2]);
  }
}

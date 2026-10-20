// The frame of this universe. Roots: the overtone series and just intonation over D,
// not 12-tone C major. Pitches are ratios; MIDI numbers are fractional.
export const TONIC = 62; // D4 = 1/1
export const rToMidi = (r) => TONIC + 12 * Math.log2(r);
export const F0 = 38; // D2: the fundamental whose harmonics are the probe
export const harmMidi = (n) => F0 + 12 * Math.log2(n);
export const cents = (r) => ((1200 * Math.log2(r)) % 1200 + 1200) % 1200;

// Overtone scale: harmonics 8..15 folded into one octave — 8 degrees per octave.
const OT = [8, 9, 10, 11, 12, 13, 14, 15];
export const DEG_MIN = -4, DEG_MAX = 11;
export const degRatio = (d) => (OT[((d % 8) + 8) % 8] / 8) * 2 ** Math.floor(d / 8);
export const degMidi = (d) => rToMidi(degRatio(d));
const fold = (d) => { while (d > DEG_MAX) d -= 8; while (d < DEG_MIN) d += 8; return d; };

// ---- spectra: chords as harmonic sets on a 3×5 ratio lattice --------------------------------
const L = "FCGDAEB";
const fifthName = (n) => { const i = n + 3, acc = Math.floor(i / 7); return L[((i % 7) + 7) % 7] + (acc > 0 ? "#".repeat(acc) : "b".repeat(-acc)); };
const red = (r) => { while (r >= 2) r /= 2; while (r < 1) r *= 2; return r; };
const frac = (a, b) => { let n = 1, d = 1; (a >= 0 ? (n *= 3 ** a) : (d *= 3 ** -a)); (b >= 0 ? (n *= 5 ** b) : (d *= 5 ** -b)); while (n / d >= 2) d *= 2; while (n / d < 1) n *= 2; return n + "/" + d; };
export const SHAPES = { "+": [1, 5 / 4, 3 / 2], "−": [1, 6 / 5, 3 / 2], "7": [1, 5 / 4, 3 / 2, 7 / 4] };
export const SPECTRA = {}; // name → { a, b, q, root, tones, ratio }
export const LATTICE = []; // node index → name (otonal/utonal only)
for (let b = -1; b <= 1; b++) for (let a = -2; a <= 2; a++) for (const q of ["+", "−", "7"]) {
  if (q === "7" && b !== 0) continue;
  const root = red(3 ** a * 5 ** b);
  const name = fifthName(a + 4 * b) + (b > 0 ? "↓" : b < 0 ? "↑" : "") + q;
  SPECTRA[name] = { a, b, q, root, tones: SHAPES[q].map((x) => red(root * x)), ratio: frac(a, b) };
  if (q !== "7") LATTICE.push(name);
}
export const SPECTRUM_NAMES = Object.keys(SPECTRA);
export const tonesOf = (name) => SPECTRA[name].tones;
// does the spectrum contain this pitch (any octave, within a comma)?
export const contains = (name, midi) => tonesOf(name).some((r) => { const d = Math.abs(((rToMidi(r) - midi) % 12 + 12) % 12); return Math.min(d, 12 - d) < 0.25; });
// a voicing: root low, the rest spread around the tonic
export function voicing(name) {
  const s = SPECTRA[name], root = rToMidi(s.root);
  return [root - 24, ...s.tones.map((r) => { let m = rToMidi(r); if (m > TONIC + 8) m -= 12; return m; }).sort((x, y) => x - y)];
}

// ---- operations on a 16-step theme (physical names) ------------------------------------------
export const OPS = { none: "Identity", mirror: "Mirror", reverse: "Reverse", excite: "Excite", relax: "Relax", precess: "Precess" };
export function op(arr, t) {
  let o = arr.slice();
  if (t === "mirror") { const ax = arr.find((x) => x != null) ?? 0; o = arr.map((d) => (d == null ? null : 2 * ax - d)); }
  else if (t === "reverse") o.reverse();
  else if (t === "excite") o = arr.map((d) => (d == null ? null : d + 1));
  else if (t === "relax") o = arr.map((d) => (d == null ? null : d - 1));
  else if (t === "precess") o = [arr[arr.length - 1], ...arr.slice(0, -1)];
  return o.map((d) => (d == null ? null : fold(d)));
}

// ---- interpretations, ensembles, links ----------------------------------------------------
export const INTERP = {
  copenhagen: ["Copenhagen", "Definite outcomes. Every note is born as a smeared cloud of partials and snaps onto its ratio. Vibraphone melody, pizzicato particles, a cello that keeps to the coldest, most consonant path."],
  mwi: ["Many-Worlds", "Nothing collapses. Each bar the ensemble splits: every world plays its own variation in its own octave and corner of the room, over every live spectrum at once."],
  zeno: ["Quantum Zeno", "Watched, the state can't move. Notes are re-struck instead of changed, the lattice walk crawls, and the bass holds a singing-bowl pedal."],
  decoherence: ["Decoherence", "Free, hot and smeared at first; as phase leaks into the room the temperature drops and the music crystallises into dry, metric harp."],
  pilot: ["Pilot-wave", "Hidden variables: a seed fixes every outcome. A theremin rides a visible guide wave while kalimba particles follow it. Same seed, same piece."],
  grw: ["GRW collapse", "The cloud spreads, hot and blurred, until a random hit — a gong and a thump — crushes it to a point, then it spreads again."],
  relational: ["Relational", "Each part is its own observer and measures the harmony separately, so the melody, counter-voice and accompaniment can hear different spectra at once."],
  qbism: ["QBism", "Probabilities are beliefs. Every outcome updates them, so the piece learns its own habits and cools as it grows confident."],
  transactional: ["Transactional", "Offer and confirmation waves: the harmony is written backwards from its final spectrum, notes swell into their attacks, and rhythms read the same both ways."],
};
export const PALETTE = {
  copenhagen: { mel: "vibes", ctr: "pizz", cp: "cello", chord: "guitar", bass: "cello" },
  mwi: { mel: "glassbell", ctr: "choir", cp: "choir", chord: "organ", bass: "bowl" },
  zeno: { mel: "kalimba", ctr: "marimba", cp: "glass", chord: "glass", bass: "bowl" },
  decoherence: { mel: "organ", ctr: "organ", cp: "strings", chord: "organ", bass: "cello" },
  pilot: { mel: "kalimba", ctr: "harp", cp: "theremin", chord: "harp", bass: "bass" },
  grw: { mel: "bowedmetal", ctr: "winds", cp: "cello", chord: "bowedmetal", bass: "cello" },
  relational: { mel: "celesta", ctr: "winds", cp: "pizz", chord: "guitar", bass: "bass" },
  qbism: { mel: "marimba", ctr: "epiano", cp: "vibes", chord: "epiano", bass: "bass" },
  transactional: { mel: "reverse", ctr: "glass", cp: "cello", chord: "reverse", bass: "bowl" },
};
export const ENSEMBLES = {
  auto: ["By interpretation", null],
  bells: ["Bells & bowls", { mel: "glassbell", ctr: "bowl", cp: "vibes", chord: "glass", bass: "gong" }],
  plucked: ["Plucked strings", { mel: "guitar", ctr: "pizz", cp: "harp", chord: "guitar", bass: "pizz" }],
  breath: ["Breath", { mel: "winds", ctr: "choir", cp: "choir", chord: "organ", bass: "cello" }],
  wood: ["Wood & tine", { mel: "marimba", ctr: "kalimba", cp: "celesta", chord: "marimba", bass: "bass" }],
  aether: ["Aether", { mel: "theremin", ctr: "reverse", cp: "epiano", chord: "glass", bass: "bass" }],
  bowed: ["Bowed", { mel: "strings", ctr: "bowedmetal", cp: "cello", chord: "strings", bass: "cello" }],
};
export const LINKS = {
  specToHist: ["Spectra → harmony of Histories", true],
  pairToHist: ["Pair → melodies of Histories", true],
  orbitToHist: ["Orbits → drums of Histories", true],
  specToPair: ["Spectra → a harmony bed under the Pair", false],
  pairToSpec: ["Particle A's tune probes the Spectra", false],
  histToSpec: ["History outcomes reshape spectral amplitudes", false],
  histToPair: ["A history's last operation is written into the Pair", false],
};

export const S = {
  spec: [{ name: "D7", mag: 0.8, phase: 0 }, { name: "G−", mag: 0.5, phase: 120 }, { name: "F↑+", mag: 0.45, phase: 240 }],
  A: [0, 2, 4, 6, 7, null, 6, 4, 3, null, 5, 4, 2, 1, 0, null],
  B: [-4, null, -2, null, -1, 0, null, -2, -3, null, -1, null, -4, null, null, -3],
  linked: true,
  rule: { none: "none", mirror: "reverse", reverse: "mirror", excite: "relax", relax: "excite", precess: "precess" },
  bell: null,
  bpm: 84,
  hsrc: "lattice",
  spread: 0.7,
  ensemble: "auto",
  meas: { tempo: false, dyn: false, half: 0 },
  q: { mode: "copenhagen", basis: "computational", zeno: 0.75, gamma: 0.35, grw: 0.3, seed: 1905 },
  links: Object.fromEntries(Object.entries(LINKS).map(([k, v]) => [k, v[1]])),
  sections: [
    { name: "α", t: "none", dead: 0, options: [{ bars: 3, mag: 1 }, { bars: 5, mag: 0.6 }] },
    { name: "β", t: "mirror", dead: 0, options: [{ bars: 2, mag: 0.8 }, { bars: 4, mag: 1 }, { bars: 8, mag: 0.3 }] },
    { name: "γ", t: "precess", dead: 0, options: [{ bars: 1, mag: 0.5 }, { bars: 3, mag: 1 }] },
    { name: "ω", t: "reverse", dead: 0.15, options: [{ bars: 4, mag: 1 }, { bars: 6, mag: 0.7 }] },
  ],
};
export const pal = () => ENSEMBLES[S.ensemble]?.[1] || PALETTE[S.q.mode];

export function applyPair(who, t) {
  const other = who === "A" ? "B" : "A";
  S[who] = op(S[who], t);
  if (S.linked) S[other] = op(S[other], S.rule[t]);
  return S.linked ? S.rule[t] : null;
}

const bus = new EventTarget();
export const emit = (n) => bus.dispatchEvent(new Event(n));
export const on = (n, f) => bus.addEventListener(n, f);
export const $ = (id) => document.getElementById(id);

const performances = new Map();

/** Starting playback on one station stops every other station that is still running. */
export function beginPerformance(id, stop) {
  for (const [other, halt] of performances) {
    if (other === id) continue;
    performances.delete(other);
    halt();
  }
  performances.set(id, stop);
}

export function endPerformance(id) {
  performances.delete(id);
}

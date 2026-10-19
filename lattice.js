// Harmony: a continuous-time quantum walk across a 3×5 just-intonation lattice of spectra.
// Neighbours: same root other quality, a pure fifth (3/2) either way, a pure third (5/4) either way.
import { SPECTRA, LATTICE } from "./world.js";
import { rand } from "./ket.js";

export const N = LATTICE.length;
const idx = new Map(LATTICE.map((n, i) => [n, i]));
const key = (a, b, q) => LATTICE.findIndex((n) => SPECTRA[n].a === a && SPECTRA[n].b === b && SPECTRA[n].q === q);
const NB = LATTICE.map((n) => {
  const { a, b, q } = SPECTRA[n], o = q === "+" ? "−" : "+";
  return [key(a, b, o), key(a + 1, b, q), key(a - 1, b, q), key(a, b + 1, q), key(a, b - 1, q)].filter((j) => j >= 0);
});
// the lattice's "gravity": spectra near 1/1 are where the walker is most often found
const G = LATTICE.map((n) => { const { a, b } = SPECTRA[n]; return Math.exp(-0.35 * (a * a + 1.6 * b * b)); });
export const nodeOf = (name) => { const s = SPECTRA[name]; return idx.has(name) ? idx.get(name) : key(s.a, s.b, "+"); };
export const nameOf = (i) => LATTICE[i];

export class Walk {
  constructor(init) {
    this.re = new Float64Array(N); this.im = new Float64Array(N);
    init.forEach((s) => { const i = nodeOf(s.name), ph = (s.phase * Math.PI) / 180; this.re[i] += s.mag * Math.cos(ph); this.im[i] += s.mag * Math.sin(ph); });
    this.norm();
  }
  norm() { let s = 0; for (let i = 0; i < N; i++) s += this.re[i] ** 2 + this.im[i] ** 2; s = Math.sqrt(s) || 1; for (let i = 0; i < N; i++) { this.re[i] /= s; this.im[i] /= s; } }
  evolve(tau) {
    const steps = Math.max(1, Math.ceil(tau / 0.04)), dt = tau / steps;
    const H = (re, im) => { const r = new Float64Array(N), m = new Float64Array(N); for (let i = 0; i < N; i++) for (const j of NB[i]) { r[i] += re[j]; m[i] += im[j]; } return [r, m]; };
    for (let s = 0; s < steps; s++) {
      const [ar, ai] = H(this.re, this.im), [br, bi] = H(ar, ai);
      for (let i = 0; i < N; i++) { const r = this.re[i] + dt * ai[i] - (dt * dt / 2) * br[i], m = this.im[i] - dt * ar[i] - (dt * dt / 2) * bi[i]; this.re[i] = r; this.im[i] = m; }
      this.norm();
    }
  }
  dephase(k) { for (let i = 0; i < N; i++) { const a = Math.hypot(this.re[i], this.im[i]), ph = Math.atan2(this.im[i], this.re[i]) + (rand() - 0.5) * 2 * Math.PI * k; this.re[i] = a * Math.cos(ph); this.im[i] = a * Math.sin(ph); } }
  probs() { const p = []; let s = 0; for (let i = 0; i < N; i++) { const v = (this.re[i] ** 2 + this.im[i] ** 2) * G[i]; p.push(v); s += v; } return p.map((v) => v / (s || 1)); }
  collapse(i) { this.re.fill(0); this.im.fill(0); this.re[i] = 1; }
  top(k, min = 0.04) { return this.probs().map((w, i) => ({ i, w })).filter((x) => x.w >= min).sort((a, b) => b.w - a.w).slice(0, k); }
}

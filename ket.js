// Amplitudes, bases and the Born rule.
import { S } from "./world.js";

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let seeded = null;
// Pilot-wave: every pass is fixed by the seed (hidden variables). Otherwise: crypto randomness.
export function pass(salt = 0) { seeded = S.q.mode === "pilot" ? mulberry(S.q.seed * 7919 + salt) : null; }
export function rand() { if (seeded) return seeded(); const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; }

export const toC = (s) => [s.mag * Math.cos((s.phase * Math.PI) / 180), s.mag * Math.sin((s.phase * Math.PI) / 180)];
export function fromC(list, C) {
  const mx = Math.max(...C.map(([r, i]) => Math.hypot(r, i))) || 1;
  C.forEach(([r, i], k) => { list[k].mag = +(Math.hypot(r, i) / mx).toFixed(2); list[k].phase = Math.round(((Math.atan2(i, r) * 180) / Math.PI + 360) % 360); });
}
export function born(list) { const s = list.reduce((t, a) => t + a.mag * a.mag, 0); return s ? list.map((a) => (a.mag * a.mag) / s) : list.map(() => 1 / list.length); }
const nrm = (p) => { const s = p.reduce((a, b) => a + b, 0) || 1; return p.map((x) => x / s); };
const popc = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

const uc = new Map();
function haar(N, seed) {
  const key = N + ":" + seed; if (uc.has(key)) return uc.get(key);
  const g = mulberry(seed * 31 + N), gs = () => Math.sqrt(-2 * Math.log(1 - g())) * Math.cos(2 * Math.PI * g()), U = [];
  for (let r = 0; r < N; r++) {
    let v = Array.from({ length: N }, () => [gs(), gs()]);
    for (const u of U) { let dr = 0, di = 0; for (let k = 0; k < N; k++) { dr += u[k][0] * v[k][0] + u[k][1] * v[k][1]; di += u[k][0] * v[k][1] - u[k][1] * v[k][0]; } v = v.map(([a, b], k) => [a - (dr * u[k][0] - di * u[k][1]), b - (dr * u[k][1] + di * u[k][0])]); }
    const n = Math.sqrt(v.reduce((s, [a, b]) => s + a * a + b * b, 0)) || 1; U.push(v.map(([a, b]) => [a / n, b / n]));
  }
  uc.set(key, U); return U;
}
// Outcome probabilities in the chosen measurement basis — phases interfere outside the computational one.
export function odds(list) {
  const basis = S.q.basis, N = list.length;
  if (basis === "computational" || N < 2) return born(list);
  const s = Math.sqrt(list.reduce((t, a) => t + a.mag * a.mag, 0)) || 1, A = list.map((x) => toC(x).map((v) => v / s));
  if (basis === "fourier") return nrm(A.map((_, j) => { let re = 0, im = 0; A.forEach(([r, i], k) => { const a = (-2 * Math.PI * j * k) / N; re += r * Math.cos(a) - i * Math.sin(a); im += r * Math.sin(a) + i * Math.cos(a); }); return re * re + im * im; }));
  if (basis === "hadamard") { const M = 1 << Math.ceil(Math.log2(N)), p = new Array(N).fill(0); for (let j = 0; j < M; j++) { let re = 0, im = 0; A.forEach(([r, i], k) => { const sg = popc(j & k) % 2 ? -1 : 1; re += sg * r; im += sg * i; }); p[j % N] += re * re + im * im; } return nrm(p); }
  const U = haar(N, S.q.seed);
  return nrm(U.map((row) => { let re = 0, im = 0; row.forEach(([ur, ui], k) => { re += ur * A[k][0] + ui * A[k][1]; im += ur * A[k][1] - ui * A[k][0]; }); return re * re + im * im; }));
}
export function draw(p) { const tot = p.reduce((a, b) => a + b, 0) || 1; let r = rand() * tot; for (let i = 0; i < p.length; i++) { r -= p[i]; if (r < 0) return i; } return p.length - 1; }
// Zeno: frequent looking pins the outcome to the last one.
export function look(p, last) {
  if (S.q.mode === "zeno" && last != null && last < p.length) { const z = S.q.zeno, t = p.reduce((a, b) => a + b, 0) || 1; p = p.map((x, i) => (1 - z) * (x / t) + (i === last ? z : 0)); }
  return draw(p);
}
export const entropy = (p) => -p.reduce((a, x) => a + (x > 0 ? x * Math.log2(x) : 0), 0);

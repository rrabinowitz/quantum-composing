// V · Register — a small quantum computer. Time runs downward; each column is a qubit.
// Every time step the whole state sounds: basis state |k⟩ is a pitch, loudness |α_k|², stereo position its phase.
import { S, $, on, degMidi, rToMidi, harmMidi, beginPerformance, endPerformance } from "./world.js";
import { rand, pass, look } from "./ket.js";
import { note, runLoop, at, ac } from "./audio.js";
import { wireExport } from "./export.js";

const r2 = Math.SQRT1_2, C = (re, im = 0) => ({ re, im });
const GATES = {
  H: [[C(r2), C(r2)], [C(r2), C(-r2)]], X: [[C(0), C(1)], [C(1), C(0)]], Y: [[C(0), C(0, -1)], [C(0, 1), C(0)]], Z: [[C(1), C(0)], [C(0), C(-1)]],
  S: [[C(1), C(0)], [C(0), C(0, 1)]], T: [[C(1), C(0)], [C(0), C(r2, r2)]], "√X": [[C(0.5, 0.5), C(0.5, -0.5)], [C(0.5, -0.5), C(0.5, 0.5)]],
  R: [[C(Math.cos(Math.PI / 8)), C(-Math.sin(Math.PI / 8))], [C(Math.sin(Math.PI / 8)), C(Math.cos(Math.PI / 8))]],
};
const TOOLS = ["H", "X", "Y", "Z", "S", "T", "√X", "R", "CNOT", "CZ", "M", "⌫"];
const TIPS = { H: "Hadamard — make a superposition", X: "NOT — flip", Y: "Y flip", Z: "phase flip", S: "90° phase", T: "45° phase", "√X": "half a NOT", R: "small Y-rotation (π/4)", CNOT: "controlled NOT — tap the control, then the target in the same row", CZ: "controlled phase — tap the control, then the target", M: "measure this qubit mid-run", "⌫": "erase" };
const TUNINGS = {
  "Harmonic series": (k) => harmMidi(k + 2) + 12,
  "Overtone scale": (k) => degMidi(k),
  "Subharmonic series": (k) => harmMidi(1) + 48 - 12 * Math.log2(k + 1),
  "Bohlen–Pierce": (k) => 50 + 12 * Math.log2(3 ** (k / 13)),
  "5-limit just": (k) => rToMidi([1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8][k % 7] * 2 ** Math.floor(k / 7)),
  "12-TET pentatonic": (k) => 62 + 12 * Math.floor(k / 5) + [0, 2, 4, 7, 9][k % 5],
};
const INSTS = ["vibes", "glassbell", "kalimba", "bowl", "celesta", "harp", "pizz", "guitar", "marimba", "glass", "choir", "organ", "piano", "epiano", "theremin"];
const ROWS = 16;
const R = (S.reg = { nq: 3, tuning: "Harmonic series", inst: "glassbell", grid: [] });
const blank = () => (R.grid = Array.from({ length: R.nq }, () => new Array(ROWS).fill(null)));
blank();
const put = (q, r, g) => (R.grid[q][r] = g);
put(1, 0, { g: "H" }); put(1, 1, { g: "•", t: 2 }); put(2, 1, { g: "CNOT", c: 1 }); put(0, 2, { g: "√X" }); put(2, 4, { g: "T" });
put(0, 5, { g: "•", t: 1 }); put(1, 5, { g: "CZ", c: 0 }); put(1, 6, { g: "H" }); put(0, 8, { g: "R" }); put(2, 9, { g: "H" });
put(1, 10, { g: "M" }); put(0, 11, { g: "S" }); put(2, 12, { g: "•", t: 0 }); put(0, 12, { g: "CNOT", c: 2 }); put(2, 14, { g: "Y" }); put(0, 15, { g: "H" });
export const pitchOf = (k) => TUNINGS[R.tuning](k);

class Sim {
  constructor(n) { this.n = n; this.N = 1 << n; this.re = new Float64Array(this.N); this.im = new Float64Array(this.N); this.re[0] = 1; this.last = {}; }
  apply(M, q, ctrl = -1) {
    const b = 1 << q, cm = ctrl >= 0 ? 1 << ctrl : 0, m = (a, r, i) => [a.re * r - a.im * i, a.re * i + a.im * r];
    for (let i = 0; i < this.N; i++) {
      if (i & b || (cm && !(i & cm))) continue;
      const j = i | b, [a1, a2] = m(M[0][0], this.re[i], this.im[i]), [b1, b2] = m(M[0][1], this.re[j], this.im[j]), [c1, c2] = m(M[1][0], this.re[i], this.im[i]), [d1, d2] = m(M[1][1], this.re[j], this.im[j]);
      this.re[i] = a1 + b1; this.im[i] = a2 + b2; this.re[j] = c1 + d1; this.im[j] = c2 + d2;
    }
  }
  probs() { const p = []; for (let i = 0; i < this.N; i++) p.push(this.re[i] ** 2 + this.im[i] ** 2); return p; }
  phase(i) { return Math.atan2(this.im[i], this.re[i]); }
  measure(q) {
    const b = 1 << q; let p1 = 0; this.probs().forEach((x, i) => { if (i & b) p1 += x; });
    const v = look([1 - p1, p1], this.last[q]); this.last[q] = v; let s = 0;
    for (let i = 0; i < this.N; i++) { if (((i & b) ? 1 : 0) !== v) { this.re[i] = 0; this.im[i] = 0; } else s += this.re[i] ** 2 + this.im[i] ** 2; }
    s = Math.sqrt(s) || 1; for (let i = 0; i < this.N; i++) { this.re[i] /= s; this.im[i] /= s; }
    return v;
  }
  readout() { const p = this.probs(); let r = rand(), k = 0; for (; k < p.length - 1; k++) { r -= p[k]; if (r < 0) break; } this.re.fill(0); this.im.fill(0); this.re[k] = 1; return k; }
  dephase(s) { for (let i = 0; i < this.N; i++) { const a = Math.hypot(this.re[i], this.im[i]), ph = this.phase(i) + (rand() - 0.5) * 2 * Math.PI * s; this.re[i] = a * Math.cos(ph); this.im[i] = a * Math.sin(ph); } }
}
function step(sim, r) {
  const Q = S.q, ev = [];
  for (let q = 0; q < R.nq; q++) {
    const c = R.grid[q][r]; if (!c) continue;
    if (GATES[c.g]) sim.apply(GATES[c.g], q);
    else if (c.g === "CNOT") sim.apply(GATES.X, q, c.c);
    else if (c.g === "CZ") sim.apply(GATES.Z, q, c.c);
    else if (c.g === "M") ev.push({ q, v: Q.mode === "mwi" ? null : sim.measure(q) });
  }
  if (Q.mode === "decoherence") sim.dephase(1 - Math.exp((-Q.gamma * r) / 8));
  if (Q.mode === "grw" && rand() < Q.grw * 0.15) { const q = Math.floor(rand() * R.nq); ev.push({ q, v: sim.measure(q), grw: true }); }
  return ev;
}
function rowNotes(sim, t, e8, ev, out) {
  sim.probs().forEach((w, k) => { if (w >= 0.01) out.push({ midi: pitchOf(k), t, dur: e8 * 1.8, voice: R.inst, vel: 0.16 * Math.sqrt(w), fx: { pan: Math.sin(sim.phase(k)) * 0.8 } }); });
  ev.forEach((e) => out.push({ midi: e.grw ? 36 : 100, t, dur: e.grw ? 0.3 : 0.01, voice: e.grw ? "thump" : "tick", vel: 0.05, fx: {} }));
}
function readout(sim, t, e8, out) {
  if (S.q.mode === "mwi") return null;
  const k = sim.readout();
  out.push({ midi: pitchOf(k) + 12, t, dur: e8 * 4, voice: "bowl", vel: 0.16, fx: {} }, { midi: 100, t, dur: 0.01, voice: "tick", vel: 0.06, fx: {} });
  return k;
}
export function buildRegister(loops = 2) {
  pass(8);
  const e8 = 30 / S.bpm, out = [];
  for (let l = 0; l < loops; l++) { const sim = new Sim(R.nq); for (let r = 0; r < ROWS; r++) rowNotes(sim, (l * ROWS + r) * e8, e8, step(sim, r), out); readout(sim, (l + 1) * ROWS * e8 - e8 * 0.5, e8, out); }
  return { notes: out, total: loops * ROWS * e8 + 2, bpm: S.bpm };
}

// ---- view ----
let tool = "H", ctrl = null, stop = null, row = -1, snap = null;
const say = (h) => ($("regStatus").innerHTML = h);
const ket = (k) => "|" + k.toString(2).padStart(R.nq, "0").split("").reverse().join("") + "⟩";
export function initRegister() {
  $("regTools").innerHTML = TOOLS.map((g) => `<button class="gate ${g === tool ? "sel" : ""}" data-g="${g}" title="${TIPS[g]}">${g}</button>`).join("");
  $("regTools").querySelectorAll(".gate").forEach((b) => (b.onclick = () => { tool = b.dataset.g; ctrl = null; $("regTools").querySelectorAll(".gate").forEach((x) => x.classList.toggle("sel", x === b)); say(TIPS[tool]); paint(); }));
  $("regTune").innerHTML = Object.keys(TUNINGS).map((s) => `<option ${s === R.tuning ? "selected" : ""}>${s}</option>`).join("");
  $("regTune").onchange = (e) => { R.tuning = e.target.value; preview(true); };
  $("regInst").innerHTML = INSTS.map((s) => `<option ${s === R.inst ? "selected" : ""}>${s}</option>`).join("");
  $("regInst").onchange = (e) => { R.inst = e.target.value; preview(true); };
  $("regAdd").onclick = () => { if (R.nq < 5) { R.nq++; R.grid.push(new Array(ROWS).fill(null)); preview(true); } };
  $("regRem").onclick = () => { if (R.nq > 1) { R.nq--; R.grid.pop(); R.grid.forEach((col) => col.forEach((c, i) => { if (c && (c.c >= R.nq || c.t >= R.nq)) col[i] = null; })); preview(true); } };
  $("regClear").onclick = () => { blank(); preview(); };
  $("regPlay").onclick = () => (stop ? halt() : play());
  wireExport($("regMidi"), $("regWav"), () => buildRegister(2), "register");
  $("regCv").addEventListener("pointerdown", click);
  addEventListener("resize", paint); on("q", () => preview()); on("show", paint);
  preview();
}
const geo = () => { const c = $("regCv"), W = c.clientWidth, lw = 30, rh = 26; return { c, W, H: rh * ROWS + 34, lw, rh, cw: (W - lw) / R.nq, top: 30 }; };
function click(e) {
  const g = geo(), b = g.c.getBoundingClientRect();
  const q = Math.floor((e.clientX - b.left - g.lw) / g.cw), r = Math.floor((e.clientY - b.top - g.top) / g.rh);
  if (q < 0 || q >= R.nq || r < 0 || r >= ROWS) return;
  const clear = (qq, rr) => { const c = R.grid[qq][rr]; if (!c) return; if (c.g === "•") R.grid[c.t][rr] = null; if (c.c != null) R.grid[c.c][rr] = null; R.grid[qq][rr] = null; };
  if (tool === "⌫") clear(q, r);
  else if (tool === "CNOT" || tool === "CZ") {
    if (!ctrl || ctrl.r !== r) { ctrl = { q, r }; say("Control on q" + q + " — now tap the target in the same row."); paint(); return; }
    if (ctrl.q === q) return;
    clear(q, r); clear(ctrl.q, r); R.grid[ctrl.q][r] = { g: "•", t: q }; R.grid[q][r] = { g: tool, c: ctrl.q }; ctrl = null;
  } else { clear(q, r); R.grid[q][r] = { g: tool }; }
  preview(true);
}
function preview(sound = false) {
  const sim = new Sim(R.nq); pass(8);
  for (let r = 0; r < ROWS; r++) step(sim, r);
  snap = sim; paint();
  const top = sim.probs().map((w, k) => ({ w, k })).filter((x) => x.w > 0.01).sort((a, b) => b.w - a.w).slice(0, 4);
  say("Final state: " + top.map((x) => `${ket(x.k)} ${Math.round(x.w * 100)}%`).join(" · ") + (S.q.mode === "mwi" ? " — never read out under Many-Worlds; every branch keeps sounding." : ""));
  if (sound && top.length) note(pitchOf(top[0].k), ac().currentTime + 0.01, 0.35, R.inst, 0.16);
}
export function paint() {
  const g = geo(); if (!g.W) return;
  const dpr = devicePixelRatio || 1; g.c.width = g.W * dpr; g.c.height = g.H * dpr; g.c.style.height = g.H + "px";
  const x = g.c.getContext("2d"); x.scale(dpr, dpr);
  x.textAlign = "center"; x.textBaseline = "middle";
  const cx = (q) => g.lw + g.cw * (q + 0.5), cy = (r) => g.top + g.rh * (r + 0.5);
  if (row >= 0) { x.fillStyle = "#b8860b22"; x.fillRect(g.lw, g.top + row * g.rh, g.W - g.lw, g.rh); }
  if (ctrl) { x.fillStyle = "#7b3fa022"; x.fillRect(g.lw, g.top + ctrl.r * g.rh, g.W - g.lw, g.rh); }
  x.font = "11px ui-monospace,monospace"; x.fillStyle = "#2a262266";
  for (let r = 0; r < ROWS; r += 4) x.fillText(r, 12, cy(r));
  for (let q = 0; q < R.nq; q++) {
    x.strokeStyle = "#2a262255"; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx(q), g.top); x.lineTo(cx(q), g.H - 4); x.stroke();
    x.fillStyle = "#2a2622"; x.font = "italic 14px Georgia,serif"; x.fillText("q" + q + " |0⟩", cx(q), 14);
  }
  for (let r = 0; r < ROWS; r++) for (let q = 0; q < R.nq; q++) {
    const c = R.grid[q][r]; if (!c) continue;
    const X = cx(q), Y = cy(r), s = Math.min(g.rh, g.cw) * 0.8;
    if (c.g === "•") { x.strokeStyle = "#7b3fa0"; x.lineWidth = 2; x.beginPath(); x.moveTo(X, Y); x.lineTo(cx(c.t), Y); x.stroke(); x.fillStyle = "#7b3fa0"; x.beginPath(); x.arc(X, Y, 5, 0, 7); x.fill(); }
    else if (c.g === "CNOT") { x.strokeStyle = "#7b3fa0"; x.lineWidth = 2; x.beginPath(); x.arc(X, Y, s / 2.4, 0, 7); x.moveTo(X - s / 2.4, Y); x.lineTo(X + s / 2.4, Y); x.moveTo(X, Y - s / 2.4); x.lineTo(X, Y + s / 2.4); x.stroke(); }
    else if (c.g === "CZ") { x.fillStyle = "#7b3fa0"; x.beginPath(); x.arc(X, Y, 5, 0, 7); x.fill(); }
    else {
      const m = c.g === "M"; x.fillStyle = m ? "#f3e2b8" : "#fbf7ee"; x.strokeStyle = m ? "#b8860b" : "#2a2622"; x.lineWidth = 1.3;
      x.beginPath(); x.roundRect(X - s * 0.7, Y - s / 2, s * 1.4, s, 4); x.fill(); x.stroke();
      x.fillStyle = m ? "#8a6208" : "#2a2622"; x.font = "600 13px Georgia,serif"; x.fillText(m ? "◠↗" : c.g, X, Y + 1);
    }
  }
  clocks();
}
// phasor clocks: one dial per basis state, hand length √p, hand angle = phase
function clocks() {
  const c = $("regAmps"), W = c.clientWidth; if (!W || !snap) return;
  const N = snap.N, cols = Math.min(N, W < 360 ? 4 : 8), rad = Math.min(30, W / cols / 2 - 6), rh = rad * 2 + 30, H = Math.ceil(N / cols) * rh;
  const dpr = devicePixelRatio || 1; c.width = W * dpr; c.height = H * dpr; c.style.height = H + "px";
  const x = c.getContext("2d"); x.scale(dpr, dpr); x.textAlign = "center";
  const p = snap.probs();
  p.forEach((w, k) => {
    const X = (W / cols) * ((k % cols) + 0.5), Y = Math.floor(k / cols) * rh + rad + 4, a = snap.phase(k), hue = ((a / (2 * Math.PI)) * 360 + 360) % 360;
    x.strokeStyle = "#2a262233"; x.lineWidth = 1; x.beginPath(); x.arc(X, Y, rad, 0, 7); x.stroke();
    x.fillStyle = `hsla(${hue},60%,45%,${0.12 + w * 0.6})`; x.beginPath(); x.arc(X, Y, rad * Math.sqrt(w), 0, 7); x.fill();
    if (w > 0.002) { x.strokeStyle = `hsl(${hue},60%,38%)`; x.lineWidth = 2; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + rad * Math.sqrt(w) * Math.cos(a), Y - rad * Math.sqrt(w) * Math.sin(a)); x.stroke(); }
    x.fillStyle = "#2a262299"; x.font = "11px ui-monospace,monospace"; x.fillText(ket(k), X, Y + rad + 14);
  });
}
function play() {
  beginPerformance("register", halt);
  pass(8); let sim = null;
  stop = runLoop(() => 30 / S.bpm, (i, t, bus) => {
    const r = i % ROWS, e8 = 30 / S.bpm, out = [];
    if (!r) sim = new Sim(R.nq);
    const ev = step(sim, r); rowNotes(sim, 0, e8, ev, out);
    const k = r === ROWS - 1 ? readout(sim, e8 * 0.5, e8, out) : null;
    out.forEach((n) => note(n.midi, t + n.t, n.dur, n.voice, n.vel, bus, n.fx));
    const sn = Object.assign(Object.create(Sim.prototype), sim, { re: sim.re.slice(), im: sim.im.slice() });
    at(t, () => {
      row = r; snap = sn; paint();
      if (ev.length) say(ev.map((e) => `${e.grw ? "GRW hit" : "M"} on q${e.q} → ${e.v ?? "both (branching)"}`).join(" · "));
      if (k != null) say("Readout → <b>" + ket(k) + "</b>");
    });
  });
  $("regPlay").textContent = "■ Stop";
}
function halt() { endPerformance("register"); stop && stop(); stop = null; row = -1; preview(); $("regPlay").textContent = "▶ Run"; }

// IV · Orbits — a quantum drum machine made of concentric rings. Each ring has its own number of
// steps spread over the same bar (polyrhythm). Every step is a qubit:
//  ○ silent · ● hit · ◐ superposed (P = ring's |α|²) · 🐱 GHZ: all cat steps share one measurement per bar.
import { S, $, on, beginPerformance, endPerformance } from "./world.js";
import { rand, pass } from "./ket.js";
import { note, runLoop, at, ac } from "./audio.js";
import { color } from "./score.js";
import { wireExport } from "./export.js";

export const DRUMS = {
  kick: ["Kick", "kick", 36, 36], snare: ["Snare", "snare", 38, 38], tom: ["Low tom", "tom", 45, 45], hitom: ["High tom", "tom", 52, 50],
  ksdrum: ["String drum", "ksdrum", 47, 47], hat: ["Hat", "hat", 42, 42], ohat: ["Open hat", "hat", 42, 46, { open: 1 }],
  clave: ["Clave", "clave", 75, 75], wood: ["Woodblock", "woodblock", 79, 76], shaker: ["Shaker", "shaker", 70, 70],
  bowl: ["Bowl", "bowl", 69, 53], kalimba: ["Tine", "kalimba", 74, 81], pizz: ["Pizzicato", "pizz", 50, 37],
  geiger: ["Geiger", "sample", 60, 39, { sample: "geiger", len: 0.09, randOffset: 3.5 }], cat: ["Cat", "sample", 60, 56, { sample: "cat", len: 0.9 }],
  static: ["Static", "sample", 60, 39, { sample: "static", len: 0.12, randOffset: 2.5 }],
};
export const INK = ["#c2452d", "#2d5fc2", "#1f8a5b", "#b8860b", "#7b3fa0", "#3b8ea5", "#d0657f", "#555"];
const P = (str) => [...str].map((ch) => ({ ".": 0, x: 1, "?": 2, c: 3 }[ch]));
S.orbits = [
  { inst: "kick", cells: P("x..?x.?."), p: 0.5, ent: -1, anti: false, vel: 1 },
  { inst: "snare", cells: P("...x..?...x?"), p: 0.4, ent: 0, anti: true, vel: 0.8 },
  { inst: "hat", cells: P("x?x?x?x?x?x?x?x?"), p: 0.55, ent: -1, anti: false, vel: 0.55 },
  { inst: "bowl", cells: P("x.?.?"), p: 0.45, ent: -1, anti: false, vel: 0.7 },
  { inst: "clave", cells: P("x.x.x.?"), p: 0.5, ent: -1, anti: false, vel: 0.6 },
  { inst: "cat", cells: P("...c"), p: 0.5, ent: -1, anti: false, vel: 0.7 },
];
const R = S.orbits;

export const memory = () => ({ last: null, bar: 0, counts: null, frozen: null });
export function measureBar(mem) {
  const Q = S.q, mode = Q.mode, alive = rand() < 0.5;
  const c = mode === "decoherence" ? Math.exp(-Q.gamma * mem.bar) : 1;
  if (!mem.counts || mem.counts.length !== R.length) mem.counts = R.map((r) => new Array(24).fill(1));
  const regrw = mode !== "grw" || !mem.last || rand() < Q.grw;
  const out = R.map((r) => new Array(r.cells.length).fill(0)), raw = R.map((r) => new Array(r.cells.length).fill(null));
  const prev = (i, s) => (mem.last && mem.last[i] && mem.last[i][s] > 0);
  R.forEach((r, i) => {
    const n = r.cells.length;
    for (let s = 0; s < n; s++) {
      const st = r.cells[s];
      if (!st) continue;
      if (st === 1) { out[i][s] = 1; continue; }
      if (st === 3) { out[i][s] = alive ? 1 : 0; raw[i][s] = alive; continue; }
      let p = r.p;
      if (mode === "qbism") p = 0.5 * p + 0.5 * (mem.counts[i][s] / (mem.bar + 2));
      const pr = r.ent >= 0 && r.ent < R.length && r.ent !== i ? raw[r.ent][Math.floor((s * R[r.ent].cells.length) / n)] : null;
      let hit;
      if (pr != null) hit = r.anti ? !pr : pr;
      else if (mode === "transactional" && s >= n / 2 && raw[i][n - 1 - s] != null) hit = raw[i][n - 1 - s];
      else if (mode === "zeno" && mem.last && rand() < Q.zeno) hit = prev(i, s);
      else if (!regrw) hit = prev(i, s);
      else if (mem.frozen) hit = mem.frozen[i] ? mem.frozen[i][s] > 0 : rand() < p;
      else hit = rand() < p;
      raw[i][s] = hit;
      if (mode === "mwi" || (mode === "decoherence" && !mem.frozen && rand() < c)) out[i][s] = 0.15 + 0.85 * p * (hit ? 1 : 0.6);
      else out[i][s] = hit ? 1 : 0;
      if (hit) mem.counts[i][s]++;
    }
  });
  if (mode === "decoherence" && c < 0.3 && !mem.frozen) mem.frozen = out.map((r) => r.slice());
  mem.last = out; mem.bar++;
  return { out, alive };
}
export function barNotes(m, t0, bar, out = []) {
  R.forEach((r, i) => {
    const [, v, midi, gm, dfx] = DRUMS[r.inst], step = bar / r.cells.length;
    (m.out[i] || []).forEach((x, s) => {
      if (!x) return;
      const fx = { ...(dfx || {}), pan: Math.sin(i * 2.1) * 0.45 };
      if (fx.randOffset) fx.offset = rand() * fx.randOffset;
      out.push({ midi, t: t0 + s * step, dur: step, voice: v, vel: 0.16 * r.vel * x, role: "drum", gm, fx, gen: true });
    });
  });
  return out;
}
export function buildOrbits(bars = 4) {
  pass(7);
  const bar = 240 / S.bpm, mem = memory(), notes = [];
  for (let b = 0; b < bars; b++) barNotes(measureBar(mem), b * bar, bar, notes);
  return { notes: color(notes, { bar, total: bars * bar }), total: bars * bar, bpm: S.bpm };
}

// ---- view ---------------------------------------------------------------------------------
let stop = null, lastM = null, barT0 = 0, refreshTimer = 0;
function refresh() {
  if (!stop) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (stop) { halt(); play(); } }, 180);
}
const cv = () => $("orbitCv");
const geom = () => { const c = cv(), W = c.clientWidth, cx = W / 2, R0 = W * 0.47, r1 = W * 0.12; const w = (R0 - r1) / Math.max(1, R.length); return { W, cx, R0, r1, w }; };

export function initOrbits() {
  $("orbAdd").onclick = () => { if (R.length < 8) { R.push({ inst: "tom", cells: new Array(6).fill(0), p: 0.5, ent: -1, anti: false, vel: 0.8 }); render(); refresh(); } };
  $("orbPlay").onclick = () => (stop ? halt() : play());
  $("orbOpen").onclick = () => { pass(7); lastM = measureBar(memory()); paint(); status(); };
  wireExport($("orbMidi"), $("orbWav"), () => buildOrbits(4), "orbits");
  cv().addEventListener("pointerdown", click);
  window.addEventListener("resize", paint);
  on("q", () => { paint(); refresh(); }); on("show", paint);
  $("orbRings").addEventListener("change", refresh);
  render();
}
function status() {
  $("orbStatus").innerHTML = lastM ? `The box is open: the cat is <b>${lastM.alive ? "alive" : "dead"}</b>.` : "Tap a step: ● hit → ◐ superposed → 🐱 GHZ cat → ○ off.";
}
function render() {
  const box = $("orbRings"); box.innerHTML = "";
  R.forEach((r, i) => {
    const d = document.createElement("div"); d.className = "ringRow";
    d.innerHTML = `<i class="sw" style="background:${INK[i % INK.length]}"></i>
      <select class="inst">${Object.entries(DRUMS).map(([k, x]) => `<option value="${k}" ${k === r.inst ? "selected" : ""}>${x[0]}</option>`).join("")}</select>
      <label title="steps around the ring">÷<input type="number" class="n" min="2" max="24" value="${r.cells.length}"></label>
      <label title="|α|² of superposed steps">P<input type="range" class="p" min="0" max="1" step="0.01" value="${r.p}"></label>
      <select class="ent" title="entangle superposed steps with another ring"><option value="-1">free</option>${R.map((_, j) => (j === i ? "" : `<option value="${j}" ${r.ent === j ? "selected" : ""}>⚭ ${j + 1}</option>`)).join("")}</select>
      <button class="mini anti ${r.anti ? "on" : ""}" title="correlated / anti-correlated">${r.anti ? "anti" : "corr"}</button>
      <button class="mini x" title="remove">×</button>`;
    d.querySelector(".inst").onchange = (e) => { r.inst = e.target.value; const [, v, m, , fx] = DRUMS[r.inst]; note(m, ac().currentTime + 0.02, 0.2, v, 0.16, undefined, fx); };
    d.querySelector(".n").onchange = (e) => { const n = Math.max(2, Math.min(24, Math.round(+e.target.value) || 2)); r.cells = Array.from({ length: n }, (_, s) => r.cells[s] || 0); e.target.value = n; lastM = null; paint(); };
    d.querySelector(".p").oninput = (e) => (r.p = +e.target.value);
    d.querySelector(".ent").onchange = (e) => (r.ent = +e.target.value);
    d.querySelector(".anti").onclick = (e) => { r.anti = !r.anti; e.target.textContent = r.anti ? "anti" : "corr"; e.target.classList.toggle("on", r.anti); refresh(); };
    d.querySelector(".x").onclick = () => { R.splice(i, 1); R.forEach((o) => { if (o.ent === i) o.ent = -1; else if (o.ent > i) o.ent--; }); lastM = null; render(); refresh(); };
    box.appendChild(d);
  });
  paint(); status();
}
function click(e) {
  const c = cv(), b = c.getBoundingClientRect(), { cx, R0, r1, w } = geom();
  const x = e.clientX - b.left - cx, y = e.clientY - b.top - cx, rad = Math.hypot(x, y);
  const i = Math.floor((R0 - rad) / w); if (i < 0 || i >= R.length || rad < r1) return;
  const n = R[i].cells.length, a = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  const s = Math.round((a / (2 * Math.PI)) * n) % n;
  R[i].cells[s] = (R[i].cells[s] + 1) % 4;
  const ring = R[i], st = ring.cells[s];
  if (st) {
    const [, voice, midi, , fx] = DRUMS[ring.inst];
    note(midi, ac().currentTime + 0.01, 0.2, voice, 0.16 * ring.vel * (st === 2 ? ring.p : 1), undefined, fx);
  }
  lastM = null; paint(); status(); refresh();
}
export function paint(phase = -1) {
  const c = cv(); if (!c || !c.clientWidth) return;
  const dpr = devicePixelRatio || 1, { W, cx, R0, r1, w } = geom();
  c.width = W * dpr; c.height = W * dpr; c.style.height = W + "px";
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  g.textAlign = "center"; g.textBaseline = "middle";
  R.forEach((r, i) => {
    const rad = R0 - w * (i + 0.5), n = r.cells.length, ink = INK[i % INK.length];
    g.strokeStyle = ink + "40"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cx, rad, 0, 7); g.stroke();
    r.cells.forEach((st, s) => {
      const a = (s / n) * 2 * Math.PI - Math.PI / 2, x = cx + rad * Math.cos(a), y = cx + rad * Math.sin(a), d = Math.min(w * 0.36, (rad * Math.PI) / n * 0.7);
      const v = lastM && lastM.out[i] ? lastM.out[i][s] : null;
      if (v) { g.fillStyle = ink + "33"; g.beginPath(); g.arc(x, y, d * (1.4 + v * 0.6), 0, 7); g.fill(); }
      g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1.4;
      if (st === 0) { g.globalAlpha = 0.35; g.beginPath(); g.arc(x, y, d * 0.28, 0, 7); g.fill(); g.globalAlpha = 1; }
      else if (st === 1) { g.beginPath(); g.arc(x, y, d * 0.7, 0, 7); g.fill(); }
      else if (st === 2) { g.globalAlpha = v === 0 ? 0.4 : 1; g.beginPath(); g.arc(x, y, d * 0.7, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, d * 0.7, a + Math.PI / 2, a + (3 * Math.PI) / 2); g.fill(); g.globalAlpha = 1; }
      else { g.font = d * 1.5 + "px serif"; g.fillText(lastM ? (lastM.alive ? "😺" : "💀") : "🐱", x, y + 1); }
    });
  });
  g.fillStyle = "#2a2622"; g.font = "italic 15px Georgia,serif"; g.fillText(S.q.mode === "mwi" ? "all bars" : lastM ? (lastM.alive ? "alive" : "dead") : "?", cx, cx);
  if (phase >= 0) { const a = phase * 2 * Math.PI - Math.PI / 2; g.strokeStyle = "#2a262299"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + r1 * Math.cos(a), cx + r1 * Math.sin(a)); g.lineTo(cx + R0 * Math.cos(a), cx + R0 * Math.sin(a)); g.stroke(); }
}
let raf = 0;
function play() {
  beginPerformance("orbits", halt);
  const mem = memory(); pass(7);
  stop = runLoop(() => 240 / S.bpm, (i, t, bus) => {
    const m = measureBar(mem), bar = 240 / S.bpm;
    color(barNotes(m, 0, bar), { bar, total: bar }).forEach((n) => note(n.midi, t + n.t, n.dur, n.voice, n.vel, bus, n.fx));
    at(t, () => { lastM = m; barT0 = t; status(); });
  });
  barT0 = ac().currentTime + 0.1;
  const tick = () => { if (!stop) return; paint(Math.max(0, ((ac().currentTime - barT0) / (240 / S.bpm)) % 1)); raf = requestAnimationFrame(tick); };
  tick();
  $("orbPlay").textContent = "■ Stop";
}
function halt() { endPerformance("orbits"); clearTimeout(refreshTimer); stop && stop(); stop = null; cancelAnimationFrame(raf); paint(); $("orbPlay").textContent = "▶ Spin"; }

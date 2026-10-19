// II · Pair — two particles, each a 16-step tune drawn as a closed orbit (angle = time, radius = overtone degree).
// Operate on one and, while entangled, the other answers by the rule table.
import { S, $, on, pal, OPS, op, applyPair, degMidi, DEG_MIN, DEG_MAX } from "./world.js";
import { draw as pick, pass } from "./ket.js";
import { note, runLoop, at, ac } from "./audio.js";
import { pairBranches, pairNotes, stream, color, buildPair } from "./score.js";
import { wireExport } from "./export.js";

const LV = DEG_MAX - DEG_MIN + 1, ACTS = ["mirror", "reverse", "excite", "relax", "precess"];
const PAST = { mirror: "mirrored", reverse: "reversed", excite: "excited", relax: "relaxed", precess: "precessed", none: "left alone" };
const INKS = { A: "#c2452d", B: "#2d5fc2" };
let stop = null, now = -1, refreshTimer = 0;
function refresh() {
  if (!stop) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (stop) { halt(); play(); } }, 180);
}

export function initPair() {
  document.querySelectorAll(".acts").forEach((box) => ACTS.forEach((t) => {
    const b = document.createElement("button"); b.className = "mini"; b.textContent = OPS[t];
    b.onclick = () => {
      const who = box.dataset.p, other = who === "A" ? "B" : "A", answer = applyPair(who, t);
      pulse(who); if (answer) pulse(other);
      log(`${who} ${PAST[t]}` + (answer ? ` — and <b>${other} ${PAST[answer]}</b>, at once` : " · the particles are separable"));
      paint(); refresh();
    };
    box.appendChild(b);
  }));
  rules();
  $("bellOp").innerHTML = ACTS.map((t) => `<option value="${t}">${OPS[t]}</option>`).join("");
  $("link").onclick = () => { S.linked = !S.linked; $("link").classList.toggle("on", S.linked); $("link").textContent = S.linked ? "⚭ Entangled" : "○ Separable"; paint(); refresh(); };
  $("bellGo").onclick = () => {
    S.bell = { t: $("bellOp").value, type: $("bellType").value };
    log(`Bell pair prepared, (${S.bell.type === "phi" ? "|00⟩+|11⟩" : "|01⟩+|10⟩"})/√2 over {as is, ${OPS[S.bell.t]}}. Dashed orbits are the other branch.` + (S.q.mode === "mwi" ? " Under Many-Worlds both branches will sound." : " Playing will measure it."));
    paint(); refresh();
  };
  $("bellCollapse").onclick = () => { collapseBell(); refresh(); };
  $("teleport").onclick = teleport;
  $("pairPlay").onclick = () => (stop ? halt() : play());
  wireExport($("pairMidi"), $("pairWav"), () => buildPair(4), "pair");
  ["A", "B"].forEach((w) => $("orb" + w).addEventListener("pointerdown", (e) => edit(w, e)));
  addEventListener("resize", paint); on("pair", paint); on("show", paint); on("q", refresh); on("ens", refresh); on("links", refresh);
  paint();
}
const log = (h) => ($("pairLog").innerHTML = h);
function pulse(w) { const c = $("orb" + w); c.classList.add("pulse"); setTimeout(() => c.classList.remove("pulse"), 260); }
function rules() {
  $("rules").innerHTML = ACTS.map((t) => `<label>${OPS[t]} ⟷ <select data-t="${t}">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${S.rule[t] === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>`).join("");
  $("rules").querySelectorAll("select").forEach((s) => (s.onchange = () => { S.rule[s.dataset.t] = s.value; refresh(); }));
}

// Teleportation: Bell measurement → two classical bits → B applies the correction and receives A's tune.
// No-cloning: A's original is destroyed.
const CORR = [["none", "nothing"], ["reverse", "X (reverse)"], ["mirror", "Z (mirror)"], ["both", "ZX (mirror, then reverse)"]];
function teleport() {
  if (S.q.mode === "pilot") pass(5);
  const bits = pick([1, 1, 1, 1]);
  const [corr, label] = CORR[bits];
  let tune = S.A.map((d) => (d == null ? null : Math.max(DEG_MIN, Math.min(DEG_MAX, d - 4))));
  if (corr === "mirror" || corr === "both") tune = op(tune, "mirror");
  if (corr === "reverse" || corr === "both") tune = op(tune, "reverse");
  S.B = tune;
  S.A = S.A.map((d) => (d == null || pick([1, 1]) ? null : DEG_MIN + pick(new Array(LV).fill(1))));
  pulse("A"); pulse("B"); paint(); refresh();
  log(`Bell measurement → bits <b>${bits.toString(2).padStart(2, "0")}</b>. B applies ${label} and now carries A's tune intact. <b>No-cloning:</b> A's original dissolved into noise.`);
}
export function collapseBell() {
  if (!S.bell) return null;
  const { t, type } = S.bell; if (S.q.mode === "pilot") pass(4);
  const a = pick([1, 1]), b = type === "phi" ? a : 1 - a;
  if (a) S.A = op(S.A, t); if (b) S.B = op(S.B, S.rule[t]);
  S.bell = null;
  log(`Pair measured → |${a}${b}⟩: A ${a ? PAST[t] : "kept as is"}, B ${b ? PAST[S.rule[t]] : "kept as is"}.`);
  pulse("A"); pulse("B"); paint(); return [a, b];
}

const geo = (w) => { const c = $("orb" + w), W = c.clientWidth; return { c, W, cx: W / 2, r0: W * 0.1, R: W * 0.46 }; };
const rOf = (d, g) => g.r0 + ((d - DEG_MIN + 0.5) / LV) * (g.R - g.r0);
const xy = (s, d, g) => { const a = (s / 16) * 2 * Math.PI - Math.PI / 2, r = rOf(d, g); return [g.cx + r * Math.cos(a), g.cx + r * Math.sin(a)]; };
function edit(w, e) {
  const g = geo(w), b = g.c.getBoundingClientRect(), x = e.clientX - b.left - g.cx, y = e.clientY - b.top - g.cx, r = Math.hypot(x, y);
  if (r < g.r0 || r > g.R) return;
  const s = Math.round((((Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 16) % 16;
  const d = Math.max(DEG_MIN, Math.min(DEG_MAX, DEG_MIN + Math.floor(((r - g.r0) / (g.R - g.r0)) * LV)));
  S[w][s] = S[w][s] === d ? null : d;
  if (S[w][s] != null) note(degMidi(d) + (w === "A" ? 12 : 0), ac().currentTime + 0.01, 0.3, w === "A" ? pal().mel : pal().ctr, 0.14);
  paint(); refresh();
}
function orbit(w, tune, ghost) {
  const g = geo(w); if (!g.W) return;
  const dpr = devicePixelRatio || 1; g.c.width = g.W * dpr; g.c.height = g.W * dpr; g.c.style.height = g.W + "px";
  const x = g.c.getContext("2d"); x.scale(dpr, dpr);
  const ink = INKS[w];
  for (let d = DEG_MIN; d <= DEG_MAX; d++) { x.strokeStyle = d % 8 === 0 ? "#2a262240" : "#2a262214"; x.lineWidth = d % 8 === 0 ? 1.2 : 1; x.beginPath(); x.arc(g.cx, g.cx, rOf(d, g), 0, 7); x.stroke(); }
  for (let s = 0; s < 16; s++) { const [a, b] = xy(s, DEG_MIN - 0.5, g), [c, d] = xy(s, DEG_MAX + 0.5, g); x.strokeStyle = s % 4 ? "#2a262212" : "#2a262233"; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); }
  if (now >= 0) { const [a, b] = xy(now, DEG_MIN - 0.5, g), [c, d] = xy(now, DEG_MAX + 0.5, g); x.strokeStyle = ink; x.lineWidth = 3; x.globalAlpha = 0.35; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); x.globalAlpha = 1; }
  const trace = (arr, dashed, alpha) => {
    const pts = arr.map((d, s) => (d == null ? null : xy(s, d, g))).filter(Boolean);
    x.globalAlpha = alpha; x.strokeStyle = ink; x.lineWidth = 1.6; x.setLineDash(dashed ? [4, 4] : []);
    if (pts.length > 1) { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.stroke(); }
    pts.forEach(([a, b]) => { x.beginPath(); x.arc(a, b, dashed ? 4 : 5, 0, 7); dashed ? x.stroke() : (x.fillStyle = ink, x.fill()); });
    x.setLineDash([]); x.globalAlpha = 1;
  };
  if (ghost) trace(ghost, true, 0.8);
  trace(tune, false, ghost ? 0.6 : 1);
  x.fillStyle = ink; x.font = "italic 600 20px Georgia,serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(w, g.cx, g.cx);
}
export function paint() {
  const b = S.bell;
  orbit("A", S.A, b && op(S.A, b.t)); orbit("B", S.B, b && op(S.B, S.rule[b.t]));
  $("pairBond").classList.toggle("on", S.linked);
}
function play() {
  const e8 = () => 30 / S.bpm; let hs = null, cyc = 0;
  stop = runLoop(e8, (i, t, bus) => {
    const s = i % 16;
    if (!s) {
      const pend = S.bell, measured = pend && S.q.mode !== "mwi";
      if (measured) collapseBell();
      if (S.links.specToPair) { if (!hs) hs = stream(); } else hs = null;
      const e = e8(), raw = pairNotes(pairBranches(S.A, S.B, S.bell), 0, e, hs);
      color(raw, { bar: 8 * e, total: 16 * e, offset: cyc * 16 * e, ticks: !!measured, bell: S.bell || (measured ? null : pend) }).forEach((n) => note(n.midi, t + n.t, n.dur, n.voice, n.vel, bus, n.fx));
      cyc++;
    }
    at(t, () => { now = s; paint(); });
  });
  $("pairPlay").textContent = "■ Stop";
}
function halt() { clearTimeout(refreshTimer); stop && stop(); stop = null; now = -1; paint(); $("pairPlay").textContent = "▶ Orbit"; }

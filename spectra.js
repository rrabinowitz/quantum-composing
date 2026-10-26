// I · Spectra — a superposition of harmonic spectra drawn as phasors in the complex plane.
// Drag a phasor: its length is |α|, its angle is φ. Probe it with a harmonic of D to measure.
import { S, $, on, emit, pal, SPECTRUM_NAMES, SPECTRA, voicing, contains, harmMidi, degMidi, beginPerformance, endPerformance } from "./world.js";
import { odds, born, draw, look, rand, pass, toC, fromC } from "./ket.js";
import { ac, note, pad, createBus, runLoop, at, noiseSrc } from "./audio.js";
import { collapseSound, buildSpectra } from "./score.js";
import { wireExport } from "./export.js";

export const HUE = ["#c2452d", "#2d5fc2", "#1f8a5b", "#b8860b", "#7b3fa0", "#3b8ea5", "#d0657f", "#6b5d3f"];
let sound = null, won = null, lastK = null, prepT = performance.now(), restoreAt = 0, worlds = 1, probeLoop = null;
let drag = -1, flash = -1, flashUntil = 0, lastF = performance.now(), ringMode = S.q.mode;

export function initSpectra() {
  chips(); probe();
  $("specAdd").onclick = () => { if (S.spec.length >= 8) return; const used = S.spec.map((s) => s.name); S.spec.push({ name: SPECTRUM_NAMES.find((n) => !used.includes(n)), mag: 0.5, phase: Math.round(rand() * 360) }); prepare(); chips(); rebuild(); };
  $("specSound").onclick = () => (sound ? silence() : start());
  $("specMeasure").onclick = () => collapse(null, "A direct look");
  $("specPrep").onclick = () => { prepare(); say("Prepared again: " + ket()); };
  document.querySelectorAll("#specGates button").forEach((b) => (b.onclick = () => gate(b.dataset.g)));
  wireExport($("specMidi"), $("specWav"), () => buildSpectra(8), "spectra");
  const c = $("specCv");
  c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
  addEventListener("pointerup", () => { if (drag >= 0) audition(S.spec[drag]); drag = -1; });
  addEventListener("pointercancel", () => (drag = -1));
  on("q", () => { prepare(); chips(); if (ringMode !== S.q.mode) { ringMode = S.q.mode; if (S.ensemble === "auto") rebuild(); } }); on("ens", rebuild); on("spec", () => { prepare(); chips(); rebuild(); }); on("links", syncProbeLoop);
  requestAnimationFrame(frame);
}
const say = (h) => ($("specStatus").innerHTML = h);
function aim(param, value, time, tau) {
  param.cancelScheduledValues(time);
  param.setValueAtTime(param.value, time);
  param.setTargetAtTime(value, time, tau);
}
function audition(s) {
  note(voicing(s.name)[1], ac().currentTime + 0.01, 0.7, pal().mel, 0.08 + 0.3 * s.mag, undefined,
    { pan: Math.sin((s.phase * Math.PI) / 180) * 0.8 });
}
function ket() { const s = Math.sqrt(S.spec.reduce((a, x) => a + x.mag * x.mag, 0)) || 1; return S.spec.map((x) => (x.mag / s).toFixed(2) + (x.phase ? "·e<sup>i" + x.phase + "°</sup>" : "") + "|" + x.name + "⟩").join(" + "); }
function prepare() { won = null; prepT = performance.now(); restoreAt = 0; worlds = 1; if (S.q.mode === "pilot") pass(0); }

function gate(g) {
  const L = S.spec, N = L.length, A = L.map(toC); let B = A, msg = "";
  if (g === "H") { B = A.map((_, j) => { let re = 0, im = 0; A.forEach(([r, i], k) => { const a = (2 * Math.PI * j * k) / N; re += r * Math.cos(a) - i * Math.sin(a); im += r * Math.sin(a) + i * Math.cos(a); }); return [re / Math.sqrt(N), im / Math.sqrt(N)]; }); msg = "Fourier transform: every spectrum is now a blend of all of them."; }
  else if (g === "X") { B = A.map((_, k) => A[(k - 1 + N) % N]); msg = "Shift: each amplitude moved to the next spectrum."; }
  else if (g === "Z") { B = A.map(([r, i], k) => (k % 2 ? [-r, -i] : [r, i])); msg = "Z: every second phasor turned through 180°."; }
  else if (g === "T") { B = A.map(([r, i], k) => { const a = (k * Math.PI) / 4; return [r * Math.cos(a) - i * Math.sin(a), r * Math.sin(a) + i * Math.cos(a)]; }); msg = "T: a 45° phase ramp along the list."; }
  else if (g === "tunnel") {
    // through the barrier: amplitude leaks to the far corner of the ratio lattice
    const p = odds(L), top = SPECTRA[L[p.indexOf(Math.max(...p))].name];
    const far = SPECTRUM_NAMES.find((n) => { const s = SPECTRA[n]; return s.a === -top.a - (top.a === 0 ? 2 : 0) && s.b === -top.b - (top.b === 0 ? 1 : 0) && s.q === (top.q === "+" ? "−" : "+"); }) || "C#↓+";
    const hit = L.find((x) => x.name === far);
    if (hit) hit.mag = Math.min(1, hit.mag + 0.25); else if (L.length < 8) L.push({ name: far, mag: 0.35, phase: Math.round(rand() * 360) });
    emit("spec"); say(`Tunnelled: amplitude leaked through the barrier from <b>${L[p.indexOf(Math.max(...p))].name}</b> to the far side of the lattice, <b>${far}</b> (${SPECTRA[far].ratio}).`); return;
  }
  fromC(L, B); emit("spec"); say(msg + " " + ket());
}

function chips() {
  const box = $("specChips"); box.innerHTML = "";
  S.spec.forEach((s, i) => {
    const d = document.createElement("div"); d.className = "chip"; d.style.setProperty("--h", HUE[i % HUE.length]);
    d.innerHTML = `<i></i><select>${SPECTRUM_NAMES.map((n) => `<option value="${n}" ${n === s.name ? "selected" : ""}>${n}  ${SPECTRA[n].ratio}</option>`).join("")}</select><b class="pr"></b><button class="mini" title="remove">×</button>`;
    d.querySelector("select").onchange = (e) => { s.name = e.target.value; prepare(); rebuild(); audition(s); };
    d.querySelector("button").onclick = () => { if (S.spec.length > 1) { S.spec.splice(i, 1); prepare(); chips(); rebuild(); } };
    box.appendChild(d);
  });
}
function probe() {
  const box = $("probe");
  for (let n = 1; n <= 16; n++) {
    const b = document.createElement("button"); b.className = "harm"; b.innerHTML = n; b.title = "harmonic " + n + " of D";
    b.style.setProperty("--k", Math.log2(n) / 4);
    b.onpointerdown = () => {
      const m = harmMidi(n) + (n < 4 ? 24 : n < 8 ? 12 : 0);
      const p = odds(S.spec);
      const strength = p.reduce((sum, w, i) => sum + (contains(S.spec[i].name, m) ? w : 0), 0);
      const pan = S.spec.reduce((sum, s, i) => sum + p[i] * Math.sin((s.phase * Math.PI) / 180), 0);
      note(m, ac().currentTime + 0.01, 0.8, pal().mel, 0.06 + 0.28 * strength, undefined, { pan });
      b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 200);
      if (won == null || S.q.mode === "zeno") collapse(m, "Harmonic " + n, false);
    };
    box.appendChild(b);
  }
}

// ---- the complex plane ----
const G = () => { const c = $("specCv"), W = c.clientWidth; return { c, W, cx: W / 2, R: W * 0.4 }; };
function down(e) {
  const { c, cx, R } = G(), b = c.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  let best = -1, bd = 22;
  S.spec.forEach((s, i) => { const [re, im] = toC(s), d = Math.hypot(cx + re * R - x, cx - im * R - y); if (d < bd) { bd = d; best = i; } });
  drag = best; if (best >= 0) { c.setPointerCapture(e.pointerId); move(e); }
}
function move(e) {
  if (drag < 0) return;
  const { c, cx, R } = G(), b = c.getBoundingClientRect(), x = (e.clientX - b.left - cx) / R, y = -(e.clientY - b.top - cx) / R;
  const s = S.spec[drag]; s.mag = +Math.min(1, Math.hypot(x, y)).toFixed(2); s.phase = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  prepare();
}
function coherence() { return S.q.mode === "decoherence" ? Math.exp(-S.q.gamma * ((performance.now() - prepT) / 1000) * 0.5) : 1; }

function frame() {
  const now = performance.now(), dt = (now - lastF) / 1000; lastF = now;
  const t = now / 1000, p = odds(S.spec), mode = S.q.mode, c = coherence();
  if (sound && won == null) {
    if (mode === "decoherence" && c < 0.05) collapse(null, "The environment");
    else if (mode === "grw" && rand() < S.q.grw * dt * 0.5) collapse(null, "A spontaneous GRW hit");
  }
  if (restoreAt && now > restoreAt) { prepare(); say("GRW: the state has spread back into superposition."); }
  const shim = (s) => (won == null ? 1 + 0.6 * c * Math.cos(2 * Math.PI * 0.5 * t + (s.phase * Math.PI) / 180) : 1);
  if (sound) {
    const ct = ac().currentTime;
    aim(sound.env.gain, mode === "decoherence" && won == null ? (1 - c) * 0.05 : 0, ct, 0.2);
    S.spec.forEach((s, i) => {
      const lvl = won == null ? Math.sqrt(p[i]) * shim(s) : won === i ? 1.3 : 0;
      const L = sound.layers[i]; if (!L) return;
      aim(L.g.gain, lvl * 0.05, ct, 0.04);
      if (L.p.pan) aim(L.p.pan, won === i ? 0 : Math.max(-1, Math.min(1, Math.cos((s.phase * Math.PI) / 180) * 0.7 * (won == null ? c : 1))), ct, 0.15);
    });
  }
  // chips
  [...$("specChips").children].forEach((d, i) => { const shown = won == null ? p[i] : won === i ? 1 : 0; d.querySelector(".pr").textContent = Math.round(shown * 100) + "%"; d.classList.toggle("won", won === i || (flash === i && now < flashUntil)); d.classList.toggle("lost", won != null && won !== i); });
  // plane
  const { c: cv, W, cx, R } = G();
  if (W) {
    const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = W * dpr; cv.style.height = W + "px";
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    g.strokeStyle = "#2a262222"; g.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach((r) => { g.beginPath(); g.arc(cx, cx, R * r, 0, 7); g.stroke(); });
    g.beginPath(); g.moveTo(cx - R * 1.1, cx); g.lineTo(cx + R * 1.1, cx); g.moveTo(cx, cx - R * 1.1); g.lineTo(cx, cx + R * 1.1); g.stroke();
    g.fillStyle = "#2a262288"; g.font = "italic 13px Georgia,serif"; g.textAlign = "center";
    g.fillText("Re", cx + R * 1.16, cx + 4); g.fillText("Im", cx, cx - R * 1.14);
    if (mode === "decoherence" && won == null) { g.fillStyle = "#2a2622"; for (let k = 0; k < (1 - c) * 120; k++) { const a = rand() * 7, r = rand() * R; g.globalAlpha = 0.15; g.fillRect(cx + r * Math.cos(a), cx + r * Math.sin(a), 1.5, 1.5); } g.globalAlpha = 1; }
    S.spec.forEach((s, i) => {
      const [re, im] = toC(s), x = cx + re * R, y = cx - im * R, ink = HUE[i % HUE.length];
      const pr = won == null ? p[i] : won === i ? 1 : 0, fade = won != null && won !== i ? 0.2 : 1;
      g.globalAlpha = fade;
      g.fillStyle = ink + "22"; g.beginPath(); g.arc(x, y, 8 + 46 * Math.sqrt(pr) * shim(s) * 0.8, 0, 7); g.fill();
      g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cx); g.lineTo(x, y); g.stroke();
      g.fillStyle = ink; g.beginPath(); g.arc(x, y, drag === i ? 8 : 6, 0, 7); g.fill();
      g.font = "600 14px Georgia,serif"; g.textAlign = x < cx ? "right" : "left"; g.fillText(s.name, x + (x < cx ? -12 : 12), y - 10);
      g.globalAlpha = 1;
    });
    if (mode === "mwi" && worlds > 1) { g.fillStyle = "#2a262299"; g.font = "italic 13px Georgia,serif"; g.textAlign = "left"; g.fillText(worlds + " worlds", 8, W - 10); }
    if (mode === "decoherence" && won == null) { g.fillStyle = "#2a262299"; g.font = "italic 13px Georgia,serif"; g.textAlign = "left"; g.fillText("coherence " + Math.round(c * 100) + "%", 8, W - 10); }
  }
  requestAnimationFrame(frame);
}

// ---- sound ----
function start() {
  beginPerformance("spectra", silence);
  const bus = createBus(), c = ac();
  sound = { bus, layers: S.spec.map((s) => {
    const g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : c.createGain(); g.gain.value = 0; g.connect(p); p.connect(bus);
    return { g, p, stops: voicing(s.name).map((m, k) => pad(k ? m : m + 12, g, pal().chord)) };
  }) };
  const bp = c.createBiquadFilter(), eg = c.createGain(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 0.6; eg.gain.value = 0;
  const ns = noiseSrc(c, c.currentTime, 0, bp); bp.connect(eg); eg.connect(bus);
  sound.env = eg; sound.envStop = () => ns.stop();
  prepT = performance.now(); $("specSound").textContent = "■ Silence"; syncProbeLoop();
}
function silence() {
  endPerformance("spectra");
  if (!sound) return; const s = sound; sound = null;
  s.bus.gain.setTargetAtTime(0, ac().currentTime, 0.15);
  setTimeout(() => { s.layers.forEach((l) => l.stops.forEach((f) => f())); s.envStop(); s.bus.disconnect(); }, 900);
  $("specSound").textContent = "▶ Let it ring"; syncProbeLoop();
}
function rebuild() { if (sound) { const k = won; silence(); start(); won = k; } }

// link: Particle A's tune is the measuring apparatus, one probe per half-cycle
function syncProbeLoop() {
  const want = sound && S.links.pairToSpec;
  if (want && !probeLoop) probeLoop = runLoop(() => 30 / S.bpm, (i, t, bus) => {
    const s = i % 16, d = S.A[s];
    if (d != null) note(degMidi(d) + 12, t, 15 / S.bpm, "strings", 0.16, bus);
    if (s % 8 === 0) { const f = S.A.slice(s, s + 8).find((x) => x != null); if (f != null) at(t, () => { if (won != null && S.q.mode !== "zeno") prepare(); collapse(degMidi(f), "Particle A"); }); }
  });
  else if (!want && probeLoop) { probeLoop(); probeLoop = null; }
}

// ---- measurement: a probe pitch favours spectra that contain it ----
function collapse(midi, cause, soundHit = true) {
  const mode = S.q.mode, p = odds(S.spec);
  const w = midi == null ? p : p.map((x, i) => x * (contains(S.spec[i].name, midi) ? 1 : 0.15));
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  const play = (h) => { const t = ac().currentTime + 0.02; collapseSound(h).forEach((n) => note(n.midi, t + n.t, n.dur, n.voice, n.vel * (sound && n.voice !== "tick" ? 0.5 : 1), undefined, n.fx)); };
  if (mode === "mwi") {
    const k = draw(w), live = w.filter((x) => x / tot > 0.02).length;
    worlds *= Math.max(1, live); flash = k; flashUntil = performance.now() + 700;
    say(`${cause} split the world ${live} ways (${worlds} worlds so far). This copy of you heard <b>${S.spec[k].name}</b>; every other copy heard the rest.`);
    if (soundHit) play(S.spec.map((x, i) => ({ name: x.name, w: p[i] })).filter((x) => x.w > 0.02)); return;
  }
  const k = look(w, lastK), stuck = mode === "zeno" && k === lastK;
  lastK = k; won = k;
  say(`${cause} → <b>${S.spec[k].name}</b> <span class="dim">(${SPECTRA[S.spec[k].name].ratio}, P = ${Math.round((w[k] / tot) * 100)}%)</span>` + (stuck ? " · held by the Zeno effect" : ""));
  if (cause.includes("GRW")) restoreAt = performance.now() + 2500;
  if (soundHit) play([{ name: S.spec[k].name, w: 1 }]);
}

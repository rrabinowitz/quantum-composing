// III · Histories — a piece is a sum over histories. Each section's length (and optionally tempo,
// loudness and survival) is a superposition; performing it measures one history.
import { S, $, on, emit, OPS, op, applyPair, INTERP, pal, ENSEMBLES, beginPerformance, endPerformance } from "./world.js";
import { born, draw, look, rand, pass, odds, entropy } from "./ket.js";
import { note, runEvents, at, ac } from "./audio.js";
import { composer, color, hLabel } from "./score.js";
import { measureBar, barNotes, memory } from "./orbits.js";
import { wireExport } from "./export.js";

const TEMPI = [0.75, 1, 1.3], DYN = [["pp", 0.55], ["mf", 1], ["ff", 1.45]];
const ROLES = ["mel", "ctr", "cp", "chord", "drum"], RN = { mel: "melody", ctr: "counter-melody", cp: "counter-voice", chord: "accompaniment", drum: "drums" };
const HUES = ["#c2452d", "#2d5fc2", "#1f8a5b", "#b8860b", "#7b3fa0", "#3b8ea5"];
let perf = null, count = 0, raf = 0, last = null, refreshTimer = 0;
function changed() {
  last = null;
  if (!perf) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (perf) { halt(); perform(); } }, 180);
}

export function buildHistory() {
  pass(1);
  const Q = S.q, M = S.meas, bar0 = 240 / S.bpm; let li = null;
  const form = S.sections.map((s) => {
    const p = born(s.options), i = look(p, li); li = i;
    return { name: s.name, t: s.t, bars: s.options[i].bars, p: p[i], n: s.options.length,
      tempo: M.tempo ? TEMPI[draw([1, 1.4, 1])] : 1, dyn: M.dyn ? DYN[draw([1, 1.4, 1])] : DYN[1], dead: rand() < (s.dead || 0) };
  });
  const total = form.reduce((a, f) => a + f.bars, 0), next = composer(bar0, S.links.specToHist ? S.hsrc : "static", total), mem = memory();
  const notes = [], labels = [], harmony = [], alive = Object.fromEntries(ROLES.map((r) => [r, true]));
  const decay = M.half > 0 ? 1 - 2 ** (-1 / M.half) : 0;
  let bi = 0, t = 0;
  form.forEach((f) => {
    const A = op(S.A, f.t), B = op(S.B, S.rule[f.t]), bar = bar0 / f.tempo;
    if (decay) ROLES.forEach((r) => { if (!alive[r] && rand() < 0.5) alive[r] = true; });
    if (f.dead) notes.push({ midi: 60, t, dur: 1, voice: "sample", vel: 0.06, role: "fx", gen: true, fx: { sample: "static", len: 1.2 } });
    else if (bi) notes.push({ midi: 60, t: Math.max(0, t - 0.4), dur: 1, voice: "sample", vel: 0.03, role: "fx", gen: true, fx: { sample: "whoosh", len: 1.5, rate: 1.3 } });
    for (let k = 0; k < f.bars; k++, bi++) {
      const from = (k % 2) * 8, gone = [];
      if (decay) ROLES.forEach((r) => { if (alive[r] && rand() < decay) { alive[r] = false; gone.push(r); } });
      const use = S.links.pairToHist, r = next(use ? A.slice(from, from + 8) : null, use ? B.slice(from, from + 8) : null, t, bar);
      let bn = r.notes;
      if (S.links.orbitToHist) bn = bn.concat(barNotes(measureBar(mem), t, bar));
      bn = bn.filter((n) => (f.dead ? n.role === "bass" || n.role === "fx" : !ROLES.includes(n.role) || alive[n.role]));
      bn.forEach((n) => (n.vel *= f.dyn[1]));
      gone.forEach(() => bn.push({ midi: 60, t: t + 0.01, dur: 0.2, voice: "sample", vel: 0.05, role: "fx", gen: true, fx: { sample: "geiger", len: 0.25, offset: rand() * 3 } }));
      notes.push(...bn); harmony.push(r.h);
      const { c, W, collapsing, T, obs } = r.info;
      const extra = Q.mode === "mwi" ? ` · ${W} world${W > 1 ? "s" : ""}` : Q.mode === "decoherence" ? ` · coherence ${Math.round(c * 100)}%` : collapsing ? " · <b>spontaneous collapse</b>" : "";
      labels.push({ t, html: `<b>${f.name}</b> ${k + 1}/${f.bars} · ${f.dyn[0]}${f.tempo !== 1 ? " · ×" + f.tempo : ""} · <b>${hLabel(r.h)}</b>` +
        (obs ? ` (melody hears <b>${obs.mel.name}</b>, counter-voice hears <b>${obs.cp.name}</b>)` : "") + ` · T = ${T.toFixed(2)}${extra}` +
        (gone.length ? " · ☢ " + gone.map((x) => RN[x]).join(", ") + " decayed" : "") + (f.dead ? " · <b>the cat is dead</b>; only the bass is left" : "") });
      t += bar;
    }
  });
  return { form, notes: color(notes, { bar: bar0, total: t }), labels, harmony, total: t, bpm: S.bpm, mode: Q.mode };
}

export function initHistories() {
  render();
  $("secAdd").onclick = () => { S.sections.push({ name: "αβγδεζηθικλμνξοπρστυφχψω"[S.sections.length % 24], t: "none", dead: 0, options: [{ bars: 2, mag: 1 }, { bars: 4, mag: 1 }] }); render(); changed(); };
  $("hsrc").onchange = (e) => (S.hsrc = e.target.value);
  $("spread").oninput = (e) => (S.spread = +e.target.value);
  $("bpm").oninput = (e) => { S.bpm = +e.target.value; $("bpmV").textContent = S.bpm; };
  $("mTempo").onchange = (e) => (S.meas.tempo = e.target.checked);
  $("mDyn").onchange = (e) => (S.meas.dyn = e.target.checked);
  $("mHalf").oninput = (e) => { S.meas.half = +e.target.value; $("mHalfV").textContent = S.meas.half ? S.meas.half + " bars" : "∞"; };
  $("histGo").onclick = () => (perf ? halt() : perform());
  $("histories").addEventListener("change", changed);
  on("q", changed); on("ens", changed); on("links", changed); on("orch", changed);
  wireExport($("histMidi"), $("histWav"), () => last || (last = record(buildHistory())), "history");
}

function render() {
  const box = $("secs"); box.innerHTML = "";
  S.sections.forEach((sec, si) => {
    const d = document.createElement("div"); d.className = "sec"; d.style.setProperty("--h", HUES[si % HUES.length]);
    const p = born(sec.options);
    d.innerHTML = `<div class="secHead"><input class="nm" value="${sec.name}"><select class="tf" title="operation applied to the Pair in this section">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${sec.t === k ? "selected" : ""}>${v}</option>`).join("")}</select><button class="mini del" title="remove">×</button></div>
      <div class="forks">${sec.options.map((o, i) => `<div class="fork" data-i="${i}"><span class="prong" style="opacity:${0.25 + p[i] * 0.75}"></span><input type="number" class="bars" min="1" max="32" value="${o.bars}"><small>bars</small><input type="range" class="mag" min="0" max="1" step="0.01" value="${o.mag}"><b class="pp">${Math.round(p[i] * 100)}%</b><button class="mini rm">×</button></div>`).join("")}</div>
      <div class="secFoot"><button class="mini addO">+ length</button><label title="chance the cat is found dead in this section (only the bass survives)">☠<input type="range" class="dead" min="0" max="1" step="0.01" value="${sec.dead || 0}"><span>${Math.round((sec.dead || 0) * 100)}%</span></label></div>`;
    d.querySelector(".nm").oninput = (e) => (sec.name = e.target.value);
    d.querySelector(".tf").onchange = (e) => (sec.t = e.target.value);
    d.querySelector(".del").onclick = () => { if (S.sections.length > 1) { S.sections.splice(si, 1); render(); changed(); } };
    d.querySelectorAll(".fork").forEach((el) => {
      const o = sec.options[+el.dataset.i];
      el.querySelector(".bars").onchange = (e) => (o.bars = Math.max(1, Math.min(32, Math.round(+e.target.value) || 1)));
      el.querySelector(".mag").oninput = (e) => { o.mag = +e.target.value; const pp = born(sec.options); d.querySelectorAll(".fork").forEach((f, k) => { f.querySelector(".pp").textContent = Math.round(pp[k] * 100) + "%"; f.querySelector(".prong").style.opacity = 0.25 + pp[k] * 0.75; }); };
      el.querySelector(".rm").onclick = () => { if (sec.options.length > 1) { sec.options.splice(+el.dataset.i, 1); render(); changed(); } };
    });
    d.querySelector(".addO").onclick = () => { sec.options.push({ bars: 4, mag: 0.5 }); render(); changed(); };
    d.querySelector(".dead").oninput = (e) => { sec.dead = +e.target.value; d.querySelector(".secFoot span").textContent = Math.round(sec.dead * 100) + "%"; };
    box.appendChild(d);
  });
}

function record(P) {
  count++;
  const { form, harmony, total } = P, bars = harmony.length, worlds = form.reduce((a, f) => a * f.n, 1);
  const li = document.createElement("li");
  li.innerHTML = `<b>History ${count}</b> · ${INTERP[P.mode][0]} · ${form.map((f) => (f.dead ? "☠" : "") + f.name + f.bars).join(" → ")} · ${bars} bars · ${total.toFixed(0)} s · P = ${(form.reduce((a, f) => a * f.p, 1) * 100).toFixed(2)}%` +
    (P.mode === "mwi" ? ` · one of ${worlds} formal worlds` : "") + (P.mode === "pilot" ? ` · seed ${S.q.seed}` : "");
  $("histLog").prepend(li);
  if (S.links.histToSpec && S.links.specToHist && bars) {
    const freq = {}; harmony.forEach((h) => h.forEach(({ name, w }) => (freq[name] = (freq[name] || 0) + w / bars)));
    const s = S.spec.reduce((a, x) => a + x.mag * x.mag, 0) || 1;
    S.spec.forEach((x) => (x.mag = +Math.sqrt((0.7 * x.mag * x.mag) / s + 0.3 * (freq[x.name] || 0)).toFixed(2)));
    emit("spec");
  }
  if (S.links.histToPair) { const f = form[form.length - 1]; if (f && f.t !== "none") { applyPair("A", f.t); emit("pair"); } }
  return P;
}

function perform() {
  beginPerformance("histories", halt);
  const P = (last = record(buildHistory()));
  const tl = $("worldline"); tl.innerHTML = "";
  P.form.forEach((f, i) => { const b = document.createElement("div"); b.className = "seg" + (f.dead ? " dead" : ""); b.style.flex = f.bars / f.tempo; b.style.background = HUES[i % HUES.length]; b.innerHTML = `${f.dead ? "☠ " : ""}${f.name}<small>${f.bars} · ${Math.round(f.p * 100)}%</small>`; tl.appendChild(b); });
  const head = document.createElement("div"); head.className = "head"; tl.appendChild(head);
  const ev = P.notes.map((n) => ({ t: n.t, fn: (time, bus) => note(n.midi, time, n.dur, n.voice, n.vel, bus, n.fx) }));
  P.labels.forEach((l) => ev.push({ t: l.t, fn: (time) => at(time, () => ($("histStatus").innerHTML = l.html)) }));
  perf = runEvents(ev, () => { endPerformance("histories"); perf = null; cancelAnimationFrame(raf); $("histStatus").innerHTML = "The history is complete."; head.remove(); $("histGo").textContent = "▶ Live one history"; });
  const tick = () => { if (!perf) return; head.style.left = Math.min(1, Math.max(0, (ac().currentTime - perf.t0) / P.total)) * 100 + "%"; raf = requestAnimationFrame(tick); };
  tick();
  $("histGo").textContent = "■ Stop";
}
function halt() { endPerformance("histories"); clearTimeout(refreshTimer); if (perf) perf.stop(); perf = null; cancelAnimationFrame(raf); document.querySelector("#worldline .head")?.remove(); $("histGo").textContent = "▶ Live one history"; }

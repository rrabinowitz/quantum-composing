// The frame: which interpretation, which basis, which ensemble, which couplings.
import { S, $, emit, INTERP, LINKS, ENSEMBLES } from "./world.js";
import { SCORE_VOICES } from "./orch.js";

const PARAM = { zeno: ["zeno", "watching", 0, 0.98, 0.01], decoherence: ["gamma", "γ", 0.05, 1.5, 0.01], grw: ["grw", "λ", 0.02, 1, 0.01] };
const BASIS = { fourier: " Measured in the Fourier basis, the phases interfere.", hadamard: " Hadamard basis: amplitudes interfere in ± pairs.", haar: " A seeded random rotation scrambles amplitudes and phases into new odds." };

export function initFrame() {
  $("interp").innerHTML = Object.entries(INTERP).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
  $("interp").onchange = (e) => { S.q.mode = e.target.value; params(); emit("q"); };
  $("basis").onchange = (e) => { S.q.basis = e.target.value; params(); emit("q"); };
  $("ens").innerHTML = Object.entries(ENSEMBLES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
  $("ens").onchange = (e) => { S.ensemble = e.target.value; params(); emit("ens"); };
  $("linksBtn").onclick = () => { $("links").hidden = !$("links").hidden; $("linksBtn").classList.toggle("on", !$("links").hidden); };
  $("links").innerHTML = Object.entries(LINKS).map(([k, [l]]) => `<label><input type="checkbox" data-k="${k}" ${S.links[k] ? "checked" : ""}> ${l}</label>`).join("");
  $("links").querySelectorAll("input").forEach((c) => (c.onchange = () => { S.links[c.dataset.k] = c.checked; emit("links"); }));
  initOrch();
  params();
}
function initOrch() {
  const O = S.orch;
  const slider = (id, key) => {
    const el = $(id);
    const out = el.parentElement.querySelector("output");
    el.oninput = () => { O[key] = +el.value; if (out) out.textContent = el.value; emit("orch"); };
  };
  slider("orchTune", "tune");
  slider("orchInner", "inner");
  slider("orchBass", "bass");
  const choice = (id, key) => { $(id).onchange = (e) => { O[key] = e.target.value; params(); emit("orch"); }; };
  choice("orchTuneDouble", "tuneDouble");
  choice("orchInnerDouble", "innerDouble");
  choice("orchBassDouble", "bassDouble");
  choice("orchLong", "longNotes");
  choice("orchChairs", "chairs");
  const ens = Object.entries(ENSEMBLES).filter(([k]) => k !== "auto");
  $("orchScore").innerHTML = `<option value="score">As scored</option><option value="hand">Assign by hand</option>` + ens.map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
  $("orchScore").onchange = (e) => {
    O.rescore = e.target.value;
    O.palette = ENSEMBLES[e.target.value]?.[1] || null;
    $("orchHand").hidden = e.target.value !== "hand";
    params();
    emit("orch");
  };
  const hands = [["handMel", "mel"], ["handCtr", "ctr"], ["handCp", "cp"], ["handChord", "chord"], ["handBass", "bass"]];
  const voiceOptions = (current) => SCORE_VOICES.map((v) => `<option ${v === current ? "selected" : ""}>${v}</option>`).join("");
  hands.forEach(([id, key]) => {
    const el = $(id);
    el.innerHTML = voiceOptions(O.hand[key]);
    el.onchange = (e) => { O.hand[key] = e.target.value; emit("orch"); };
  });
}
function params() {
  const Q = S.q, box = $("qParam"), P = PARAM[Q.mode];
  box.innerHTML = "";
  if (P) {
    const [k, l, lo, hi, st] = P;
    box.innerHTML = `<label class="lbl">${l} <input type="range" min="${lo}" max="${hi}" step="${st}" value="${Q[k]}"><span>${Q[k]}</span></label>`;
    const r = box.querySelector("input"); r.oninput = () => { Q[k] = +r.value; box.querySelector("span").textContent = r.value; emit("q"); };
  } else if (Q.mode === "pilot" || Q.basis === "haar") {
    box.innerHTML = `<label class="lbl">seed <input type="number" value="${Q.seed}"></label><button class="mini" title="new hidden variables">⚄</button>`;
    const n = box.querySelector("input");
    n.onchange = () => { Q.seed = Math.floor(+n.value) || 0; emit("q"); };
    box.querySelector("button").onclick = () => { Q.seed = Math.floor(Math.random() * 1e6); n.value = Q.seed; emit("q"); };
  }
  const scored = S.orch.rescore === "score" ? "" : S.orch.rescore === "hand" ? " Rescored by hand." : " Rescored as " + (ENSEMBLES[S.orch.rescore]?.[0] || S.orch.rescore) + ".";
  const chairs = S.orch.chairs === "grow" ? " Chairs admit one by one." : "";
  $("note").textContent = INTERP[Q.mode][1] + (BASIS[Q.basis] || "") + (S.ensemble === "auto" ? "" : " Ensemble override: " + ENSEMBLES[S.ensemble][0] + ".") + scored + chairs;
}

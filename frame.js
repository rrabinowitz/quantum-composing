// The frame: which interpretation, which basis, which ensemble, which couplings.
import { S, $, emit, INTERP, LINKS, ENSEMBLES } from "./world.js";

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
  params();
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
  $("note").textContent = INTERP[Q.mode][1] + (BASIS[Q.basis] || "") + (S.ensemble === "auto" ? "" : " Ensemble override: " + ENSEMBLES[S.ensemble][0] + ".");
}

import { emit } from "./world.js";
import { initFrame } from "./frame.js";
import { initSpectra } from "./spectra.js";
import { initPair } from "./pair.js";
import { initHistories } from "./histories.js";
import { initOrbits } from "./orbits.js";
import { initRegister } from "./register.js";
import { bindStationVolumes, loadSamples, setActiveStation } from "./audio.js";

document.querySelectorAll("#rail button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#rail button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".st").forEach((s) => s.classList.toggle("on", s.id === b.dataset.st));
  setActiveStation(b.dataset.st);
  emit("show");
}));
bindStationVolumes();
setActiveStation("spectra");
initFrame();
initSpectra();
initPair();
initHistories();
initOrbits();
initRegister();
loadSamples();

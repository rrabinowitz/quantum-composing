import { VOICES as INST } from "./instruments.js";
import { renderVoice } from "./models.js";
import { PERC } from "./percussion.js";
const VOICES = { ...INST, ...PERC };
const RENDER_CACHE = new Map();
function cachedRender(sr, freq, dur, voice, fx) {
  const key = [
    voice, sr, Math.round(freq * 2), Math.round(dur * 20),
    fx.sample || "", fx.vowel || "", fx.open ? 1 : 0, fx.coh == null ? "" : Math.round(fx.coh * 10),
  ].join(":");
  let wave = RENDER_CACHE.get(key);
  if (!wave) {
    wave = renderVoice(sr, freq, dur, voice, fx);
    if (wave) {
      if (RENDER_CACHE.size > 64) RENDER_CACHE.delete(RENDER_CACHE.keys().next().value);
      RENDER_CACHE.set(key, wave);
    }
  }
  return wave;
}
// Kept so offline WAV export can await the same hook. Synthesis no longer needs a worklet.
export async function prepare() {}
export async function loadSamples() {}
const isNative = typeof window !== "undefined" && !!window.webkit?.messageHandlers?.saveBlob;
const isSafari = !isNative && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/.test(navigator.userAgent);
let ctx, master, meter, nativeAudio, streamAudio;
// Jot feedback delay network. Low-frequency T60 is 1.7 s; the one-pole in each loop shortens the highs.
function impulse(c, sec) {
  const sr = c.sampleRate;
  const len = Math.floor(sr * sec);
  const b = c.createBuffer(2, len, sr);
  const L = b.getChannelData(0);
  const R = b.getChannelData(1);
  const seconds = [0.031, 0.037, 0.043, 0.053];
  const lines = seconds.map((s) => {
    const n = Math.max(2, Math.round(s * sr));
    return { buf: new Float32Array(n), w: 0, n, lp: 0, g: 10 ** (-3 * n / (sr * 1.7)) };
  });
  const damp = 0.35;
  let peak = 1e-8;
  for (let i = 0; i < len; i += 1) {
    const x = i === 0 ? 1 : 0;
    const y = lines.map((line) => line.buf[line.w]);
    const sum = y[0] + y[1] + y[2] + y[3];
    for (let k = 0; k < 4; k += 1) {
      const fb = y[k] - 0.5 * sum + (k === 0 ? x : 0);
      const line = lines[k];
      line.lp += (1 - damp) * (fb - line.lp);
      line.buf[line.w] = line.g * line.lp;
      line.w += 1;
      if (line.w >= line.n) line.w = 0;
    }
    L[i] = y[0] + y[2];
    R[i] = y[1] + y[3];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.8 / peak;
  for (let i = 0; i < len; i += 1) { L[i] *= g; R[i] *= g; }
  return b;
}
// Master chain (gain → compressor + reverb) for any context, live or offline.
export function makeOutput(c) {
  const out = c.createGain(); out.gain.value = 0.6;
  const comp = c.createDynamicsCompressor(), verb = c.createConvolver(), wet = c.createGain();
  verb.buffer = impulse(c, 2.4); wet.gain.value = 0.25;
  out.connect(comp); out.connect(verb); verb.connect(wet); wet.connect(comp);
  if (c === ctx) {
    meter = c.createAnalyser(); meter.fftSize = 2048;
    comp.connect(meter);
    if (isSafari && c.createMediaStreamDestination) {
      const stream = c.createMediaStreamDestination();
      meter.connect(stream);
      streamAudio = new Audio();
      streamAudio.srcObject = stream.stream;
      streamAudio.playsInline = true;
    } else meter.connect(c.destination);
  } else comp.connect(c.destination);
  return out;
}
export function ac() {
  if (!ctx) {
    if (navigator.audioSession) {
      try { navigator.audioSession.type = "playback"; } catch (e) { console.warn("Audio session unavailable", e); }
    }
    const LiveContext = window.AudioContext || window.webkitAudioContext;
    ctx = new LiveContext(); master = makeOutput(ctx); ensureStations(); prepare(ctx);
    ctx.onstatechange = () => { if (ctx.state === "running") document.getElementById("audioUnlock")?.remove(); };
  }
  return ctx;
}
function showAudioUnlock() {
  if (document.getElementById("audioUnlock")) return;
  const button = document.createElement("button");
  button.id = "audioUnlock";
  button.textContent = "Sound blocked · tap to enable";
  button.setAttribute("aria-label", "Enable sound");
  button.onclick = unlockAudio;
  document.body.appendChild(button);
}
function unlockAudio() {
  const c = ac();
  if (streamAudio && streamAudio.paused) {
    const playing = streamAudio.play();
    if (playing) playing.catch((e) => {
      console.warn("Native audio output unavailable", e);
      meter.connect(c.destination);
      streamAudio = null;
    });
  }
  if (c.state === "running") return;
  // WebKit may leave resume() pending until a source starts in the same gesture.
  const source = c.createBufferSource();
  source.buffer = c.createBuffer(1, 1, c.sampleRate);
  source.connect(c.destination);
  source.start(0);
  try { Promise.resolve(c.resume()).catch(showAudioUnlock); } catch { showAudioUnlock(); }
  setTimeout(() => { if (c.state !== "running") showAudioUnlock(); }, 600);
}
document.addEventListener("click", unlockAudio, { capture: true });
document.addEventListener("touchend", unlockAudio, { capture: true });
document.addEventListener("keydown", unlockAudio, { capture: true });

// Safari can report a running context even when nothing reaches its output.
if (isSafari) {
  document.addEventListener("click", (e) => {
    const play = e.target.closest("#specSound,#pairPlay,#histGo,#orbPlay,#regPlay");
    if (!play || !play.textContent.startsWith("■")) return;
    const box = document.getElementById("audioStatus") || document.createElement("div");
    box.id = "audioStatus";
    if (!box.isConnected) document.body.appendChild(box);
    box.replaceChildren();
    const label = document.createElement("span"), test = document.createElement("button"), nativeButton = document.createElement("button");
    label.textContent = "Checking Safari audio…";
    test.textContent = "Test tone";
    test.onclick = () => {
      const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.frequency.value = 440; g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + 0.8);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.81);
    };
    nativeButton.textContent = "Play sample";
    nativeButton.onclick = () => {
      if (nativeAudio) nativeAudio.pause();
      nativeAudio = new Audio("sfx/bell-note.wav");
      nativeAudio.play().catch((e) => { label.textContent = `Sample blocked: ${e.name}`; });
    };
    box.append(label, test, nativeButton);
    if (!meter) { label.textContent = "Audio output unavailable"; return; }
    const data = new Uint8Array(meter.fftSize), start = performance.now();
    let peak = 0;
    const sample = () => {
      meter.getByteTimeDomainData(data);
      for (const x of data) peak = Math.max(peak, Math.abs(x - 128));
      if (performance.now() - start < 1600) requestAnimationFrame(sample);
      else label.textContent = `Audio ${ctx.state} · output signal ${Math.round(peak / 128 * 100)}% · ${streamAudio ? streamAudio.paused ? "media paused" : "media playing" : "direct output"}`;
    };
    sample();
  });
}
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const STATIONS = ["spectra", "pair", "histories", "orbits", "register"];
const stationGain = new Map();
const stationLevel = new Map(STATIONS.map((id) => [id, 0.8]));
let activeStation = "spectra";

function ensureStations() {
  if (stationGain.size || !ctx || !master) return;
  for (const id of STATIONS) {
    const gain = ctx.createGain();
    gain.gain.value = stationLevel.get(id) ?? 0.8;
    gain.connect(master);
    stationGain.set(id, gain);
  }
}

function stationInput() {
  ac();
  return stationGain.get(activeStation) || master;
}

export function setActiveStation(id) {
  if (STATIONS.includes(id)) activeStation = id;
}

export function activeStationGain() {
  return stationLevel.get(activeStation) ?? 0.8;
}

export function bindStationVolumes(root = document) {
  root.querySelectorAll("input[data-station]").forEach((input) => {
    const id = input.dataset.station;
    const out = input.parentElement?.querySelector("output");
    const apply = () => {
      const unit = Math.max(0, Math.min(1, Number(input.value) / 100));
      stationLevel.set(id, unit);
      if (out) out.textContent = input.value;
      const node = stationGain.get(id);
      if (!node) return;
      const now = node.context.currentTime;
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(unit, now + 0.03);
    };
    input.addEventListener("input", apply);
    if (out) out.textContent = input.value;
    stationLevel.set(id, Math.max(0, Math.min(1, Number(input.value) / 100)));
  });
}

export function createBus() {
  const c = ac();
  const gain = c.createGain();
  gain.connect(stationInput());
  return gain;
}

function osc(c, type, f, t, end, dest, gain = 1) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f; g.gain.value = gain;
  o.connect(g); g.connect(dest); o.start(t); o.stop(end);
  return o;
}
const noiseCache = new WeakMap(), lfoCache = new WeakMap();
function noiseBuf(c) {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}
export function noiseSrc(c, t, end, dest) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.loop = true;
  s.connect(dest); s.start(t, Math.random() * 1.5); if (end) s.stop(end); return s;
}
// One LFO per context: every voice using it wobbles in perfect lockstep (entangled vibrato).
function sharedLfo(c) {
  let l = lfoCache.get(c);
  if (!l) { l = c.createOscillator(); l.frequency.value = 5.3; l.start(0); lfoCache.set(c, l); }
  return l;
}
const isLive = (c) => c === ctx;
const SUSTAINED = new Set(["strings", "cello", "winds", "choir", "organ", "theremin", "bowedmetal", "pilot", "glass", "reverse", "noise"]);

/* One-shot note. voice: piano | bass | strings | winds | glass | pluck | pilot | noise | tick | thump
   fx: { pan, detune (cents), smear (0..1 — starts as a pitch cluster that collapses onto the note),
         glide (midi to slide from), vib: "shared" | rate(Hz) } */
export function note(midi, t, dur, voice = "piano", vel = 0.15, dest, fx = {}) {
  const c = dest ? dest.context : ac();
  dest = dest || stationInput();
  fx = fx || {};
  let out = dest;
  if (fx.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, fx.pan)); p.connect(dest); out = p; }
  const f = mtof(midi + (fx.detune || 0) / 100), env = c.createGain();
  env.gain.setValueAtTime(0, t);
  const smear = fx.smear || 0, collapseT = 0.03 + smear * 0.5;
  // pitch trajectory for each oscillator: glide or wave-function collapse from a smeared cluster
  const bend = (o, ratio = 1) => {
    const ft = f * ratio, p = o.frequency;
    if (fx.glide != null) { p.setValueAtTime(mtof(fx.glide) * ratio, t); p.exponentialRampToValueAtTime(ft, t + Math.min(dur * 0.8, 0.35)); }
    else if (smear > 0) { p.setValueAtTime(ft * 2 ** (((Math.random() * 2 - 1) * smear * 5) / 12), t); p.exponentialRampToValueAtTime(ft, t + collapseT); }
    return o;
  };
  const vib = (oscs, end, depth = 0.005) => {
    if (!fx.vib) return;
    const g = c.createGain(); g.gain.value = f * depth;
    let src;
    if (fx.vib === "shared") src = sharedLfo(c);
    else { src = c.createOscillator(); src.frequency.value = fx.vib; src.start(t); src.stop(end); }
    src.connect(g); oscs.forEach((o) => g.connect(o.frequency));
    if (isLive(c) && fx.vib === "shared") setTimeout(() => { try { src.disconnect(g); } catch {} }, (end - c.currentTime + 0.2) * 1000);
  };
  // a smeared note also sounds faint ghost partials that collapse onto it
  const ghosts = (end, g = 0.25) => { if (smear > 0.2) for (let k = 0; k < 2; k++) bend(osc(c, "sine", f, t, Math.min(end, t + collapseT * 2), env, g * smear)); };

  const rendered = cachedRender(c.sampleRate, f, Math.max(0.05, dur), voice, fx);
  if (rendered) {
    const buffer = c.createBuffer(1, rendered.length, c.sampleRate);
    buffer.copyToChannel(rendered, 0);
    const src = c.createBufferSource();
    src.buffer = buffer;
    env.connect(out);
    const sustained = SUSTAINED.has(voice);
    const attackAt = t + Math.min(sustained ? 0.03 : 0.008, Math.max(0.003, dur * 0.2)) + smear * 0.02;
    const releaseAt = Math.max(attackAt + 0.01, t + (sustained ? dur : Math.min(buffer.duration, dur + 1.6)));
    env.gain.linearRampToValueAtTime(Math.max(vel, 1e-4), attackAt);
    env.gain.setTargetAtTime(0.0001, releaseAt, sustained ? 0.08 : 0.14);
    if (fx.glide != null && Number.isFinite(fx.glide)) {
      const ratio = Math.max(0.25, mtof(fx.glide) / f);
      src.playbackRate.setValueAtTime(ratio, t);
      src.playbackRate.exponentialRampToValueAtTime(1, t + Math.max(0.02, Math.min(dur * 0.8, 0.35)));
    } else if (smear > 0) {
      const ratio = Math.max(0.5, 2 ** (((Math.random() * 2 - 1) * smear * 4) / 12));
      src.playbackRate.setValueAtTime(ratio, t);
      src.playbackRate.exponentialRampToValueAtTime(1, t + Math.max(0.02, collapseT));
    }
    if (fx.vib) {
      const depth = c.createGain();
      depth.gain.value = 0.006;
      let lfo;
      if (fx.vib === "shared") lfo = sharedLfo(c);
      else {
        lfo = c.createOscillator();
        lfo.frequency.setValueAtTime(Number(fx.vib) || 5, t);
        lfo.start(t);
        lfo.stop(t + buffer.duration + 0.05);
      }
      lfo.connect(depth);
      depth.connect(src.playbackRate);
      if (isLive(c) && fx.vib === "shared") {
        const end = t + buffer.duration + 0.2;
        setTimeout(() => { try { lfo.disconnect(depth); } catch { /* node already gone */ } }, Math.max(0, (end - c.currentTime) * 1000));
      }
    }
    src.connect(env);
    src.start(t);
    src.stop(t + buffer.duration * 2.2 + 0.05);
    return;
  }

  if (voice === "piano" || voice === "bass") {
    const end = t + dur + 1.2;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel, t + 0.006 + smear * 0.08);
    env.gain.exponentialRampToValueAtTime(Math.max(vel * 0.35, 1e-4), t + 0.3 + smear * 0.2);
    env.gain.setTargetAtTime(0.0001, t + dur, 0.25);
    bend(osc(c, "triangle", f, t, end, env));
    bend(osc(c, "sine", f * 2, t, end, env, voice === "bass" ? 0.1 : 0.3), 2);
    ghosts(end);
  } else if (voice === "strings") {
    const end = t + dur + 0.6, lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2200; lp.Q.value = 0.4;
    env.connect(lp); lp.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.55, t + 0.07 + smear * 0.1);
    env.gain.setTargetAtTime(0, t + dur, 0.12);
    const o = [bend(osc(c, "sawtooth", f * 0.997, t, end, env, 0.5), 0.997), bend(osc(c, "sawtooth", f * 1.003, t, end, env, 0.5), 1.003)];
    vib(o, end); ghosts(end);
  } else if (voice === "winds") {
    const end = t + dur + 0.4, lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1500;
    env.connect(lp); lp.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.8, t + 0.035 + smear * 0.1);
    env.gain.setTargetAtTime(0, t + dur, 0.06);
    const o = [bend(osc(c, "triangle", f, t, end, env)), bend(osc(c, "square", f, t, end, env, 0.12))];
    if (!fx.vib) fx.vib = 5.2;
    vib(o, end); ghosts(end);
  } else if (voice === "glass") {
    // coherent: pure sines a hair apart so they beat (audible interference)
    const end = t + dur + 1.5;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.7, t + 0.25);
    env.gain.setTargetAtTime(0, t + dur, 0.45);
    const o = [bend(osc(c, "sine", f, t, end, env, 0.6)), bend(osc(c, "sine", f * 1.004, t, end, env, 0.6), 1.004), bend(osc(c, "sine", f * 3, t, end, env, 0.06), 3)];
    vib(o, end, 0.003);
  } else if (voice === "pluck") {
    // particle: hard transient, fast decay, little noise burst at the pitch
    const end = t + dur + 0.6, bp = c.createBiquadFilter(), ng = c.createGain();
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel, t + 0.002);
    env.gain.exponentialRampToValueAtTime(1e-4, t + Math.max(0.25, dur * 1.3));
    bend(osc(c, "triangle", f, t, end, env)); bend(osc(c, "sine", f * 2, t, end, env, 0.4), 2); bend(osc(c, "sine", f * 4.01, t, end, env, 0.1), 4.01);
    bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 6;
    ng.gain.setValueAtTime(vel * 3, t); ng.gain.exponentialRampToValueAtTime(1e-4, t + 0.04);
    noiseSrc(c, t, t + 0.05, bp); bp.connect(ng); ng.connect(out);
  } else if (voice === "pilot") {
    // the guiding wave: soft gliding sine with a slow filter breath
    const end = t + dur + 0.5, lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(500, t + dur);
    env.connect(lp); lp.connect(out);
    env.gain.linearRampToValueAtTime(vel, t + Math.min(0.2, dur * 0.4));
    env.gain.setTargetAtTime(0, t + dur, 0.15);
    bend(osc(c, "sine", f, t, end, env)); bend(osc(c, "triangle", f * 0.5, t, end, env, 0.5), 0.5);
  } else if (voice === "noise") {
    // the environment: band of noise centred on the pitch
    const end = t + dur + 0.6, bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 0.9;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel, t + dur * 0.4);
    env.gain.setTargetAtTime(0, t + dur * 0.7, 0.2);
    noiseSrc(c, t, end, bp); bp.connect(env);
  } else if (voice === "tick") {
    // Geiger click: a measurement happened
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500 + (midi % 12) * 300;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 4, t + 0.0008);
    env.gain.exponentialRampToValueAtTime(1e-4, t + 0.012);
    noiseSrc(c, t, t + 0.02, hp); hp.connect(env);
  } else if (voice === "thump") {
    // objective collapse: pitch-drop body + crack
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 2.5, t + 0.003);
    env.gain.exponentialRampToValueAtTime(1e-4, t + 0.45);
    const o = osc(c, "sine", 140, t, t + 0.5, env);
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const bp = c.createBiquadFilter(), ng = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.2;
    ng.gain.setValueAtTime(vel * 3, t); ng.gain.exponentialRampToValueAtTime(1e-4, t + 0.07);
    noiseSrc(c, t, t + 0.08, bp); bp.connect(ng); ng.connect(out);
  } else if (VOICES[voice]) {
    VOICES[voice]({ c, f, t, dur, vel, env, out, bend, fx,
      osc: (type, fr, t0, end, d, g) => osc(c, type, fr, t0, end, d, g),
      noise: (t0, end, d) => noiseSrc(c, t0, end, d) });
  }
}

export function pad(midi, dest, voice = "glass") {
  const c = ac();
  const g = c.createGain();
  g.gain.value = 1;
  g.connect(dest);
  const struck = ["guitar", "pizz", "harp", "marimba", "epiano", "reverse", "glass", "vibes", "glassbell", "kalimba", "celesta", "bowl", "piano", "gong"].includes(voice);
  if (struck) {
    const strike = () => note(midi, c.currentTime + 0.05, 1.6, voice, 0.16, g);
    strike();
    const timer = setInterval(strike, 2100);
    return () => { clearInterval(timer); g.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => g.disconnect(), 700); };
  }
  note(midi, c.currentTime + 0.05, 12, voice, 0.16, g);
  const timer = setInterval(() => note(midi, c.currentTime + 0.05, 12, voice, 0.16, g), 11000);
  return () => { clearInterval(timer); g.gain.setTargetAtTime(0, c.currentTime, 0.08); setTimeout(() => g.disconnect(), 800); };
}

export function runLoop(stepDur, onStep) {
  const c = ac(), bus = createBus();
  let next = c.currentTime + 0.1, step = 0;
  const tick = () => { while (next < c.currentTime + 0.2) { onStep(step, next, bus); next += stepDur(); step++; } };
  tick();
  const id = setInterval(tick, 40);
  return () => { clearInterval(id); bus.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => bus.disconnect(), 600); };
}

export function runEvents(events, onEnd) {
  events.sort((a, b) => a.t - b.t);
  const c = ac(), bus = createBus(), t0 = c.currentTime + 0.15;
  let i = 0, done = false;
  const endT = events.length ? events[events.length - 1].t + 2 : 0;
  const stop = () => {
    if (done) return; done = true; clearInterval(id);
    bus.gain.setTargetAtTime(0, c.currentTime, 0.08); setTimeout(() => bus.disconnect(), 800);
  };
  const id = setInterval(() => {
    while (i < events.length && t0 + events[i].t < c.currentTime + 0.25) { events[i].fn(t0 + events[i].t, bus); i++; }
    if (i >= events.length && c.currentTime > t0 + endT) { stop(); onEnd && onEnd(); }
  }, 40);
  return { stop, t0 };
}
export const at = (time, fn) => setTimeout(fn, Math.max(0, (time - ctx.currentTime) * 1000));

// Percussion & physical-modelling voices.
// Modal synthesis: an exciter (impulse/noise) rings a bank of resonant band-pass filters tuned to the
// vibration modes of real objects (circular membranes, free bars, metal plates, wood, bowls).
// Karplus-Strong waveguides (AudioWorklet) give plucked strings and KS drums.
export const KS_READY = new WeakSet();
export const SAMPLES = new Map();

const MODES = {
  membrane: [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501],      // Bessel zeros of a circular membrane
  bar: [1, 2.756, 5.404, 8.933],                                           // free-free bar (marimba/vibes)
  metal: [1, 1.42, 1.93, 2.47, 2.88, 3.36, 3.79, 4.5, 5.2],                // plate-ish inharmonic
  wood: [1, 2.572, 4.644],
  bowl: [1, 2.71, 5.15, 8.43],
  glassbell: [1, 2.32, 4.25, 6.63, 9.38],
};

function burst(h, t, len, dest, gain = 1, color = 0) {
  const { c } = h, g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(1e-4, t + len);
  let node = g;
  if (color) { const lp = c.createBiquadFilter(); lp.type = color > 0 ? "highpass" : "lowpass"; lp.frequency.value = Math.abs(color); g.connect(lp); node = lp; }
  h.noise(t, t + len + 0.01, g);
  node.connect(dest);
}
// Ring a modal bank. Each vibration mode is an exponentially decaying sinusoid whose ring time
// follows from its quality factor (τ = Q / πf), as for a real resonator; a short filtered noise
// burst supplies the strike transient.
function modal(h, { f, modes, q, amps, exLen = 0.004, exColor = 0, gain = 1, pitchDrop = 0 }) {
  const { c, t, env } = h;
  const A = modes.map((_, k) => (amps ? amps[k] ?? 0.2 : 1 / (1 + k)));
  const norm = Math.sqrt(gain) / A.reduce((a, b) => a + b, 0);
  modes.forEach((r, k) => {
    const fr = f * r; if (fr > 18000) return;
    const Q = Array.isArray(q) ? q[k] ?? q[q.length - 1] : q / (1 + k * 0.15);
    const tau = Math.max(0.006, Math.min(4, Q / (Math.PI * fr)));
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(pitchDrop ? fr * (1 + pitchDrop) : fr, t);
    if (pitchDrop) o.frequency.exponentialRampToValueAtTime(fr, t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A[k] * norm, t + 0.0015);
    g.gain.setTargetAtTime(0, t + 0.0015, tau);
    o.connect(g); g.connect(env); o.start(t); o.stop(t + 0.01 + tau * 5); // ≈ −43 dB: inaudible beyond this
  });
  burst(h, t, Math.max(0.003, exLen * 2), env, 0.25 * Math.sqrt(gain), exColor || 3000);
}

function ks(h, opts) {
  const { c, t, env } = h;
  if (!KS_READY.has(c)) return false;
  // the string waits silently until its scheduled time (worklets start running as soon as they exist)
  const node = new AudioWorkletNode(c, "ks", { numberOfInputs: 0, outputChannelCount: [1], processorOptions: { ...opts, start: t } });
  // AudioWorkletNodes start immediately: gate them with a gain that opens at t
  const gate = c.createGain(); gate.gain.setValueAtTime(0, c.currentTime); gate.gain.setValueAtTime(1, t);
  node.connect(gate); gate.connect(env);
  return true;
}
const hold = (h, len) => { h.env.connect(h.out); h.env.gain.setValueAtTime(h.vel, h.t); h.env.gain.setTargetAtTime(0, h.t + len, len * 0.3); };

export const PERC = {
  kick(h) { hold(h, 0.6); modal(h, { f: 48, modes: [1, 1.594, 2.136], q: [18, 10, 8], amps: [1, 0.3, 0.15], exLen: 0.006, exColor: -900, gain: 2.2, pitchDrop: 0.9 }); burst(h, h.t, 0.004, h.env, 0.4, 2500); },
  snare(h) { hold(h, 0.35); modal(h, { f: 185, modes: MODES.membrane.slice(0, 5), q: 14, exLen: 0.003, gain: 0.9 }); const w = h.c.createGain(); burst(h, h.t, 0.18, w, 0.9, 1800); w.connect(h.env); },
  tom(h) { hold(h, 0.7); modal(h, { f: h.f, modes: MODES.membrane, q: 26, exLen: 0.004, exColor: -3000, gain: 1, pitchDrop: 0.25 }); },
  hat(h) { hold(h, h.fx.open ? 0.4 : 0.07); modal(h, { f: 3200, modes: MODES.metal, q: 40, exLen: 0.002, exColor: 4000, gain: 0.35 }); burst(h, h.t, h.fx.open ? 0.3 : 0.05, h.env, 0.5, 7000); },
  clave(h) { hold(h, 0.25); modal(h, { f: 2200, modes: MODES.wood, q: [60, 30, 20], exLen: 0.001, gain: 0.7 }); },
  woodblock(h) { hold(h, 0.3); modal(h, { f: h.f, modes: MODES.wood, q: [35, 18, 12], exLen: 0.0015, gain: 0.9 }); },
  shaker(h) { hold(h, 0.09); const g = h.c.createGain(); for (let k = 0; k < 6; k++) burst(h, h.t + k * 0.008 + Math.random() * 0.006, 0.02, g, 0.25, 6000); g.connect(h.env); },
  bowl(h) { hold(h, 4); modal(h, { f: h.f, modes: MODES.bowl, q: [900, 700, 500, 400], amps: [1, 0.5, 0.25, 0.1], exLen: 0.002, exColor: -2000, gain: 0.3 }); },
  vibes(h) { hold(h, 2.5); modal(h, { f: h.f, modes: MODES.bar, q: [500, 260, 150, 90], amps: [1, 0.25, 0.08, 0.03], exLen: 0.001, exColor: -4000, gain: 0.45 }); },
  glassbell(h) { hold(h, 3); modal(h, { f: h.f, modes: MODES.glassbell, q: [700, 500, 350, 250, 200], amps: [1, 0.5, 0.3, 0.2, 0.1], exLen: 0.001, gain: 0.3 }); },
  // Karplus-Strong voices (fallback to modal if the worklet is unavailable)
  ksdrum(h) { hold(h, 0.8); if (!ks(h, { freq: h.f, drum: true, blend: 0.5, decay: 0.995, dur: 1, gain: 0.7 })) PERC.tom(h); },
  pizz(h) { hold(h, 1.5); if (!ks(h, { freq: h.f, decay: 0.994, bright: 0.6, pick: 0.13, dur: 1.6, gain: 0.8 })) PERC.vibes(h); },
  guitar(h) { hold(h, 3); if (!ks(h, { freq: h.f, decay: 0.998, bright: 0.85, pick: 0.2, stretch: 0.5, dur: 3.2, gain: 0.7 })) PERC.vibes(h); },
  kalimba(h) { hold(h, 1.8); modal(h, { f: h.f, modes: [1, 5.9, 13.5], q: [300, 80, 40], amps: [1, 0.2, 0.05], exLen: 0.001, gain: 0.6 }); },
  // Sampled sounds (generated audio files), pitched by playback rate
  sample(h) {
    const buf = SAMPLES.get(h.fx.sample);
    if (!buf) return;
    const { c, t, env, out, vel } = h, s = c.createBufferSource();
    s.buffer = buf; s.playbackRate.value = h.fx.rate ?? 1;
    env.connect(out); env.gain.setValueAtTime(vel * 3, t);
    if (h.fx.len) env.gain.setTargetAtTime(0, t + h.fx.len, 0.05);
    const off = Math.min(h.fx.offset || 0, Math.max(0, buf.duration - 0.2));
    s.connect(env); s.start(t, off); s.stop(t + Math.min((buf.duration - off) / (h.fx.rate ?? 1), h.fx.len ? h.fx.len + 0.3 : 99));
  },
};

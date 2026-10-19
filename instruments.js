// Extended orchestra. Each voice gets helpers from audio.js:
// h = { c, f, t, dur, vel, env, out, bend, osc(type,f,t,end,dest,gain), noise(t,end,dest), fx }
const exp = (p, v0, v1, t0, t1) => { p.setValueAtTime(Math.max(v0, 1e-4), t0); p.exponentialRampToValueAtTime(Math.max(v1, 1e-4), t1); };

function fm(h, ratio, i0, i1, decay, end, amp = 1) {
  const { c, f, t, env } = h;
  const car = h.bend(h.osc("sine", f, t, end, env, amp));
  const mod = c.createOscillator(), mg = c.createGain();
  mod.frequency.value = f * ratio;
  exp(mg.gain, f * ratio * i0, f * ratio * i1, t, t + decay);
  mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(end);
  return car;
}
// a partial with its own decay envelope
function partial(h, ratio, amp, attack, decay, end, type = "sine") {
  const { c, f, t, env } = h, g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + attack);
  g.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
  g.connect(env);
  return h.bend(h.osc(type, f * ratio, t, end, g, 1), ratio);
}
function lfo(h, rate, depthHz, params, delay = 0, end) {
  const { c, t } = h, o = c.createOscillator(), g = c.createGain();
  o.frequency.value = rate;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(depthHz, t + delay + 0.01);
  o.connect(g); params.forEach((p) => g.connect(p)); o.start(t); o.stop(end);
}
const VOWELS = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1600, 2700], i: [270, 2140, 2950] };
const METAL = [1, 1.483, 2.03, 2.612, 3.37, 4.17, 5.43];

export const VOICES = {
  // Transactional: sound arriving from the future — swells into its attack, then is cut off
  reverse(h) {
    const { c, t, dur, vel, env, out, f } = h, len = Math.max(0.25, dur * 1.6), end = t + len + 0.05;
    const lp = c.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(6000, t + len);
    env.connect(lp); lp.connect(out);
    env.gain.setValueAtTime(1e-4, t); env.gain.exponentialRampToValueAtTime(vel, t + len); env.gain.linearRampToValueAtTime(0, t + len + 0.02);
    const car = h.bend(h.osc("sine", f, t, end, env, 1));
    const mod = c.createOscillator(), mg = c.createGain(); mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 0.2, t); mg.gain.exponentialRampToValueAtTime(f * 2, t + len);
    mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(end);
    h.bend(h.osc("triangle", f * 2, t, end, env, 0.2), 2);
  },
  // Copenhagen: crystalline, definite, struck
  celesta(h) {
    const { t, dur, vel, env, out, f } = h, end = t + dur + 1.6;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel, t + 0.003);
    env.gain.exponentialRampToValueAtTime(1e-4, t + Math.max(1.3, dur + 1));
    fm(h, 4, 2.2, 0.15, 0.35, end);
    partial(h, 2, 0.25, 0.002, 0.6, end);
  },
  epiano(h) {
    const { t, dur, vel, env, out } = h, end = t + dur + 1.4;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel, t + 0.004);
    env.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.7);
    env.gain.setTargetAtTime(1e-4, t + dur, 0.3);
    fm(h, 1, 1.6, 0.25, 1.2, end);
    partial(h, 7.02, 0.06, 0.001, 0.12, end);
  },
  cello(h) {
    const { c, t, dur, vel, env, out, f } = h, end = t + dur + 0.6;
    const lp = c.createBiquadFilter(), pk = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1700; pk.type = "peaking"; pk.frequency.value = 260; pk.gain.value = 7;
    env.connect(pk); pk.connect(lp); lp.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.6, t + 0.14);
    env.gain.setTargetAtTime(0, t + dur, 0.18);
    const o = [h.bend(h.osc("sawtooth", f, t, end, env, 0.5)), h.bend(h.osc("sawtooth", f * 1.004, t, end, env, 0.4), 1.004)];
    lfo(h, 5.4, f * 0.007, o.map((x) => x.frequency), 0.25, end);
  },
  // Many-Worlds: a multitude of voices
  choir(h) {
    const { c, t, dur, vel, env, out, f, fx } = h, end = t + dur + 0.8;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 3, t + 0.35);
    env.gain.setTargetAtTime(0, t + dur, 0.3);
    const src = c.createGain();
    (VOWELS[fx.vowel] || VOWELS.a).forEach((fr, k) => {
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = fr; bp.Q.value = 9 - k * 2; g.gain.value = [1, 0.5, 0.22][k];
      src.connect(bp); bp.connect(g); g.connect(env);
    });
    const o = [-13, -4, 5, 12].map((cents) => h.bend(h.osc("sawtooth", f * 2 ** (cents / 1200), t, end, src, 0.3), 2 ** (cents / 1200)));
    lfo(h, 4.8 + Math.random(), f * 0.006, o.map((x) => x.frequency), 0.3, end);
  },
  // Zeno: struck again and again
  marimba(h) {
    const { c, t, vel, env, out, f } = h, end = t + 1;
    env.connect(out); env.gain.setValueAtTime(vel, t);
    partial(h, 1, 1, 0.002, 0.55, end);
    partial(h, 3.93, 0.28, 0.001, 0.07, end);
    partial(h, 9.9, 0.07, 0.001, 0.025, end);
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = f * 3; bp.Q.value = 3;
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.012);
    h.noise(t, t + 0.02, bp); bp.connect(g); g.connect(env);
  },
  // Decoherence: an additive organ whose partials lose phase/tuning coherence and sink into noise
  organ(h) {
    const { c, t, dur, vel, env, out, f, fx } = h, end = t + dur + 0.4, coh = fx.coh ?? 1, inc = 1 - coh;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.5, t + 0.05 + coh * 0.1);
    env.gain.setTargetAtTime(0, t + dur, 0.12);
    [1, 2, 3, 4, 6, 8].forEach((r, k) => {
      const cents = (Math.random() - 0.5) * inc * 70 * (k + 1) * 0.5;
      const o = h.bend(h.osc("sine", f * r * 2 ** (cents / 1200), t, end, env, [1, 0.6, 0.42, 0.26, 0.16, 0.1][k]), r * 2 ** (cents / 1200));
      if (inc > 0.05) lfo(h, 0.4 + Math.random() * 3, f * r * 0.012 * inc, [o.frequency], 0, end);
    });
    if (inc > 0.05) {
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 1.5 + coh * 6; g.gain.value = inc * 0.9;
      h.noise(t, end, bp); bp.connect(g); g.connect(env);
    }
  },
  // Pilot-wave: particles and their guiding wave
  harp(h) {
    const { c, t, dur, vel, env, out, f } = h, end = t + Math.max(1.6, dur + 1.2);
    env.connect(out); env.gain.setValueAtTime(vel, t);
    partial(h, 1, 1, 0.002, 1.5, end, "triangle");
    partial(h, 2, 0.35, 0.002, 0.7, end);
    partial(h, 3, 0.12, 0.002, 0.3, end);
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = f * 4; bp.Q.value = 4;
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.03);
    h.noise(t, t + 0.04, bp); bp.connect(g); g.connect(env);
  },
  theremin(h) {
    const { t, dur, vel, env, out, f } = h, end = t + dur + 0.5;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.7, t + 0.12);
    env.gain.setTargetAtTime(0, t + dur, 0.2);
    const o = [h.bend(h.osc("sine", f, t, end, env, 0.9)), h.bend(h.osc("triangle", f, t, end, env, 0.12))];
    lfo(h, 5.9, f * 0.012, o.map((x) => x.frequency), 0.18, end);
  },
  // GRW: metal — struck at a collapse, bowed & blurred in between
  gong(h) {
    const { c, t, vel, env, out, f } = h, end = t + 4;
    env.connect(out); env.gain.setValueAtTime(vel, t);
    METAL.forEach((r, k) => partial(h, r, 1 / (k + 1) ** 0.7, 0.002, 3.2 / Math.sqrt(k + 1), end));
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "highpass"; bp.frequency.value = 3000;
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.05);
    h.noise(t, t + 0.06, bp); bp.connect(g); g.connect(env);
  },
  bowedmetal(h) {
    const { t, dur, vel, env, out } = h, end = t + dur + 1;
    env.connect(out);
    env.gain.linearRampToValueAtTime(vel * 0.6, t + Math.min(0.6, dur * 0.6));
    env.gain.setTargetAtTime(0, t + dur, 0.35);
    const o = METAL.slice(0, 5).map((r, k) => h.bend(h.osc("sine", h.f * r, t, end, env, 0.6 / (k + 1)), r));
    lfo(h, 3.1, h.f * 0.004, o.map((x) => x.frequency), 0.2, end);
  },
};

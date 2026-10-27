// The Fourier check lives here, not in the synthesizer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { rToMidi } from "../world.js";
import { interfere, groupPitches } from "../physics.js";

const SR = 16000;

function goertzel(samples, sr, freq) {
  const w = (2 * Math.PI * freq) / sr;
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples.length; i++) {
    re += samples[i] * Math.cos(w * i);
    im -= samples[i] * Math.sin(w * i);
  }
  return (re * re + im * im) / samples.length;
}

function partials(f1, f2, dur, phase2 = 0) {
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  const w1 = (2 * Math.PI * f1) / SR;
  const w2 = (2 * Math.PI * f2) / SR;
  for (let i = 0; i < n; i++) out[i] = Math.sin(w1 * i) + Math.sin(w2 * i + phase2);
  return out;
}

function envelope(samples) {
  const out = new Float32Array(samples.length);
  const a = Math.exp((-2 * Math.PI * 40) / SR);
  let acc = 0;
  for (let i = 0; i < samples.length; i++) {
    acc = a * acc + (1 - a) * samples[i] * samples[i];
    out[i] = acc;
  }
  return out;
}

test("two partials a syntonic comma apart beat at their difference, and the same pitch cancels", () => {
  const f1 = 440 * 2 ** ((rToMidi(1) - 69) / 12);
  const f2 = f1 * (81 / 80);
  const df = Math.abs(f2 - f1);
  const wave = partials(f1, f2, 2);
  assert.ok(goertzel(wave, SR, f1) > goertzel(wave, SR, 1000) * 20);
  assert.ok(goertzel(wave, SR, f2) > goertzel(wave, SR, 1000) * 20);
  const env = envelope(wave);
  assert.ok(goertzel(env, SR, df) > goertzel(env, SR, df / 2) * 3);

  const opposed = partials(f1, f2, 2, Math.PI);
  assert.ok(goertzel(opposed, SR, f1) > goertzel(opposed, SR, 1000) * 20);
  assert.ok(goertzel(envelope(opposed), SR, df) > goertzel(envelope(opposed), SR, df / 2) * 3);

  const hole = partials(f1, f1, 1, Math.PI);
  const tone = partials(f1, 0, 1, 0);
  assert.ok(goertzel(hole, SR, f1) < goertzel(tone, SR, f1) * 1e-6);

  const root = rToMidi(1);
  const comma = rToMidi(81 / 80);
  const kept = interfere([
    { midi: root, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: { phase: 0 } },
    { midi: comma, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: { phase: 180 } },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(groupPitches([{ midi: root, index: 0 }, { midi: comma, index: 1 }], 0.08).length, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { bow, flute, pluck, renderVoice } from "../models.js";

function rms(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i += 1) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

function period(samples, min, max) {
  let best = min;
  let score = -Infinity;
  for (let lag = min; lag <= max; lag += 1) {
    let corr = 0;
    const end = Math.min(samples.length - lag, 4000);
    for (let i = 200; i < end; i += 3) corr += samples[i] * samples[i + lag];
    if (corr > score) {
      score = corr;
      best = lag;
    }
  }
  return best;
}

test("pluck rings near the requested pitch", () => {
  const sr = 22050;
  const freq = 220;
  const wave = pluck(sr, freq, 0.8);
  assert.ok(rms(wave) > 0.05);
  assert.ok(wave.every((x) => Number.isFinite(x)));
  const lag = period(wave, 80, 130);
  assert.ok(Math.abs(lag - sr / freq) < 8, `lag ${lag}`);
});

test("bow and flute produce pitched tone", () => {
  const sr = 22050;
  const bowed = bow(sr, 196, 0.4);
  const blown = flute(sr, 440, 0.35);
  assert.ok(rms(bowed) > 0.04);
  assert.ok(rms(blown) > 0.04);
  assert.ok(Math.abs(period(blown, 40, 70) - sr / 440) < 8);
});

test("effects that used to require missing samples still render", () => {
  for (const sample of ["geiger", "static", "whoosh", "cat"]) {
    const wave = renderVoice(22050, 440, 0.2, "sample", { sample });
    assert.ok(wave && rms(wave) > 0.02, sample);
  }
  const open = renderVoice(22050, 3000, 0.2, "hat", { open: 1 });
  const closed = renderVoice(22050, 3000, 0.2, "hat", {});
  assert.ok(open.length > closed.length);
});

test("every ensemble voice renders", () => {
  for (const voice of ["vibes", "pizz", "cello", "guitar", "choir", "gong", "reverse", "piano"]) {
    const wave = renderVoice(44100, 311, 0.25, voice);
    assert.ok(wave && rms(wave) > 0.02, voice);
  }
});

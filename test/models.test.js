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
  for (const sample of ["geiger", "static", "whoosh"]) {
    const wave = renderVoice(22050, 440, 0.2, "sample", { sample });
    assert.ok(wave && rms(wave) > 0.02, sample);
  }
  const open = renderVoice(22050, 3000, 0.2, "hat", { open: 1 });
  const closed = renderVoice(22050, 3000, 0.2, "hat", {});
  assert.ok(open.length > closed.length);
});

function windowRms(samples, sr) {
  const n = Math.max(1, Math.min(samples.length, Math.floor(sr * 0.05)));
  let acc = 0;
  for (let i = 0; i < Math.min(n, samples.length); i += 1) acc += samples[i] * samples[i];
  let best = acc;
  for (let i = n; i < samples.length; i += 1) {
    acc += samples[i] * samples[i] - samples[i - n] * samples[i - n];
    if (acc > best) best = acc;
  }
  return Math.sqrt(best / n);
}

test("voices share a loudness level", () => {
  const sr = 48000;
  const freq = 293.66;
  const guitar = windowRms(renderVoice(sr, freq, 0.6, "guitar"), sr);
  const winds = windowRms(renderVoice(sr, freq, 0.6, "winds"), sr);
  const hat = windowRms(renderVoice(sr, freq, 0.6, "hat"), sr);
  assert.ok(guitar > 0.12 && winds > 0.12 && hat > 0.1);
  assert.ok(Math.max(guitar, winds) / Math.min(guitar, winds) < 1.25);
  assert.ok(Math.max(guitar, hat) / Math.min(guitar, hat) < 1.6);
});

test("organ speaks the written pitch", () => {
  const sr = 48000;
  for (const midi of [36, 60, 84]) {
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const wave = renderVoice(sr, freq, 0.5, "organ");
    const tone = (f) => {
      const w = 2 * Math.PI * f / sr;
      let re = 0;
      let im = 0;
      const a = Math.floor(sr * 0.12);
      const b = Math.floor(sr * 0.4);
      for (let n = a; n < b; n += 1) {
        re += wave[n] * Math.cos(w * n);
        im -= wave[n] * Math.sin(w * n);
      }
      return Math.hypot(re, im);
    };
    assert.ok(tone(freq) > tone(2 * freq) * 1.5, `midi ${midi}`);
  }
});

test("marimba speaks the written pitch", () => {
  const sr = 48000;
  for (const midi of [48, 62, 76]) {
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const wave = renderVoice(sr, freq, 0.35, "marimba");
    const tone = (f) => {
      const w = 2 * Math.PI * f / sr;
      let re = 0;
      let im = 0;
      const b = Math.floor(sr * 0.08);
      for (let n = 0; n < b; n += 1) {
        re += wave[n] * Math.cos(w * n);
        im -= wave[n] * Math.sin(w * n);
      }
      return Math.hypot(re, im);
    };
    assert.ok(tone(freq) > tone(freq * 3.31356), `midi ${midi}`);
    assert.ok(wave.every((x) => Number.isFinite(x)));
  }
});

test("every ensemble voice renders", () => {
  for (const voice of ["vibes", "pizz", "cello", "guitar", "choir", "gong", "reverse", "piano"]) {
    const wave = renderVoice(44100, 311, 0.25, voice);
    assert.ok(wave && rms(wave) > 0.02, voice);
  }
});

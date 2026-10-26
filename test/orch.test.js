import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { S } from "../world.js";
import { dress, fold } from "../orch.js";

const original = JSON.parse(JSON.stringify(S.orch));

describe("orchestration", { concurrency: false }, () => {
test("fold keeps a pitch inside its band", () => {
  assert.equal(fold(100, 55, 79), 76);
  assert.equal(fold(30, 36, 82), 42);
  assert.equal(fold(62, 55, 79), 62);
});

test("a short bar restrikes a note it cannot hold", () => {
  S.orch.longNotes = "restrike";
  S.orch.rescore = "score";
  S.orch.chairs = "all";
  S.orch.tuneDouble = "bare";
  S.orch.innerDouble = "bare";
  S.orch.bassDouble = "bare";
  const notes = dress([{ midi: 67, t: 0, dur: 1, voice: "marimba", vel: 0.1, role: "chord" }], { total: 1 });
  assert.ok(notes.length >= 8);
  assert.ok(notes.every((n) => n.voice === "marimba" && n.dur <= 0.11));
});

test("held voice gives a long bar to an instrument that sustains", () => {
  S.orch.longNotes = "held";
  const notes = dress([{ midi: 67, t: 0, dur: 1, voice: "marimba", vel: 0.1, role: "chord" }], { total: 1 });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].voice, "organ");
  S.orch.longNotes = "restrike";
});

test("the chord sits at least an octave above the bass", () => {
  const notes = dress([
    { midi: 40, t: 0, dur: 1, voice: "cello", vel: 0.1, role: "bass" },
    { midi: 50, t: 0, dur: 1, voice: "guitar", vel: 0.05, role: "chord" },
  ], { total: 1 });
  const bass = notes.find((n) => n.role === "bass");
  const chord = notes.find((n) => n.role === "chord");
  assert.ok(chord.midi >= bass.midi + 11.5);
});

test("the tune sits above the chord", () => {
  const notes = dress([
    { midi: 70, t: 0, dur: 0.4, voice: "vibes", vel: 0.16, role: "chord" },
    { midi: 60, t: 0, dur: 0.4, voice: "vibes", vel: 0.16, role: "mel" },
  ], { total: 1 });
  const mel = notes.find((n) => n.role === "mel");
  const chord = notes.find((n) => n.role === "chord");
  assert.ok(mel.midi > chord.midi);
});

test("unison doubling adds the second color", () => {
  S.orch.tuneDouble = "unison";
  const notes = dress([{ midi: 67, t: 0, dur: 0.2, voice: "marimba", vel: 0.16, role: "mel" }], { total: 1 });
  assert.ok(notes.some((n) => n.double && n.voice === "organ"));
  S.orch.tuneDouble = "bare";
});

test("chairs admit the tune only after the foundation", () => {
  S.orch.chairs = "grow";
  const notes = dress([
    { midi: 40, t: 0, dur: 0.4, voice: "cello", vel: 0.1, role: "bass" },
    { midi: 74, t: 0, dur: 0.3, voice: "vibes", vel: 0.16, role: "mel" },
    { midi: 74, t: 6, dur: 0.3, voice: "vibes", vel: 0.16, role: "mel" },
    { midi: 60, t: 7.5, dur: 0.2, voice: "woodblock", vel: 0.1, role: "drum" },
  ], { total: 8 });
  assert.ok(notes.some((n) => n.role === "bass" && n.t === 0));
  assert.ok(!notes.some((n) => n.role === "mel" && n.t === 0));
  assert.ok(notes.some((n) => n.role === "mel" && n.t === 6));
  assert.ok(notes.some((n) => n.role === "drum"));
  S.orch.chairs = "all";
});

test("rescore keeps the pitches and changes the ensemble", () => {
  S.orch.rescore = "bowed";
  S.orch.palette = { mel: "strings", ctr: "bowedmetal", cp: "cello", chord: "strings", bass: "cello" };
  const notes = dress([{ midi: 74, t: 0, dur: 0.3, voice: "vibes", vel: 0.16, role: "mel" }], { total: 1 });
  assert.equal(notes[0].voice, "strings");
  assert.ok(Math.abs(notes[0].midi - 74) < 1 || notes[0].midi <= 93);
  S.orch.rescore = "score";
  S.orch.palette = null;
});

test("a weak tune is louder than the organ under it", () => {
  const notes = dress([
    { midi: 70, t: 0, dur: 0.4, voice: "marimba", vel: 0.16, role: "mel" },
    { midi: 55, t: 0, dur: 0.4, voice: "organ", vel: 0.05, role: "chord" },
  ], { total: 1 });
  const mel = notes.find((n) => n.role === "mel" && !n.double);
  const chord = notes.find((n) => n.role === "chord" && !n.double);
  assert.ok(mel.vel > chord.vel * 3);
});

test("orchestration settings are put back", () => {
  Object.assign(S.orch, original);
  assert.equal(S.orch.longNotes, "restrike");
  assert.equal(S.orch.chairs, "all");
  assert.equal(S.orch.rescore, "score");
});
});

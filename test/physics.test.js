import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { op, rToMidi, SPECTRA } from "../world.js";
import {
  phasorSum, groupPitches, interfere, widen, nearMisses, overlap, splitOverlap,
  lengthSuperposition, commuteTheme, hzResidue, nearestBeat, tenneyHalo, latticeResidue,
} from "../physics.js";

describe("physics", { concurrency: false }, () => {
  test("shared tones add in phase and cancel out of phase", () => {
    const loud = phasorSum([{ mag: 1, phase: 0 }, { mag: 1, phase: 0 }]);
    const thin = phasorSum([{ mag: 1, phase: 0 }, { mag: 1, phase: 180 }]);
    assert.ok(loud.mag > 1.9 && loud.beatHz === 0);
    assert.ok(thin.mag < 0.02 && thin.beatDepth > 0.5);
    const same = interfere([
      { midi: 62, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: { phase: 0 } },
      { midi: 62.05, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: { phase: 0 } },
    ]);
    assert.equal(same.length, 1);
    assert.ok(same[0].vel > 0.39);
    const gone = interfere([
      { midi: 62, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: { phase: 0 } },
      { midi: 62, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: { phase: 180 } },
    ]);
    assert.equal(gone.length, 0);
  });

  test("a short note spreads across neighboring ratios and watching shortens it", () => {
    const brief = widen(62, 0.1, 0.1, 0);
    const held = widen(62, 2, 8, 0);
    const watched = widen(62, 1, 8, 0.9);
    assert.ok(brief.midis.length >= 2);
    assert.equal(held.midis.length, 0);
    assert.ok(watched.dur < 0.4);
    assert.ok(watched.midis.length >= 1);
  });

  test("a hot temperature keeps near misses and a cold one does not", () => {
    const cands = [0, 1, 2, 3];
    const E = (x) => x * x;
    assert.ok(nearMisses(cands, E, 2, 0).length >= 1);
    assert.equal(nearMisses(cands, E, 0.05, 0).length, 0);
  });

  test("a tone inside the spectrum is accompaniment and one outside beats", () => {
    assert.equal(overlap(62, [62, 65.5]), 1);
    assert.equal(overlap(68, [62]), 0);
    const inChord = splitOverlap(62, 0.2, [62, 67]);
    const out = splitOverlap(68, 0.2, [62]);
    assert.ok(inChord.inside > 0.19 && inChord.outside === 0);
    assert.equal(out.inside, 0);
    assert.ok(out.outside > 0.19 && out.beatHz > 0);
  });

  test("shared lengths add and a measured cut drops the rest", () => {
    const bar = (midi) => [{ midi, t: 0, dur: 1, voice: "vibes", vel: 0.2, role: "mel", fx: {} }];
    const options = [{ bars: 2, p: 0.5 }, { bars: 4, p: 0.5 }];
    const sup = lengthSuperposition([bar(60), bar(62), bar(64), bar(65)], options, 2);
    assert.equal(sup.cut, true);
    assert.ok(sup.notes.every((n) => n.midi === 60 || n.midi === 62));
    const tail = lengthSuperposition(
      [bar(60), bar(62), bar(64), bar(65)],
      [{ bars: 4, p: 0.25 }, { bars: 2, p: 0.25 }, { bars: 4, p: 0.25 }, { bars: 2, p: 0.25 }],
      4,
    );
    const late = tail.notes.filter((n) => n.midi === 64);
    assert.equal(late.length, 2);
    assert.equal(Math.abs(late[0].fx.phase - late[1].fx.phase), 180);
    assert.equal(interfere(late).length, 0);
  });

  test("the commutator keeps only the degrees that moved", () => {
    const theme = [0, 2, 4, null, 1, 3];
    const ab = op(op(theme, "excite"), "mirror");
    const ba = op(op(theme, "mirror"), "excite");
    const got = commuteTheme(theme);
    got.line.forEach((d, i) => {
      if (ab[i] === ba[i]) assert.equal(d, null);
      else assert.equal(d, ab[i]);
    });
    const hz = hzResidue();
    assert.ok(hz[0].mag < 1e-9);
    assert.ok(Math.abs(hz[1].mag - Math.SQRT2) < 1e-9);
  });

  test("a halo weight is the raw Tenney distance, and a cold temperature drops it", () => {
    const root = rToMidi(1);
    const fifth = rToMidi(3 / 2);
    const comma = rToMidi(81 / 80);
    const raw = (n, d) => Math.log2(n * d);
    const halo = tenneyHalo(root, [fifth, comma], 1);
    const at = (midi) => halo.find((x) => Math.abs(x.midi - midi) < 1e-6);
    assert.ok(Math.abs(at(fifth).w - 1 / raw(3, 2)) < 1e-9);
    assert.ok(Math.abs(at(comma).w - 1 / raw(81, 80)) < 1e-9);
    assert.ok(at(fifth).w > at(comma).w);
    assert.equal(tenneyHalo(root, [fifth], 0.05).length, 0);
  });

  test("a fifth, a third, and a quality change leave only the chords that moved", () => {
    const spec = [{ name: "D+", mag: 1, phase: 0 }];
    const fifth = latticeResidue(spec, "fifth");
    assert.ok(fifth.every((s) => s.name !== "D+"));
    assert.deepEqual(fifth.map((s) => s.name).sort(), ["A+", "G+"]);
    fifth.forEach((s) => assert.ok(Math.abs(s.mag - 1) < 1e-9));
    const third = latticeResidue(spec, "third").map((s) => s.name).sort();
    assert.deepEqual(third, ["Bb↑+", "F#↓+"]);
    const quality = latticeResidue(spec, "quality");
    assert.deepEqual(quality.map((s) => s.name), ["D−"]);
    assert.ok(Math.abs(quality[0].mag - 2) < 1e-9);
    assert.equal(SPECTRA["D+"].a, 0);
  });

  test("close basis states beat at their frequency difference", () => {
    const notes = nearestBeat([
      { midi: 69, t: 0, dur: 1, voice: "glassbell", vel: 0.1, role: "mel", fx: { phase: 0 } },
      { midi: 69.1, t: 0, dur: 1, voice: "glassbell", vel: 0.1, role: "mel", fx: { phase: 10 } },
    ]);
    assert.ok(notes[0].fx.beatHz > 0.4 && notes[0].fx.beatHz < 14);
    const grouped = groupPitches([{ midi: 60, index: 0 }, { midi: 60.1, index: 1 }, { midi: 67, index: 0 }], 0.2);
    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped[0].members, [0, 1]);
  });
});

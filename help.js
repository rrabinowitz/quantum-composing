import { INTERP } from "./world.js";

const HEAR = {
  copenhagen: "Each note starts as a smeared cluster of partials and snaps onto its pitch. Look on Spectra collapses the cloud onto one spectrum.",
  mwi: "Nothing is discarded. A melody splits into more copies as the bars go on, spread in octave and across the room. A Bell pair plays both branches. On Register, a measurement is never read out; every branch keeps sounding.",
  zeno: "The watching slider re-strikes a note instead of letting it move, and it slows the walk on the ratio lattice. The metronome tick stays silent.",
  decoherence: "Coherence falls with γ. While it is high, pitches are smeared and detuned; as it falls, the harmony crystallises onto one spectrum.",
  pilot: "The seed fixes every random choice. The same seed is the same piece. A theremin rides a guide wave; the other parts follow the path that seed already decided.",
  grw: "Most of the time the cloud stays smeared. At random, a hit collapses it to one point. That hit is a gong and a thump.",
  relational: "Melody, counter-voice, and accompaniment can each land on a different spectrum. Each part measures the harmony for itself.",
  qbism: "Each outcome updates a belief, and later bars mix that belief back into the odds. The accompaniment grows more settled as the piece goes on.",
  transactional: "The harmony is written from the final spectrum backwards, then played forwards. Melodies use the reverse instrument, so the attack arrives at the end of the note.",
};

const PAGES = {
  pitch: {
    title: "Pitch",
    body: [
      "The root is D, not C, and the scale is the overtone series folded into one octave: harmonics 8 through 15. MIDI numbers are fractional, so a just ratio is not forced onto 12-tone equal temperament.",
      "Spectra are chords on a lattice of fifths and thirds. A name like D+ is a major triad; D− is minor; a 7 adds the harmonic seventh. Arrows mark a comma shift up or down the thirds axis.",
      "The row of keys under Spectra is the harmonic series of a low D. Tapping one measures that harmonic.",
    ],
  },
  stations: {
    title: "The five stations",
    body: [
      "I Spectra is a superposition. Each spectrum is a phasor you can drag. F, X, Z, T, and Tunnel remix the amplitudes. Look collapses them onto one. Let it ring plays the cloud.",
      "II Pair is two 16-step themes, A and B. Entangled ties an operation on one to the matching operation on the other. Bell pair prepares a correlated or anti-correlated pair; Measure pair reads it out. Teleport A → B sends A’s tune to B and clears A.",
      "III Histories is the piece. Sections are the blocks along the line. Live one history plays one of them. Harmony can walk the ratio lattice, or it can follow the Spectra superposition.",
      "IV Orbits is a set of rings. Spin plays them. Open the box reads the state.",
      "V Register is a small computer. Time runs downward; each column is a qubit. Run sounds the state: each basis state is a pitch, loudness is its probability, and stereo position is its phase. readout is the last hit of each pass. second pass plays the circuit again on another instrument.",
      "Orchestration sits under the title. tune, inner, and bass are how loud each part sits. tune double, inner double, and bass double add a second instrument at the unison or the octave. long notes either restrikes a tone the instrument cannot hold, or hands it to a voice that can. rescore keeps the pitches and puts another ensemble on them, or assigns each part by hand. chairs can admit the bass and chord first, then the inner parts, then the tune, then the drums.",
      "Physics sits under that. forks is Sum or One. Sum sounds every length of a section together: bars they share get louder, bars only some of them reach can cancel, and the measured length cuts the rest. A short note spreads across the neighboring ratios; a long one sits on one. While a passage is hot, each note keeps a quiet halo of the ratios it almost chose. A tone inside the current spectrum becomes accompaniment. The part of it that sits outside stays the tune and beats against the chord. Dragging a phasor on Spectra adds shared tones as amplitudes, so the tone swells, thins, or beats. commutator is Off, Excite then Mirror, H then Z, Fifth, Third, or Quality. Fifth, Third, and Quality play only the lattice chords that move under that step.",
    ],
  },
  sound: {
    title: "How the sound is made",
    body: [
      "Every note is synthesized in the page. There are no sampled instruments. Strings use the stiff-string partials of a metal wire. A bow uses the friction table of a bowed string. The flute uses a jet. The organ is an open pipe, partials at 1, 2, 3… times the written pitch. Vibes, celesta, glass, and the bowl use the published bar, glass, and bowl mode lists. The marimba is the measured modes of a marimba bar: fifty partials of a low C bar, transposed to the written pitch, quiet after about a tenth of a second. The piano is a struck stiff string: the hammer contact shortens as the note gets louder, low notes are one string, higher notes are two and then three slightly detuned strings, and a longitudinal partial rings in the attack.",
      "Each station has its own volume slider. They start at the same position. Starting play on one station stops the others.",
    ],
  },
};

export function theoryText(id) {
  if (PAGES[id]) return PAGES[id];
  const named = INTERP[id];
  if (!named) return PAGES.stations;
  return { title: named[0], body: [named[1], HEAR[id]] };
}

export function renderTheory(id) {
  const box = document.getElementById("theoryBody");
  if (!box) return;
  const page = theoryText(id);
  box.innerHTML = `<h2>${page.title}</h2>${page.body.map((p) => `<p>${p}</p>`).join("")}`;
}

export function openHelp() {
  const help = document.getElementById("help-menu");
  const theory = document.getElementById("theory-menu");
  if (theory) theory.open = false;
  if (!help) return;
  help.open = true;
  help.querySelector("summary")?.focus();
}

export function initHelp() {
  const select = document.getElementById("theory");
  const help = document.getElementById("help-menu");
  const theory = document.getElementById("theory-menu");
  if (select) {
    select.addEventListener("change", () => renderTheory(select.value));
    renderTheory(select.value);
  }
  document.querySelectorAll(".info-panel .sheet-x").forEach((button) => {
    button.addEventListener("click", () => {
      const menu = button.closest("details");
      if (menu) menu.open = false;
    });
  });
  document.addEventListener("keydown", (event) => {
    const tag = event.target && event.target.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (event.target && event.target.isContentEditable);
    if (event.key === "?" && !typing) {
      event.preventDefault();
      openHelp();
    }
    if (event.key === "Escape") {
      if (help) help.open = false;
      if (theory) theory.open = false;
    }
  });
}

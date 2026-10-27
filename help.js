import { INTERP } from "./world.js";

const HEAR = {
  copenhagen: "Each note starts as a smeared cluster of partials and snaps onto its pitch. Look on Spectra collapses the cloud onto one spectrum.",
  mwi: "Nothing is discarded. A melody splits into more copies as the bars go on, spread in octave and across the room. A Bell pair plays both branches. On Register, a measurement is never read out; every branch keeps sounding.",
  zeno: "The watching slider starts at 0.75. It re-strikes a note instead of letting it move, and it slows the walk on the ratio lattice. The metronome tick stays silent.",
  decoherence: "γ starts at 0.35. Coherence falls with γ. While it is high, pitches are smeared and detuned; as it falls, the harmony crystallises onto one spectrum. When it has fallen far enough, the melody and the counter-voice become harp.",
  pilot: "The seed starts at 1905. It fixes every random choice. The same seed is the same piece. A theremin rides a guide wave; the other parts follow the path that seed already decided.",
  grw: "λ starts at 0.3. Most of the time the cloud stays smeared. At random, a hit collapses it to one point. That hit is a gong and a thump.",
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
      "The row under the title starts as Copenhagen, computational basis, and By interpretation. Quantum Zeno shows watching, starting at 0.75. Decoherence shows γ, starting at 0.35. GRW collapse shows λ, starting at 0.3. Pilot-wave, and the random unitary basis, show seed, starting at 1905; the dice picks a new seed. ⇄ couplings opens the links. × closes that list. Three links start on: Spectra → harmony of Histories, Pair → melodies of Histories, and Orbits → drums of Histories. The other four start off.",
      "I Spectra is a superposition. Each spectrum is a phasor you can drag. Shared tones add as amplitudes, so the tone swells, thins, or beats. F, X, Z, T, and Tunnel remix the amplitudes. + spectrum adds one. The keys along the bottom measure a harmonic of D. Look collapses the cloud onto one. Prepare again restores it. Let it ring plays it.",
      "II Pair is two 16-step themes, A and B. Tap inside an orbit to place or remove a note. Mirror, Reverse, Excite, Relax, and Precess change that orbit. Entangled starts on and ties each operation to the other particle; the row under the orbits sets the tie. Separable leaves the other particle alone. Orbit plays them. Bell pair prepares a pair and starts as correlated. Measure pair reads it out. Teleport A → B sends A’s tune to B and clears A.",
      "III Histories is the piece. The sections start as α, β, γ, and ω. + section adds one. Each section has an operation on the Pair, one or more lengths in bars, and a ☠ slider: the chance the cat is found dead, in which case only the bass is left. + length adds a length. Harmony starts as a walk on the ratio lattice, and can instead follow the Spectra superposition. Spread starts at 0.7. Tempo starts at 84. Live one history plays one measured history through those sections. measure tempo and measure loudness start off. Half-life starts at ∞.",
      "IV Orbits is a set of rings. + ring adds one. Tap a step to cycle it: hit, superposed, GHZ cat, off. P is the chance of a superposed step. A ring can stay free or be tied to another ring, correlated or anti-correlated. Spin plays them. Open the box reads the state and says whether the cat is alive or dead.",
      "V Register is a small computer. Pick a gate, then tap the grid. The gates are H, X, Y, Z, S, T, √X, R, CNOT, CZ, M, and erase. Time runs downward; each column is a qubit. Run sounds the state: each basis state is a pitch, loudness is its probability, and stereo position is its phase. Tuning starts as Harmonic series. The instrument starts as glassbell. readout is the last hit of each pass and starts as bowl. second pass plays the circuit again and starts as the same instrument. + qubit and − qubit change the width. clear empties the grid.",
      "Orchestration sits under the title. tune, inner, and bass start at 100, 58, and 72. tune double, inner double, and bass double start at Bare; Unison and Octave add a second instrument. long notes starts at Restrike, which repeats a tone the instrument cannot hold; Held voice hands that line to a voice that can. rescore starts at As scored. Assign by hand sets melody, counter-melody, counter-voice, chord, and bass voice, or another ensemble keeps the pitches and changes the instruments. chairs starts at All at once. Admit one by one brings in the bass and chord, then the inner parts, then the tune, then the drums.",
      "Physics sits under that. forks starts at Sum. Sum sounds every length of a section together: bars they share get louder, bars only some of them reach can cancel, and the measured length cuts the rest with a tick. One plays only the measured length. A short note spreads across the neighboring ratios; a long one sits on one. While a passage is hot, each note keeps a quiet halo of the ratios it almost chose. A cold passage drops that halo. A tone inside the current spectrum becomes accompaniment. The part of it that sits outside stays the tune and beats against the chord. commutator starts at Off, which plays the notes as written. Excite then Mirror plays only the Pair notes that move when those two operations are swapped. H then Z does that for Register: Run plays the state that changes when H and Z are swapped, and it beats. Fifth, Third, and Quality play only the lattice chords that move under that step. A chord that does not move stays silent.",
    ],
  },
  sound: {
    title: "How the sound is made",
    body: [
      "Every note is synthesized in the page. There are no sampled instruments. Strings use the stiff-string partials of a metal wire. A bow uses the friction table of a bowed string. The flute uses a jet. The organ is an open pipe, partials at 1, 2, 3… times the written pitch. Vibes, celesta, glass, and the bowl use the published bar, glass, and bowl mode lists. The marimba is the measured modes of a marimba bar: fifty partials of a low C bar, transposed to the written pitch, quiet after about a tenth of a second. The piano is a struck stiff string: the hammer contact shortens as the note gets louder, low notes are one string, higher notes are two and then three slightly detuned strings, and a longitudinal partial rings in the attack.",
      "Each station has its own volume slider. All five start at 50. 50 is the opening loudness. 100 is twice that loudness. 0 is silent. The slider on the station you are hearing is the one that moves. MIDI and WAV download that station. A WAV uses the slider as a fraction of the file’s peak: 50 is half of the loudest the file gets, and 100 is that full file, just under the peak. Starting play on one station stops the others. If the browser is holding the sound, the page shows a full-screen button: Tap to enable sound.",
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

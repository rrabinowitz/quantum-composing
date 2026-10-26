import { activeStationGain, makeOutput, note, prepare, setActiveStation } from "./audio.js";

const PROG = {
  piano: [0, 0, "Piano"], bass: [1, 32, "Bass"], strings: [2, 48, "Strings"], winds: [3, 71, "Woodwinds"],
  glass: [4, 92, "Glass (coherent)"], pluck: [5, 46, "Particles (pluck)"], pilot: [6, 95, "Pilot wave"],
  noise: [7, 122, "Environment"], tick: [9, 0, "Geiger"], thump: [9, 0, "Collapse"],
  celesta: [8, 8, "Celesta"], epiano: [10, 4, "E-piano"], cello: [11, 42, "Cello"], choir: [12, 52, "Choir"],
  marimba: [13, 12, "Marimba"], organ: [14, 19, "Organ"], harp: [15, 46, "Harp"], theremin: [6, 79, "Theremin"],
  gong: [4, 14, "Tubular bells / gong"], bowedmetal: [5, 92, "Bowed metal"],
  vibes: [0, 11, "Vibraphone"], kalimba: [0, 108, "Kalimba"], pizz: [0, 45, "Pizzicato"], guitar: [0, 24, "Guitar"],
  bowl: [0, 14, "Singing bowl"], glassbell: [0, 9, "Glass bell"], reverse: [0, 89, "Reversed tape"],
};
const DRUM = { tick: 42, thump: 36 };
PROG.__drums = [9, 0, "Quantum percussion"];

// notes: [{midi, t(sec), dur(sec), voice, vel}] → Standard MIDI File (format 1)
export function toMidi(notes, bpm) {
  notes = notes.map((n) => (n.gm != null ? { ...n, voice: "__drums" } : n));
  const ppq = 480, tick = (s) => Math.max(0, Math.round((s * bpm * ppq) / 60));
  const vlq = (n) => { n = Math.max(0, n | 0); const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const str = (s) => [...s].map((c) => c.charCodeAt(0));
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (id, data) => [...str(id), ...u32(data.length), ...data];
  const us = Math.round(60e6 / bpm);
  const tracks = [[0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0]];
  let nextCh = 0;
  for (const [voice, [defCh, prog, name]] of Object.entries(PROG)) {
    const ns = notes.filter((n) => n.voice === voice);
    if (!ns.length) continue;
    // channels are allocated only to instruments actually used (drums stay on channel 10)
    let ch = defCh;
    if (defCh !== 9) { if (nextCh === 9) nextCh++; ch = Math.min(15, nextCh++); }
    const ev = [];
    ns.forEach((n) => {
      const v = Math.max(1, Math.min(127, Math.round((n.vel / 0.2) * 100)));
      const key = n.gm ?? DRUM[voice] ?? Math.max(0, Math.min(127, Math.round(n.midi)));
      const on = tick(n.t), off = Math.max(on + 1, tick(n.t + Math.max(n.dur, 0.05)));
      ev.push({ t: on, o: 1, b: [0x90 | ch, key, v] }, { t: off, o: 0, b: [0x80 | ch, key, 0] });
    });
    ev.sort((a, b) => a.t - b.t || a.o - b.o);
    const data = [0, 0xff, 0x03, ...vlq(name.length), ...str(name), ...(ch === 9 ? [] : [0, 0xc0 | ch, prog])];
    let last = 0;
    ev.forEach((e) => { data.push(...vlq(e.t - last), ...e.b); last = e.t; });
    data.push(0, 0xff, 0x2f, 0);
    tracks.push(data);
  }
  const bytes = [...chunk("MThd", [0, 1, 0, tracks.length, (ppq >> 8) & 255, ppq & 255]), ...tracks.flatMap((t) => chunk("MTrk", t))];
  return new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
}

// Offline render with the same synth voices → 16-bit stereo WAV
export async function toWav(notes, total) {
  const sr = 44100, OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("Offline audio rendering is unavailable in this browser");
  const c = new OfflineContext(2, Math.ceil(sr * (total + 3)), sr);
  await prepare(c);
  const out = makeOutput(c);
  notes.forEach((n) => note(n.midi, n.t + 0.05, n.dur, n.voice, n.vel, out, n.fx));
  const buf = await c.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), len = L.length;
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = (peak > 0 ? 0.95 / peak : 1) * activeStationGain();
  const ab = new ArrayBuffer(44 + len * 4), v = new DataView(ab);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + len * 4, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, len * 4, true);
  for (let i = 0, o = 44; i < len; i++, o += 4) {
    v.setInt16(o, Math.max(-1, Math.min(1, L[i] * g)) * 32767, true);
    v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i] * g)) * 32767, true);
  }
  return new Blob([ab], { type: "audio/wav" });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  return btoa(binary);
}

export function download(blob, name) {
  const bridge = window.webkit?.messageHandlers?.saveBlob;
  if (bridge) {
    blob.arrayBuffer().then((buf) => {
      bridge.postMessage({ filename: name, base64: bytesToBase64(new Uint8Array(buf)) });
    });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Wire a pair of export buttons to a builder returning {notes, total, bpm}
export function wireExport(midiBtn, wavBtn, build, base) {
  const station = midiBtn.closest("section")?.id;
  const arm = () => { if (station) setActiveStation(station); };
  midiBtn.onclick = () => { arm(); const r = build(); download(toMidi(r.notes, r.bpm), base + ".mid"); };
  wavBtn.onclick = async () => {
    arm();
    const r = build(), label = wavBtn.textContent;
    wavBtn.disabled = true; wavBtn.textContent = "Rendering…";
    try { download(await toWav(r.notes, r.total), base + ".wav"); }
    catch (err) { wavBtn.textContent = "Export failed"; console.error(err); await new Promise((resolve) => setTimeout(resolve, 1200)); }
    finally { wavBtn.disabled = false; wavBtn.textContent = label; }
  };
}

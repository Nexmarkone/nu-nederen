// WebAudio — everything synthesized in code, no audio files.
// iOS requires a user gesture before sound: call unlockAudio() on first tap.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

export function unlockAudio(): void {
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function ac(): AudioContext | null {
  if (muted || !ctx || ctx.state !== "running") return null;
  return ctx;
}

function tone(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  t0: number,
  dur: number,
  peak = 0.18,
  glideTo?: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(
  c: AudioContext,
  t0: number,
  dur: number,
  filterType: BiquadFilterType,
  freq: number,
  peak = 0.25,
  sweepTo?: number,
): void {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

/** Short crisp card tick (draw, deal). */
export function sndTick(): void {
  const c = ac();
  if (!c) return;
  noiseBurst(c, c.currentTime, 0.04, "highpass", 2500, 0.18);
}

/** Filtered noise sweep — a card flipping. */
export function sndFlip(): void {
  const c = ac();
  if (!c) return;
  noiseBurst(c, c.currentTime, 0.18, "bandpass", 500, 0.2, 3200);
}

/** Rising sine arpeggio — success. */
export function sndPling(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  tone(c, "sine", 660, t, 0.12, 0.16);
  tone(c, "sine", 880, t + 0.09, 0.12, 0.16);
  tone(c, "sine", 1320, t + 0.18, 0.2, 0.14);
}

/** Falling square — wrong! */
export function sndBuzz(): void {
  const c = ac();
  if (!c) return;
  tone(c, "square", 170, c.currentTime, 0.28, 0.12, 75);
}

/** Heavy slam for jump-ins. */
export function sndSlam(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  noiseBurst(c, t, 0.12, "lowpass", 300, 0.5);
  tone(c, "sine", 150, t, 0.22, 0.4, 55);
}

/** Brass-ish baguette horn: three rising sawtooth notes. */
export function sndHorn(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const notes = [220, 277.2, 329.6];
  notes.forEach((f, i) => {
    tone(c, "sawtooth", f, t + i * 0.16, 0.22, 0.14);
    tone(c, "sawtooth", f * 2, t + i * 0.16, 0.22, 0.05);
  });
  // Final sustained chord
  for (const f of notes) tone(c, "sawtooth", f, t + 0.5, 0.65, 0.1);
}

/** Winner fanfare. */
export function sndFanfare(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const seq = [523.3, 659.3, 784, 1046.5];
  seq.forEach((f, i) => tone(c, "triangle", f, t + i * 0.13, 0.18, 0.16));
  for (const f of [523.3, 659.3, 784]) tone(c, "sawtooth", f, t + 0.55, 0.9, 0.07);
}

import { type Position, frequencyAt, positionKey } from '../game/notes';
import { HANDBELL_BEAT, HANDBELL_PARTIALS } from './bells';
import { BLOCK_PARTIALS, CLICK } from './blocks';
import { BEAT_HZ, BELL_PARTIALS, type ChimeKind, chimeNotes } from './chime';
import { karplusStrong } from './karplus';

/**
 * Tiny Web Audio layer. Plucks are pre-rendered Karplus–Strong buffers
 * (cached per position) played through a warm low-pass and a soft body
 * resonance. Created lazily on the first user gesture.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
const cache = new Map<string, AudioBuffer>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/** Call from a user gesture (iOS/Chrome autoplay policy). */
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

function pluckBuffer(c: AudioContext, p: Position): AudioBuffer {
  const key = positionKey(p);
  let buf = cache.get(key);
  if (!buf) {
    const freq = frequencyAt(p);
    // Wound, low strings ring longer and darker; plain strings brighter.
    const data = karplusStrong(freq, c.sampleRate, {
      duration: p.string < 3 ? 2.6 : 2.0,
      decay: p.string < 3 ? 0.997 : 0.995,
      brightness: p.string < 3 ? 0.55 : 0.75,
      pluckPosition: 0.16,
    });
    buf = c.createBuffer(1, data.length, c.sampleRate);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    cache.set(key, buf);
  }
  return buf;
}

export function pluck(p: Position, velocity = 0.8) {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, p);
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3800;
  tone.Q.value = 0.4;
  const body = c.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 210;
  body.Q.value = 1.2;
  body.gain.value = 4;
  const g = c.createGain();
  g.gain.value = 0.55 * velocity;
  src.connect(tone).connect(body).connect(g).connect(master);
  src.start();
}

/** A dry, soft wood knock: no harsh buzzer. */
export function knock() {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  const len = Math.floor(c.sampleRate * 0.12);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / c.sampleRate;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.6 + Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 40) * 0.8;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const g = c.createGain();
  g.gain.value = 0.35;
  src.connect(lp).connect(g).connect(master);
  src.start();
}

/**
 * A brass chime (see `chime.ts`): a milestone in a run, or a stage mastered. Quiet under
 * the plucks, bright on top; silent when the player has turned sound off.
 */
export function chime(kind: ChimeKind, tier = 1) {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  const t0 = c.currentTime + 0.01;
  const air = c.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = 7000;
  const bus = c.createGain();
  bus.gain.value = kind === 'mastered' ? 0.2 : 0.16;
  bus.connect(air).connect(master);
  for (const note of chimeNotes(kind, tier)) {
    for (const p of BELL_PARTIALS) {
      const f = note.freq * p.ratio;
      if (f > 12000) continue;
      const ring = p.ring * (kind === 'mastered' ? 1.4 : 1);
      const g = c.createGain();
      const at = t0 + note.delay;
      // A soft strike (3 ms) then an exponential ring to silence.
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(note.gain * p.gain * 0.5, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      g.connect(bus);
      for (const d of [-BEAT_HZ / 2, BEAT_HZ / 2]) {
        const o = c.createOscillator();
        o.frequency.value = f + d;
        o.connect(g);
        o.start(at);
        o.stop(at + ring + 0.05);
      }
    }
  }
}

/**
 * Echo's hand bell (see `bells.ts`): a felt-tipped clapper strike, then the fundamental and
 * its twelfth ringing down. `velocity` 0–1; `damp` shortens the ring (a stroke from the
 * player, quicker to clear than the room's own playing). Silent when sound is off.
 */
export function ringBell(freq: number, velocity = 1, damp = 1) {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  const t0 = c.currentTime + 0.005;
  const air = c.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = 6500;
  const bus = c.createGain();
  bus.gain.value = 0.3 * velocity;
  bus.connect(air).connect(master);
  for (const p of HANDBELL_PARTIALS) {
    const f = freq * p.ratio;
    if (f > 14000) continue;
    const ring = p.ring * damp;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p.gain * 0.5, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ring);
    g.connect(bus);
    for (const d of [-HANDBELL_BEAT / 2, HANDBELL_BEAT / 2]) {
      const o = c.createOscillator();
      o.frequency.value = f + d;
      o.connect(g);
      o.start(t0);
      o.stop(t0 + ring + 0.05);
    }
  }
  // The clapper: a few milliseconds of band-passed noise at the strike.
  const len = Math.floor(c.sampleRate * 0.02);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / c.sampleRate) * 300);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(9000, freq * 4);
  bp.Q.value = 1.4;
  const tg = c.createGain();
  tg.gain.value = 0.12;
  src.connect(bp).connect(tg).connect(bus);
  src.start(t0);
}

/**
 * A lacquered block lighting (see `blocks.ts`): a wooden click, then, unless `chimeFreq` is 0,
 * a small brass chime. `velocity` 0–1. Silent when sound is off.
 */
export function tapBlock(chimeFreq: number, velocity = 1) {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  const t0 = c.currentTime + 0.004;
  const bus = c.createGain();
  bus.gain.value = 0.32 * velocity;
  bus.connect(master);
  const len = Math.floor(c.sampleRate * 0.03);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / c.sampleRate) * CLICK.decay);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = CLICK.centre;
  bp.Q.value = CLICK.q;
  const cg = c.createGain();
  cg.gain.value = CLICK.gain * 4;
  src.connect(bp).connect(cg).connect(bus);
  src.start(t0);
  if (!chimeFreq) return;
  for (const p of BLOCK_PARTIALS) {
    const g = c.createGain();
    const at = t0 + 0.006;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(p.gain * 0.22, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + p.ring);
    g.connect(bus);
    const o = c.createOscillator();
    o.frequency.value = chimeFreq * p.ratio;
    o.connect(g);
    o.start(at);
    o.stop(at + p.ring + 0.05);
  }
}

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
}

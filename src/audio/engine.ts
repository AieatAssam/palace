import { type Position, frequencyAt, positionKey } from '../game/notes';
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

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
}

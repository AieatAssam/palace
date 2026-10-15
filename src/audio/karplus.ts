/**
 * Karplus–Strong plucked-string synthesis (pure, testable).
 *
 * A noise burst circulates through a delay line with a two-point averaging
 * low-pass filter. The averager adds half a sample of delay, and a first-order
 * all-pass supplies the remaining fractional delay so pitch is accurate even
 * for short (high-frequency) delay lines.
 */
export interface PluckOptions {
  /** Seconds of audio to render. */
  duration?: number;
  /** Per-period loss (0..1, closer to 1 rings longer). */
  decay?: number;
  /** 0..1, where along the string it is plucked (shapes the harmonic content). */
  pluckPosition?: number;
  /** 0..1 brightness of the initial excitation. */
  brightness?: number;
  /** Deterministic noise source (for tests). */
  rng?: () => number;
}

export function karplusStrong(frequency: number, sampleRate: number, opts: PluckOptions = {}): Float32Array {
  const { duration = 2.2, decay = 0.996, pluckPosition = 0.18, brightness = 0.65, rng = Math.random } = opts;
  const total = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(total);

  // Loop delay = N (integer) + 0.5 (averager) + d (all-pass), d in [0.1, 1.1).
  const period = sampleRate / frequency;
  let n = Math.floor(period - 0.5 - 0.1);
  if (n < 2) n = 2;
  const d = period - 0.5 - n;
  const apC = (1 - d) / (1 + d);

  // Excitation: noise, softened by a one-pole low-pass (brightness), then a
  // comb (pluck position) to remove harmonics with a node at the pluck point.
  const buf = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const white = rng() * 2 - 1;
    lp += (white - lp) * (0.15 + 0.85 * brightness);
    buf[i] = lp;
  }
  const combDelay = Math.max(1, Math.round(n * pluckPosition));
  const excitation = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    excitation[i] = buf[i]! - (i >= combDelay ? buf[i - combDelay]! : 0);
    mean += excitation[i]!;
  }
  mean /= n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    excitation[i]! -= mean; // remove DC so the tail decays to silence
    peak = Math.max(peak, Math.abs(excitation[i]!));
  }
  if (peak > 0) for (let i = 0; i < n; i++) excitation[i]! /= peak;

  const line = excitation;
  let idx = 0;
  let prev = 0;
  let apX1 = 0;
  let apY1 = 0;
  for (let t = 0; t < total; t++) {
    const cur = line[idx]!;
    // Averaging low-pass with per-period loss.
    const avg = decay * 0.5 * (cur + prev);
    prev = cur;
    // First-order all-pass for fractional delay.
    const ap = apC * avg + apX1 - apC * apY1;
    apX1 = avg;
    apY1 = ap;
    out[t] = cur;
    line[idx] = ap;
    idx = (idx + 1) % n;
  }

  // Short attack ramp (avoid a click) and gentle fade at the tail.
  const attack = Math.min(total, Math.floor(sampleRate * 0.002));
  for (let i = 0; i < attack; i++) out[i]! *= i / attack;
  const release = Math.min(total, Math.floor(sampleRate * 0.25));
  for (let i = 0; i < release; i++) out[total - 1 - i]! *= i / release;
  return out;
}

/**
 * Estimate the fundamental frequency of a signal by autocorrelation (used in
 * tests to check the synth is in tune).
 */
export function estimatePitch(signal: Float32Array, sampleRate: number, minHz = 60, maxHz = 1500): number {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  const len = Math.min(signal.length - maxLag, 4096);
  const corr = (lag: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += signal[i]! * signal[i + lag]!;
    return s;
  };
  let bestLag = minLag;
  let best = -Infinity;
  const values: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const c = corr(lag);
    values[lag] = c;
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  // Prefer the first strong peak (avoid octave errors from sub-multiples).
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const c = values[lag]!;
    if (c > 0.9 * best && c >= values[lag - 1]! && c >= values[lag + 1]!) {
      bestLag = lag;
      break;
    }
  }
  // Parabolic interpolation around the peak for sub-sample accuracy.
  const a = values[bestLag - 1] ?? values[bestLag]!;
  const b = values[bestLag]!;
  const c = values[bestLag + 1] ?? values[bestLag]!;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return sampleRate / (bestLag + shift);
}

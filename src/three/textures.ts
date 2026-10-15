import * as THREE from 'three';

/**
 * Procedural textures, generated once on a 2D canvas: rosewood (albedo,
 * roughness, normal), wound-string normal map, mother-of-pearl, and soft
 * glow / halo sprites.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1D value noise with smooth interpolation, tiled over `period`. */
function noise1D(rng: () => number, period: number) {
  const pts = Array.from({ length: period }, rng);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = pts[((i % period) + period) % period]!;
    const b = pts[(((i + 1) % period) + period) % period]!;
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export interface WoodMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

/**
 * Rosewood: long, slightly wavy dark grain lines along U (the neck axis),
 * open pores, and colour variation. Height drives both normal and roughness
 * (pores are rougher and recessed).
 */
export function makeRosewood(w = 1024, h = 256, seed = 7): WoodMaps {
  const rng = mulberry32(seed);
  const height = new Float32Array(w * h);
  const tone = new Float32Array(w * h);

  // Grain bands: each row gets a band value from layered noise, warped along x.
  const bands = noise1D(rng, 64);
  const bands2 = noise1D(rng, 128);
  // Noise periods match their U multipliers so the map tiles seamlessly along the neck.
  const warp = noise1D(rng, 6);
  const warp2 = noise1D(rng, 13);
  const warp3 = noise1D(rng, 4);
  const streak = noise1D(rng, 512);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const wv = v * 40 + (warp(u * 6) - 0.5) * 3 + (warp2(u * 13 + v * 3) - 0.5) * 0.8;
      const b = bands(wv) * 0.65 + bands2(wv * 3.1) * 0.35;
      const line = Math.pow(Math.abs(Math.sin(wv * Math.PI * 2.0 + b * 4)), 6);
      const fine = streak(v * 400 + (warp3(u * 4) - 0.5) * 20) * 0.5;
      const i = y * w + x;
      tone[i] = b * 0.7 + fine * 0.3 - line * 0.35;
      height[i] = 0.55 + b * 0.25 - line * 0.25;
    }
  }
  // Pores: short dark dashes stretched along the grain.
  const pores = Math.floor(w * h * 0.004);
  for (let k = 0; k < pores; k++) {
    const px = Math.floor(rng() * w);
    const py = Math.floor(rng() * h);
    const len = 3 + Math.floor(rng() * 10);
    for (let d = 0; d < len; d++) {
      const i = py * w + ((px + d) % w);
      tone[i]! -= 0.28;
      height[i]! -= 0.4;
    }
  }

  const albedo = canvas(w, h);
  const rough = canvas(w, h);
  const normal = canvas(w, h);
  const a = albedo.getContext('2d')!;
  const r = rough.getContext('2d')!;
  const n = normal.getContext('2d')!;
  const ai = a.createImageData(w, h);
  const ri = r.createImageData(w, h);
  const ni = n.createImageData(w, h);

  // Palette: rosewood #5C3A2E, darker streak #2E1A14, warmer highlight #7A4A36.
  const dark = [40, 22, 17];
  const base = [92, 58, 46];
  const warm = [124, 76, 56];
  const strength = 2.4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = Math.min(1, Math.max(0, tone[i]!));
      const c =
        t < 0.5
          ? dark.map((d, k) => d + (base[k]! - d) * (t / 0.5))
          : base.map((d, k) => d + (warm[k]! - d) * ((t - 0.5) / 0.5));
      const o = i * 4;
      ai.data[o] = c[0]!;
      ai.data[o + 1] = c[1]!;
      ai.data[o + 2] = c[2]!;
      ai.data[o + 3] = 255;

      const hv = height[i]!;
      const rv = Math.min(255, Math.max(0, (0.55 + (0.6 - hv) * 0.6) * 255));
      ri.data[o] = rv;
      ri.data[o + 1] = rv;
      ri.data[o + 2] = rv;
      ri.data[o + 3] = 255;

      const hl = height[y * w + ((x - 1 + w) % w)]!;
      const hr = height[y * w + ((x + 1) % w)]!;
      const hu = height[((y - 1 + h) % h) * w + x]!;
      const hd = height[((y + 1) % h) * w + x]!;
      let nx = (hl - hr) * strength;
      let ny = (hu - hd) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      ni.data[o] = (nx * 0.5 + 0.5) * 255;
      ni.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      ni.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      ni.data[o + 3] = 255;
    }
  }
  a.putImageData(ai, 0, 0);
  r.putImageData(ri, 0, 0);
  n.putImageData(ni, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  const normalMap = new THREE.CanvasTexture(normal);
  for (const t of [map, roughnessMap, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, roughnessMap, normalMap };
}

/** Helical winding as a tileable normal map (V along the string). */
export function makeWindingNormal(size = 64): THREE.CanvasTexture {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Ridges run around the string (U), repeating along its length (V),
      // with a slight helix: phase depends mostly on v, a little on u.
      const phase = ((y + x * 0.125) / size) * Math.PI * 2 * 8;
      const ny = Math.cos(phase) * 0.75;
      const nz = Math.sqrt(1 - ny * ny);
      const o = (y * size + x) * 4;
      img.data[o] = 128;
      img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft radial glow sprite (white, alpha falloff). */
export function makeGlow(size = 128): THREE.CanvasTexture {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft halo sprite: a faint core inside a brighter ring that fades out (white, alpha falloff). */
export function makeHalo(size = 128): THREE.CanvasTexture {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,1)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface PearlMaps {
  /** Albedo: pale nacre with faint growth bands and a hint of colour. */
  map: THREE.CanvasTexture;
  /** Thin-film thickness (G channel): drives where the iridescent colours shift. */
  thickness: THREE.CanvasTexture;
  /** Roughness (G channel): tiny variation between nacre layers. */
  roughnessMap: THREE.CanvasTexture;
}

/**
 * Mother-of-pearl, cut from a shell: wavy, roughly concentric growth bands
 * with a fine fibrous shimmer across them. The bands modulate thin-film
 * thickness, so the iridescence breaks into flowing colour rather than a flat tint.
 */
export function makePearl(size = 256, seed = 11): PearlMaps {
  const rng = mulberry32(seed);
  const warp = noise1D(rng, 64);
  const warp2 = noise1D(rng, 64);
  const fibre = noise1D(rng, 256);
  const mk = () => {
    const c = canvas(size, size);
    return { c, ctx: c.getContext('2d')!, img: new ImageData(size, size) };
  };
  const albedo = mk();
  const thick = mk();
  const rough = mk();
  // Band centre sits off the disc so the bands sweep across it like a slice of shell.
  const cx = size * -0.35;
  const cy = size * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy) / size;
      const a = Math.atan2(dy, dx);
      const wobble = 0.05 * warp(a * 18 + 7) + 0.025 * warp2(r * 40);
      const band = 0.5 + 0.5 * Math.sin((r + wobble) * 24);
      const fine = 0.5 + 0.5 * Math.sin((r + wobble * 0.5) * 110 + fibre(a * 300) * 3);
      const fib = fibre(a * 900 + r * 40);
      const v = 0.7 * band + 0.18 * fine + 0.12 * fib;
      const o = (y * size + x) * 4;
      // Albedo: cream with whisper-faint pink / green drift across the bands.
      const l = 206 + 46 * v;
      albedo.img.data[o] = Math.min(255, l + 6 * Math.sin(band * 3.1));
      albedo.img.data[o + 1] = Math.min(255, l - 3 + 5 * Math.sin(band * 3.1 + 2.1));
      albedo.img.data[o + 2] = Math.min(255, l - 12 + 8 * Math.sin(band * 3.1 + 4.2));
      albedo.img.data[o + 3] = 255;
      const t = Math.round(255 * (0.15 + 0.85 * (0.85 * band + 0.15 * fine)));
      thick.img.data[o] = thick.img.data[o + 1] = thick.img.data[o + 2] = t;
      thick.img.data[o + 3] = 255;
      const rr = Math.round(255 * (0.12 + 0.16 * (1 - fine) + 0.06 * fib));
      rough.img.data[o] = rough.img.data[o + 1] = rough.img.data[o + 2] = rr;
      rough.img.data[o + 3] = 255;
    }
  }
  const tex = (m: ReturnType<typeof mk>, srgb: boolean) => {
    m.ctx.putImageData(m.img, 0, 0);
    const t = new THREE.CanvasTexture(m.c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(albedo, true), thickness: tex(thick, false), roughnessMap: tex(rough, false) };
}

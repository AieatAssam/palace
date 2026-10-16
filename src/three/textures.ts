import * as THREE from 'three';

/**
 * Procedural textures, generated once on a 2D canvas: rosewood and walnut
 * (albedo, roughness, normal), tooled desk leather, wound-string normal map
 * and mother-of-pearl.
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

/** 2D value noise, tiled over `px` × `py` lattice cells. */
function noise2D(rng: () => number, px: number, py: number) {
  const pts = Array.from({ length: px * py }, rng);
  const at = (i: number, j: number) => pts[(((j % py) + py) % py) * px + (((i % px) + px) % px)]!;
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
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

type RGB = readonly [number, number, number];

interface WoodSpec {
  /** Albedo ramp: darkest pore / grain, body, warmest figure. */
  dark: RGB;
  base: RGB;
  warm: RGB;
  /** Contrast of the long, gentle figure (0 = none). */
  figure: number;
  /** Pores per pixel. */
  pores: number;
  /** Roughness of the bare wood under any finish. */
  roughness: number;
}

/**
 * Quiet, tileable wood along U (the grain axis): a large, slow colour drift,
 * a soft long figure, fine fibre streaks and open pores as short dots. No
 * hard banding — every term is low-contrast and smooth. Height drives both
 * normal and roughness (pores are rougher and recessed).
 */
function makeWood(w: number, h: number, seed: number, spec: WoodSpec): WoodMaps {
  const rng = mulberry32(seed);
  const height = new Float32Array(w * h);
  const tone = new Float32Array(w * h);

  // Lattice periods match their U / V multipliers so the map tiles seamlessly.
  const drift = noise2D(rng, 3, 2);
  const drift2 = noise2D(rng, 7, 4);
  const warp = noise2D(rng, 4, 3);
  const fibre = noise2D(rng, 6, 160);
  const fibre2 = noise2D(rng, 12, 320);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const d = drift(u * 3, v * 2) * 0.65 + drift2(u * 7, v * 4) * 0.35;
      const phase = v * 9 + (warp(u * 4, v * 3) - 0.5) * 1.6;
      const fig = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const fb = fibre(u * 6, v * 160) * 0.6 + fibre2(u * 12, v * 320) * 0.4;
      const i = y * w + x;
      tone[i] = 0.5 + (d - 0.5) * 0.6 + (fig - 0.5) * spec.figure + (fb - 0.5) * 0.3;
      height[i] = 0.5 + (fb - 0.5) * 0.3 + (fig - 0.5) * 0.05;
    }
  }
  // Pores: small soft dots, barely stretched along the grain.
  const pores = Math.floor(w * h * spec.pores);
  for (let k = 0; k < pores; k++) {
    const px = Math.floor(rng() * w);
    const py = Math.floor(rng() * h);
    const len = 2 + Math.floor(rng() * 3);
    const depth = 0.5 + rng() * 0.5;
    for (let d = 0; d < len; d++) {
      const fall = d === 0 || d === len - 1 ? 0.55 : 1;
      const i = py * w + ((px + d) % w);
      tone[i]! -= 0.16 * depth * fall;
      height[i]! -= 0.32 * depth * fall;
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

  const { dark, base, warm } = spec;
  const strength = 1.6;
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
      const rv = Math.min(255, Math.max(0, (spec.roughness + (0.5 - hv) * 0.7) * 255));
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

/** Dark Indian rosewood (#2A1812 → #3F261C): chocolate body, soft figure, dotted pores. */
export function makeRosewood(w = 1024, h = 256, seed = 7): WoodMaps {
  return makeWood(w, h, seed, {
    dark: [36, 20, 15],
    base: [56, 34, 25],
    warm: [74, 46, 33],
    figure: 0.14,
    pores: 0.0025,
    roughness: 0.5,
  });
}

/** Figured walnut for the desk: a little more figure, lighter and browner than the board. */
export function makeWalnut(w = 512, h = 256, seed = 23): WoodMaps {
  return makeWood(w, h, seed, {
    dark: [40, 27, 19],
    base: [62, 43, 30],
    warm: [88, 63, 43],
    figure: 0.32,
    pores: 0.0015,
    roughness: 0.42,
  });
}

/**
 * Desk leather: a fine, tight tooled grain — small irregular cells with soft
 * creases between them — over a slow, barely-there mottle, dyed bottle green.
 * Everything is low amplitude: the hide should read as smooth and dense from
 * a metre away, with grain only where the light rakes across it.
 */
export function makeLeather(size = 1024, seed = 31): WoodMaps {
  const rng = mulberry32(seed);
  const mottle = noise2D(rng, 3, 3);
  const mottle2 = noise2D(rng, 9, 9);
  const warp = noise2D(rng, 24, 24);
  const cell = noise2D(rng, 64, 64);
  const cell2 = noise2D(rng, 112, 112);
  const pore = noise2D(rng, 320, 320);
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // A gentle warp keeps the cells from lining up on the lattice.
      const wu = u + (warp(u * 24, v * 24) - 0.5) * 0.012;
      const wv = v + (warp(u * 24 + 11, v * 24 + 5) - 0.5) * 0.012;
      // Soft creases where the cell noise crosses its midpoint, rounded tops between.
      const c = 1 - Math.abs(cell(wu * 64, wv * 64) * 2 - 1);
      const c2 = 1 - Math.abs(cell2(wu * 112, wv * 112) * 2 - 1);
      const crease = Math.pow(1 - (c * 0.6 + c2 * 0.4), 2.2);
      const hv = 0.5 + (0.5 - crease) * 0.5 + (pore(u * 320, v * 320) - 0.5) * 0.08;
      const i = y * size + x;
      height[i] = hv;
      const m = mottle(u * 3, v * 3) * 0.7 + mottle2(u * 9, v * 9) * 0.3;
      tone[i] = 0.5 + (m - 0.5) * 0.45 + (hv - 0.5) * 0.12;
    }
  }
  const mk = () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d')!;
    return { c, ctx, img: ctx.createImageData(size, size) };
  };
  const albedo = mk();
  const rough = mk();
  const normal = mk();
  const dark: RGB = [20, 36, 29];
  const base: RGB = [30, 50, 41];
  const warm: RGB = [40, 60, 47];
  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = i * 4;
      const t = Math.min(1, Math.max(0, tone[i]!));
      const c =
        t < 0.5
          ? dark.map((d, k) => d + (base[k]! - d) * (t / 0.5))
          : base.map((d, k) => d + (warm[k]! - d) * ((t - 0.5) / 0.5));
      albedo.img.data[o] = c[0]!;
      albedo.img.data[o + 1] = c[1]!;
      albedo.img.data[o + 2] = c[2]!;
      albedo.img.data[o + 3] = 255;
      // Burnished tops are a touch smoother than the creases.
      const hv = height[i]!;
      const rv = Math.round(255 * (0.56 + (0.5 - hv) * 0.3));
      rough.img.data[o] = rough.img.data[o + 1] = rough.img.data[o + 2] = rv;
      rough.img.data[o + 3] = 255;
      const hl = height[y * size + ((x - 1 + size) % size)]!;
      const hr = height[y * size + ((x + 1) % size)]!;
      const hu = height[((y - 1 + size) % size) * size + x]!;
      const hd = height[((y + 1) % size) * size + x]!;
      let nx = (hl - hr) * strength;
      let ny = (hu - hd) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      normal.img.data[o] = (nx * 0.5 + 0.5) * 255;
      normal.img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      normal.img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      normal.img.data[o + 3] = 255;
    }
  }
  const tex = (m: ReturnType<typeof mk>, srgb: boolean) => {
    m.ctx.putImageData(m.img, 0, 0);
    const t = new THREE.CanvasTexture(m.c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(albedo, true), roughnessMap: tex(rough, false), normalMap: tex(normal, false) };
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

export interface PearlMaps {
  /** Albedo: pale nacre with soft, cloudy drifts of colour. */
  map: THREE.CanvasTexture;
  /** Thin-film thickness (G channel): drives where the iridescent colours shift. */
  thickness: THREE.CanvasTexture;
  /** Roughness (G channel): tiny variation between nacre layers. */
  roughnessMap: THREE.CanvasTexture;
}

/**
 * Mother-of-pearl as it looks in a fretboard dot: soft, cloudy nacre. Low
 * frequency noise, domain-warped twice so the colour pools and drifts in
 * irregular clouds — no rings, no stripes, no regular bands anywhere. The
 * cloud field drives thin-film thickness, so the iridescence flows across the
 * dot and shifts with the viewing angle.
 */
export function makePearl(size = 256, seed = 11): PearlMaps {
  const rng = mulberry32(seed);
  const n1 = noise2D(rng, 4, 4);
  const n2 = noise2D(rng, 7, 7);
  const n3 = noise2D(rng, 13, 13);
  const qa = noise2D(rng, 5, 5);
  const qb = noise2D(rng, 5, 5);
  const ra = noise2D(rng, 9, 9);
  const rb = noise2D(rng, 9, 9);
  const tint = noise2D(rng, 3, 3);
  const fbm = (x: number, y: number) => n1(x * 4, y * 4) * 0.55 + n2(x * 7, y * 7) * 0.3 + n3(x * 13, y * 13) * 0.15;
  const mk = () => {
    const c = canvas(size, size);
    return { c, ctx: c.getContext('2d')!, img: new ImageData(size, size) };
  };
  const albedo = mk();
  const thick = mk();
  const rough = mk();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Two rounds of domain warping: clouds folded into clouds.
      const qx = qa(u * 5, v * 5) - 0.5;
      const qy = qb(u * 5, v * 5) - 0.5;
      const rx = ra((u + qx * 0.5) * 9, (v + qy * 0.5) * 9) - 0.5;
      const ry = rb((u + qx * 0.5) * 9, (v + qy * 0.5) * 9) - 0.5;
      const c = fbm(u + qx * 0.35 + rx * 0.22, v + qy * 0.35 + ry * 0.22);
      // Stretch the cloud field's contrast a little so the colour has somewhere to go.
      const cloud = Math.min(1, Math.max(0, (c - 0.5) * 1.8 + 0.5));
      const t = tint(u * 3, v * 3);
      const o = (y * size + x) * 4;
      // Albedo: milky cream; brighter clouds drift faintly pink, the hollows faintly green-blue.
      const l = 214 + 34 * cloud;
      albedo.img.data[o] = Math.min(255, l + 6 * (cloud - 0.5) + 4 * (t - 0.5));
      albedo.img.data[o + 1] = Math.min(255, l - 2 - 3 * (cloud - 0.5));
      albedo.img.data[o + 2] = Math.min(255, l - 6 - 6 * (cloud - 0.5) + 8 * (0.5 - t));
      albedo.img.data[o + 3] = 255;
      const th = Math.round(255 * (0.1 + 0.85 * (cloud * 0.8 + t * 0.2)));
      thick.img.data[o] = thick.img.data[o + 1] = thick.img.data[o + 2] = th;
      thick.img.data[o + 3] = 255;
      const rr = Math.round(255 * (0.1 + 0.12 * (1 - cloud)));
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

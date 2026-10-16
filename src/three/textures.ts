import * as THREE from 'three';
import { LITE } from './quality';

/** Requested anisotropy: three clamps it to the renderer's maximum. Lite stays cheap on a CPU rasteriser. */
const ANISOTROPY = LITE ? 4 : 16;

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
    t.anisotropy = ANISOTROPY;
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

/**
 * Quarter-sawn black walnut for the desk: straight, close growth lines with a
 * gentle wander, short elongated pores (not endless streaks), and a slow
 * colour drift between boards. Square, seamless, mipmapped, high anisotropy:
 * one tile is ~2.4 desk units, so a line is a millimetre or two at true scale.
 */
export function makeWalnut(size = 1024, seed = 23): WoodMaps {
  const rng = mulberry32(seed);
  const wander = noise2D(rng, 2, 3);
  const wander2 = noise2D(rng, 5, 7);
  const board = noise2D(rng, 1, 4);
  const pore = noise2D(rng, 48, 384);
  const fleck = noise2D(rng, 160, 160);
  const height = new Float32Array(size * size);
  const tone = new Float32Array(size * size);
  const LINES = 38;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const w = (wander(u * 2, v * 3) - 0.5) * 0.06 + (wander2(u * 5, v * 7) - 0.5) * 0.015;
      const ph = (v + w) * LINES;
      const f = ph - Math.floor(ph);
      // Latewood: a narrow dark band at the end of each year, soft-edged.
      const late = Math.pow(Math.max(0, 1 - Math.abs(f - 0.85) / 0.12), 1.6);
      // Pores: short dashes along the grain, a few per line, darker and sunk.
      const pz = pore(u * 48, (v + w) * 384);
      const poreMask = Math.max(0, (pz - 0.72) / 0.28) * (0.4 + 0.6 * late);
      const b = board(u, v * 4);
      const i = y * size + x;
      tone[i] = 0.55 + (b - 0.5) * 0.35 - late * 0.45 - poreMask * 0.3 + (fleck(u * 160, v * 160) - 0.5) * 0.04;
      height[i] = 0.5 - late * 0.08 - poreMask * 0.5;
    }
  }
  const dark: RGB = [34, 23, 16];
  const base: RGB = [66, 45, 31];
  const warm: RGB = [92, 64, 43];
  const mk = () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d')!;
    return { c, ctx, img: ctx.createImageData(size, size) };
  };
  const albedo = mk();
  const rough = mk();
  const normal = mk();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = i * 4;
      const k = Math.max(0, Math.min(1, tone[i]!));
      const lo = k < 0.5 ? dark : base;
      const hi = k < 0.5 ? base : warm;
      const s = k < 0.5 ? k * 2 : (k - 0.5) * 2;
      for (let c = 0; c < 3; c++) albedo.img.data[o + c] = lo[c]! + (hi[c]! - lo[c]!) * s;
      albedo.img.data[o + 3] = 255;
      const rv = Math.round(255 * (0.4 + (0.5 - height[i]!) * 0.6));
      rough.img.data[o] = rough.img.data[o + 1] = rough.img.data[o + 2] = rv;
      rough.img.data[o + 3] = 255;
      const hl = height[y * size + ((x - 1 + size) % size)]!;
      const hr = height[y * size + ((x + 1) % size)]!;
      const hu = height[((y - 1 + size) % size) * size + x]!;
      const hd = height[((y + 1) % size) * size + x]!;
      let nx = (hl - hr) * 1.6;
      let ny = (hu - hd) * 1.6;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      normal.img.data[o] = (nx * 0.5 + 0.5) * 255;
      normal.img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      normal.img.data[o + 2] = (0.5 / len + 0.5) * 255;
      normal.img.data[o + 3] = 255;
    }
  }
  const out = [albedo, rough, normal].map(({ c, ctx, img }, n) => {
    ctx.putImageData(img, 0, 0);
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.generateMipmaps = true;
    tx.minFilter = THREE.LinearMipmapLinearFilter;
    tx.magFilter = THREE.LinearFilter;
    tx.anisotropy = ANISOTROPY; // clamped to the GPU maximum by three
    if (n === 0) tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  });
  return { map: out[0]!, roughnessMap: out[1]!, normalMap: out[2]! };
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
    t.anisotropy = ANISOTROPY;
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
  t.anisotropy = ANISOTROPY;
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
    t.anisotropy = ANISOTROPY;
    return t;
  };
  return { map: tex(albedo, true), thickness: tex(thick, false), roughnessMap: tex(rough, false) };
}

export interface PaperMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/** Clean cream paper: a barely-there mottle and a faint fibre tooth for the bump. */
export function makePaper(size = 512, seed = 47): PaperMaps {
  const rng = mulberry32(seed);
  const cloud = noise2D(rng, 4, 4);
  const fibre = noise2D(rng, 96, 96);
  const grain = noise2D(rng, 160, 160);
  const color = canvas(size, size);
  const bump = canvas(size, size);
  const cctx = color.getContext('2d')!;
  const bctx = bump.getContext('2d')!;
  const cimg = cctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const m = cloud(u * 4, v * 4) - 0.5;
      
      const f = fibre(u * 96, v * 96) * 0.6 + grain(u * 160, v * 160) * 0.4;
      // Laid lines (close, faint ribs across the sheet) and the odd darker cotton fibre.
      const laid = Math.sin(v * Math.PI * 2 * 48) * 0.5 + 0.5;
      const chain = Math.pow(Math.max(0, Math.cos(u * Math.PI * 2 * 4)), 24);
      const fleck = fibre(u * 96 + 31, v * 24) > 0.86 ? -0.012 : 0;
      const t = 1 + m * 0.02 + (f - 0.5) * 0.012 + (laid - 0.5) * 0.006 + fleck;
      const i = (y * size + x) * 4;
      cimg.data[i] = Math.min(255, 238 * t);
      cimg.data[i + 1] = Math.min(255, 230 * t);
      cimg.data[i + 2] = Math.min(255, 213 * t);
      cimg.data[i + 3] = 255;
      const h = Math.round(255 * (0.5 + (f - 0.5) * 0.25 + (laid - 0.5) * 0.08 + chain * 0.05));
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = h;
      bimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = ANISOTROPY;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(color, true), bumpMap: tex(bump, false) };
}

/** A soft rounded-rectangle shadow, for a card lying on the desk (alpha only). */
export function makeCardShadow(size = 256): THREE.CanvasTexture {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  // Draw the rectangle far off-canvas and let only its blurred shadow land in view.
  const off = size * 4;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetX = off;
  ctx.fillStyle = '#000';
  const m = size * 0.24;
  ctx.fillRect(m - off, m, size - 2 * m, size - 2 * m);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** A soft-edged rounded impression (alpha only): a label pressed into the page. */
export function makeImpression(size = 128): THREE.CanvasTexture {
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const m = size * 0.2;
  ctx.filter = `blur(${size * 0.07}px)`;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(m, m, size - 2 * m, size - 2 * m, size * 0.18);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

/** A capsule, white on transparent: the end-rounded rule under a focused label. */
export function makeCapsule(w = 256, h = 16): THREE.CanvasTexture {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, (h - 2) / 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = ANISOTROPY;
  return t;
}

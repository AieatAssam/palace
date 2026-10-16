import { useFrame, useThree } from '@react-three/fiber';
import { type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAX_FRET, type Position, STRING_COUNT, samePosition } from '../game/notes';
import { isUnlocked } from '../game/unlocks';
import { usePalace } from '../store';
import {
  BOARD_END,
  BOARD_TAPER,
  BOARD_THICKNESS,
  EDGE_MARGIN,
  HEADSTOCK_LEN,
  HEADSTOCK_TILT,
  INLAY_FRETS,
  NUT_WIDTH,
  NUT_X0,
  OPEN_HALO,
  RENDERED_FRETS,
  STRING_RADII,
  WOUND,
  fretX,
  headstockPoint,
  markerPoint,
  neckWidth,
  postPoint,
  resolveTap,
  stringHeight,
  stringPoint,
  stringSpacing,
  tapRect,
  wrapPoint,
} from './layout';
import { COLORS } from './palette';
import { LITE } from './quality';
import { makePearl, makeRosewood, makeWindingNormal } from './textures';

const STRING_END = 30; // strings run off-frame towards the bridge

/* ------------------------------------------------------------------ */
/* Materials                                                          */
/* ------------------------------------------------------------------ */

/** Physical material, or a cheaper standard one (physical-only extras dropped) in lite mode. */
function physical(params: THREE.MeshPhysicalMaterialParameters): THREE.MeshStandardMaterial {
  if (!LITE) return new THREE.MeshPhysicalMaterial(params);
  const {
    clearcoat: _c,
    clearcoatRoughness: _cr,
    iridescence: _i,
    iridescenceIOR: _ii,
    iridescenceThicknessRange: _it,
    iridescenceThicknessMap: _itm,
    sheen: _s,
    sheenColor: _sc,
    sheenRoughness: _sr,
    ...rest
  } = params;
  return new THREE.MeshStandardMaterial(rest);
}

/**
 * Locked region, shared by every neck material: past the last unlocked fret,
 * and (while some strings are locked) across the higher strings. Locked parts
 * are dimmed and desaturated in the shader rather than veiled.
 */
export interface LockUniforms {
  /** Inverse of the neck group's world matrix (world → neck-local). */
  uNeckInv: { value: THREE.Matrix4 };
  uLockX: { value: number };
  /** Locked-strings edge as z = a + b·x (higher strings sit at -Z). */
  uLockEdge: { value: THREE.Vector2 };
  uLockStrings: { value: number };
}

function makeLockUniforms(): LockUniforms {
  return {
    uNeckInv: { value: new THREE.Matrix4() },
    uLockX: { value: 1e3 },
    uLockEdge: { value: new THREE.Vector2() },
    uLockStrings: { value: 0 },
  };
}

function injectLock(shader: THREE.WebGLProgramParametersWithUniforms, lock: LockUniforms) {
  Object.assign(shader.uniforms, lock);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform mat4 uNeckInv;\nvarying vec3 vNeck;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvNeck = (uNeckInv * modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform float uLockX; uniform vec2 uLockEdge; uniform float uLockStrings; varying vec3 vNeck;',
    )
    .replace(
      '#include <opaque_fragment>',
      `{
  float beyond = smoothstep(uLockX - 0.06, uLockX + 0.3, vNeck.x);
  float edge = uLockEdge.x + uLockEdge.y * max(vNeck.x, 0.0);
  float across = uLockStrings * (1.0 - smoothstep(edge - 0.12, edge + 0.04, vNeck.z));
  float locked = max(beyond, across);
  float luma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  // Darken and soften the colour, but keep it warm: locked wood stays wood, not grey.
  outgoingLight = mix(outgoingLight, vec3(luma) * vec3(1.12, 0.94, 0.8), 0.4 * locked) * (1.0 - 0.45 * locked);
}
#include <opaque_fragment>`,
    );
}

function withLock<M extends THREE.Material>(mat: M, lock: LockUniforms): M {
  mat.onBeforeCompile = (shader) => injectLock(shader, lock);
  return mat;
}

/**
 * Nacre's play of colour: pastel hues that drift across the shell's soft
 * clouds and shift with viewing angle. Physical iridescence only tints the
 * specular reflection, which a dim room barely shows; this carries the
 * colour in the body of the pearl too (and survives the lite path).
 */
function withNacre(mat: THREE.MeshStandardMaterial, clouds: THREE.Texture, lock: LockUniforms) {
  mat.onBeforeCompile = (shader) => {
    injectLock(shader, lock);
    shader.uniforms.uNacre = { value: clouds };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNacre;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float cloud = texture2D(uNacre, vMapUv).g;
  float ph = cloud * 0.75 + (1.0 - ndv) * 1.1;
  vec3 hue = 0.5 + 0.5 * cos(6.2831853 * (ph + vec3(0.0, 0.33, 0.67)));
  diffuseColor.rgb *= mix(vec3(1.0), 0.62 + 0.55 * hue, 0.5);
  totalEmissiveRadiance += diffuseColor.rgb * hue * 0.1 * (0.4 + cloud);
}`,
      );
  };
  return mat;
}

/**
 * The question cue on one string: a warm emissive lift over a stretch of the
 * string in neck-local x. Driven by the question's highlight, read by the
 * string's shader (both over the board and behind the nut).
 */
export interface StringCue {
  /** (x0, x1, amount) in neck-local units. */
  uCue: { value: THREE.Vector3 };
  uCueColor: { value: THREE.Color };
  uCueT: { value: number };
}

function makeCue(): StringCue {
  return { uCue: { value: new THREE.Vector3(0, 0, 0) }, uCueColor: { value: new THREE.Color() }, uCueT: { value: 0 } };
}

/** Adds the lock dimming and the cue lift to a string material's shader. */
function injectCue(shader: THREE.WebGLProgramParametersWithUniforms, cue: StringCue, lock: LockUniforms) {
  injectLock(shader, lock);
  Object.assign(shader.uniforms, cue);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uCue; uniform vec3 uCueColor; uniform float uCueT;')
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
{
  float cueIn = smoothstep(uCue.x - 0.04, uCue.x + 0.06, vNeck.x) * (1.0 - smoothstep(uCue.y - 0.06, uCue.y + 0.04, vNeck.x));
  // A slow band of warm light travels along the segment, over a steady base sheen.
  float travel = 0.5 + 0.5 * sin(vNeck.x * 9.0 - uCueT * 2.2);
  float sheen = 0.55 + 0.45 * travel * travel;
  totalEmissiveRadiance += uCueColor * (uCue.z * cueIn * sheen);
}`,
    );
}

const WIRE = {
  wound: { color: COLORS.bronze, roughness: 0.34 },
  plain: { color: COLORS.steel, roughness: 0.18 },
} as const;

function useMaterials() {
  return useMemo(() => {
    const lock = makeLockUniforms();
    const wood = LITE ? makeRosewood(512, 128) : makeRosewood();
    wood.map.repeat.set(2.5, 1);
    wood.roughnessMap.repeat.set(2.5, 1);
    wood.normalMap.repeat.set(2.5, 1);

    // Lacquered board: a real clearcoat over quiet, dark wood, so the room shows
    // once as a soft sheen rather than as texture.
    const board = physical({
      map: wood.map,
      roughnessMap: wood.roughnessMap,
      normalMap: wood.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1,
      clearcoat: 0.62,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.85,
    });
    // The neck back: satin lacquer, so its curve shades from lit to dark
    // rather than mirroring the room as a pale band at grazing angles.
    const neck = physical({
      color: COLORS.mahogany,
      normalMap: wood.normalMap,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.55,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.4,
    });
    const headstock = board.clone();
    headstock.color = new THREE.Color('#8a7a70');
    // Tilted back towards the window, a glossy face catches the key as a grey sheet:
    // a satin veneer with little environment keeps it reading as wood.
    headstock.roughnessMap = null;
    headstock.roughness = 0.78;
    headstock.envMapIntensity = 0.35;
    if (headstock instanceof THREE.MeshPhysicalMaterial) headstock.clearcoat = 0.12;
    // Tuner posts: brushed brass, undimmed. Frets: polished nickel-silver, sharing the lock.
    const post = new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 1, roughness: 0.34 });
    // Nickel, a shade down and slightly satin: from the low hero angle a bright
    // mirror crown flares every fret into a white bar.
    const nickel = withLock(
      new THREE.MeshStandardMaterial({ color: '#8a867d', metalness: 1, roughness: 0.42, envMapIntensity: LITE ? 0.16 : 0.26 }),
      lock,
    );
    const nut = physical({
      color: COLORS.bone,
      roughness: 0.36,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
      sheen: 0.3,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#fff4de'),
    });
    const shell = LITE ? makePearl(128) : makePearl();
    const pearl = physical({
      color: '#e8e2d6',
      map: shell.map,
      roughness: 1,
      roughnessMap: shell.roughnessMap,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
      iridescence: 1,
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [180, 980],
      iridescenceThicknessMap: shell.thickness,
      sheen: 0.55,
      sheenRoughness: 0.22,
      sheenColor: new THREE.Color('#c8e0ff'),
      envMapIntensity: LITE ? 1.1 : 2.1,
      metalness: 0.08,
    });
    // The seat the pearl is set into: a hairline of dark glue and shadow.
    const inlaySeat = withLock(new THREE.MeshStandardMaterial({ color: '#140b08', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), lock);
    pearl.polygonOffset = true;
    pearl.polygonOffsetFactor = -4;
    pearl.polygonOffsetUnits = -4;
    for (const mat of [board, neck, nut]) withLock(mat, lock);
    withNacre(pearl, shell.thickness, lock);
    const winding = makeWindingNormal();
    winding.repeat.set(1, 220);
    const cues = Array.from({ length: STRING_COUNT }, makeCue);
    // Behind the nut each string gets its own material, so the open-string cue can light it.
    const behindNut = cues.map((cue, s) => {
      const w = WOUND[s] ? WIRE.wound : WIRE.plain;
      const mat = new THREE.MeshStandardMaterial({ color: w.color, metalness: 1, roughness: w.roughness });
      mat.onBeforeCompile = (shader) => injectCue(shader, cue, lock);
      return mat;
    });
    return { board, neck, headstock, post, nickel, nut, pearl, inlaySeat, winding, cues, behindNut, lock };
  }, []);
}

type Materials = ReturnType<typeof useMaterials>;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function taperedBoardGeometry(): THREE.BufferGeometry {
  const len = BOARD_END - NUT_X0;
  const g = new THREE.BoxGeometry(len, BOARD_THICKNESS, NUT_WIDTH, 48, 1, 1);
  g.translate(NUT_X0 + len / 2, -BOARD_THICKNESS / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, (pos.getZ(i) * neckWidth(x)) / NUT_WIDTH);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Rounded neck back: a half-ellipse sweep that tapers with the board and
 * thickens towards the body, deep enough (about half the board's width) that
 * the low hero camera reads its curve under the board's edge.
 */
function neckBackGeometry(): THREE.BufferGeometry {
  const nx = 40;
  const na = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = NUT_X0 + ((BOARD_END - NUT_X0) * i) / nx;
    const half = neckWidth(x) / 2;
    const depth = 0.66 + 0.1 * (x / BOARD_END);
    for (let j = 0; j <= na; j++) {
      const a = (Math.PI * j) / na;
      positions.push(x, -BOARD_THICKNESS - Math.sin(a) * depth, Math.cos(a) * half);
      uvs.push(i / nx, j / na);
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < na; j++) {
      const a = i * (na + 1) + j;
      const b = a + na + 1;
      // Wound so the faces (and computed normals) point outward, away from the neck's core.
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

function placeBetween(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  obj.position.copy(a).addScaledVector(dir, 0.5);
  obj.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
}

/* ------------------------------------------------------------------ */
/* Static parts                                                       */
/* ------------------------------------------------------------------ */

function Board({ m }: { m: Materials }) {
  const board = useMemo(taperedBoardGeometry, []);
  const back = useMemo(neckBackGeometry, []);
  return (
    <group>
      <mesh geometry={board} material={m.board} />
      <mesh geometry={back} material={m.neck} />
    </group>
  );
}

function Headstock({ m, thick }: { m: Materials; thick: number }) {
  const { rotation, position } = useMemo(() => {
    const centre = new THREE.Vector3(...headstockPoint(NUT_X0 - HEADSTOCK_LEN / 2, -0.11, 0));
    return { rotation: HEADSTOCK_TILT, position: centre };
  }, []);
  const posts = useMemo(
    () => Array.from({ length: STRING_COUNT }, (_, s) => ({ string: s, pos: new THREE.Vector3(...postPoint(s)) })),
    [],
  );
  return (
    <group>
      <mesh position={position} rotation={[0, 0, rotation]} material={m.headstock}>
        <boxGeometry args={[HEADSTOCK_LEN, 0.22, NUT_WIDTH + 0.2]} />
      </mesh>
      {posts.map(({ pos, string }) => (
        <group key={string} position={pos} rotation={[0, 0, HEADSTOCK_TILT]}>
          <mesh material={m.post} position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.055, 0.065, 0.18, 16]} />
          </mesh>
          <mesh material={m.post} position={[0, 0.015, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.03, 20]} />
          </mesh>
        </group>
      ))}
      {/* Strings run straight back from the nut to their posts. */}
      {posts.map(({ string }) => (
        <BehindNutString key={`b${string}`} string={string} m={m} thick={thick} />
      ))}
    </group>
  );
}

function BehindNutString({ string, m, thick }: { string: number; m: Materials; thick: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(...stringPoint(string, NUT_X0 - 1e-6)), [string]);
  const b = useMemo(() => new THREE.Vector3(...wrapPoint(string)), [string]);
  const len = a.distanceTo(b);
  useEffect(() => {
    if (ref.current) placeBetween(ref.current, a, b);
  }, [a, b]);
  const r = visualRadius(string, thick);
  return (
    <mesh ref={ref} material={m.behindNut[string]} userData={{ role: 'string', string }}>
      <cylinderGeometry args={[r, r, len, 8, 1, true]} />
    </mesh>
  );
}

function Nut({ m }: { m: Materials }) {
  const h = stringHeight(0) + 0.02;
  return (
    <mesh position={[NUT_X0 / 2, h / 2, 0]} material={m.nut} userData={{ role: 'fret', fret: 0 }}>
      <boxGeometry args={[Math.abs(NUT_X0), h, NUT_WIDTH]} />
    </mesh>
  );
}

function Frets({ m }: { m: Materials }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.042, 0.042, 1, 14, 1);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  return (
    <group>
      {Array.from({ length: RENDERED_FRETS }, (_, i) => {
        const x = fretX(i + 1);
        return (
          <mesh
            key={i}
            geometry={geo}
            material={m.nickel}
            position={[x, 0, 0]}
            scale={[1, 1, neckWidth(x) - 0.02]}
            userData={{ role: 'fret', fret: i + 1 }}
          />
        );
      })}
    </group>
  );
}

const INLAY_R = 0.13;

const inlayGeo = new THREE.CircleGeometry(INLAY_R, 64).rotateX(-Math.PI / 2);
const seatGeo = new THREE.RingGeometry(INLAY_R - 0.002, INLAY_R + 0.01, 64).rotateX(-Math.PI / 2);

function Inlays({ m }: { m: Materials }) {
  const dots = useMemo(() => {
    const out: [number, number][] = [];
    for (const f of INLAY_FRETS) {
      const x = (fretX(f - 1) + fretX(f)) / 2;
      if (f === 12) {
        const s = stringSpacing(x);
        out.push([x, s * 1.5], [x, -s * 1.5]);
      } else out.push([x, 0]);
    }
    return out;
  }, []);
  // Flush full discs on the board face (y = 0), pulled forward in depth with
  // polygon offset so nothing z-fights; strings sit well above, frets are clear.
  return (
    <group>
      {dots.map(([x, z], i) => (
        <group key={i} position={[x, 0.0006, z]} rotation={[0, i * 2.39, 0]}>
          <mesh geometry={seatGeo} material={m.inlaySeat} renderOrder={1} />
          <mesh geometry={inlayGeo} material={m.pearl} position={[0, 0.0002, 0]} renderOrder={2} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Strings (vibrating)                                                */
/* ------------------------------------------------------------------ */

interface StringUniforms {
  uAmp: { value: number };
  uTime: { value: number };
  uStart: { value: number };
  uFreq: { value: number };
  uLen: { value: number };
}

/** Rendered string radius: true gauge on desktop, thickened on phones so thin strings stay legible. */
function visualRadius(string: number, thick: number) {
  const r = STRING_RADII[string]!;
  return thick > 1 ? Math.max(r * thick, 0.024) : r;
}

function makeStringMaterial(string: number, m: Materials, len: number) {
  const wound = WOUND[string];
  const w = wound ? WIRE.wound : WIRE.plain;
  const mat = new THREE.MeshStandardMaterial({
    color: w.color,
    metalness: 1,
    roughness: w.roughness,
    normalMap: wound ? m.winding : null,
    normalScale: new THREE.Vector2(1, 1),
    emissive: new THREE.Color('#fff1d2'),
    emissiveIntensity: 0,
  });
  const uniforms: StringUniforms = {
    uAmp: { value: 0 },
    uTime: { value: 0 },
    uStart: { value: 0 },
    uFreq: { value: 15 + string * 1.7 },
    uLen: { value: len },
  };
  mat.onBeforeCompile = (shader) => {
    injectCue(shader, m.cues[string]!, m.lock);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uAmp; uniform float uTime; uniform float uStart; uniform float uFreq; uniform float uLen;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float u = position.y / uLen + 0.5;
  float s = clamp((u - uStart) / max(1.0 - uStart, 0.001), 0.0, 1.0);
  float w = sin(6.2831853 * uFreq * uTime) * sin(3.1415926 * s)
          + 0.35 * sin(6.2831853 * uFreq * 2.03 * uTime) * sin(6.2831853 * s);
  transformed.z += uAmp * w;
  transformed.x += uAmp * 0.3 * w;
}`,
      );
  };
  return { mat, uniforms };
}

function GuitarString({ string, m, thick }: { string: number; m: Materials; thick: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(...stringPoint(string, 0)), [string]);
  const b = useMemo(() => new THREE.Vector3(...stringPoint(string, STRING_END)), [string]);
  const len = a.distanceTo(b);
  const { mat, uniforms } = useMemo(() => makeStringMaterial(string, m, len), [string, m, len]);
  const r = visualRadius(string, thick);

  useEffect(() => {
    if (ref.current) placeBetween(ref.current, a, b);
  }, [a, b]);

  // Excitation state lives in refs; driven by store events.
  const excite = useRef({ at: -1e9, amp: 0, decay: 2.2, shimmer: 0 });
  useEffect(
    () =>
      usePalace.subscribe((s, prev) => {
        if (s.lastPluck && s.lastPluck !== prev.lastPluck && s.lastPluck.position.string === string) {
          const f = s.lastPluck.position.fret;
          // An idle shimmer (attract) is a softer, slower sigh than a pluck.
          excite.current = s.lastPluck.quiet
            ? { at: performance.now(), amp: 0.01, decay: 1.4, shimmer: 0.55 }
            : { at: performance.now(), amp: 0.032, decay: 2.0, shimmer: 1 };
          uniforms.uStart.value = f === 0 ? 0 : fretX(f) / STRING_END;
        }
        if (s.lastMiss && s.lastMiss !== prev.lastMiss && s.lastMiss.position.string === string) {
          // A muted, dull thud: tiny and quickly damped.
          excite.current = { at: performance.now(), amp: 0.008, decay: 14, shimmer: 0 };
          const f = s.lastMiss.position.fret;
          uniforms.uStart.value = f === 0 ? 0 : fretX(f) / STRING_END;
        }
      }),
    [string, uniforms],
  );

  useFrame(() => {
    const t = (performance.now() - excite.current.at) / 1000;
    const env = Math.exp(-t * excite.current.decay);
    uniforms.uAmp.value = env > 0.01 ? excite.current.amp * env : 0;
    uniforms.uTime.value = t;
    mat.emissiveIntensity = excite.current.shimmer * 1.6 * Math.exp(-t * 2.6);
  });

  return (
    <mesh ref={ref} material={mat} userData={{ role: 'string', string }}>
      <cylinderGeometry args={[r, r, len, 10, 160, true]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Highlights                                                         */
/* ------------------------------------------------------------------ */

type CueTone = 'ask' | 'correct' | 'miss' | 'spark';

/**
 * In-world cue: warm brass (or feedback) sheen along the string segment via
 * the string shader, plus a short polished bead on the string itself that
 * catches the room. No outline box, no billboard sprite.
 */
const TONE: Record<CueTone, { color: string; emissive: THREE.Color; string: THREE.Color }> = {
  ask: {
    color: COLORS.brass,
    emissive: new THREE.Color('#e0b56a').multiplyScalar(0.9),
    string: new THREE.Color('#ffc98a').multiplyScalar(1.9),
  },
  correct: {
    color: COLORS.correct,
    emissive: new THREE.Color('#4eb894').multiplyScalar(0.85),
    string: new THREE.Color('#6fdcbc').multiplyScalar(0.95),
  },
  miss: {
    color: COLORS.miss,
    emissive: new THREE.Color(COLORS.miss).multiplyScalar(0.8),
    string: new THREE.Color(COLORS.miss).multiplyScalar(1.0),
  },
  spark: {
    color: COLORS.brass,
    emissive: new THREE.Color('#ffe7bd').multiplyScalar(1.1),
    string: new THREE.Color('#ffe7bd').multiplyScalar(1.3),
  },
};

const FRET_INSET = 0.1;

/** Neck-local x range of the string sheen. */
function cueCell(p: Position) {
  if (p.fret === 0) {
    return { x0: -OPEN_HALO.length * 0.5, x1: 0.04 };
  }
  return { x0: fretX(p.fret - 1) + FRET_INSET, x1: fretX(p.fret) - FRET_INSET };
}

function Cue({
  position,
  tone,
  m,
  thick = 1,
  breathe = false,
  fadeFrom,
  question = false,
}: {
  position: Position;
  tone: CueTone;
  m: Materials;
  thick?: number;
  breathe?: boolean;
  fadeFrom?: number;
  question?: boolean;
}) {
  const t = TONE[tone];
  // Faint warm pool of light in the fret slot under the string: soft-edged, additive, low.
  const poolMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: slotPool(),
        color: new THREE.Color(t.color).multiplyScalar(0.9),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [t],
  );
  useEffect(() => () => poolMat.dispose(), [poolMat]);

  const cue = m.cues[position.string]!;
  const cell = cueCell(position);
  useEffect(() => {
    if (!question) return;
    cue.uCue.value.set(cell.x0, cell.x1, 0);
    cue.uCueColor.value.copy(t.string);
    return () => {
      cue.uCue.value.z = 0;
    };
  }, [question, cue, cell.x0, cell.x1, t]);

  useFrame(() => {
    const now = performance.now();
    let k = 1;
    if (breathe) k = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin((now / 1000) * 1.8));
    let o = 1;
    if (fadeFrom !== undefined) o = Math.max(0, 1 - (now - fadeFrom) / 800);
    poolMat.opacity = 0.42 * k * o;
    if (question) {
      cue.uCue.value.z = k * o;
      cue.uCueT.value = now / 1000;
    }
  });

  const [mx, my, mz] = markerPoint(position);
  const open = position.fret === 0;
  const len = Math.max(0.12, cell.x1 - cell.x0);
  const width = stringSpacing((cell.x0 + cell.x1) / 2) * (thick > 1 ? 0.95 : 0.8);
  const cx = (cell.x0 + cell.x1) / 2 - mx;

  return (
    <group position={[mx, my, mz]} userData={{ role: 'highlight', question, string: position.string, fret: position.fret, tone }}>
      {!open && (
        <mesh material={poolMat} position={[cx, 0.002 - my, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <planeGeometry args={[len, width]} />
        </mesh>
      )}
    </group>
  );
}

let poolTex: THREE.CanvasTexture | null = null;
/** Soft rounded-rect falloff, built once: brightest along the string, fading to the fret wires. */
function slotPool() {
  if (poolTex) return poolTex;
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = Math.abs(x / (w - 1) - 0.5) * 2;
      const v = Math.abs(y / (h - 1) - 0.5) * 2;
      const a = Math.pow(Math.max(0, 1 - u * u), 1.5) * Math.pow(Math.max(0, 1 - v * v), 2.2);
      const o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

function Highlights({ m, thick }: { m: Materials; thick: number }) {
  const question = usePalace((s) => s.question);
  const feedback = usePalace((s) => s.feedback);
  const found = usePalace((s) => s.found);
  const lastMiss = usePalace((s) => s.lastMiss);
  const lastPluck = usePalace((s) => s.lastPluck);
  // The neck only asks during play; on the title, primer and session sheet it rests.
  const asking = usePalace((s) => s.screen === 'play');

  const out: React.ReactNode[] = [];
  if (asking && question.kind === 'name') {
    const tone: CueTone = feedback?.kind === 'correct' ? 'correct' : feedback?.kind === 'miss' ? 'miss' : 'ask';
    out.push(
      <Cue
        key={`q-${question.itemId}-${tone}`}
        position={question.position}
        tone={tone}
        m={m}
        thick={thick}
        breathe={tone === 'ask'}
        question
      />,
    );
  } else if (asking) {
    for (const p of found) out.push(<Cue key={`f-s${p.string}f${p.fret}`} position={p} tone="correct" m={m} thick={thick} />);
  }
  if (lastMiss && !(question.kind === 'name' && samePosition(lastMiss.position, question.position))) {
    out.push(<Cue key={`m-${lastMiss.id}`} position={lastMiss.position} tone="miss" m={m} thick={thick} fadeFrom={lastMiss.at} />);
  }
  // A pluck on a cell that's already framed (the answer, a found target) only shimmers its string.
  const framed = !asking ? [] : question.kind === 'name' ? [question.position] : found;
  if (lastPluck && !lastPluck.quiet && !framed.some((p) => samePosition(p, lastPluck.position))) {
    out.push(<Cue key={`p-${lastPluck.id}`} position={lastPluck.position} tone="spark" m={m} thick={thick} fadeFrom={lastPluck.at} />);
  }
  return <group>{out}</group>;
}

/* ------------------------------------------------------------------ */
/* Locked veil + tap targets                                          */
/* ------------------------------------------------------------------ */

/** Feeds the current stage's locked region (and the neck's world transform) to the lock shader. */
function LockRegion({ m, root }: { m: Materials; root: React.RefObject<THREE.Group | null> }) {
  const stageIdx = usePalace((s) => s.saved.stage);
  useEffect(() => {
    const stage = usePalace.getState().stage();
    const maxString = Math.max(...stage.strings);
    const { lock } = m;
    lock.uLockX.value = stage.maxFret >= RENDERED_FRETS ? 1e3 : fretX(stage.maxFret);
    lock.uLockStrings.value = maxString < STRING_COUNT - 1 ? 1 : 0;
    // Midway between the last unlocked string and the next: (2 - maxString) · stringSpacing(x), linear in x.
    const k = (2 - maxString) / (STRING_COUNT - 1);
    lock.uLockEdge.value.set(k * (NUT_WIDTH - 2 * EDGE_MARGIN), (k * BOARD_TAPER) / fretX(12));
  }, [m, stageIdx]);
  useFrame(() => {
    if (root.current) m.lock.uNeckInv.value.copy(root.current.matrixWorld).invert();
  });
  return null;
}

const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

function HitCells() {
  const stageIdx = usePalace((s) => s.saved.stage);
  const tap = usePalace((s) => s.tapPosition);
  const cells = useMemo(() => {
    const stage = usePalace.getState().stage();
    const out: { p: Position; rect: [number, number, number, number] }[] = [];
    for (let s = 0; s < STRING_COUNT; s++)
      for (let f = 0; f <= MAX_FRET; f++) {
        const p = { string: s, fret: f };
        if (isUnlocked(stage, p)) out.push({ p, rect: tapRect(p, stage.strings) });
      }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdx]);
  const local = useMemo(() => new THREE.Vector3(), []);

  const onDown = (p: Position) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const { question, found } = usePalace.getState();
    let target = p;
    if (question.kind === 'find' && e.object.parent) {
      // Forgive near-misses toward an unfound target on the adjacent string.
      e.object.parent.worldToLocal(local.copy(e.point));
      const open = question.targets.filter((t) => !found.some((f) => samePosition(f, t)));
      target = resolveTap(p, local.x, local.z, open);
    }
    tap(target);
  };

  return (
    <group>
      {cells.map(({ p, rect: [x0, x1, z0, z1] }) => (
        <mesh
          key={`s${p.string}f${p.fret}`}
          position={[(x0 + x1) / 2, 0.15, (z0 + z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={hitMaterial}
          onPointerDown={onDown(p)}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <planeGeometry args={[x1 - x0, z1 - z0]} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Fretboard() {
  const m = useMaterials();
  const root = useRef<THREE.Group>(null);
  const portrait = useThree((s) => s.size.height > s.size.width * 1.05);
  const thick = portrait ? 1.7 : 1;
  return (
    <group ref={root}>
      <LockRegion m={m} root={root} />
      <Board m={m} />
      <Headstock m={m} thick={thick} />
      <Nut m={m} />
      <Frets m={m} />
      <Inlays m={m} />
      {Array.from({ length: STRING_COUNT }, (_, s) => (
        <GuitarString key={s} string={s} m={m} thick={thick} />
      ))}
      <Highlights m={m} thick={thick} />
      <HitCells />
    </group>
  );
}

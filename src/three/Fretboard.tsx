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
  INLAY_FRETS,
  NUT_DEPTH,
  NUT_WIDTH,
  RENDERED_FRETS,
  STRING_RADII,
  WOUND,
  fretX,
  markerPoint,
  neckWidth,
  resolveTap,
  stringHeight,
  stringSpacing,
  stringZ,
  tapRect,
} from './layout';
import { COLORS } from './palette';
import { LITE } from './quality';
import { makeGlow, makeRosewood, makeWindingNormal } from './textures';

const STRING_END = 30; // strings run off-frame towards the bridge
const NUT_X0 = -NUT_DEPTH;
const HEADSTOCK_LEN = 4.2;
const HEADSTOCK_TILT = 0.16;

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
    sheen: _s,
    sheenColor: _sc,
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
  outgoingLight = mix(outgoingLight, vec3(luma) * vec3(1.0, 0.96, 0.92), 0.72 * locked) * (1.0 - 0.4 * locked);
}
#include <opaque_fragment>`,
    );
}

function withLock<M extends THREE.Material>(mat: M, lock: LockUniforms): M {
  mat.onBeforeCompile = (shader) => injectLock(shader, lock);
  return mat;
}

function useMaterials() {
  return useMemo(() => {
    const lock = makeLockUniforms();
    const wood = LITE ? makeRosewood(512, 128) : makeRosewood();
    wood.map.repeat.set(2.5, 1);
    wood.roughnessMap.repeat.set(2.5, 1);
    wood.normalMap.repeat.set(2.5, 1);

    const board = physical({
      map: wood.map,
      roughnessMap: wood.roughnessMap,
      normalMap: wood.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
    });
    const neck = physical({
      color: COLORS.oak,
      normalMap: wood.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.42,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
    });
    const headstock = board.clone();
    headstock.color = new THREE.Color('#8a6a5c');
    // Posts and tuners keep their own (undimmed) brass; frets share the lock.
    const post = new THREE.MeshStandardMaterial({ color: '#c4a067', metalness: 1, roughness: 0.24 });
    const brass = withLock(new THREE.MeshStandardMaterial({ color: '#c4a067', metalness: 1, roughness: 0.24 }), lock);
    const woundWire = withLock(new THREE.MeshStandardMaterial({ color: '#c9a676', metalness: 1, roughness: 0.34 }), lock);
    const plainWire = withLock(new THREE.MeshStandardMaterial({ color: '#dcd7ce', metalness: 1, roughness: 0.2 }), lock);
    const nut = physical({
      color: '#EEE7D7',
      roughness: 0.38,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    });
    const pearl = physical({
      color: '#d9d1c2',
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      iridescence: 1,
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [180, 620],
      sheen: 0.6,
      sheenColor: new THREE.Color('#e4eeff'),
    });
    for (const mat of [board, neck, nut, pearl]) withLock(mat, lock);
    const winding = makeWindingNormal();
    winding.repeat.set(1, 220);
    const glow = makeGlow();
    return { board, neck, headstock, post, brass, woundWire, plainWire, nut, pearl, winding, glow, lock };
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

/** Rounded neck back (a half-ellipse sweep that tapers with the board). */
function neckBackGeometry(): THREE.BufferGeometry {
  const nx = 40;
  const na = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = NUT_X0 + ((BOARD_END - NUT_X0) * i) / nx;
    const half = neckWidth(x) / 2;
    const depth = 0.5 + 0.12 * (x / BOARD_END);
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
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Rotate a point about the nut pivot to follow the headstock's back-angle. */
function headstockPoint(x: number, y: number, z: number): THREE.Vector3 {
  const px = NUT_X0;
  const dx = x - px;
  const c = Math.cos(HEADSTOCK_TILT);
  const s = Math.sin(HEADSTOCK_TILT);
  return new THREE.Vector3(px + dx * c - y * s, dx * s + y * c, z);
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

/** Inline tuner posts, one per string, each directly behind its slot in the nut. */
function postX(string: number) {
  return -1.15 - string * 0.46;
}

function Headstock({ m, thick }: { m: Materials; thick: number }) {
  const { rotation, position } = useMemo(() => {
    const centre = headstockPoint(NUT_X0 - HEADSTOCK_LEN / 2, -0.11, 0);
    return { rotation: HEADSTOCK_TILT, position: centre };
  }, []);
  const posts = useMemo(
    () => Array.from({ length: STRING_COUNT }, (_, s) => ({ string: s, pos: headstockPoint(postX(s), 0, stringZ(s, 0)) })),
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
      {posts.map(({ pos, string }) => (
        <BehindNutString key={`b${string}`} string={string} post={pos} m={m} thick={thick} />
      ))}
    </group>
  );
}

function BehindNutString({ string, post, m, thick }: { string: number; post: THREE.Vector3; m: Materials; thick: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(NUT_X0, stringHeight(0) - 0.005, stringZ(string, 0)), [string]);
  const b = useMemo(() => {
    const c = Math.cos(HEADSTOCK_TILT);
    const s = Math.sin(HEADSTOCK_TILT);
    // Wrap point near the top of the post (post-local y ≈ 0.12).
    return post.clone().add(new THREE.Vector3(-0.12 * s, 0.12 * c, 0));
  }, [post]);
  const len = a.distanceTo(b);
  useEffect(() => {
    if (ref.current) placeBetween(ref.current, a, b);
  }, [a, b]);
  const r = visualRadius(string, thick);
  return (
    <mesh ref={ref} material={WOUND[string] ? m.woundWire : m.plainWire}>
      <cylinderGeometry args={[r, r, len, 8, 1, true]} />
    </mesh>
  );
}

function Nut({ m }: { m: Materials }) {
  const h = stringHeight(0) + 0.02;
  return (
    <mesh position={[NUT_X0 / 2, h / 2, 0]} material={m.nut}>
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
        return <mesh key={i} geometry={geo} material={m.brass} position={[x, 0, 0]} scale={[1, 1, neckWidth(x) - 0.02]} />;
      })}
    </group>
  );
}

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
  return (
    <group>
      {dots.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.001, z]} material={m.pearl}>
          <cylinderGeometry args={[0.13, 0.13, 0.004, 32]} />
        </mesh>
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
  const mat = new THREE.MeshStandardMaterial({
    color: wound ? '#c9a676' : '#dcd7ce',
    metalness: 1,
    roughness: wound ? 0.34 : 0.2,
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
    injectLock(shader, m.lock);
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
  const a = useMemo(() => new THREE.Vector3(0, stringHeight(0), stringZ(string, 0)), [string]);
  const b = useMemo(() => new THREE.Vector3(STRING_END, stringHeight(STRING_END), stringZ(string, STRING_END)), [string]);
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
          excite.current = { at: performance.now(), amp: 0.032, decay: 2.0, shimmer: 1 };
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
    <mesh ref={ref} material={mat}>
      <cylinderGeometry args={[r, r, len, 10, 160, true]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Highlights                                                         */
/* ------------------------------------------------------------------ */

type GlowTone = 'ask' | 'correct' | 'miss' | 'spark';

const TONE_COLOR: Record<GlowTone, THREE.Color> = {
  ask: new THREE.Color('#ffe2a8').multiplyScalar(2.2),
  correct: new THREE.Color('#5fd2b0').multiplyScalar(1.6),
  miss: new THREE.Color(COLORS.miss).multiplyScalar(1.3),
  spark: new THREE.Color('#fff4dc').multiplyScalar(2.4),
};

function Glow({
  position,
  tone,
  m,
  breathe = false,
  fadeFrom,
  size = 0.62,
}: {
  position: Position;
  tone: GlowTone;
  m: Materials;
  breathe?: boolean;
  /** performance.now() timestamp: fade out over ~0.8s from here. */
  fadeFrom?: number;
  size?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: m.glow,
        color: TONE_COLOR[tone],
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [m, tone],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const [x, y, z] = markerPoint(position);
  // Fretted: on the board under the string. Open: on top of the nut, smaller, so it stays on the neck.
  const open = position.fret === 0;
  const gy = open ? stringHeight(0) + 0.025 : y * 0.5;
  const gsize = open ? size * 0.8 : size;
  useFrame(() => {
    if (!ref.current) return;
    const t = performance.now() / 1000;
    let o = 1;
    let s = 1;
    if (breathe) {
      const b = 0.5 + 0.5 * Math.sin(t * 3.4);
      o = 0.7 + 0.3 * b;
      s = 0.92 + 0.12 * b;
    }
    if (fadeFrom !== undefined) {
      const k = (performance.now() - fadeFrom) / 800;
      o *= Math.max(0, 1 - k);
      s *= 1 + 0.35 * Math.min(1, k);
    }
    mat.opacity = o;
    ref.current.scale.setScalar(gsize * s);
    ref.current.visible = o > 0.01;
  });
  return (
    <mesh ref={ref} position={[x, gy, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={5}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

function Highlights({ m }: { m: Materials }) {
  const question = usePalace((s) => s.question);
  const feedback = usePalace((s) => s.feedback);
  const found = usePalace((s) => s.found);
  const lastMiss = usePalace((s) => s.lastMiss);
  const lastPluck = usePalace((s) => s.lastPluck);

  const out: React.ReactNode[] = [];
  if (question.kind === 'name') {
    const tone: GlowTone = feedback?.kind === 'correct' ? 'correct' : feedback?.kind === 'miss' ? 'miss' : 'ask';
    out.push(<Glow key={`q-${question.itemId}-${tone}`} position={question.position} tone={tone} m={m} breathe={tone === 'ask'} size={0.7} />);
  } else {
    for (const p of found) out.push(<Glow key={`f-s${p.string}f${p.fret}`} position={p} tone="correct" m={m} />);
  }
  if (lastMiss && !(question.kind === 'name' && samePosition(lastMiss.position, question.position))) {
    out.push(<Glow key={`m-${lastMiss.id}`} position={lastMiss.position} tone="miss" m={m} fadeFrom={lastMiss.at} />);
  }
  if (lastPluck) {
    out.push(<Glow key={`p-${lastPluck.id}`} position={lastPluck.position} tone="spark" m={m} fadeFrom={lastPluck.at} size={0.9} />);
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
      <Highlights m={m} />
      <HitCells />
    </group>
  );
}

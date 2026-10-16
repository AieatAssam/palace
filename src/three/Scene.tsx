import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { Desk, SHADOW_Y } from './Desk';
import { Fretboard } from './Fretboard';
import { COLORS } from './palette';
import { markerPoint, neckMatrix, neckToWorld, regionBounds } from './layout';
import { LITE } from './quality';
import { renderInfo, setInspector, setProjector, useView } from './view';

const FOV = 30;

/**
 * Reading-room HDRI (Poly Haven, CC0) for honest reflections on the lacquer,
 * nickel and pearl. Relative to the app's base, so it resolves under any
 * GitHub Pages sub-path. Full quality only: lite never fetches it.
 *
 * Path-traced stills (three-gpu-pathtracer) for an attract mode are deferred:
 * far too heavy for the realtime play path on phones.
 */
const HDRI = `${import.meta.env.BASE_URL}hdri/reading_room_1k.hdr`;
/** Swings the room's window (≈ az 210° in the file) round to the upper left of the screen. */
const HDRI_ROTATION: [number, number, number] = [0, 2.9, 0];

function isCoarsePointer() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

export interface Quality {
  /** 0 = no post, 1 = specular-only bloom + vignette, 2 = adds ambient occlusion. */
  tier: 0 | 1 | 2;
  dpr: number;
}

function initialQuality(): Quality {
  if (LITE) return { tier: 0, dpr: 1 };
  const mobile = isCoarsePointer() || (typeof innerWidth !== 'undefined' && innerWidth < 700);
  const deviceDpr = typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio;
  const dpr = Math.min(deviceDpr, mobile ? 1.75 : 2);
  // Low-DPR or touch devices: skip ambient occlusion, keep the light bloom.
  const tier: Quality['tier'] = mobile || deviceDpr < 1 ? 1 : 2;
  return { tier, dpr };
}

/** Orientation of the neck on screen. */
function useLayout() {
  const size = useThree((s) => s.size);
  const portrait = size.height > size.width * 1.05;
  return { portrait, size };
}

/**
 * Positions the neck (portrait: nut at top; landscape: nut at left, mirrored
 * for left-handed players) and dollies the camera to frame the unlocked region
 * inside the space left free by the HUD.
 */
function NeckRig({ children }: { children: React.ReactNode }) {
  const { portrait, size } = useLayout();
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const stageIdx = usePalace((s) => s.saved.stage);
  const insets = useView((s) => s.insets);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);

  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);

  const target = useMemo(() => {
    const stage = usePalace.getState().stage();
    const b = regionBounds(stage.maxFret);
    const corners = [
      neckToWorld(b.x0, b.z0, view),
      neckToWorld(b.x1, b.z0, view),
      neckToWorld(b.x0, b.z1, view),
      neckToWorld(b.x1, b.z1, view),
    ];
    const xs = corners.map((c) => c[0]);
    const zs = corners.map((c) => c[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const W = maxX - minX;
    const H = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const tilt = THREE.MathUtils.degToRad(portrait ? 16 : 24);
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = size.width / Math.max(1, size.height);
    const avail = Math.max(0.3, (size.height - insets.top - insets.bottom) / Math.max(1, size.height));
    const dV = (H * Math.cos(tilt)) / (2 * t * avail * 0.94);
    const dH = W / (2 * t * aspect * (portrait ? 0.96 : 0.9));
    const D = Math.max(dV, dH) * 1.02;
    // Shift so the region centres inside the free band between the HUD panels.
    const yc = (insets.bottom - insets.top) / 2 / Math.max(1, size.height / 2);
    const look = new THREE.Vector3(cx, 0, cz + (yc * D * t) / Math.cos(tilt));
    const pos = look.clone().add(new THREE.Vector3(0, D * Math.cos(tilt), D * Math.sin(tilt)));
    return { look, pos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, portrait, size.width, size.height, insets.top, insets.bottom, stageIdx]);

  const lookNow = useRef(target.look.clone());
  const first = useRef(true);
  /** Attract idle drift: 1 on the title, eases to 0 when play starts (camera settles, no whip-pan). */
  const idle = useRef(0);
  const drift = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    renderInfo.frames++;
    const wantIdle = usePalace.getState().screen === 'attract' && !isCalm() ? 1 : 0;
    idle.current += (wantIdle - idle.current) * (1 - Math.exp(-dt * 1.4));
    if (idle.current < 1e-3 && !wantIdle) idle.current = 0;
    // A slow figure-of-eight over the desk, a few percent of the viewing distance.
    const reach = target.pos.distanceTo(target.look) * 0.035 * idle.current;
    const t = state.clock.elapsedTime;
    drift.set(Math.sin(t * 0.16) * reach, 0, Math.sin(t * 0.11) * Math.cos(t * 0.16) * reach * 0.6);
    goal.copy(target.pos).add(drift);
    if (first.current) {
      camera.position.copy(goal);
      lookNow.current.copy(target.look);
      first.current = false;
    } else {
      const k = 1 - Math.exp(-dt * 3.2); // ~1.2 s dolly
      camera.position.lerp(goal, k);
      lookNow.current.lerp(target.look, k);
    }
    camera.up.set(0, 0, -1);
    camera.lookAt(lookNow.current);
  });

  // Register a projector (and scene stats) for the e2e test hooks.
  useEffect(() => {
    let meshes = 0;
    let triangles = 0;
    group.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    });
    renderInfo.meshes = meshes;
    renderInfo.triangles = Math.round(triangles);
    const v = new THREE.Vector3();
    setProjector((p) => {
      const g = group.current;
      if (!g) return null;
      g.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      v.set(...markerPoint(p)).applyMatrix4(g.matrixWorld).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    });
    setInspector(() => {
      const g = group.current;
      if (!g) return null;
      g.updateWorldMatrix(true, true);
      camera.updateMatrixWorld();
      const rect = gl.domElement.getBoundingClientRect();
      const toPage = (w: THREE.Vector3) => {
        const n = w.clone().project(camera);
        return new THREE.Vector2(rect.left + ((n.x + 1) / 2) * rect.width, rect.top + ((1 - n.y) / 2) * rect.height);
      };
      let glow: THREE.Object3D | undefined;
      const strings: THREE.Mesh[] = [];
      const frets: { fret: number; x: number }[] = [];
      g.traverse((o) => {
        const d = o.userData as { role?: string; fret?: number };
        if (d.role === 'highlight' && o.userData.question) glow = o;
        else if (d.role === 'string') strings.push(o as THREE.Mesh);
        else if (d.role === 'fret') frets.push({ fret: d.fret!, x: g.worldToLocal(o.getWorldPosition(new THREE.Vector3())).x });
      });
      if (!glow) return null;
      const centre = glow.getWorldPosition(new THREE.Vector3());
      const at = toPage(centre);
      // Nearest string on screen: distance to each rendered string segment.
      let renderedString = -1;
      let best = Infinity;
      for (const mesh of strings) {
        const h = (mesh.geometry as THREE.CylinderGeometry).parameters.height;
        const a = toPage(new THREE.Vector3(0, -h / 2, 0).applyMatrix4(mesh.matrixWorld));
        const b = toPage(new THREE.Vector3(0, h / 2, 0).applyMatrix4(mesh.matrixWorld));
        const ab = b.clone().sub(a);
        const t = THREE.MathUtils.clamp(at.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
        const dist = a.addScaledVector(ab, t).distanceTo(at);
        if (dist < best) {
          best = dist;
          renderedString = mesh.userData.string as number;
        }
      }
      // Fret space: count the nut/fret wires between the headstock and the highlight
      // (an open-string highlight sits on the nut itself, so the nut doesn't count).
      const lx = g.worldToLocal(centre.clone()).x;
      const renderedFret = frets.filter((f) => f.x < lx - 0.01).reduce((m, f) => Math.max(m, f.fret + 1), 0);
      const d = glow.userData as { string: number; fret: number; tone: string };
      return { string: d.string, fret: d.fret, tone: d.tone, screen: { x: at.x, y: at.y }, renderedString, renderedFret };
    });
    return () => {
      setProjector(null);
      setInspector(null);
    };
  }, [camera, gl]);

  // Orientation and mirroring come from the same mapping the framing uses.
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.matrix.set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>));
    g.matrixWorldNeedsUpdate = true;
  }, [view]);

  return (
    <group ref={group} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

/**
 * Study light. Full: the reading-room HDRI for reflections, a soft window key
 * from the upper left and a weak cool fill opposite. Lite: the same key and
 * fill over a cheap Lightformer room (no file load).
 */
function Studio() {
  return (
    <>
      <hemisphereLight args={['#f6ead8', '#2a2018', LITE ? 0.45 : 0.18]} />
      {/* World −X is screen left, −Z screen top. */}
      <directionalLight position={[-5, 9, -4]} intensity={LITE ? 1.5 : 1.7} color="#fff0dc" />
      <directionalLight position={[6, 3, 5]} intensity={0.22} color="#dfe6ee" />
      {LITE ? (
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={2} color="#fff0dc" position={[-4, 6, -3]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#e8eef2" position={[6, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 2, 1]} />
          <mesh scale={30}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="#3a2e24" side={THREE.BackSide} />
          </mesh>
        </Environment>
      ) : (
        <Suspense fallback={null}>
          <Environment files={HDRI} environmentIntensity={0.75} environmentRotation={HDRI_ROTATION} />
        </Suspense>
      )}
    </>
  );
}

function Effects({ tier }: { tier: Quality['tier'] }) {
  if (tier === 0) return null;
  // Bloom threshold sits above everything but the brightest specular ticks on
  // nickel and brass: it never blooms the cue, the pearl or the wood.
  const bloom = <Bloom mipmapBlur intensity={0.35} luminanceThreshold={0.96} luminanceSmoothing={0.08} resolutionScale={0.5} />;
  const vignette = <Vignette offset={0.32} darkness={0.42} />;
  if (tier === 1) {
    return (
      <EffectComposer multisampling={0}>
        {bloom}
        {vignette}
      </EffectComposer>
    );
  }
  // Desktop: soft contact occlusion under strings, frets and the neck. No depth of field — the neck stays sharp.
  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes quality="performance" aoRadius={0.5} distanceFalloff={0.6} intensity={1.6} color="#120c08" />
      {bloom}
      {vignette}
    </EffectComposer>
  );
}

export function Scene() {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const maxDpr = quality.dpr;

  return (
    <Canvas
      className="scene"
      data-testid="scene"
      dpr={LITE ? 1 : [1, maxDpr]}
      camera={{ fov: FOV, near: 0.5, far: 120, position: [0, 20, 6] }}
      gl={{ antialias: !LITE && quality.tier < 2, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // Low enough that the rosewood stays dark and rich; metals still find their highlights.
        gl.toneMappingExposure = LITE ? 0.95 : 0.88;
      }}
    >
      <color attach="background" args={[COLORS.study]} />
      {!LITE && (
        <PerformanceMonitor
          onDecline={() =>
            setQuality((q) => ({
              tier: q.tier > 0 ? ((q.tier - 1) as Quality['tier']) : 0,
              dpr: Math.max(1, q.dpr - 0.25),
            }))
          }
        />
      )}
      <Studio />
      <NeckRig>
        <Desk />
        <Fretboard />
      </NeckRig>
      {/* A single soft contact shadow on the desk (no realtime shadow maps). */}
      <ContactShadowsForNeck key={String(leftHanded)} />
      <Effects tier={quality.tier} />
    </Canvas>
  );
}

function ContactShadowsForNeck() {
  const { portrait } = useLayout();
  return (
    <ContactShadows
      key={String(portrait)}
      position={[0, SHADOW_Y, 0]}
      scale={60}
      resolution={LITE ? 128 : 512}
      blur={2.4}
      far={1.4}
      opacity={0.55}
      color="#0d0806"
      frames={1}
    />
  );
}

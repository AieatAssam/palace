import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { usePalace } from '../store';
import { Fretboard } from './Fretboard';
import { COLORS } from './palette';
import { markerPoint, regionBounds } from './layout';
import { renderInfo, setProjector, useView } from './view';

const FOV = 30;

function isCoarsePointer() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

export interface Quality {
  /** 0 = no post, 1 = light bloom + vignette, 2 = full (bloom, vignette, depth of field). */
  tier: 0 | 1 | 2;
  dpr: number;
}

function initialQuality(): Quality {
  const mobile = isCoarsePointer() || (typeof innerWidth !== 'undefined' && innerWidth < 700);
  const deviceDpr = typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio;
  const dpr = Math.min(deviceDpr, mobile ? 1.75 : 2);
  // Low-DPR or touch devices: skip depth of field, keep a light bloom.
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
  const setFocus = useView((s) => s.setFocusDistance);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);

  const target = useMemo(() => {
    const stage = usePalace.getState().stage();
    const b = regionBounds(stage.maxFret);
    // Local → world mapping: portrait rotates the neck so +X points down-screen.
    const corners = [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ].map(([x, z]) => {
      let wx = portrait ? -z! : x!;
      const wz = portrait ? x! : z!;
      if (leftHanded) wx = -wx;
      return [wx, wz] as const;
    });
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
    return { look, pos, D };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait, size.width, size.height, insets.top, insets.bottom, leftHanded, stageIdx]);

  const lookNow = useRef(target.look.clone());
  const first = useRef(true);

  useEffect(() => setFocus(target.D), [target, setFocus]);

  useFrame((_, dt) => {
    renderInfo.frames++;
    if (first.current) {
      camera.position.copy(target.pos);
      lookNow.current.copy(target.look);
      first.current = false;
    } else {
      const k = 1 - Math.exp(-dt * 3.2); // ~1.2 s dolly
      camera.position.lerp(target.pos, k);
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
    return () => setProjector(null);
  }, [camera, gl]);

  return (
    <group scale={[leftHanded ? -1 : 1, 1, 1]}>
      <group ref={group} rotation={[0, portrait ? -Math.PI / 2 : 0, 0]}>
        {children}
      </group>
    </group>
  );
}

function Studio() {
  return (
    <>
      <hemisphereLight args={['#fff8ee', '#c9b9a4', 0.5]} />
      <directionalLight position={[-4, 9, 5]} intensity={1.4} color="#fff3e0" />
      <directionalLight position={[6, 4, -6]} intensity={0.45} color="#e8eef2" />
      <Environment resolution={256} frames={1}>
        {/* High window key, soft fill and a warm rim — gives metal and pearl something to reflect. */}
        <Lightformer form="rect" intensity={2.2} color="#fff4e2" position={[0, 6, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#e8eef2" position={[-6, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#f3d9b0" position={[6, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 2, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[2, 4, 6]} scale={2} />
        <mesh scale={30}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#d9cfc0" side={THREE.BackSide} />
        </mesh>
      </Environment>
    </>
  );
}

function Effects({ tier }: { tier: Quality['tier'] }) {
  const focus = useView((s) => s.focusDistance);
  if (tier === 0) return null;
  if (tier === 1) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.45} luminanceThreshold={0.92} luminanceSmoothing={0.2} resolutionScale={0.5} />
        <Vignette offset={0.32} darkness={0.32} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={4}>
      <DepthOfField worldFocusDistance={focus} worldFocusRange={focus * 0.9} bokehScale={1.6} />
      <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
      <Vignette offset={0.3} darkness={0.35} />
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
      dpr={[1, maxDpr]}
      camera={{ fov: FOV, near: 0.5, far: 120, position: [0, 20, 6] }}
      gl={{ antialias: quality.tier < 2, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.95;
      }}
    >
      <color attach="background" args={[COLORS.plaster]} />
      <fog attach="fog" args={[COLORS.plaster, 30, 70]} />
      <PerformanceMonitor
        onDecline={() =>
          setQuality((q) => ({
            tier: q.tier > 0 ? ((q.tier - 1) as Quality['tier']) : 0,
            dpr: Math.max(1, q.dpr - 0.25),
          }))
        }
      />
      <Studio />
      <NeckRig>
        <Fretboard />
      </NeckRig>
      {/* A single soft contact shadow on the plaster (no realtime shadow maps). */}
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
      position={[0, -0.94, 0]}
      scale={60}
      resolution={512}
      blur={2.8}
      far={2}
      opacity={0.26}
      color="#3a2a20"
      frames={1}
    />
  );
}

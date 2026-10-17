import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import figuresFont from '../assets/fonts/ledger-figures.ttf?url';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { DESK_Y, MAT } from '../three/Desk';
import { neckMatrix } from '../three/layout';
import { COLORS } from '../three/palette';
import { LITE } from '../three/quality';
import { makeWalnut } from '../three/textures';
import { setRoomAnchor, useRoomFrame } from '../three/view';
import { bellDom, bellRects, echoFx, type StrikeKind } from './fx';
import { BELL_HEIGHT, HANDLE_HEIGHT, PLINTH_H, TABLET_STRIP, bellLayout } from './layout';
import { useEcho } from './store';

/**
 * Echo on the desk: graduated brass hand bells, mouth down on felt, stood along a walnut
 * plinth with an ivory number let into its front edge under each. A bell the room plays
 * lights from within and lifts a little as it rings; the player's stroke does the same,
 * quicker. A wrong stroke flushes clay; the bell that was wanted glows green.
 *
 * Built in world space: the rig turns the desk for a phone, and this group undoes that turn
 * so the bells always stand left to right across the screen, numbers in reading order.
 */

/** A hand bell's outer profile, mouth radius 1 (lathe points: radius, height). */
const BELL_PROFILE: [number, number][] = [
  [0.0, 0.2],
  [0.84, 0.05],
  [0.97, 0.0],
  [1.03, 0.025],
  [1.02, 0.07],
  [0.94, 0.16],
  [0.82, 0.3],
  [0.71, 0.46],
  [0.65, 0.62],
  [0.63, 0.77],
  [0.61, 0.89],
  [0.55, 0.99],
  [0.43, 1.07],
  [0.25, 1.115],
  [0.0, 1.13],
];

/** The turned handle above the crown, mouth radius 1: brass shank, then a rosewood grip and knob. */
const SHANK: [number, number][] = [
  [0.0, 0.0],
  [0.12, 0.0],
  [0.12, 0.06],
  [0.09, 0.09],
  [0.08, 0.16],
  [0.13, 0.19],
  [0.13, 0.23],
  [0.0, 0.23],
];
const GRIP: [number, number][] = [
  [0.0, 0.0],
  [0.1, 0.0],
  [0.13, 0.08],
  [0.15, 0.28],
  [0.12, 0.5],
  [0.09, 0.6],
  [0.16, 0.68],
  [0.17, 0.74],
  [0.13, 0.8],
  [0.0, 0.82],
];

const lathe = (pts: [number, number][], seg: number) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Light colours: warm gold when a bell sounds, clay for a wrong stroke, green for the wanted bell. */
const GLOW: Record<StrikeKind, THREE.Color> = {
  cue: new THREE.Color('#ff9a36'),
  tap: new THREE.Color('#ffae55'),
  slip: new THREE.Color(COLORS.miss),
  show: new THREE.Color('#5fb79b'),
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function useMaterials(n: number) {
  return useMemo(() => {
    const brass = Array.from({ length: n }, () =>
      LITE
        ? new THREE.MeshStandardMaterial({ color: '#c9a25e', metalness: 0.75, roughness: 0.3, emissive: '#000000' })
        : new THREE.MeshPhysicalMaterial({
            color: '#d4ae6a',
            metalness: 1,
            roughness: 0.2,
            clearcoat: 0.6,
            clearcoatRoughness: 0.12,
            envMapIntensity: 1.25,
            emissive: '#000000',
          }),
    );
    const fitting = LITE
      ? new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.7, roughness: 0.35 })
      : new THREE.MeshPhysicalMaterial({ color: COLORS.brass, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
    const grip = LITE
      ? new THREE.MeshStandardMaterial({ color: '#5a2e1c', roughness: 0.4 })
      : new THREE.MeshPhysicalMaterial({ color: '#5a2e1c', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.8 });
    const felt = new THREE.MeshStandardMaterial({ color: '#5a1f22', roughness: 0.95 });
    const ivory = LITE
      ? new THREE.MeshStandardMaterial({ color: COLORS.bone, roughness: 0.5 })
      : new THREE.MeshPhysicalMaterial({ color: '#efe4c9', roughness: 0.36, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });
    let walnut: THREE.Material;
    if (LITE) walnut = new THREE.MeshStandardMaterial({ color: '#4a3021', roughness: 0.5 });
    else {
      const wood = makeWalnut(512, 41);
      for (const t of [wood.map, wood.roughnessMap, wood.normalMap]) {
        t.repeat.set(2.4, 0.5);
        t.anisotropy = 8;
      }
      walnut = new THREE.MeshPhysicalMaterial({
        map: wood.map,
        roughnessMap: wood.roughnessMap,
        normalMap: wood.normalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughness: 1,
        clearcoat: 0.7,
        clearcoatRoughness: 0.22,
        envMapIntensity: 0.75,
      });
    }
    const glow = Array.from(
      { length: n },
      () => new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    return { brass, fitting, grip, felt, ivory, walnut, glow };
  }, [n]);
}

let sharedGlow: THREE.CanvasTexture | null = null;
const glowTex = () => (sharedGlow ??= glowTexture());

export function Bells() {
  const stage = useEcho((s) => s.stage)();
  const n = stage.bells;
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const portrait = size.height > size.width * 1.05;
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);
  const layout = useMemo(() => bellLayout(n, portrait), [n, portrait]);
  const m = useMaterials(n);
  const seg = LITE ? 28 : 64;
  const geo = useMemo(
    () => ({
      bell: lathe(BELL_PROFILE, seg),
      shank: lathe(SHANK, Math.round(seg / 2)),
      grip: lathe(GRIP, Math.round(seg / 2)),
      ring: new THREE.CylinderGeometry(1.08, 1.12, 0.03, seg),
      disc: new THREE.PlaneGeometry(1, 1),
    }),
    [seg],
  );

  /** Undo the rig's turn (its matrix is orthogonal, so the inverse is the transpose). */
  const unturn = useMemo(() => {
    const mtx = new THREE.Matrix4().set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>));
    return mtx.transpose();
  }, [view]);
  /**
   * Where the plinths stand: on the mat, across the world origin, which is where every
   * desk sheet keeps a strip of the room in shot beside the card (the Fretboard's nut).
   */
  const centre = useMemo(() => new THREE.Vector3(0, DESK_Y + MAT.thickness, 0), []);

  const turn = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = turn.current;
    if (!g) return;
    g.matrix.copy(unturn);
    g.matrixWorldNeedsUpdate = true;
  }, [unturn]);
  const outer = useRef<THREE.Group>(null);
  const bells = useRef<(THREE.Group | null)[]>([]);
  const glows = useRef<(THREE.Mesh | null)[]>([]);

  // Publish what the camera must frame: the plinths and the tallest bell's handle.
  const setFrame = useRoomFrame((s) => s.set);
  useLayoutEffect(() => {
    const pts: THREE.Vector3[] = [];
    const top = PLINTH_H + layout.bells[0]!.r * (BELL_HEIGHT + HANDLE_HEIGHT);
    for (const p of layout.plinths)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          pts.push(new THREE.Vector3(centre.x + p.x + (sx * p.w) / 2, centre.y, centre.z + p.z + (sz * p.d) / 2));
          pts.push(new THREE.Vector3(centre.x + p.x + (sx * p.w) / 2, centre.y + top, centre.z + p.z + (sz * p.d) / 2));
        }
    setFrame({ key: `echo-${n}-${portrait ? 'p' : 'l'}-${leftHanded ? 'm' : 'r'}`, points: pts, elevation: portrait ? 50 : 30 });
  }, [layout, centre, n, portrait, leftHanded, setFrame]);
  useLayoutEffect(() => () => setFrame(null), [setFrame]);

  // Gilt rises from the bell struck last.
  useLayoutEffect(() => {
    setRoomAnchor((out) => {
      const g = bells.current[echoFx.last];
      if (!g) return false;
      g.getWorldPosition(out);
      out.y += layout.bells[echoFx.last]!.r * BELL_HEIGHT;
      return true;
    });
    return () => setRoomAnchor(null);
  }, [layout]);

  const corner = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const now = performance.now();
    const calm = isCalm();
    layout.bells.forEach((b, i) => {
      const g = bells.current[i];
      const s = echoFx.strikes[i]!;
      const t = now - s.at;
      // Light: up in 30 ms, held, then a 260 ms fade.
      const light = t < 0 || !Number.isFinite(t) ? 0 : t < 30 ? t / 30 : t < s.hold ? 1 : Math.exp(-(t - s.hold) / 260);
      const lit = light > 0.004 ? light : 0;
      const mat = m.brass[i]!;
      col.copy(GLOW[s.kind]).multiplyScalar(lit * (s.kind === 'slip' ? 0.45 : s.kind === 'show' ? 0.5 : LITE ? 0.42 : 0.6));
      mat.emissive.copy(col);
      const glow = glows.current[i];
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = lit * (s.kind === 'show' ? 0.8 : 0.65);
      if (glow) (glow.material as THREE.MeshBasicMaterial).color.copy(GLOW[s.kind]);
      if (!g) return;
      // Ring: the bell lifts off its felt and rocks towards the player, then settles.
      const sec = t / 1000;
      const ringing = !calm && Number.isFinite(t) && t >= 0 && sec < 1.6 && s.kind !== 'show';
      const env = ringing ? Math.exp(-sec * 3.2) : 0;
      g.position.y = PLINTH_H + 0.025 + b.r * 0.14 * env * Math.min(1, sec * 14);
      g.rotation.x = ringing ? 0.11 * env * Math.sin(sec * 17) : 0;
      g.rotation.z = ringing ? 0.05 * env * Math.sin(sec * 13 + 1) : 0;
    });

    // Keep each real button over its bell on screen, at least a fingertip wide.
    const o = outer.current;
    if (!o) return;
    o.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const rect = gl.domElement.getBoundingClientRect();
    layout.bells.forEach((b, i) => {
      const el = bellDom.get(i);
      if (!el) return;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      const h = PLINTH_H + b.r * (BELL_HEIGHT + HANDLE_HEIGHT);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          for (const y of [PLINTH_H, h]) {
            corner.set(b.x + sx * b.r * 1.04, y, b.z + sz * b.r * 0.6).applyMatrix4(o.matrixWorld).project(camera);
            const px = rect.left + ((corner.x + 1) / 2) * rect.width;
            const py = rect.top + ((1 - corner.y) / 2) * rect.height;
            x0 = Math.min(x0, px);
            x1 = Math.max(x1, px);
            y0 = Math.min(y0, py);
            y1 = Math.max(y1, py);
          }
      const w = Math.max(48, x1 - x0);
      const hh = Math.max(48, y1 - y0);
      const left = (x0 + x1) / 2 - w / 2;
      const top = (y0 + y1) / 2 - hh / 2;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${hh}px`;
      el.classList.add('placed');
      bellRects.set(i, { x: left, y: top, w, h: hh });
    });
  });

  return (
    <group ref={turn} matrixAutoUpdate={false}>
      <group ref={outer} position={centre}>
        {layout.plinths.map((p, i) => (
          <group key={`p${i}`} position={[p.x, 0, p.z]}>
            <mesh material={m.walnut} position={[0, PLINTH_H / 2, 0]}>
              <boxGeometry args={[p.w, PLINTH_H, p.d]} />
            </mesh>
            {/* A moulded lip round the top and a brass rod along the front edge. */}
            <mesh material={m.walnut} position={[0, PLINTH_H + 0.012, 0]}>
              <boxGeometry args={[p.w - 0.06, 0.024, p.d - 0.06]} />
            </mesh>
            <mesh material={m.fitting} position={[0, PLINTH_H * 0.28, p.d / 2 + 0.012]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.018, 0.018, p.w - 0.04, 12]} />
            </mesh>
          </group>
        ))}
        {layout.bells.map((b, i) => (
          <group key={i} position={[b.x, 0, b.z]}>
            {/* Felt the bell stands on, and the light it spills on the walnut. */}
            <mesh geometry={geo.ring} material={m.felt} position={[0, PLINTH_H + 0.04, 0]} scale={[b.r, 1, b.r]} />
            <mesh
              ref={(el) => {
                glows.current[i] = el;
              }}
              geometry={geo.disc}
              material={m.glow[i]}
              position={[0, PLINTH_H + 0.06, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[b.r * 3.4, b.r * 3.4, 1]}
              renderOrder={3}
            />
            <group
              ref={(el) => {
                bells.current[i] = el;
              }}
              position={[0, PLINTH_H + 0.025, 0]}
            >
              <mesh geometry={geo.bell} material={m.brass[i]} scale={[b.r, b.r * (BELL_HEIGHT / 1.13), b.r]} />
              <group position={[0, b.r * BELL_HEIGHT - 0.01, 0]} scale={b.r}>
                <mesh geometry={geo.shank} material={m.fitting} />
                <mesh geometry={geo.grip} material={m.grip} position={[0, 0.22, 0]} />
              </group>
            </group>
            {/* The bell's number, engraved on an ivory tablet inlaid in the plinth in front of it. */}
            <group position={[0, PLINTH_H + 0.026, layout.plinths[b.row]!.z - b.z + layout.plinths[b.row]!.d / 2 - TABLET_STRIP / 2 - 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
              <mesh material={m.ivory}>
                <boxGeometry args={[0.3, 0.22, 0.012]} />
              </mesh>
              <mesh material={m.fitting} position={[0, 0, -0.002]}>
                <boxGeometry args={[0.33, 0.25, 0.008]} />
              </mesh>
              <Text font={figuresFont} fontSize={0.19} color="#2a2018" anchorX="center" anchorY="middle" position={[0, 0.012, 0.008]}>
                {String(i + 1)}
              </Text>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

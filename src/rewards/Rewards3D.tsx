import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import scriptFont from '../assets/fonts/pinyon-script.ttf?url';
import { isCalm } from '../motion';
import { LITE } from '../three/quality';
import { waxSeal } from '../three/Sheet';
import { focusPoint, rewardAnchorPoint } from '../three/view';
import { SEAL_TIMING, sealNdc, sealRadiusPx } from './placement';
import { useRewards } from './store';

/**
 * The shared rewards, in the room: gold leaf thrown up from the place just answered at
 * each milestone of a run, and a wax seal pressed onto the view when a stage is mastered.
 * Both are skipped (the leaf) or set down without travel (the seal) when motion is reduced.
 */
export function Rewards3D() {
  return (
    <>
      <GiltBurst />
      <WaxStamp />
    </>
  );
}

const MAX_FLAKES = 84;
const LIFE = 1.5;
const GRAVITY = -9;

interface Flake {
  p: THREE.Vector3;
  v: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  size: number;
  born: number;
  life: number;
}

/** Gold leaf: small square flakes that tumble, catch the key light and settle out of sight. */
function GiltBurst() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seen = useRef(0);
  const flakes = useRef<Flake[]>([]);
  const throwScale = useRef(1);
  const camera = useThree((s) => s.camera);
  const material = useMemo(
    () =>
      LITE
        ? new THREE.MeshStandardMaterial({ color: '#e0b860', metalness: 0.55, roughness: 0.3, side: THREE.DoubleSide })
        : new THREE.MeshPhysicalMaterial({ color: '#e0b860', metalness: 1, roughness: 0.22, clearcoat: 0.3, envMapIntensity: 1.4, side: THREE.DoubleSide }),
    [],
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), o: new THREE.Vector3(), toCam: new THREE.Vector3() }), []);

  useFrame((state, dt) => {
    const im = mesh.current;
    if (!im) return;
    const burst = useRewards.getState().burst;
    const t = state.clock.elapsedTime;
    if (burst && burst.id !== seen.current) {
      seen.current = burst.id;
      if (!isCalm() && rewardAnchorPoint(tmp.o)) {
        // Scale the throw to the viewing distance so it reads the same on a phone and a desk.
        const scale = camera.position.distanceTo(tmp.o) / 24;
        throwScale.current = scale;
        tmp.toCam.copy(camera.position).sub(tmp.o).normalize();
        const n = Math.min(MAX_FLAKES, 30 + 12 * Math.min(4, burst.tier));
        const list: Flake[] = [];
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const out = (2.5 + Math.random() * 5.5) * scale;
          const v = new THREE.Vector3(Math.cos(a) * out, (7 + Math.random() * 8) * scale, Math.sin(a) * out).addScaledVector(tmp.toCam, (1 + Math.random() * 3) * scale);
          list.push({
            p: tmp.o.clone(),
            v,
            axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
            spin: (4 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1),
            size: (0.09 + Math.random() * 0.11) * scale,
            born: t - Math.random() * 0.05,
            life: LIFE * (0.7 + Math.random() * 0.45),
          });
        }
        flakes.current = list;
      }
    }
    const list = flakes.current;
    let live = 0;
    const step = Math.min(dt, 1 / 30);
    const g = GRAVITY * throwScale.current;
    for (const f of list) {
      const age = t - f.born;
      if (age > f.life) continue;
      // Leaf is all drag: it shoots up, then drifts down slower than it rose.
      f.v.multiplyScalar(Math.exp(-step * 2.2));
      f.v.y += g * step;
      f.p.addScaledVector(f.v, step);
      const k = age / f.life;
      const shrink = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      tmp.q.setFromAxisAngle(f.axis, f.spin * age);
      tmp.s.setScalar(f.size * Math.max(0, shrink));
      tmp.m.compose(f.p, tmp.q, tmp.s);
      im.setMatrixAt(live++, tmp.m);
    }
    im.count = live;
    im.visible = live > 0;
    if (live) im.instanceMatrix.needsUpdate = true;
    if (!live && list.length) flakes.current = [];
  });

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_FLAKES]} visible={false} frustumCulled={false} renderOrder={5} />;
}

/** The sheet's seal proportions (radius to wax thickness). */
const SEAL_R = 0.34;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A stage mastered: an oxblood seal pressed onto the view, a "P" cypher in its face. It drops
 * from just in front of the lens and spreads a touch as it lands, holds, then fades. It sits
 * a little in front of the room's focus so the depth of field keeps it sharp.
 */
function WaxStamp() {
  const group = useRef<THREE.Group>(null);
  const seen = useRef(0);
  const start = useRef(-1);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const geom = useMemo(() => waxSeal(SEAL_R, 11), []);
  // The cypher's glyph is set only once a seal has been pressed: SDF generation stalls a CPU rasteriser.
  const pressed = useRewards((s) => s.seal !== null);
  const wax = useMemo(
    () =>
      LITE
        ? new THREE.MeshStandardMaterial({ color: '#6a121b', roughness: 0.5, transparent: true })
        : new THREE.MeshPhysicalMaterial({ color: '#6a121b', roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.26, sheen: 0.4, sheenColor: new THREE.Color('#a8323a'), envMapIntensity: 0.7, transparent: true }),
    [],
  );
  const cypher = useRef<THREE.Mesh & { fillOpacity?: number }>(null);
  const v = useMemo(() => ({ dir: new THREE.Vector3(), pos: new THREE.Vector3(), tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.18, 0.3)) }), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const seal = useRewards.getState().seal;
    const t = state.clock.elapsedTime;
    if (seal && seal.id !== seen.current) {
      seen.current = seal.id;
      start.current = t;
    }
    if (start.current < 0) {
      g.visible = false;
      return;
    }
    const calm = isCalm();
    const { drop, settle, hold, fade } = SEAL_TIMING;
    const age = t - start.current;
    const total = drop + settle + hold + fade;
    if (age > total) {
      start.current = -1;
      g.visible = false;
      return;
    }
    // Drop (closer to the lens, so larger), a small spread as the wax takes the press, then a fade.
    let lift = 0;
    let spread = 1;
    if (!calm && age < drop) lift = 1 - ease(age / drop);
    else if (!calm && age < drop + settle) spread = 1 + 0.06 * Math.sin(((age - drop) / settle) * Math.PI);
    const fadeAt = calm ? hold + drop + settle : drop + settle + hold;
    const opacity = age < (calm ? 0.12 : drop * 0.6) ? Math.min(1, age / (calm ? 0.12 : drop * 0.6)) : age > fadeAt ? Math.max(0, 1 - (age - fadeAt) / fade) : 1;

    const ndc = sealNdc(size.width, size.height);
    const dist = Math.max(2, camera.position.distanceTo(focusPoint) * 0.8);
    const d = dist * (1 - 0.35 * lift);
    v.dir.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    // Along the ray, then scaled so its on-screen radius is fixed whatever the camera does.
    v.pos.copy(camera.position).addScaledVector(v.dir, d);
    const worldPerPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, size.height);
    const r = sealRadiusPx(size.width, size.height) * worldPerPx * (1 + 0.5 * lift) * spread;
    g.position.copy(v.pos);
    g.quaternion.copy(camera.quaternion).multiply(v.tilt);
    g.scale.setScalar(r / SEAL_R);
    g.visible = opacity > 0.001;
    wax.opacity = opacity;
    if (cypher.current) cypher.current.fillOpacity = 0.9 * opacity;
  });

  return (
    <group ref={group} visible={false} renderOrder={6}>
      <mesh geometry={geom.outer} material={wax} />
      <mesh geometry={geom.ring} material={wax} position={[0, 0, 0.03]} />
      {pressed && (
        <Text ref={cypher} font={scriptFont} fontSize={SEAL_R * 1.12} color="#3c0a0f" position={[0, -SEAL_R * 0.38, 0.04]} anchorX="center" anchorY="bottom-baseline" sdfGlyphSize={LITE ? 32 : 64} fillOpacity={0.9}>
          P
        </Text>
      )}
    </group>
  );
}

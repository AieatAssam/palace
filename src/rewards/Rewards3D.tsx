import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import scriptFont from '../assets/fonts/pinyon-script.ttf?url';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { CAPTURE, LITE } from '../three/quality';
import { waxSeal } from '../three/Sheet';
import { DESK_Y } from '../three/Desk';
import { rewardAnchorPoint } from '../three/view';
import { SEAL_TIMING, sealCandidates, sealRadiusPx, sealSpot } from './placement';
import { useRewards } from './store';

/**
 * The shared rewards, in the room: gold leaf thrown up from the place just answered at
 * each milestone of a run, and a wax seal pressed down onto the desk when a stage is
 * mastered. Both are skipped (the leaf) or set down without travel (the seal) when motion
 * is reduced.
 */
export function Rewards3D() {
  return (
    <>
      <GiltBurst />
      <WaxStamp />
    </>
  );
}

/** `?capture` (stills on a slow software renderer): the rewards play this many times slower, so a still can catch them. */
const PACE = CAPTURE ? 24 : 1;

/** Flakes per leaf shape; three shapes, so up to three times this in the air. */
const PER_SHAPE = 34;
const SHAPES = 3;
const LIFE = 1.7;
const GRAVITY = -9;

interface Flake {
  shape: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  /** Width, and height as a share of it: torn leaf is rarely square. */
  size: number;
  aspect: number;
  /** Flutter: how fast and how far the leaf rocks as it drifts down, and its phase. */
  rock: number;
  sway: number;
  phase: number;
  born: number;
  life: number;
}

/**
 * A torn scrap of gold leaf: an uneven outline, crumpled into facets at different angles
 * (flat-shaded, so each facet catches the light on its own), barely any thickness.
 */
function leafGeometry(seed: number): THREE.BufferGeometry {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const n = 6 + Math.floor(rnd() * 3);
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
    const r = 0.5 * (0.62 + rnd() * 0.45);
    rim.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, (rnd() - 0.5) * 0.16));
  }
  const centre = new THREE.Vector3((rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08, 0.05);
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = rim[i]!;
    const q = rim[(i + 1) % n]!;
    // A crease halfway out on every wedge, pushed up or down: the crumple.
    const m = p.clone().add(q).multiplyScalar(0.5).lerp(centre, 0.35);
    m.z += (rnd() - 0.5) * 0.14;
    pos.push(centre.x, centre.y, centre.z, p.x, p.y, p.z, m.x, m.y, m.z);
    pos.push(centre.x, centre.y, centre.z, m.x, m.y, m.z, q.x, q.y, q.z);
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, m.x, m.y, m.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Gold leaf: metallic and warm, never brown. Each flake carries its own glint (a bright
 * flash when one of its facets turns to the window) and its own fade, as instance attributes
 * added to the standard shader. On the lite path, with no photographed room to reflect, the
 * leaf keeps a low golden glow of its own so it still reads as metal.
 */
function leafMaterial() {
  const params = {
    color: '#f1c45a',
    metalness: LITE ? 0.6 : 1,
    roughness: LITE ? 0.32 : 0.24,
    emissive: new THREE.Color('#c48a22'),
    emissiveIntensity: LITE ? 0.42 : 0.08,
    side: THREE.DoubleSide,
    flatShading: true,
    transparent: true,
    depthWrite: false,
  };
  const mat = LITE ? new THREE.MeshStandardMaterial(params) : new THREE.MeshPhysicalMaterial({ ...params, envMapIntensity: 1.6, clearcoat: 0.2 });
  const glint = { value: new THREE.Color('#fff4cf') };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlintColor = glint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlint;\nattribute float aFade;\nvarying float vGlint;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlint = aGlint;\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlintColor;\nvarying float vGlint;\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlintColor * vGlint;');
  };
  mat.customProgramCacheKey = () => 'gold-leaf';
  return mat;
}

/** The window's key light, as a direction (see `three/Scene.tsx`); mirrored for left-handers. */
const KEY = new THREE.Vector3(-5, 9, -4).normalize();
const KEY_MIRRORED = new THREE.Vector3(5, 9, -4).normalize();

/** Gold leaf thrown up at a milestone: torn, crumpled flakes that tumble, flash in the light and fade as they drift down. */
function GiltBurst() {
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const seen = useRef(0);
  const flakes = useRef<Flake[]>([]);
  const throwScale = useRef(1);
  const camera = useThree((s) => s.camera);
  const material = useMemo(leafMaterial, []);
  const geometries = useMemo(
    () =>
      Array.from({ length: SHAPES }, (_, i) => {
        const g = leafGeometry(17 + i * 101);
        g.setAttribute('aGlint', new THREE.InstancedBufferAttribute(new Float32Array(PER_SHAPE), 1));
        g.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(PER_SHAPE).fill(1), 1));
        return g;
      }),
    [],
  );
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      rock: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      o: new THREE.Vector3(),
      toCam: new THREE.Vector3(),
      n: new THREE.Vector3(),
      h: new THREE.Vector3(),
      x: new THREE.Vector3(1, 0, 0),
    }),
    [],
  );

  useFrame((state, dt) => {
    const burst = useRewards.getState().burst;
    const t = state.clock.elapsedTime / PACE;
    if (burst && burst.id !== seen.current) {
      seen.current = burst.id;
      if (!isCalm() && rewardAnchorPoint(tmp.o)) {
        // Scale the throw to the viewing distance so it reads the same on a phone and a desk.
        const scale = camera.position.distanceTo(tmp.o) / 24;
        throwScale.current = scale;
        tmp.toCam.copy(camera.position).sub(tmp.o).normalize();
        const n = Math.min(PER_SHAPE * SHAPES, 36 + 14 * Math.min(4, burst.tier));
        const list: Flake[] = [];
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const out = (2.5 + Math.random() * 5.5) * scale;
          const v = new THREE.Vector3(Math.cos(a) * out, (7 + Math.random() * 8) * scale, Math.sin(a) * out).addScaledVector(tmp.toCam, (1 + Math.random() * 3) * scale);
          // Mostly small scraps, a few broad pieces.
          const r = Math.random();
          list.push({
            shape: i % SHAPES,
            p: tmp.o.clone(),
            v,
            axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
            spin: (3 + Math.random() * 7) * (Math.random() < 0.5 ? -1 : 1),
            size: (0.08 + 0.2 * r * r) * scale,
            aspect: 0.55 + Math.random() * 0.45,
            rock: 5 + Math.random() * 5,
            sway: (0.6 + Math.random() * 1.2) * scale,
            phase: Math.random() * Math.PI * 2,
            born: t - Math.random() * 0.06,
            life: LIFE * (0.7 + Math.random() * 0.45),
          });
        }
        flakes.current = list;
      }
    }
    const list = flakes.current;
    const live = [0, 0, 0];
    const step = Math.min(dt / PACE, 1 / 30);
    const g = GRAVITY * throwScale.current;
    const key = usePalace.getState().saved.settings.leftHanded ? KEY_MIRRORED : KEY;
    const flash = LITE ? 2.6 : 1.8;
    for (const f of list) {
      const age = t - f.born;
      if (age > f.life) continue;
      const im = meshes.current[f.shape];
      if (!im) continue;
      // Leaf is all drag: it shoots up, then drifts down slower than it rose, swaying as it goes.
      f.v.multiplyScalar(Math.exp(-step * 2.4));
      f.v.y += g * step;
      f.v.x += Math.sin(age * 4.2 + f.phase) * f.sway * step * 6;
      f.v.z += Math.cos(age * 3.4 + f.phase) * f.sway * step * 4;
      f.p.addScaledVector(f.v, step);
      const k = age / f.life;
      // Tumbling about its own axis, rocking like a falling leaf as the throw dies away.
      tmp.q.setFromAxisAngle(f.axis, f.spin * age);
      tmp.rock.setFromAxisAngle(tmp.x, Math.sin(age * f.rock + f.phase) * 0.7 * Math.min(1, age * 2));
      tmp.q.multiply(tmp.rock);
      const shrink = k < 0.8 ? 1 : 1 - 0.4 * ((k - 0.8) / 0.2);
      tmp.s.set(f.size * shrink, f.size * f.aspect * shrink, f.size * shrink);
      tmp.m.compose(f.p, tmp.q, tmp.s);
      const j = live[f.shape]!++;
      im.setMatrixAt(j, tmp.m);
      // A glint: the leaf's face turned halfway between the window and the eye flashes bright.
      tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
      tmp.toCam.copy(camera.position).sub(f.p).normalize();
      tmp.h.copy(key).add(tmp.toCam).normalize();
      const spec = Math.pow(Math.abs(tmp.n.dot(tmp.h)), 28);
      const twinkle = 0.75 + 0.25 * Math.sin(age * 23 + f.phase * 3);
      const geo = im.geometry;
      (geo.attributes.aGlint as THREE.InstancedBufferAttribute).setX(j, spec * flash * twinkle);
      (geo.attributes.aFade as THREE.InstancedBufferAttribute).setX(j, k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45));
    }
    let any = false;
    meshes.current.forEach((im, i) => {
      if (!im) return;
      im.count = live[i]!;
      im.visible = live[i]! > 0;
      if (!live[i]) return;
      any = true;
      im.instanceMatrix.needsUpdate = true;
      im.geometry.attributes.aGlint!.needsUpdate = true;
      im.geometry.attributes.aFade!.needsUpdate = true;
    });
    if (!any && list.length) flakes.current = [];
  });

  return (
    <>
      {geometries.map((geo, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          args={[geo, material, PER_SHAPE]}
          visible={false}
          frustumCulled={false}
          renderOrder={5}
          userData={{ reward: true }}
        />
      ))}
    </>
  );
}

/** The sheet's seal proportions (radius to wax thickness), and how much thicker the stamp's wax stands. */
const SEAL_R = 0.34;
const DEPTH = 1.8;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** True for the desk (or the blotter or a card lying on it), false for furniture standing on it. */
const onDesk = (y: number) => y < DESK_Y + 0.09;

/**
 * A stage mastered: an oxblood seal with a "P" cypher pressed down onto the desk. The scene
 * looks for a patch of bare desk near the seal's place on screen (clear of the neck, the bells
 * or the blocks), and the stamp comes down there: it drops, squashes as the wax takes the
 * press, spreads a touch and stays a little flatter, holds, then fades. Its face is turned so
 * the cypher reads upright from the chair. Under reduced motion it is simply set down.
 */
function WaxStamp() {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const shade = useRef<THREE.Mesh>(null);
  const seen = useRef(0);
  const start = useRef(-1);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const geom = useMemo(() => waxSeal(SEAL_R, 11), []);
  // The cypher's glyph is set only once a seal has been pressed: SDF generation stalls a CPU rasteriser.
  const pressed = useRewards((s) => s.seal !== null);
  const wax = useMemo(
    () =>
      LITE
        ? new THREE.MeshStandardMaterial({ color: '#7a1620', roughness: 0.42, transparent: true })
        : new THREE.MeshPhysicalMaterial({ color: '#6a121b', roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.24, sheen: 0.4, sheenColor: new THREE.Color('#a8323a'), envMapIntensity: 0.8, transparent: true }),
    [],
  );
  const shadeMat = useMemo(() => new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0, color: '#000000' }), []);
  const cypher = useRef<THREE.Mesh & { fillOpacity?: number }>(null);
  const v = useMemo(
    () => ({
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      at: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
      basis: new THREE.Matrix4(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      radius: 0.3,
    }),
    [],
  );

  /** The first visible surface under a point on screen (NDC), skipping the rewards themselves. */
  const surfaceAt = (x: number, y: number) => {
    v.ray.setFromCamera(v.ndc.set(x, y), camera);
    return v.ray.intersectObjects(scene.children, true).find((h) => {
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible || o.userData.reward) return false;
      return !!(h.object as THREE.Mesh).isMesh;
    });
  };
  /** The seal's radius in world units at a point: the same size on screen whatever the camera does. */
  const radiusAt = (p: THREE.Vector3) => {
    const d = camera.position.distanceTo(p);
    const worldPerPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, size.height);
    return sealRadiusPx(size.width, size.height) * worldPerPx * 1.1;
  };
  /** Bare desk under the whole seal: its centre and eight points round its rim all land on the desk where expected. */
  const clearPatch = (centre: THREE.Vector3, r: number) => {
    const rim = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rim.set(centre.x + Math.cos(a) * r * 1.15, centre.y, centre.z + Math.sin(a) * r * 1.15);
      const ndc = rim.clone().project(camera);
      if (Math.abs(ndc.x) > 0.98 || Math.abs(ndc.y) > 0.98) return false;
      const hit = surfaceAt(ndc.x, ndc.y);
      if (!hit || !onDesk(hit.point.y) || hit.point.distanceTo(rim) > r * 0.3) return false;
    }
    return true;
  };

  /** Find where the stamp comes down: the first candidate with bare desk under the whole seal, else the first surface met. */
  const place = (id: number) => {
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    let chosen: THREE.Intersection | null = null;
    let fallback: THREE.Intersection | null = null;
    for (const c of sealCandidates(size.width, size.height)) {
      const hit = surfaceAt(c.x, c.y);
      if (!hit) continue;
      fallback ??= hit;
      if (onDesk(hit.point.y) && clearPatch(hit.point, radiusAt(hit.point))) {
        chosen = hit;
        break;
      }
    }
    chosen ??= fallback;
    if (chosen) {
      v.at.copy(chosen.point);
      if (onDesk(chosen.point.y) || !chosen.face) v.normal.set(0, 1, 0);
      else v.normal.copy(chosen.face.normal).transformDirection(chosen.object.matrixWorld);
      v.ray.ray.direction.copy(v.at).sub(camera.position).normalize();
    } else {
      // Nothing under any candidate (should not happen over a desk): the desk plane under the first.
      const c = sealCandidates(size.width, size.height)[0]!;
      v.ray.setFromCamera(v.ndc.set(c.x, c.y), camera);
      v.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(DESK_Y + 0.012)), v.at);
      v.normal.set(0, 1, 0);
    }
    if (v.normal.dot(v.ray.ray.direction) > 0) v.normal.negate();
    v.radius = radiusAt(v.at);
    // Face up off the surface, the cypher's top towards the far side of the desk, turned a little off square.
    v.fwd.copy(v.at).sub(camera.position);
    v.y.copy(v.fwd).addScaledVector(v.normal, -v.fwd.dot(v.normal)).normalize();
    v.y.applyAxisAngle(v.normal, (Math.random() - 0.5) * 0.5);
    v.x.crossVectors(v.y, v.normal).normalize();
    v.basis.makeBasis(v.x, v.y, v.normal);
    const page = v.at.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    sealSpot.current = { x: rect.left + ((page.x + 1) / 2) * rect.width, y: rect.top + ((1 - page.y) / 2) * rect.height, r: sealRadiusPx(size.width, size.height), id };
  };

  useFrame((state) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    const seal = useRewards.getState().seal;
    const t = state.clock.elapsedTime / PACE;
    if (seal && seal.id !== seen.current) {
      seen.current = seal.id;
      start.current = t;
      place(seal.id);
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
    // Drop onto the desk, then the press: the wax squashes and spreads, and stays a touch flatter.
    let lift = 0;
    let flat = 0.88;
    let spread = 1.04;
    if (!calm && age < drop) {
      lift = 1 - ease(age / drop);
      flat = 1;
      spread = 1;
    } else if (!calm && age < drop + settle) {
      const u = (age - drop) / settle;
      const bump = Math.sin(u * Math.PI);
      flat = 1 + (0.88 - 1) * ease(u) - 0.22 * bump;
      spread = 1 + 0.04 * ease(u) + 0.08 * bump;
    }
    const fadeAt = calm ? hold + drop + settle : drop + settle + hold;
    const opacity = age < (calm ? 0.12 : drop * 0.5) ? Math.min(1, age / (calm ? 0.12 : drop * 0.5)) : age > fadeAt ? Math.max(0, 1 - (age - fadeAt) / fade) : 1;

    const s = v.radius / SEAL_R;
    g.position.copy(v.at).addScaledVector(v.normal, lift * v.radius * 2.4 + 0.002);
    g.quaternion.setFromRotationMatrix(v.basis);
    g.scale.setScalar(s);
    // The wax's underside (its bevel reaches 0.012 below z = 0) sits on the surface.
    b.position.z = 0.012 * DEPTH * flat;
    b.scale.set(spread, spread, DEPTH * flat);
    g.visible = opacity > 0.001;
    wax.opacity = opacity;
    if (cypher.current) cypher.current.fillOpacity = 0.9 * opacity;
    const sh = shade.current;
    if (sh) {
      // Its shadow gathers under it as it comes down, held back by the lift.
      sh.position.z = -lift * v.radius * 2.4 / s + 0.001;
      sh.scale.setScalar(SEAL_R * 2.5 * (1 + lift * 0.6));
      shadeMat.opacity = 0.5 * opacity * (1 - lift * 0.7);
    }
  });

  return (
    <group ref={group} visible={false} renderOrder={6} userData={{ reward: true }}>
      <mesh ref={shade} material={shadeMat} renderOrder={5}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group ref={body}>
        <mesh geometry={geom.outer} material={wax} />
        <mesh geometry={geom.ring} material={wax} position={[0, 0, 0.03]} />
        {pressed && (
          <Text ref={cypher} font={scriptFont} fontSize={SEAL_R * 1.12} color="#3c0a0f" position={[0, -SEAL_R * 0.38, 0.034]} anchorX="center" anchorY="bottom-baseline" sdfGlyphSize={LITE ? 32 : 64} fillOpacity={0.9}>
            P
          </Text>
        )}
      </group>
    </group>
  );
}

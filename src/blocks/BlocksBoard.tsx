import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { DESK_Y, MAT } from '../three/Desk';
import { neckMatrix } from '../three/layout';
import { COLORS } from '../three/palette';
import { LITE } from '../three/quality';
import { makeLeather, makeRosewood } from '../three/textures';
import { setRoomAnchor, useRoomFrame } from '../three/view';
import { type LightKind, blockDom, blockRects, blocksFx } from './fx';
import { BLOCK_HEIGHT, BLOCK_SIZE, BLOTTER_RIM, type Finish, blockLayout } from './layout';
import { SHIFT_MS, useBlocks } from './store';

/**
 * Blocks on the desk: lacquered cubes of rosewood and ebony, some with brass stringing
 * let into the top, scattered over an oxblood leather blotter with brass corners. A block
 * the board shows lifts a hair and takes a warm brass sheen across its lacquer; the
 * player's tap does the same, quicker. A wrong tap flushes clay; the block that was due
 * glows green. A moving board slides its blocks to their new places before the next line.
 *
 * Built in world space, like Echo's bells: this group undoes the rig's turn for a phone so
 * the board always reads across the screen, blocks numbered in reading order.
 */

const BLOTTER_T = 0.022;

/** Light colours: warm brass when a block lights, clay for a wrong tap, green for the block that was due. */
const GLOW: Record<LightKind, THREE.Color> = {
  cue: new THREE.Color('#ffb64d'),
  tap: new THREE.Color('#ffc978'),
  slip: new THREE.Color(COLORS.miss),
  show: new THREE.Color('#5fb79b'),
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let sharedGlow: THREE.CanvasTexture | null = null;
const glowTex = () => (sharedGlow ??= glowTexture());

/** One block's lacquer, by finish; each block gets its own so it can light alone. */
function lacquer(finish: Finish, wood: THREE.Texture | null): THREE.MeshStandardMaterial {
  const ebony = finish.startsWith('ebony');
  if (LITE) return new THREE.MeshStandardMaterial({ color: ebony ? '#1d1714' : '#5a2d1e', roughness: 0.32, metalness: 0.05, emissive: '#000000' });
  return new THREE.MeshPhysicalMaterial({
    color: ebony ? '#0b0908' : '#ffd2bc',
    map: ebony ? null : wood,
    roughness: ebony ? 0.36 : 0.46,
    clearcoat: 0.85,
    clearcoatRoughness: ebony ? 0.08 : 0.14,
    envMapIntensity: ebony ? 0.55 : 0.5,
    emissive: '#000000',
  });
}

function useMaterials(n: number, finishes: Finish[]) {
  const wood = useMemo(() => {
    if (LITE) return null;
    const w = makeRosewood(256, 256, 61);
    w.map.repeat.set(0.9, 0.9);
    return w.map;
  }, []);
  const key = finishes.join(',');
  const blocks = useMemo(
    () => finishes.map((f) => lacquer(f, wood)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, wood],
  );
  const shared = useMemo(() => {
    const brass = Array.from({ length: n }, () =>
      LITE
        ? new THREE.MeshStandardMaterial({ color: '#c9a25e', metalness: 0.85, roughness: 0.2, emissive: '#000000' })
        : new THREE.MeshPhysicalMaterial({ color: '#d4ae6a', metalness: 1, roughness: 0.22, envMapIntensity: 1.3, emissive: '#000000' }),
    );
    let blotter: THREE.Material;
    if (LITE) blotter = new THREE.MeshStandardMaterial({ color: '#4a1916', roughness: 0.7 });
    else {
      const hide = makeLeather(512, 77);
      for (const t of [hide.roughnessMap, hide.normalMap]) t.repeat.set(3, 3);
      blotter = new THREE.MeshPhysicalMaterial({
        color: '#3a1110',
        roughnessMap: hide.roughnessMap,
        normalMap: hide.normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 1,
        sheen: 0.25,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color('#6a2a24'),
        envMapIntensity: 0.35,
      });
    }
    const fitting = LITE
      ? new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.85, roughness: 0.22 })
      : new THREE.MeshPhysicalMaterial({ color: COLORS.brass, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
    const gilt = new THREE.MeshStandardMaterial({ color: '#c9a35e', metalness: LITE ? 0.5 : 1, roughness: 0.34 });
    const sheen = Array.from(
      { length: n },
      () => new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    const halo = Array.from(
      { length: n },
      () => new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    return { brass, blotter, fitting, gilt, sheen, halo };
  }, [n]);
  return { blocks, ...shared };
}

/** Brass stringing let into a block's top: a square inset from the edge, and a lozenge at its heart. */
function Stringing({ material }: { material: THREE.Material }) {
  const s = BLOCK_SIZE * 0.66;
  const t = 0.022;
  const y = BLOCK_HEIGHT + 0.0015;
  return (
    <group position={[0, y, 0]}>
      {[
        [0, -s / 2, s + t, t],
        [0, s / 2, s + t, t],
        [-s / 2, 0, t, s],
        [s / 2, 0, t, s],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} material={material} position={[x!, 0, z!]}>
          <boxGeometry args={[w!, 0.004, d!]} />
        </mesh>
      ))}
      <mesh material={material} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.1, 0.004, 0.1]} />
      </mesh>
    </group>
  );
}

export function BlocksBoard() {
  const stage = useBlocks((s) => s.stage)();
  const seed = useBlocks((s) => s.seed);
  const n = stage.blocks;
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const portrait = size.height > size.width * 1.05;
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);
  const board = useMemo(() => blockLayout(n, portrait, seed), [n, portrait, seed]);
  const m = useMaterials(
    n,
    board.blocks.map((b) => b.finish),
  );
  const geo = useMemo(
    () => ({
      block: new RoundedBoxGeometry(BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE, LITE ? 2 : 4, 0.035),
      disc: new THREE.PlaneGeometry(1, 1),
    }),
    [],
  );

  /** Undo the rig's turn (its matrix is orthogonal, so the inverse is the transpose). */
  const unturn = useMemo(() => new THREE.Matrix4().set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>)).transpose(), [view]);
  const centre = useMemo(() => new THREE.Vector3(0, DESK_Y + MAT.thickness, 0), []);
  const turn = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = turn.current;
    if (!g) return;
    g.matrix.copy(unturn);
    g.matrixWorldNeedsUpdate = true;
  }, [unturn]);
  const outer = useRef<THREE.Group>(null);
  const blocks = useRef<(THREE.Group | null)[]>([]);
  const lifts = useRef<(THREE.Group | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);

  const bw = board.w + 2 * BLOTTER_RIM;
  const bd = board.d + 2 * BLOTTER_RIM;

  // Publish what the camera must frame: the blotter and the blocks standing on it.
  const setFrame = useRoomFrame((s) => s.set);
  useLayoutEffect(() => {
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const y of [0, BLOCK_HEIGHT + 0.05]) pts.push(new THREE.Vector3(centre.x + (sx * bw) / 2, centre.y + y, centre.z + (sz * bd) / 2));
    setFrame({ key: `blocks-${n}-${portrait ? 'p' : 'l'}-${leftHanded ? 'm' : 'r'}`, points: pts, elevation: portrait ? 62 : 52 });
  }, [centre, bw, bd, n, portrait, leftHanded, setFrame]);
  useLayoutEffect(() => () => setFrame(null), [setFrame]);

  // Gilt rises from the block lit last.
  useLayoutEffect(() => {
    setRoomAnchor((out) => {
      const g = blocks.current[blocksFx.last];
      if (!g) return false;
      g.getWorldPosition(out);
      out.y += BLOCK_HEIGHT;
      return true;
    });
    return () => setRoomAnchor(null);
  }, []);

  /** Where each block is drawn now: it slides to the board's new place (instantly under calm). */
  const placed = useRef<{ x: number; z: number; turn: number }[]>([]);
  const settled = useRef(false);
  useLayoutEffect(() => {
    // A new stage (a different count) or a turn of the phone puts the board down at once.
    if (placed.current.length !== board.blocks.length) settled.current = false;
  }, [board]);
  const prevPortrait = useRef(portrait);

  const corner = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    const now = performance.now();
    const calm = isCalm();
    if (!settled.current || prevPortrait.current !== portrait || calm) {
      placed.current = board.blocks.map((b) => ({ x: b.x, z: b.z, turn: b.turn }));
      settled.current = true;
      prevPortrait.current = portrait;
    } else {
      const k = 1 - Math.exp(-dt * (4600 / SHIFT_MS));
      board.blocks.forEach((b, i) => {
        const p = placed.current[i]!;
        p.x += (b.x - p.x) * k;
        p.z += (b.z - p.z) * k;
        p.turn += (b.turn - p.turn) * k;
      });
    }
    board.blocks.forEach((_, i) => {
      const g = blocks.current[i];
      const lift = lifts.current[i];
      const p = placed.current[i]!;
      const s = blocksFx.lights[i]!;
      const t = now - s.at;
      // Light: up in 40 ms, held, then a 280 ms fade.
      const light = t < 0 || !Number.isFinite(t) ? 0 : t < 40 ? t / 40 : t < s.hold ? 1 : Math.exp(-(t - s.hold) / 280);
      const lit = light > 0.004 ? light : 0;
      const glow = GLOW[s.kind];
      // A warm cast in the lacquer, brighter brass in the stringing, and the sheen pooled on the top.
      const strength = s.kind === 'slip' || s.kind === 'show' ? 0.3 : LITE ? 0.16 : 0.12;
      m.blocks[i]?.emissive.copy(col.copy(glow).multiplyScalar(lit * strength));
      m.brass[i]?.emissive.copy(col.copy(glow).multiplyScalar(lit * (LITE ? 0.75 : 0.55)));
      const sheen = m.sheen[i]!;
      sheen.opacity = lit * (s.kind === 'show' ? 0.6 : 0.42);
      sheen.color.copy(glow);
      const halo = m.halo[i]!;
      halo.opacity = lit * 0.38;
      halo.color.copy(glow);
      if (g) {
        g.position.set(p.x, BLOTTER_T, p.z);
        g.rotation.y = p.turn;
      }
      const h = halos.current[i];
      if (h) h.position.set(p.x, BLOTTER_T + 0.003, p.z);
      if (lift) lift.position.y = calm || s.kind === 'show' ? 0 : 0.05 * lit;
    });

    // Keep each real button over its block on screen, at least a fingertip wide.
    const o = outer.current;
    if (!o) return;
    o.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const rect = gl.domElement.getBoundingClientRect();
    board.blocks.forEach((_, i) => {
      const el = blockDom.get(i);
      if (!el) return;
      const p = placed.current[i]!;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      const c = Math.cos(p.turn);
      const sn = Math.sin(p.turn);
      const hs = BLOCK_SIZE / 2;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          for (const y of [BLOTTER_T, BLOTTER_T + BLOCK_HEIGHT]) {
            const lx = sx * hs;
            const lz = sz * hs;
            corner.set(p.x + lx * c + lz * sn, y, p.z - lx * sn + lz * c).applyMatrix4(o.matrixWorld).project(camera);
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
      blockRects.set(i, { x: left, y: top, w, h: hh });
    });
  });

  // Brass corner pieces: an L of brass over each corner of the blotter.
  const cornerArm = 0.42;
  const cornerW = 0.07;
  return (
    <group ref={turn} matrixAutoUpdate={false}>
      <group ref={outer} position={centre}>
        <mesh material={m.blotter} position={[0, BLOTTER_T / 2, 0]}>
          <boxGeometry args={[bw, BLOTTER_T, bd]} />
        </mesh>
        {/* A gilt hairline tooled round the blotter, inside its brass corners. */}
        {[
          [0, -bd / 2 + 0.16, bw - 0.32, 0.012],
          [0, bd / 2 - 0.16, bw - 0.32, 0.012],
          [-bw / 2 + 0.16, 0, 0.012, bd - 0.32],
          [bw / 2 - 0.16, 0, 0.012, bd - 0.32],
        ].map(([x, z, w, d], i) => (
          <mesh key={`r${i}`} material={m.gilt} position={[x!, BLOTTER_T + 0.0008, z!]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w!, d!]} />
          </mesh>
        ))}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz], i) => (
          <group key={`c${i}`} position={[(sx! * bw) / 2, BLOTTER_T, (sz! * bd) / 2]}>
            <mesh material={m.fitting} position={[(-sx! * cornerArm) / 2, 0.006, (-sz! * cornerW) / 2]}>
              <boxGeometry args={[cornerArm, 0.014, cornerW]} />
            </mesh>
            <mesh material={m.fitting} position={[(-sx! * cornerW) / 2, 0.006, (-sz! * cornerArm) / 2]}>
              <boxGeometry args={[cornerW, 0.014, cornerArm]} />
            </mesh>
          </group>
        ))}
        {board.blocks.map((b, i) => (
          <group key={`h${i}`}>
            <mesh
              ref={(el) => {
                halos.current[i] = el;
              }}
              geometry={geo.disc}
              material={m.halo[i]}
              position={[b.x, BLOTTER_T + 0.003, b.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[BLOCK_SIZE * 2.6, BLOCK_SIZE * 2.6, 1]}
              renderOrder={3}
            />
          </group>
        ))}
        {board.blocks.map((b, i) => (
          <group
            key={i}
            ref={(el) => {
              blocks.current[i] = el;
            }}
            position={[b.x, BLOTTER_T, b.z]}
            rotation={[0, b.turn, 0]}
          >
            <group
              ref={(el) => {
                lifts.current[i] = el;
              }}
            >
              <mesh geometry={geo.block} material={m.blocks[i]} position={[0, BLOCK_HEIGHT / 2, 0]} />
              {b.finish.endsWith('brass') && <Stringing material={m.brass[i]!} />}
              {/* The sheen: brass light pooled on the block's top. */}
              <mesh geometry={geo.disc} material={m.sheen[i]} position={[0, BLOCK_HEIGHT + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[BLOCK_SIZE * 1.1, BLOCK_SIZE * 1.1, 1]} renderOrder={4} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

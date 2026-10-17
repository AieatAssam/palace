import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { isCalm } from '../motion';
import { usePalace } from '../store';
import { DESK_Y, MAT } from '../three/Desk';
import { neckMatrix } from '../three/layout';
import { LITE } from '../three/quality';
import { makePearl, makeWalnut } from '../three/textures';
import { setRoomAnchor, useRoomFrame } from '../three/view';
import { TILES } from './logic';
import { nbackFx, useNBack } from './store';

/**
 * N-Back on the desk: a walnut tray of nine tiles in brass bezels, three by three. Each tile
 * lies glass-and-walnut side up; on its trial one turns over to show a mother-of-pearl face
 * with a gilt lozenge, then turns back. In the dual stage a bell sounds as it turns.
 *
 * Built in world space with the rig's turn undone, so the tray always reads across the screen.
 */

const TILE = 0.86;
const TILE_T = 0.09;
const GAP = 0.26;
const PITCH = TILE + GAP;
const TRAY_RIM = 0.38;
const TRAY_T = 0.08;
const FLIP_MS = 220;

/** Tile i's centre on the tray, reading order: back row first, left to right. */
function tileAt(i: number): [number, number] {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return [(col - 1) * PITCH, (row - 1) * PITCH];
}

function useMaterials() {
  return useMemo(() => {
    if (LITE) {
      return {
        tray: new THREE.MeshStandardMaterial({ color: '#4a2e1c', roughness: 0.5 }),
        back: new THREE.MeshStandardMaterial({ color: '#2c1a10', roughness: 0.25, metalness: 0.05 }),
        face: new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.3, emissive: '#000000' }),
        bezel: new THREE.MeshStandardMaterial({ color: '#c9a25e', metalness: 0.7, roughness: 0.3 }),
        gilt: new THREE.MeshStandardMaterial({ color: '#b08d57', metalness: 0.6, roughness: 0.35 }),
        well: new THREE.MeshStandardMaterial({ color: '#160d08', roughness: 0.9 }),
      };
    }
    const walnut = makeWalnut(512, 29);
    const pearl = makePearl(256, 17);
    return {
      tray: new THREE.MeshPhysicalMaterial({ map: walnut.map, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.16, envMapIntensity: 0.55 }),
      // Under glass: walnut seen through a clear lacquer, deep and glossy.
      back: new THREE.MeshPhysicalMaterial({ color: '#7a5038', map: walnut.map, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9 }),
      face: new THREE.MeshPhysicalMaterial({ map: pearl.map, roughness: 0.28, iridescence: 0.6, iridescenceThicknessMap: pearl.thickness, iridescenceThicknessRange: [180, 520], clearcoat: 0.6, envMapIntensity: 0.9, emissive: '#000000' }),
      bezel: new THREE.MeshPhysicalMaterial({ color: '#d4ae6a', metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 }),
      gilt: new THREE.MeshPhysicalMaterial({ color: '#c39a4a', metalness: 1, roughness: 0.3, envMapIntensity: 1 }),
      well: new THREE.MeshStandardMaterial({ color: '#160d08', roughness: 0.9 }),
    };
  }, []);
}

/** One tile: a brass bezel round a two-faced slab that turns over on its own axis. */
function Tile({ i, m, geo }: { i: number; m: ReturnType<typeof useMaterials>; geo: { slab: THREE.BufferGeometry; bezel: THREE.BufferGeometry } }) {
  const flip = useRef<THREE.Group>(null);
  const face = useMemo(() => (m.face as THREE.MeshStandardMaterial).clone(), [m.face]);
  const [x, z] = tileAt(i);
  useFrame(() => {
    const g = flip.current;
    if (!g) return;
    const now = performance.now();
    const mine = nbackFx.place === i;
    let k = 0;
    if (mine) {
      const up = (now - nbackFx.shownAt) / FLIP_MS;
      const down = (now - nbackFx.hideAt) / FLIP_MS;
      k = Math.max(0, Math.min(1, up)) * (1 - Math.max(0, Math.min(1, down)));
      if (isCalm()) k = now >= nbackFx.shownAt && now < nbackFx.hideAt ? 1 : 0;
    }
    const e = k * k * (3 - 2 * k);
    g.rotation.x = Math.PI * e;
    // Lift as it turns so the slab clears its bezel.
    g.position.y = TILE_T / 2 + 0.03 + Math.sin(Math.PI * e) * 0.22;
    face.emissive.setRGB(0.16 * e, 0.13 * e, 0.08 * e);
  });
  return (
    <group position={[x, TRAY_T, z]}>
      <mesh material={m.well} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TILE + 0.04, TILE + 0.04]} />
      </mesh>
      <mesh geometry={geo.bezel} material={m.bezel} position={[0, 0.02, 0]} />
      <group ref={flip} position={[0, TILE_T / 2 + 0.03, 0]}>
        <mesh geometry={geo.slab} material={m.back} />
        {/* The face, under the slab until it turns. */}
        <mesh material={face} position={[0, -TILE_T / 2 - 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TILE - 0.08, TILE - 0.08]} />
        </mesh>
        <mesh material={m.gilt} position={[0, -TILE_T / 2 - 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.16, 0.2, 4]} />
        </mesh>
      </group>
    </group>
  );
}

/** A square brass bezel: a frame with a square hole, extruded. */
function bezelGeometry() {
  const o = TILE / 2 + 0.07;
  const inner = TILE / 2 + 0.015;
  const shape = new THREE.Shape();
  shape.moveTo(-o, -o).lineTo(o, -o).lineTo(o, o).lineTo(-o, o).lineTo(-o, -o);
  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner).lineTo(-inner, inner).lineTo(inner, inner).lineTo(inner, -inner).lineTo(-inner, -inner);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: !LITE, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function NBackTray() {
  const size = useThree((s) => s.size);
  const portrait = size.height > size.width * 1.05;
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const view = useMemo(() => ({ portrait, leftHanded }), [portrait, leftHanded]);
  const m = useMaterials();
  const geo = useMemo(() => ({ slab: new RoundedBoxGeometry(TILE, TILE_T, TILE, LITE ? 2 : 3, 0.03), bezel: bezelGeometry() }), []);

  const unturn = useMemo(() => new THREE.Matrix4().set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>)).transpose(), [view]);
  const centre = useMemo(() => new THREE.Vector3(0, DESK_Y + MAT.thickness, 0), []);
  const turn = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = turn.current;
    if (!g) return;
    g.matrix.copy(unturn);
    g.matrixWorldNeedsUpdate = true;
  }, [unturn]);

  const span = 3 * PITCH - GAP + 2 * TRAY_RIM;
  const setFrame = useRoomFrame((s) => s.set);
  useLayoutEffect(() => {
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 0.4]) pts.push(new THREE.Vector3(centre.x + (sx * span) / 2, centre.y + y, centre.z + (sz * span) / 2));
    setFrame({ key: `nback-${portrait ? 'p' : 'l'}-${leftHanded ? 'm' : 'r'}`, points: pts, elevation: portrait ? 64 : 62 });
  }, [centre, span, portrait, leftHanded, setFrame]);
  useLayoutEffect(() => () => setFrame(null), [setFrame]);

  const tiles = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    setRoomAnchor((out) => {
      const g = tiles.current;
      if (!g || nbackFx.place < 0) return false;
      const [x, z] = tileAt(nbackFx.place);
      out.set(x, TRAY_T + 0.3, z);
      g.localToWorld(out);
      return true;
    });
    return () => setRoomAnchor(null);
  }, []);

  // The stage's n, inlaid as brass studs along the tray's front rail.
  const n = useNBack((s) => s.stage().n);
  return (
    <group ref={turn} matrixAutoUpdate={false}>
      <group position={centre}>
        <mesh material={m.tray} position={[0, TRAY_T / 2, 0]}>
          <boxGeometry args={[span, TRAY_T, span]} />
        </mesh>
        {[
          [0, -span / 2 + 0.06, span, 0.04],
          [0, span / 2 - 0.06, span, 0.04],
          [-span / 2 + 0.06, 0, 0.04, span],
          [span / 2 - 0.06, 0, 0.04, span],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} material={m.bezel} position={[x!, TRAY_T + 0.006, z!]}>
            <boxGeometry args={[w!, 0.012, d!]} />
          </mesh>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <mesh key={`n${i}`} material={m.bezel} position={[(i - (n - 1) / 2) * 0.16, TRAY_T + 0.01, span / 2 - TRAY_RIM / 2 + 0.02]}>
            <cylinderGeometry args={[0.04, 0.04, 0.02, LITE ? 10 : 20]} />
          </mesh>
        ))}
        <group ref={tiles}>
          {Array.from({ length: TILES }, (_, i) => (
            <Tile key={i} i={i} m={m} geo={geo} />
          ))}
        </group>
      </group>
    </group>
  );
}

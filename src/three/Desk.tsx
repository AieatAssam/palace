import { useMemo } from 'react';
import * as THREE from 'three';
import { BOARD_END } from './layout';
import { COLORS } from './palette';
import { LITE } from './quality';
import { makeLeather, makeWalnut } from './textures';

/**
 * The bench the neck lies on, in neck-local space (so it follows portrait and
 * left-handed layouts): a walnut desk top with a long green leather mat under
 * the neck, finished like a bookbinder's desk skiver — a fine grain with a
 * faint sheen and a gold-tooled double rule inset from its edge, with a small
 * tooled lozenge at each corner. Lite: flat-coloured planes and the same
 * rules in a plain gold, no textures.
 *
 * Everything sits at or below DESK_Y, under the contact-shadow plane (Scene),
 * and carries no pointer handlers, so it can never take a tap from the neck.
 */
export const DESK_Y = -0.95;
/** Contact-shadow plane: just above the tallest desk fitting, below the headstock tip (≈ -0.89). */
export const SHADOW_Y = -0.918;

export const MAT = { x0: -5.4, x1: BOARD_END + 3, halfZ: 2.3, thickness: 0.012 } as const;
/** Gold tooling: a bolder outer rule and a hairline inside it. */
const RULES = [
  { inset: 0.13, width: 0.02 },
  { inset: 0.21, width: 0.01 },
] as const;
/** Half-diagonal of the corner lozenge, centred between the rules. */
const LOZENGE = 0.045;

function useDeskMaterials() {
  return useMemo(() => {
    if (LITE) {
      return {
        walnut: new THREE.MeshStandardMaterial({ color: COLORS.walnut, roughness: 0.6 }),
        leather: new THREE.MeshStandardMaterial({ color: COLORS.leather, roughness: 0.62 }),
        gilt: new THREE.MeshStandardMaterial({ color: '#b8955a', roughness: 0.45, metalness: 0.5 }),
      };
    }
    const wood = makeWalnut();
    const ani = 16;
    // Walnut grain runs along the desk (neck-local x); ~7 × 3.5 units per tile.
    for (const t of [wood.map, wood.roughnessMap, wood.normalMap]) {
      t.repeat.set(160 / 2.4, 120 / 2.4);
      t.anisotropy = ani;
    }
    const hide = makeLeather();
    const len = MAT.x1 - MAT.x0;
    // ~1.6 units per tile: cells of ~0.025 units, a fine grain that still survives mipmapping.
    for (const t of [hide.map, hide.roughnessMap, hide.normalMap]) t.repeat.set(len / 1.6, (MAT.halfZ * 2) / 1.6);
    return {
      walnut: new THREE.MeshPhysicalMaterial({
        map: wood.map,
        roughnessMap: wood.roughnessMap,
        normalMap: wood.normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 1,
        clearcoat: 0.3,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.6,
      }),
      // Low-amplitude grain; a soft sheen at grazing angles and the thinnest
      // wax coat, so the window reads once across the hide.
      leather: new THREE.MeshPhysicalMaterial({
        map: hide.map,
        roughnessMap: hide.roughnessMap,
        normalMap: hide.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 1,
        sheen: 0.45,
        sheenRoughness: 0.45,
        sheenColor: new THREE.Color('#6f7d5c'),
        clearcoat: 0.1,
        clearcoatRoughness: 0.55,
        envMapIntensity: 0.55,
      }),
      // Gold leaf pressed into the hide: warmer and smoother than the brass fittings.
      gilt: new THREE.MeshStandardMaterial({ color: '#c9a35e', metalness: 1, roughness: 0.32 }),
    };
  }, []);
}

/** A square turned 45°, lying flat: the tooled lozenge at each corner. */
function lozengeGeometry() {
  const g = new THREE.PlaneGeometry(LOZENGE * Math.SQRT2, LOZENGE * Math.SQRT2);
  g.rotateZ(Math.PI / 4);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function Desk() {
  const m = useDeskMaterials();
  const lozenge = useMemo(lozengeGeometry, []);
  const len = MAT.x1 - MAT.x0;
  const cx = (MAT.x0 + MAT.x1) / 2;
  const top = DESK_Y + MAT.thickness + 0.0006;
  // Each rule as four strips: (x, z, length along x, length along z).
  const rules: [number, number, number, number][] = RULES.flatMap(({ inset, width }) => {
    const tl = len - 2 * inset;
    const tz = MAT.halfZ - inset;
    return [
      [cx, tz, tl + width, width],
      [cx, -tz, tl + width, width],
      [MAT.x0 + inset, 0, width, tz * 2],
      [MAT.x1 - inset, 0, width, tz * 2],
    ] as [number, number, number, number][];
  });
  // Lozenges sit on the diagonal between the two rules at each corner.
  const mid = (RULES[0].inset + RULES[1].inset) / 2;
  const corners: [number, number][] = [
    [MAT.x0 + mid, -MAT.halfZ + mid],
    [MAT.x1 - mid, -MAT.halfZ + mid],
    [MAT.x1 - mid, MAT.halfZ - mid],
    [MAT.x0 + mid, MAT.halfZ - mid],
  ];
  return (
    <group>
      {/* Large enough that the low camera never finds its far edge. */}
      <mesh position={[10, DESK_Y - 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.walnut}>
        <planeGeometry args={[160, 120]} />
      </mesh>
      <mesh position={[cx, DESK_Y + MAT.thickness / 2, 0]} material={m.leather}>
        <boxGeometry args={[len, MAT.thickness, MAT.halfZ * 2]} />
      </mesh>
      {rules.map(([x, z, sx, sz], i) => (
        <mesh key={`r${i}`} position={[x, top, z]} rotation={[-Math.PI / 2, 0, 0]} material={m.gilt}>
          <planeGeometry args={[sx, sz]} />
        </mesh>
      ))}
      {corners.map(([x, z], i) => (
        <mesh key={`l${i}`} geometry={lozenge} position={[x, top, z]} material={m.gilt} />
      ))}
    </group>
  );
}

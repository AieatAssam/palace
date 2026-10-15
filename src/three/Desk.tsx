import { useMemo } from 'react';
import * as THREE from 'three';
import { BOARD_END } from './layout';
import { COLORS } from './palette';
import { LITE } from './quality';
import { makeLeather, makeWalnut } from './textures';

/**
 * The bench the neck lies on, in neck-local space (so it follows portrait and
 * left-handed layouts): a walnut desk top with a long green leather mat under
 * the neck, a gilt tooling line round the leather and brass corner caps.
 * Lite: two flat-coloured planes, no textures, no fittings.
 *
 * Everything sits at or below DESK_Y, under the contact-shadow plane (Scene),
 * and carries no pointer handlers, so it can never take a tap from the neck.
 */
export const DESK_Y = -0.95;
/** Contact-shadow plane: just above the tallest desk fitting, below the headstock tip (≈ -0.89). */
export const SHADOW_Y = -0.918;

const MAT = { x0: -5.4, x1: BOARD_END + 3, halfZ: 2.3, thickness: 0.012 } as const;
const TOOL_INSET = 0.12;
const TOOL_WIDTH = 0.014;
const CORNER = 0.42;

function useDeskMaterials() {
  return useMemo(() => {
    if (LITE) {
      return {
        walnut: new THREE.MeshStandardMaterial({ color: COLORS.walnut, roughness: 0.6 }),
        leather: new THREE.MeshStandardMaterial({ color: COLORS.leather, roughness: 0.75 }),
        brass: null,
      };
    }
    const wood = makeWalnut();
    // Walnut grain runs along the desk (neck-local x); ~7 × 3.5 units per tile.
    for (const t of [wood.map, wood.roughnessMap, wood.normalMap]) t.repeat.set(80 / 7, 60 / 3.5);
    const hide = makeLeather();
    const len = MAT.x1 - MAT.x0;
    for (const t of [hide.map, hide.roughnessMap, hide.normalMap]) t.repeat.set(len / 2.2, (MAT.halfZ * 2) / 2.2);
    return {
      walnut: new THREE.MeshPhysicalMaterial({
        map: wood.map,
        roughnessMap: wood.roughnessMap,
        normalMap: wood.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 1,
        clearcoat: 0.35,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.6,
      }),
      leather: new THREE.MeshStandardMaterial({
        map: hide.map,
        roughnessMap: hide.roughnessMap,
        normalMap: hide.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 1,
        envMapIntensity: 0.5,
      }),
      brass: new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 1, roughness: 0.36 }),
    };
  }, []);
}

/** A right-angled brass cap with its corner at the origin, legs along +x and +z. */
function cornerGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(CORNER, 0);
  s.lineTo(0, CORNER);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2 });
  // Shape is drawn in x/y; lay it flat with y → +z and the extrusion pointing up.
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.014, 0);
  return g;
}

export function Desk() {
  const m = useDeskMaterials();
  const corner = useMemo(() => (LITE ? null : cornerGeometry()), []);
  const len = MAT.x1 - MAT.x0;
  const cx = (MAT.x0 + MAT.x1) / 2;
  const top = DESK_Y + MAT.thickness;
  const tl = len - 2 * TOOL_INSET;
  const tz = MAT.halfZ - TOOL_INSET;
  const tooling: [number, number, number, number][] = [
    [cx, tz, tl, TOOL_WIDTH],
    [cx, -tz, tl, TOOL_WIDTH],
    [MAT.x0 + TOOL_INSET, 0, TOOL_WIDTH, tz * 2],
    [MAT.x1 - TOOL_INSET, 0, TOOL_WIDTH, tz * 2],
  ];
  // Corner caps: (x, z, rotation about y) so each cap's legs run along the mat's edges.
  const corners: [number, number, number][] = [
    [MAT.x0, -MAT.halfZ, 0],
    [MAT.x1, -MAT.halfZ, -Math.PI / 2],
    [MAT.x1, MAT.halfZ, Math.PI],
    [MAT.x0, MAT.halfZ, Math.PI / 2],
  ];
  return (
    <group>
      <mesh position={[10, DESK_Y - 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.walnut}>
        <planeGeometry args={[80, 60]} />
      </mesh>
      <mesh position={[cx, DESK_Y + MAT.thickness / 2, 0]} material={m.leather}>
        <boxGeometry args={[len, MAT.thickness, MAT.halfZ * 2]} />
      </mesh>
      {m.brass && (
        <>
          {tooling.map(([x, z, sx, sz], i) => (
            <mesh key={`t${i}`} position={[x, top + 0.0006, z]} rotation={[-Math.PI / 2, 0, 0]} material={m.brass}>
              <planeGeometry args={[sx, sz]} />
            </mesh>
          ))}
          {corner &&
            corners.map(([x, z, r], i) => (
              <mesh key={`c${i}`} geometry={corner} material={m.brass} position={[x, top - 0.006, z]} rotation={[0, r, 0]} />
            ))}
        </>
      )}
    </group>
  );
}

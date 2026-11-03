import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Longitudinal stations: z, full width, lower edge, upper edge. */
type Station = readonly [number, number, number, number];
export function BodyPanel({
  sections,
  color,
  stripe = 0,
  position = [0, 0, 0],
  visible = true,
  roughness = 0.38,
  metalness = 0.18,
}: {
  sections: readonly Station[];
  color: string;
  stripe?: number;
  position?: [number, number, number];
  visible?: boolean;
  roughness?: number;
  metalness?: number;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [];
    const paint = new THREE.Color(color),
      cream = new THREE.Color("#f3ecd9");
    const rings = sections.map(([z, width, low, high]) => {
      const w = width / 2,
        bevel = Math.min((high - low) * 0.22, w * 0.2);
      const s = Math.min(stripe / 2, w * 0.5);
      return [
        [-w + bevel, low, z],
        [w - bevel, low, z],
        [w, low + bevel, z],
        [w, high - bevel, z],
        [w - bevel, high, z],
        [s, high, z],
        [-s, high, z],
        [-w + bevel, high, z],
        [-w, high - bevel, z],
        [-w, low + bevel, z],
      ];
    });
    const triangle = (
      a: number[],
      b: number[],
      c: number[],
      tint: THREE.Color,
    ) => {
      positions.push(...a, ...b, ...c);
      for (let i = 0; i < 3; i++) colors.push(tint.r, tint.g, tint.b);
    };
    for (let j = 0; j < rings.length - 1; j++)
      for (let i = 0; i < 10; i++) {
        const next = (i + 1) % 10;
        const tint = i === 5 && stripe > 0 ? cream : paint;
        triangle(rings[j][i], rings[j][next], rings[j + 1][next], tint);
        triangle(rings[j][i], rings[j + 1][next], rings[j + 1][i], tint);
      }
    for (let i = 1; i < 9; i++) {
      triangle(rings[0][0], rings[0][i + 1], rings[0][i], paint);
      const front = rings[rings.length - 1];
      triangle(front[0], front[i], front[i + 1], paint);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    result.computeVertexNormals();
    return result;
  }, [sections, color, stripe]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} visible={visible} castShadow>
      <meshStandardMaterial
        vertexColors
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

export const FORMULA_HULL: readonly Station[] = [
  [-1.32, 0.22, -0.05, 0.12],
  [-0.72, 0.72, -0.08, 0.19],
  [0.05, 0.86, -0.06, 0.23],
  [0.6, 0.6, -0.06, 0.22],
  [1.35, 0.34, -0.055, 0.16],
  [2.15, 0.19, -0.04, 0.12],
  [2.72, 0.1, -0.025, 0.07],
];
export const FORMULA_SIDEPOD: readonly Station[] = [
  [-0.66, 0.2, -0.09, 0.1],
  [-0.38, 0.46, -0.09, 0.18],
  [0.16, 0.46, -0.09, 0.18],
  [0.43, 0.3, -0.07, 0.13],
];
export const FORMULA_COVER: readonly Station[] = [
  [-1.32, 0.08, 0.12, 0.2],
  [-0.9, 0.2, 0.13, 0.73],
  [-0.62, 0.24, 0.16, 0.71],
  [-0.28, 0.1, 0.17, 0.28],
];
export const FORMULA_COCKPIT_NOSE: readonly Station[] = [
  [0.45, 0.68, -0.36, 0.01],
  [0.95, 0.56, -0.34, 0.015],
  [1.75, 0.4, -0.31, -0.02],
  [2.5, 0.24, -0.29, -0.08],
  [3.18, 0.12, -0.26, -0.13],
  [3.55, 0.08, -0.23, -0.17],
];
export const KART_NOSE: readonly Station[] = [
  [-0.25, 0.44, -0.1, 0.08],
  [-0.08, 0.72, -0.1, 0.15],
  [0.18, 0.7, -0.09, 0.12],
  [0.32, 0.56, -0.065, 0.04],
];
export const TRUCK_HOOD: readonly Station[] = [
  [-0.58, 1.47, -0.14, 0.16],
  [-0.22, 1.58, -0.14, 0.17],
  [0.38, 1.5, -0.14, 0.09],
  [0.6, 1.4, -0.1, 0.01],
];
export const TRUCK_CAB: readonly Station[] = [
  [-0.77, 1.3, 0.27, 0.72],
  [-0.55, 1.44, 0.27, 0.94],
  [-0.12, 1.44, 0.27, 0.94],
  [0.36, 1.32, 0.27, 0.43],
];
export const TRUCK_COCKPIT_HOOD: readonly Station[] = [
  [0.18, 2.08, -0.39, -0.17],
  [0.72, 2.08, -0.39, -0.15],
  [1.6, 1.98, -0.39, -0.23],
  [2.35, 1.78, -0.36, -0.29],
];
export const TUK_CANOPY: readonly Station[] = [
  [-0.86, 1.24, -0.035, 0.015],
  [-0.58, 1.32, -0.035, 0.085],
  [0.46, 1.32, -0.035, 0.075],
  [0.82, 1.24, -0.035, 0.01],
];

export const TUK_SIDE: readonly Station[] = [
  [-0.575, 0.07, -0.145, 0.145],
  [0.575, 0.07, -0.145, 0.145],
];
export const TUK_REAR: readonly Station[] = [
  [-0.0375, 1, -0.32, 0.32],
  [0.0375, 1, -0.32, 0.32],
];
export const TUK_SEAT: readonly Station[] = [
  [-0.255, 0.85, -0.075, 0.075],
  [0.255, 0.85, -0.075, 0.075],
];
export const TUK_BACK: readonly Station[] = [
  [-0.045, 0.85, -0.175, 0.175],
  [0.045, 0.85, -0.175, 0.175],
];

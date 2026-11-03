import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeWorldParts, worldPart } from "./WorldInstances";

export type MountainPeak = {
  position: [number, number, number];
  size: [number, number, number];
  seed: number;
};

/** Irregular ridgelines with snow baked into the rock, rather than a floating second cone. */
export function MountainMassif({
  peaks,
  rain,
  castShadow = false,
}: {
  peaks: MountainPeak[];
  rain: boolean;
  castShadow?: boolean;
}) {
  const geometry = useMemo(
    () =>
      mergeWorldParts(
        peaks.map((peak) => {
          const positions: number[] = [],
            colors: number[] = [];
          const stone = new THREE.Color(rain ? "#71817d" : "#7f8d7c"),
            snow = new THREE.Color(rain ? "#d2dfdf" : "#edf2e9");
          const ring = (level: number, i: number) => {
            const angle = (i * Math.PI * 2) / 9;
            const variation = 0.88 + 0.12 * Math.sin(i * 7.1 + peak.seed * 3.7);
            const radius = [1, 0.66, 0.29, 0][level];
            const height = [0, 0.32, 0.71, 1][level];
            return new THREE.Vector3(
              Math.sin(angle) * radius * variation +
                [0, 0.08, -0.08, 0.11][level],
              height +
                (level === 0 || level === 3
                  ? 0
                  : Math.sin(i * 4.1 + peak.seed) * 0.055),
              Math.cos(angle) * radius * variation +
                [0, -0.07, 0.04, -0.06][level],
            );
          };
          const triangle = (
            a: THREE.Vector3,
            b: THREE.Vector3,
            c: THREE.Vector3,
          ) => {
            const average = (a.y + b.y + c.y) / 3;
            const faceTone =
              0.89 +
              0.14 *
                ((Math.sin((a.x + b.x) * 21 + (a.z + c.z) * 17 + peak.seed) +
                  1) *
                  0.5);
            for (const v of [a, b, c]) {
              positions.push(
                v.x * peak.size[0] + peak.position[0],
                v.y * peak.size[1] + peak.position[1],
                v.z * peak.size[2] + peak.position[2],
              );
              // Each crag gets a broken snow line and a white summit without overlapping surfaces.
              const line = 0.73 + 0.025 * Math.sin(a.x * 7 + a.z * 6 + peak.seed);
              const amount = average > line ? 1 : 0;
              const color = stone
                .clone()
                .lerp(snow, amount)
                .multiplyScalar(faceTone * (average < 0.25 ? 0.91 : 1));
              color.toArray(colors, colors.length);
            }
          };
          for (let level = 0; level < 3; level++)
            for (let i = 0; i < 9; i++) {
              const a = ring(level, i),
                b = ring(level, (i + 1) % 9),
                c = ring(level + 1, i),
                d = ring(level + 1, (i + 1) % 9);
              // Counterclockwise from outside; the top tier ends in a single shared summit.
              triangle(a, b, c);
              if (level < 2) triangle(b, d, c);
            }
          const g = new THREE.BufferGeometry();
          g.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
          );
          g.computeVertexNormals();
          const part = worldPart(g, [0, 0, 0]);
          part.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3),
          );
          return part;
        }),
      ),
    [peaks, rain],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      castShadow={castShadow}
      receiveShadow={castShadow}
    >
      <meshStandardMaterial vertexColors roughness={0.98} />
    </mesh>
  );
}

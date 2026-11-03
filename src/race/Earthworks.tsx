import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { TrackDef } from "../shared/types";
import { sampleTrack, trackMetrics } from "../shared/tracks";
import { mergeWorldParts, worldPart } from "./WorldInstances";

type Section = {
  start: number;
  end: number;
  side: number;
  height: number;
  stone?: boolean;
};
const SECTIONS: Record<string, Section[]> = {
  sakura: [
    { start: 0.17, end: 0.35, side: 1, height: 2.2 },
    { start: 0.57, end: 0.76, side: -1, height: 1.8 },
  ],
  alpine: [
    { start: 0.15, end: 0.32, side: 1, height: 6.8, stone: true },
    { start: 0.55, end: 0.72, side: 1, height: 5.4, stone: true },
  ],
  fjord: [
    { start: 0.11, end: 0.23, side: -1, height: 10, stone: true },
    { start: 0.39, end: 0.49, side: -1, height: 7, stone: true },
    { start: 0.64, end: 0.75, side: -1, height: 5.6, stone: true },
  ],
  cloudline: [
    { start: 0.055, end: 0.16, side: -1, height: 6, stone: true },
    { start: 0.3, end: 0.39, side: 1, height: 8.5, stone: true },
    { start: 0.5, end: 0.59, side: 1, height: 10, stone: true },
    { start: 0.75, end: 0.82, side: -1, height: 7, stone: true },
  ],
};

/** Authored banks/cuttings create near and middle distance without moving the racing surface. */
export function Earthworks({
  track,
  rain,
}: {
  track: TrackDef;
  rain: boolean;
}) {
  const geometry = useMemo(() => buildEarthworks(track, rain), [track, rain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        flatShading
        roughness={1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function buildEarthworks(track: TrackDef, rain: boolean) {
  const length = trackMetrics(track).totalLength,
    positions: number[] = [],
    colors: number[] = [];
  const roads = Array.from({ length: Math.ceil(length / 10) }, (_, i) =>
    sampleTrack(track, (length * i) / Math.ceil(length / 10)),
  );
  const clear = track.width / 2 + track.curbWidth + track.wallMargin + 2;
  const maxY = Math.max(...track.points.map((p) => p.y ?? 0), 1);
  const triangle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    color: THREE.Color,
  ) => {
    const minX = Math.min(a.x, b.x, c.x) - clear - 5,
      maxX = Math.max(a.x, b.x, c.x) + clear + 5;
    const minZ = Math.min(a.z, b.z, c.z) - clear - 5,
      maxZ = Math.max(a.z, b.z, c.z) + clear + 5;
    const minY = Math.min(a.y, b.y, c.y) - 4,
      maxHeight = Math.max(a.y, b.y, c.y) + 4;
    // A conservative road mask also protects other levels of stacked switchbacks.
    if (
      roads.some((p) => {
        if (
          p.x <= minX ||
          p.x >= maxX ||
          p.z <= minZ ||
          p.z >= maxZ ||
          p.y <= minY ||
          p.y >= maxHeight
        )
          return false;
        const edge = (v: THREE.Vector3, w: THREE.Vector3) => {
          const dx = w.x - v.x,
            dz = w.z - v.z,
            t = THREE.MathUtils.clamp(
              ((p.x - v.x) * dx + (p.z - v.z) * dz) /
                Math.max(0.001, dx * dx + dz * dz),
              0,
              1,
            );
          return Math.hypot(p.x - v.x - dx * t, p.z - v.z - dz * t);
        };
        const sign = (v: THREE.Vector3, w: THREE.Vector3) =>
          (p.x - w.x) * (v.z - w.z) - (v.x - w.x) * (p.z - w.z);
        const signs = [sign(a, b), sign(b, c), sign(c, a)];
        const inside = !(signs.some((v) => v < 0) && signs.some((v) => v > 0));
        return (
          inside || Math.min(edge(a, b), edge(b, c), edge(c, a)) < clear + 5
        );
      })
    )
      return;
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      color.toArray(colors, colors.length);
    }
  };
  for (const section of SECTIONS[track.sceneryId] ?? []) {
    const steps = Math.max(
      8,
      Math.ceil(
        ((section.end - section.start) * length) / (section.stone ? 12 : 8),
      ),
    );
    const point = (step: number, band: number) => {
      const t = step / steps,
        progress = (section.start + (section.end - section.start) * t) * length,
        p = sampleTrack(track, progress);
      const envelope = Math.sin(Math.PI * t) ** 0.55;
      const offset = clear + 7 + [0, 3.2, 8.5, 17][band];
      const tooth = 0.84 + 0.16 * Math.sin(step * 2.14 + section.side);
      const height =
        [-0.12, 0.7, 1, 0.13][band] * section.height * envelope * tooth;
      return new THREE.Vector3(
        p.x + Math.cos(p.heading) * offset * section.side,
        p.y + height,
        p.z - Math.sin(p.heading) * offset * section.side,
      );
    };
    for (let i = 0; i < steps; i++)
      for (let band = 0; band < 3; band++) {
        const a = point(i, band),
          b = point(i + 1, band),
          c = point(i, band + 1),
          d = point(i + 1, band + 1);
        const high =
          track.sceneryId === "cloudline" && (a.y + b.y) / 2 > maxY * 0.68;
        const base = high
          ? "#d8e2dc"
          : section.stone
            ? band === 1
              ? "#808b7b"
              : "#697967"
            : band === 1
              ? "#799454"
              : "#637d48";
        const color = new THREE.Color(base).multiplyScalar(
          (rain ? 0.77 : 1) * (0.95 + Math.sin(i * 1.37) * 0.035),
        );
        if (section.side === 1) {
          triangle(a, b, c, color);
          triangle(c, b, d, color);
        } else {
          triangle(a, c, b, color);
          triangle(c, d, b, color);
        }
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Lower forest, exposed rock, then snow: the pass now changes with its real elevation. */
export function colorMountainGround(
  geometry: THREE.BufferGeometry,
  track: TrackDef,
  gravel = false,
) {
  const height = Math.max(...track.points.map((p) => p.y ?? 0), 1),
    p = geometry.getAttribute("position"),
    colors = new Float32Array(p.count * 3);
  const grass = new THREE.Color("#7c936a"),
    rock = new THREE.Color("#929d8d"),
    snow = new THREE.Color(gravel ? "#7e8d85" : "#d9e4df");
  for (let i = 0; i < p.count; i++) {
    const elevation = p.getY(i) / height;
    const color = grass
      .clone()
      .lerp(rock, THREE.MathUtils.smoothstep(elevation, 0.34, 0.62));
    color.lerp(snow, THREE.MathUtils.smoothstep(elevation, 0.64, 0.82));
    color
      .multiplyScalar(
        0.97 + Math.sin(p.getX(i) * 0.035 + p.getZ(i) * 0.049) * 0.025,
      )
      .toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function FjordQuay({
  position,
  heading,
  waterY,
  rain,
}: {
  position: [number, number, number];
  heading: number;
  waterY: number;
  rain: boolean;
}) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const box = (
      size: [number, number, number],
      at: [number, number, number],
      color: string,
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const g = worldPart(new THREE.BoxGeometry(...size), at, rotation),
        c = new THREE.Color(color).multiplyScalar(rain ? 0.77 : 1),
        attribute = g.getAttribute("color");
      for (let i = 0; i < attribute.count; i++)
        attribute.setXYZ(i, c.r, c.g, c.b);
      parts.push(g);
    };
    const drop = Math.max(2, position[1] - waterY);
    box([24, drop, 22], [0, -drop / 2, 0], "#a5a18a");
    box([14, 0.25, 22], [4, -0.2, 0], "#a2a38d");
    box([1.2, drop, 23], [11, -drop / 2, 0], "#7d887b");
    box([3, 0.25, 21], [18, -drop + 0.35, 0], "#9a8261");
    for (const z of [-9, -3, 3, 9]) {
      box([0.28, 1.0, 0.28], [17.2, -drop + 0.65, z], "#5a5b49");
      box([0.35, 1.4, 0.35], [19, -drop - 0.15, z], "#5a5b49");
    }
    for (let i = 0; i < 10; i++)
      box(
        [0.8, 0.2, 2.4],
        [11.8 + i * 0.6, -0.45 - (drop * i) / 10, 8.7],
        "#a6a28a",
      );
    for (const z of [-5, -2, 1]) box([1.6, 1.0, 1.2], [5, 0.4, z], "#987351");
    // A compact dock crane gives the harbor a clear silhouette from the approach.
    box([0.45, 5.8, 0.45], [8, 2.7, -8], "#b59d5c");
    box([5.2, 0.25, 0.3], [10.1, 5.5, -8], "#d3ba78", [0, 0, -0.18]);
    box([0.04, 4.5, 0.04], [12.4, 2.5, -8], "#465754");
    box([0.5, 0.3, 0.4], [12.4, 0.2, -8], "#465754");
    return mergeWorldParts(parts);
  }, [position[1], waterY, rain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={position}
      rotation={[0, heading, 0]}
      geometry={geometry}
      receiveShadow
    >
      <meshStandardMaterial vertexColors roughness={0.94} />
    </mesh>
  );
}

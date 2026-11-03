import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { TrackDef } from "../shared/types";
import { nearestTrackPoint, sampleTrack, trackMetrics } from "../shared/tracks";
import { COAST_SEA_LEVEL } from "./Coastline";
import { mergeWorldParts, worldPart } from "./WorldInstances";

export function coastHeadlands(track: TrackDef) {
  const length = trackMetrics(track).totalLength;
  return [
    {
      fraction: 0.422,
      extra: 2.4,
      radius: 6.8,
      width: 12,
      depth: 10,
      angle: 1.12,
    },
    {
      fraction: 0.7,
      extra: 1.8,
      radius: 10.8,
      width: 20,
      depth: 15,
      angle: 1.26,
    },
  ].map((p) => {
    const point = sampleTrack(track, length * p.fraction),
      offset =
        track.width / 2 +
        track.curbWidth +
        track.wallMargin +
        p.extra +
        p.radius;
    return {
      ...p,
      x: point.x - Math.cos(point.heading) * offset,
      z: point.z + Math.sin(point.heading) * offset,
      heading: point.heading + p.angle,
    };
  });
}

/** Foundations make the existing lighthouse and harbor read as places on the shoreline. */
export function CoastFeatures({
  track,
  rain,
}: {
  track: TrackDef;
  rain: boolean;
}) {
  const heads = useMemo(() => coastHeadlands(track), [track]);
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const put = (
      g: THREE.BufferGeometry,
      at: [number, number, number],
      color: string,
      rotation: [number, number, number] = [0, 0, 0],
      scale: [number, number, number] = [1, 1, 1],
    ) => {
      const part = worldPart(g, at, rotation, scale),
        tint = new THREE.Color(color).multiplyScalar(rain ? 0.78 : 1),
        colors = part.getAttribute("color");
      for (let i = 0; i < colors.count; i++)
        colors.setXYZ(i, tint.r, tint.g, tint.b);
      parts.push(part);
    };
    for (const head of heads) {
      const height = -COAST_SEA_LEVEL + 0.35;
      put(
        new THREE.CylinderGeometry(1, 0.88, height, 12),
        [head.x, -0.13 - height / 2, head.z],
        "#c5b589",
        [0, head.heading, 0],
        [head.width, 1, head.depth],
      );
      // A lower, dark sea wall makes the small settlement feel anchored to the water.
      put(
        new THREE.CylinderGeometry(0.9, 0.84, 0.65, 12),
        [head.x, COAST_SEA_LEVEL + 0.24, head.z],
        "#657f78",
        [0, head.heading, 0],
        [head.width, 1, head.depth],
      );
    }
    const harbor = heads[1];
    const harborPart = (
      x: number,
      y: number,
      z: number,
      size: [number, number, number],
    ) => {
      const point = new THREE.Vector3(x, 0, z).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        harbor.heading,
      );
      put(
        new THREE.BoxGeometry(...size),
        [harbor.x + point.x, y, harbor.z + point.z],
        "#9a805f",
        [0, harbor.heading, 0],
      );
    };
    harborPart(0, -0.08, -13, [2.4, 0.25, 12]);
    harborPart(4, -0.08, -18.5, [10.5, 0.25, 2.4]);
    for (const z of [-9, -14, -18.5])
      for (const x of [-0.85, 0.85]) harborPart(x, -3.35, z, [0.3, 6.4, 0.3]);
    for (const x of [3, 8]) harborPart(x, -3.35, -18.5, [0.3, 6.4, 0.3]);
    const length = trackMetrics(track).totalLength;
    const p = sampleTrack(track, length * 0.285),
      offset = track.width / 2 + track.curbWidth + track.wallMargin + 2.2 + 5.6;
    const x = p.x - Math.cos(p.heading) * offset,
      z = p.z + Math.sin(p.heading) * offset;
    const shore = nearestTrackPoint(track, { x, y: 0, z }),
      walkLength = shore.distance - track.width / 2 - track.curbWidth;
    put(new THREE.BoxGeometry(10.5, 0.28, 9), [x, -0.17, z], "#826e53", [
      0,
      p.heading - 0.22,
      0,
    ]);
    put(
      new THREE.BoxGeometry(walkLength, 0.22, 2.2),
      [
        (x +
          shore.x -
          Math.cos(p.heading) * (track.width / 2 + track.curbWidth)) /
          2,
        -0.13,
        (z +
          shore.z +
          Math.sin(p.heading) * (track.width / 2 + track.curbWidth)) /
          2,
      ],
      "#a18a64",
      [0, p.heading, 0],
    );
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const local = new THREE.Vector3(
          side * 3.8,
          0,
          end * 3.1,
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.heading - 0.22);
        put(
          new THREE.BoxGeometry(0.4, 6.6, 0.4),
          [x + local.x, -3.5, z + local.z],
          "#686c58",
        );
      }
    return mergeWorldParts(parts);
  }, [track, heads, rain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.96} />
    </mesh>
  );
}

export function coastPropHeight(
  track: TrackDef,
  x: number,
  z: number,
  nearest: {
    x: number;
    y: number;
    z: number;
    heading: number;
    progress: number;
    distance: number;
  },
) {
  if (
    coastHeadlands(track).some((head) => {
      const dx = x - head.x,
        dz = z - head.z,
        c = Math.cos(head.heading),
        s = Math.sin(head.heading);
      return (
        ((dx * c - dz * s) / head.width) ** 2 +
          ((dx * s + dz * c) / head.depth) ** 2 <
        1
      );
    })
  )
    return -0.09;
  const safe = track.width / 2 + track.curbWidth + track.wallMargin,
    side =
      (x - nearest.x) * Math.cos(nearest.heading) -
        (z - nearest.z) * Math.sin(nearest.heading) >=
      0
        ? 1
        : -1;
  const wave =
    Math.sin(nearest.progress * 0.011 + side) * 0.55 +
    Math.sin(nearest.progress * 0.027) * 0.25;
  const distances = [
    safe + 3,
    safe + 10 + wave * 2,
    safe + 23 + wave * 3,
    safe + 39 + wave * 4,
    safe + 44 + wave * 4,
  ];
  const heights = [
    -0.11,
    0.6 + wave * 0.65,
    -1.55,
    COAST_SEA_LEVEL + 0.05,
    COAST_SEA_LEVEL - 0.1,
  ];
  for (let i = 0; i < distances.length; i++)
    if (nearest.distance < distances[i]) {
      if (i === 0) return heights[0];
      const t =
        (nearest.distance - distances[i - 1]) /
        (distances[i] - distances[i - 1]);
      return THREE.MathUtils.lerp(heights[i - 1], heights[i], t);
    }
  return COAST_SEA_LEVEL - 0.1;
}

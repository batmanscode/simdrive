import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { TrackDef } from "../shared/types";
import {
  isCausewayBridgeProgress,
  sampleTrack,
  trackMetrics,
} from "../shared/tracks";
import { WorldInstances, type WorldInstance } from "./WorldInstances";

export const COAST_SEA_LEVEL = -5.8;
type Point = [number, number, number];

/** A continuous shoreline and bridge deck; the driven road and its wall limits stay unchanged. */
export function Coastline({
  track,
  rain,
  mirror = false,
}: {
  track: TrackDef;
  rain: boolean;
  mirror?: boolean;
}) {
  const world = useMemo(() => buildCoast(track, rain), [track, rain]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const concrete = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.92 }),
    [],
  );
  useEffect(
    () => () => {
      world.ground.dispose();
      world.deck.dispose();
    },
    [world],
  );
  useEffect(
    () => () => {
      box.dispose();
      concrete.dispose();
    },
    [box, concrete],
  );
  return (
    <group>
      <mesh geometry={world.ground} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={world.deck} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.91}
          side={THREE.DoubleSide}
        />
      </mesh>
      {!mirror && (
        <WorldInstances
          geometry={box}
          material={concrete}
          instances={world.piers}
        />
      )}
    </group>
  );
}

export function buildCoast(track: TrackDef, rain: boolean) {
  const length = trackMetrics(track).totalLength;
  const count = Math.ceil(length / 12);
  const cuts = [
    ...new Set([
      0,
      length,
      ...Array.from({ length: count }, (_, i) => (length * i) / count),
      ...[0.34, 0.49, 0.64, 0.78, 0.98].map((p) => p * length),
    ]),
  ].sort((a, b) => a - b);
  const ground: number[] = [],
    groundColors: number[] = [],
    deck: number[] = [],
    deckColors: number[] = [];
  const piers: WorldInstance[] = [];
  const safe = track.width / 2 + track.curbWidth + track.wallMargin;
  // Coarse road samples are only a conservative clearance mask for cosmetic dunes.
  const roads = Array.from({ length: Math.ceil(length / 10) }, (_, i) =>
    sampleTrack(track, (length * i) / Math.ceil(length / 10)),
  );
  const tint = (color: string, shade = 1) =>
    new THREE.Color(color).multiplyScalar((rain ? 0.76 : 1) * shade);
  const quad = (
    positions: number[],
    colors: number[],
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    color: THREE.Color,
    flip = false,
  ) => {
    for (const point of flip ? [a, c, b, c, d, b] : [a, b, c, c, b, d]) {
      positions.push(...point);
      color.toArray(colors, colors.length);
    }
  };
  const at = (progress: number, offset: number, y: number): Point => {
    const p = sampleTrack(track, progress);
    return [
      p.x + Math.cos(p.heading) * offset,
      y,
      p.z - Math.sin(p.heading) * offset,
    ];
  };
  const profile = (progress: number, side: number): Point[] => {
    const p = sampleTrack(track, progress),
      wave =
        Math.sin(progress * 0.011 + side) * 0.55 +
        Math.sin(progress * 0.027) * 0.25;
    const offsets = [
      0,
      safe + 3,
      safe + 10 + wave * 2,
      safe + 23 + wave * 3,
      safe + 39 + wave * 4,
      safe + 44 + wave * 4,
      safe + 55 + wave * 4,
    ];
    const heights = [
      -0.1,
      -0.11,
      0.6 + wave * 0.65,
      -1.55,
      COAST_SEA_LEVEL + 0.05,
      COAST_SEA_LEVEL - 0.1,
      COAST_SEA_LEVEL - 0.7,
    ];
    return offsets.map((offset, i) => {
      const point = at(progress, side * offset, heights[i]);
      if (
        i === 2 &&
        roads.some((r) => Math.hypot(point[0] - r.x, point[2] - r.z) < safe + 3)
      )
        point[1] = -0.13;
      return point;
    });
  };
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i],
      end = cuts[i + 1],
      mid = (start + end) / 2;
    if (isCausewayBridgeProgress(mid / length)) {
      const half = track.width / 2 + track.curbWidth + 1.45;
      quad(
        deck,
        deckColors,
        at(start, -half, -0.075),
        at(end, -half, -0.075),
        at(start, half, -0.075),
        at(end, half, -0.075),
        tint("#a2a69d"),
      );
      for (const side of [-1, 1])
        quad(
          deck,
          deckColors,
          at(start, side * half, -0.07),
          at(end, side * half, -0.07),
          at(start, side * half, -1.0),
          at(end, side * half, -1.0),
          tint("#7c8986", 0.94),
          side === 1,
        );
    } else {
      for (const side of [-1, 1]) {
        const a = profile(start, side),
          b = profile(end, side);
        const shades = [
          "#d9c99e",
          "#c8bf91",
          "#d9c798",
          "#e2d4ac",
          "#c3dfd3",
          "#74b8b5",
        ];
        for (let band = 0; band < 6; band++)
          quad(
            ground,
            groundColors,
            a[band],
            b[band],
            a[band + 1],
            b[band + 1],
            tint(shades[band], 0.97 + Math.sin(mid * 0.031) * 0.025),
            side === -1,
          );
      }
    }
  }
  for (let progress = 20; progress < length; progress += 44) {
    if (!isCausewayBridgeProgress(progress / length)) continue;
    const p = sampleTrack(track, progress);
    for (const side of [-1, 1])
      piers.push({
        position: at(progress, side * 3.1, -3.8),
        rotation: [0, p.heading, 0],
        scale: [0.8, 5.8, 1.05],
        color: rain ? "#697b79" : "#94a69d",
      });
    piers.push({
      position: [p.x, -1.14, p.z],
      rotation: [0, p.heading, 0],
      scale: [track.width + 2 * track.curbWidth + 2, 0.52, 1.4],
      color: rain ? "#71817b" : "#a8b1a4",
    });
  }
  // Alternating bridge lamps provide a readable above-hood rhythm from the cockpit.
  for (
    let progress = 70, index = 0;
    progress < length;
    progress += 96, index++
  ) {
    if (!isCausewayBridgeProgress(progress / length)) continue;
    const p = sampleTrack(track, progress),
      side = index % 2 ? 1 : -1,
      offset = side * (track.width / 2 + track.curbWidth + 1.75);
    const color = rain ? "#42595b" : "#52696a";
    piers.push({
      position: at(progress, offset, 2.25),
      rotation: [0, p.heading, 0],
      scale: [0.23, 4.65, 0.23],
      color,
    });
    piers.push({
      position: at(progress, offset - side * 0.43, 4.5),
      rotation: [0, p.heading, 0],
      scale: [1.0, 0.12, 0.13],
      color,
    });
    piers.push({
      position: at(progress, offset - side * 0.82, 4.45),
      rotation: [0, p.heading, 0],
      scale: [0.55, 0.12, 0.3],
      color: rain ? "#d2c4a3" : "#f3dcac",
    });
  }
  const geometry = (positions: number[], colors: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  };
  return {
    ground: geometry(ground, groundColors),
    deck: geometry(deck, deckColors),
    piers,
  };
}

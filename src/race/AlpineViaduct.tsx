import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeWorldParts, worldPart } from "./WorldInstances";

type Point = [number, number, number];

/** A complete scenic crossing; all masonry, approaches and banks share one draw. */
export function AlpineViaduct({
  position,
  heading,
  rain,
}: {
  position: Point;
  heading: number;
  rain: boolean;
}) {
  const geometry = useMemo(() => buildAlpineViaduct(rain), [rain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={position}
      rotation={[0, heading, 0]}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        roughness={0.96}
      />
    </mesh>
  );
}

export function buildAlpineViaduct(rain: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const stone = "#b9b6a5",
    joint = "#939383",
    grass = "#799454",
    rock = "#929d8d";
  const add = (
    geometry: THREE.BufferGeometry,
    color: string,
    position: Point = [0, 0, 0],
    rotation: Point = [0, 0, 0],
  ) => {
    const part = worldPart(geometry, position, rotation);
    const tint = new THREE.Color(color).multiplyScalar(rain ? 0.77 : 1);
    const colors = part.getAttribute("color");
    for (let i = 0; i < colors.count; i++)
      colors.setXYZ(i, tint.r, tint.g, tint.b);
    parts.push(part);
    return part;
  };
  const box = (
    size: Point,
    at: Point,
    color = stone,
    rotation: Point = [0, 0, 0],
  ) => add(new THREE.BoxGeometry(...size), color, at, rotation);
  const quad = (
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    color: string,
    flip = false,
  ) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        flip
          ? [...a, ...c, ...b, ...c, ...d, ...b]
          : [...a, ...b, ...c, ...c, ...b, ...d],
        3,
      ),
    );
    return add(geometry, color);
  };
  const arch = (angle: number, outer: boolean, z: number): Point => [
    Math.cos(angle) * (outer ? 16.1 : 15),
    2.6 + Math.sin(angle) * (outer ? 6 : 4.9),
    z,
  ];
  // Keep the original generous arch opening. Filled spandrels carry the deck
  // all the way to the abutments instead of leaving a slab balanced at its apex.
  for (let i = 0; i < 18; i++) {
    const a = (i * Math.PI) / 18,
      b = ((i + 1) * Math.PI) / 18;
    const tone =
      i === 8 || i === 9 ? "#d0cbbb" : i % 3 === 0 ? "#aaa997" : stone;
    for (const z of [-2.7, 2.7]) {
      quad(
        arch(a, false, z),
        arch(b, false, z),
        arch(a, true, z),
        arch(b, true, z),
        tone,
        z > 0,
      );
      const left = arch(a, true, z),
        right = arch(b, true, z);
      // One continuous outer face includes the parapet. Internal deck edges
      // stay behind it, so long shared edges cannot sparkle in small panes.
      quad(left, right, [left[0], 10.5, z], [right[0], 10.5, z], stone, z > 0);
    }
    quad(
      arch(a, false, -2.7),
      arch(a, false, 2.7),
      arch(b, false, -2.7),
      arch(b, false, 2.7),
      "#a4a592",
    );
  }
  for (const side of [-1, 1]) {
    box([2.8, 3.2, 5.4], [side * 15.5, 1, 0], joint);
    box([8, 9.6, 6.4], [side * 20.1, 4.75, 0]);
    for (const y of [2.4, 4.8, 7.2])
      box([8.03, 0.055, 6.43], [side * 20.1, y, 0], joint);
    box([8.3, 0.22, 6.6], [side * 20.1, 9.45, 0], "#cbc7b7");
  }
  box([36, 0.9, 5.3], [0, 9.1, 0]);
  box([36, 0.06, 4.6], [0, 9.58, 0], "#888477");
  for (const z of [-2.5, 2.5]) {
    box([36, 0.95, 0.3], [0, 10.025, z]);
    const side = Math.sign(z);
    quad(
      [-18, 10.5, side * 2.35],
      [-18, 10.5, side * 2.7],
      [18, 10.5, side * 2.35],
      [18, 10.5, side * 2.7],
      stone,
      side < 0,
    );
  }

  // The quieter gravel road descends into the landscape on both sides. It is
  // scenery, with no markings that could suggest a branch of the race course.
  const height = (d: number) =>
    9.55 * (1 - THREE.MathUtils.smoothstep(d, 24, 84));
  const path = (side: number, d: number): THREE.Vector3 =>
    // The outer approach skirts the existing crag instead of running into it.
    new THREE.Vector3(
      side * d,
      height(d),
      -(side > 0 ? 24 : 14) * THREE.MathUtils.smoothstep(d, 24, 84),
    );
  const edge = (side: number, d: number, offset: number, y: number): Point => {
    const p = path(side, d),
      tangent = path(side, d + 0.1)
        .sub(p)
        .setY(0)
        .normalize();
    return [p.x - tangent.z * offset, y, p.z + tangent.x * offset];
  };
  for (const side of [-1, 1]) {
    const road = [18, 24, 32, 42, 54, 68, 82, 94];
    const stations = road.slice(1);
    const bank = (d: number, band: number): Point => {
      const t = (d - 24) / 70,
        h = height(d);
      const spread = 9 + (7 + Math.sin(d * 0.37) * 1.2) * Math.sin(t * Math.PI);
      const offsets = [-spread, -5.5, -3.1, 3.1, 6.5, spread * 1.1];
      const elevations = [
        -0.12,
        h * (0.72 + 0.08 * Math.sin(d * 0.4 + side)),
        h + 0.01,
        h + 0.01,
        h * (0.78 + 0.08 * Math.cos(d * 0.21)),
        -0.12,
      ];
      return edge(side, d, offsets[band], elevations[band]);
    };
    for (let i = 0; i < stations.length - 1; i++) {
      for (let band = 0; band < 5; band++) {
        const tone =
          band === 0 || band === 4 ? (i < 2 ? rock : "#71865a") : grass;
        quad(
          bank(stations[i], band),
          bank(stations[i], band + 1),
          bank(stations[i + 1], band),
          bank(stations[i + 1], band + 1),
          tone,
        );
      }
    }
    // Sloped rock faces blend the earthworks into the masonry wing walls.
    for (let band = 0; band < 5; band++) {
      const a = bank(24, band),
        b = bank(24, band + 1);
      quad([side * 16.4, -0.12, a[2]], [side * 16.4, -0.12, b[2]], a, b, rock);
    }
    for (let i = 0; i < road.length - 1; i++) {
      const d = road[i],
        next = road[i + 1];
      const fade = (at: number) => THREE.MathUtils.smoothstep(at, 68, 94);
      const halfWidth = (at: number) => 2.2 * (1 - fade(at) * 0.85);
      const surface = quad(
        edge(side, d, -halfWidth(d), height(d) + 0.06),
        edge(side, d, halfWidth(d), height(d) + 0.06),
        edge(side, next, -halfWidth(next), height(next) + 0.06),
        edge(side, next, halfWidth(next), height(next) + 0.06),
        "#888477",
      );
      const colors = surface.getAttribute("color");
      for (let vertex = 0; vertex < 6; vertex++) {
        const at = vertex === 0 || vertex === 1 || vertex === 4 ? d : next;
        const tint = new THREE.Color("#888477")
          .lerp(new THREE.Color(grass), fade(at))
          .multiplyScalar(rain ? 0.77 : 1);
        colors.setXYZ(vertex, tint.r, tint.g, tint.b);
      }
      if (d >= 54) continue;
      for (const offset of [-2.5, 2.5]) {
        const a = new THREE.Vector3(...edge(side, d, offset, height(d))),
          b = new THREE.Vector3(...edge(side, next, offset, height(next)));
        const delta = b.clone().sub(a),
          length = delta.length();
        const turn = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(1, 0, 0),
          delta.normalize(),
        );
        const midpoint = a.clone().add(b).multiplyScalar(0.5);
        // Coping and walls follow the slope, with their bases sunk into the bank.
        add(
          new THREE.BoxGeometry(length + 0.04, 0.85, 0.42).applyQuaternion(
            turn,
          ),
          stone,
          midpoint
            .clone()
            .add(new THREE.Vector3(0, 0.45, 0))
            .toArray() as Point,
        );
        add(
          new THREE.BoxGeometry(length + 0.08, 0.16, 0.56).applyQuaternion(
            turn,
          ),
          "#d0cbbb",
          midpoint
            .clone()
            .add(new THREE.Vector3(0, 0.95, 0))
            .toArray() as Point,
        );
      }
    }
  }
  const geometry = mergeWorldParts(parts);
  geometry.computeBoundingSphere();
  return geometry;
}

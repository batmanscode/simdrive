import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  mergeWorldParts,
  worldPart,
  WorldInstances,
  type WorldInstance,
} from "./WorldInstances";

export type PlantKind = "cherry" | "pine" | "palm" | "mangrove";
export type Plant = {
  position: [number, number, number];
  seed: number;
  heading?: number;
  scale?: number;
  lean?: number;
};
const random = (n: number) => {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const colors: Record<PlantKind, [string, string, string]> = {
  cherry: ["#efb0c3", "#bc8d9e", "#685040"],
  pine: ["#41634e", "#344f45", "#62503c"],
  palm: ["#4f8057", "#3f6550", "#92734c"],
  mangrove: ["#577550", "#425e4c", "#6b5740"],
};

export function Vegetation({
  kind,
  plants,
  rain,
  castShadow = true,
  distant = false,
}: {
  kind: PlantKind;
  plants: Plant[];
  rain: boolean;
  castShadow?: boolean;
  distant?: boolean;
}) {
  const geometry = useMemo(() => makePlant(kind, distant), [kind, distant]);
  const uniforms = useMemo(
    () => ({ plantTime: { value: 0 }, plantWind: { value: 1 } }),
    [],
  );
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );
  const materials = useMemo(() => {
    const wood = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    });
    const leaves = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      flatShading: true,
    });
    leaves.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float plantTime; uniform float plantWind;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec3 plantRoot=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
          float bend=smoothstep(1.3,4.3,position.y)*plantWind;
          transformed.x+=sin(plantTime*1.05+plantRoot.x*.07+plantRoot.z*.11)*bend*.055;
          transformed.z+=sin(plantTime*.79+plantRoot.z*.09)*bend*.035;`,
        );
    };
    leaves.customProgramCacheKey = () => "motorsport-foliage-v1";
    return { wood, leaves };
  }, [uniforms]);
  const placements = useMemo(() => {
    const palette = colors[kind];
    const wood: WorldInstance[] = [],
      leaves: WorldInstance[] = [];
    for (const p of plants) {
      const size = p.scale ?? 1,
        spread = 0.92 + random(p.seed * 3) * 0.16;
      const height =
        kind === "cherry"
          ? (2.8 + random(p.seed * 11) * 0.9) / 3.35
          : kind === "pine"
            ? (3 + random(p.seed * 13) * 1.1) / 4
            : kind === "palm"
              ? (4.9 + random(p.seed * 13) * 1.7) / 3.7
              : 0.85 + random(p.seed * 7) * 0.3;
      const transform = {
        position: p.position,
        rotation: [
          0,
          p.heading ?? random(p.seed * 19) * Math.PI * 2,
          p.lean ?? 0,
        ] as [number, number, number],
        scale: [size * spread, size * height, size * spread] as [
          number,
          number,
          number,
        ],
      };
      const tone = 0.94 + random(p.seed * 29) * 0.13;
      const leaf = new THREE.Color(palette[rain ? 1 : 0]).multiplyScalar(tone);
      const bark = new THREE.Color(palette[2]).multiplyScalar(
        rain ? 0.72 : 0.92 + random(p.seed * 31) * 0.12,
      );
      wood.push({ ...transform, color: "#" + bark.getHexString() });
      leaves.push({ ...transform, color: "#" + leaf.getHexString() });
    }
    return { wood, leaves };
  }, [kind, plants, rain]);
  useFrame(({ clock }) => {
    uniforms.plantTime.value = clock.elapsedTime;
    uniforms.plantWind.value = reduced.matches ? 0 : rain ? 1.3 : 1;
  });
  useEffect(
    () => () => {
      geometry.wood.dispose();
      geometry.leaves.dispose();
    },
    [geometry],
  );
  useEffect(
    () => () => {
      materials.wood.dispose();
      materials.leaves.dispose();
    },
    [materials],
  );
  return (
    <group>
      <WorldInstances
        geometry={geometry.wood}
        material={materials.wood}
        instances={placements.wood}
        castShadow={castShadow}
      />
      <WorldInstances
        geometry={geometry.leaves}
        material={materials.leaves}
        instances={placements.leaves}
        castShadow={castShadow}
      />
    </group>
  );
}

function makePlant(kind: PlantKind, distant: boolean) {
  const wood: THREE.BufferGeometry[] = [],
    leaves: THREE.BufferGeometry[] = [];
  const branch = (
    a: [number, number, number],
    b: [number, number, number],
    width: number,
  ) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      direction = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(
      width * 0.55,
      width,
      direction.length(),
      5,
    );
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      ),
    );
    wood.push(
      worldPart(
        g,
        start.add(end).multiplyScalar(0.5).toArray() as [
          number,
          number,
          number,
        ],
      ),
    );
  };
  if (kind === "cherry") {
    branch([0, 0, 0], [0.08, 1.8, 0.03], 0.19);
    for (const [x, y, z] of [
      [-1.0, 3.0, 0.2],
      [1.04, 2.85, -0.15],
      [0.1, 3.15, -0.8],
    ])
      branch([0.08, 1.45, 0.03], [x, y, z], 0.11);
    for (const [i, p] of [
      [-0.95, 3.15, 0.12],
      [0.98, 3.0, -0.12],
      [0.08, 3.43, -0.58],
      [0.08, 3.28, 0.62],
      [0, 3.62, 0],
    ].entries()) {
      leaves.push(
        worldPart(
          new THREE.IcosahedronGeometry(1, !distant && i % 3 === 0 ? 1 : 0),
          p as [number, number, number],
          [0, i * 0.7, 0],
          [1.0, 0.62, 0.88],
          0.88 + i * 0.045,
        ),
      );
    }
  } else if (kind === "pine") {
    branch([0, 0, 0], [0, 2.5, 0], 0.14);
    for (let layer = 0; layer < 3; layer++) {
      const r = 1.22 - layer * 0.27,
        y = 1.15 + layer * 0.72,
        h = 1.4 - layer * 0.12,
        positions: number[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 + layer * 0.32,
          next = ((i + 1) * Math.PI) / 5 + layer * 0.32;
        const a = [
          Math.sin(angle) * r * (i % 2 ? 0.72 : 1),
          y + (i % 2 ? 0.12 : -0.12),
          Math.cos(angle) * r * (i % 2 ? 0.72 : 1),
        ];
        const j = (i + 1) % 10,
          b = [
            Math.sin(next) * r * (j % 2 ? 0.72 : 1),
            y + (j % 2 ? 0.12 : -0.12),
            Math.cos(next) * r * (j % 2 ? 0.72 : 1),
          ];
        positions.push(...a, ...b, 0, y + h, 0, ...b, ...a, 0, y + 0.12, 0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.computeVertexNormals();
      leaves.push(
        worldPart(g, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.88 + layer * 0.07),
      );
    }
  } else if (kind === "palm") {
    const trunk = new THREE.CylinderGeometry(0.11, 0.21, 3.7, 6, 4),
      p = trunk.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 1.85;
      p.setXYZ(i, p.getX(i) + 0.22 * (y / 3.7) ** 2, y, p.getZ(i));
    }
    trunk.computeVertexNormals();
    wood.push(worldPart(trunk, [0, 0, 0]));
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7,
        positions: number[] = [];
      const ring = (t: number) => {
        const width = Math.sin(Math.PI * t) * 0.31 + 0.025,
          y = 3.7 + Math.sin(t * Math.PI) * 0.28 - t * t * 0.62,
          z = t * 2.18;
        return [
          [-width, y - 0.035, z],
          [0, y + 0.025, z],
          [width, y - 0.035, z],
        ];
      };
      for (let j = 0; j < 4; j++) {
        const a = ring(j / 4),
          b = ring((j + 1) / 4);
        for (let k = 0; k < 3; k++) {
          const n = (k + 1) % 3;
          positions.push(...a[k], ...b[k], ...b[n], ...a[k], ...b[n], ...a[n]);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.computeVertexNormals();
      leaves.push(
        worldPart(
          g,
          [0.22, 0, 0],
          [0, angle, 0],
          [1, 1, 1],
          0.86 + (i % 3) * 0.08,
        ),
      );
    }
  } else {
    branch([0, 0.1, 0], [0, 1.45, 0], 0.12);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      branch(
        [Math.sin(a) * 0.8, 0, Math.cos(a) * 0.7],
        [Math.sin(a) * 0.25, 0.9, Math.cos(a) * 0.22],
        0.065,
      );
    }
    for (const [i, p] of [
      [-0.66, 1.42, 0.12],
      [0.5, 1.6, -0.18],
      [0.82, 1.22, 0.45],
    ].entries())
      leaves.push(
        worldPart(
          new THREE.IcosahedronGeometry(0.9, 0),
          p as [number, number, number],
          [0, i * 0.8, 0],
          [1, 0.69, 0.86],
          0.87 + i * 0.07,
        ),
      );
  }
  return { wood: mergeWorldParts(wood), leaves: mergeWorldParts(leaves) };
}

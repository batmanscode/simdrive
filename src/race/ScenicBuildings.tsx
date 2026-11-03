import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeWorldParts, worldPart } from "./WorldInstances";

type House = { x: number; z: number; angle: number; color: string };

/** Small authored landmarks, baked into four meshes rather than one draw per plank. */
export function ScenicBuildings({
  position,
  heading,
  rain,
  alpine = false,
}: {
  position: [number, number, number];
  heading: number;
  rain: boolean;
  alpine?: boolean;
}) {
  const geometry = useMemo(() => {
    const masonry: THREE.BufferGeometry[] = [],
      timber: THREE.BufferGeometry[] = [],
      trim: THREE.BufferGeometry[] = [],
      glass: THREE.BufferGeometry[] = [];
    let house: House = { x: 0, z: 0, angle: 0, color: "#87583d" };
    const place = (
      part: THREE.BufferGeometry,
      color: string,
      target: THREE.BufferGeometry[],
    ) => {
      const tint = new THREE.Color(color).multiplyScalar(rain ? 0.79 : 1);
      const count = part.getAttribute("position").count,
        colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
      part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      part.rotateY(house.angle);
      part.translate(house.x, 0, house.z);
      target.push(part);
    };
    const box = (
      at: [number, number, number],
      size: [number, number, number],
      color: string,
      target: THREE.BufferGeometry[],
      rotation: [number, number, number] = [0, 0, 0],
    ) =>
      place(
        worldPart(new THREE.BoxGeometry(...size), at, rotation),
        color,
        target,
      );
    const houses: House[] = alpine
      ? [house]
      : [-3.8, -1.25, 1.35, 3.9].map((x, i) => ({
          x,
          z: i % 2 === 0 ? 0.85 : -0.78,
          angle: (i - 1.5) * 0.13,
          color: ["#a4473e", "#bc6552", "#a4473e", "#ceaf7a"][i],
        }));
    for (house of houses) {
      box([0, 0.12, 0], [1.84, 0.24, 1.47], "#8c9386", masonry);
      box([0, 0.79, 0], [1.8, 1.32, 1.44], house.color, timber);
      // A true gable prism fills the triangular wall beneath the roof.
      const shape = new THREE.Shape();
      shape.moveTo(-0.9, 1.4);
      shape.lineTo(0.9, 1.4);
      shape.lineTo(0, 2.08);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: 1.44,
        bevelEnabled: false,
      });
      g.translate(0, 0, -0.72);
      place(worldPart(g, [0, 0, 0]), house.color, timber);
      const angle = Math.atan2(0.72, 1.05),
        length = Math.hypot(0.72, 1.05);
      for (const side of [-1, 1]) {
        box([side * 0.525, 1.76, 0], [length, 0.1, 1.83], "#303d42", trim, [
          0,
          0,
          -side * angle,
        ]);
        if (alpine)
          box(
            [side * 0.525, 1.82, 0],
            [length, 0.055, 1.84],
            "#ecf1e9",
            masonry,
            [0, 0, -side * angle],
          );
        // Cream corner boards and a few broad siding seams retain detail at driving distance.
        for (const z of [-0.74, 0.74])
          box([side * 0.875, 0.82, z], [0.075, 1.4, 0.06], "#ded6bd", timber);
        for (const y of [0.4, 0.7, 1.0, 1.3])
          box(
            [0, y, side * 0.727],
            [1.73, 0.018, 0.012],
            alpine ? "#634535" : "#874136",
            timber,
          );
        for (const z of [-0.28, 0.32]) {
          box([side * 0.91, 0.92, z], [0.035, 0.43, 0.38], "#d6ceb5", timber);
          box([side * 0.934, 0.92, z], [0.012, 0.32, 0.27], "#f1c784", glass);
          box([side * 0.943, 0.92, z], [0.015, 0.32, 0.025], "#d6ceb5", timber);
        }
      }
      for (const z of [-0.748, 0.748]) {
        for (const x of [-0.54, 0.54]) {
          box([x, 0.94, z], [0.43, 0.43, 0.035], "#ded6bd", timber);
          box([x, 0.94, z * 1.028], [0.32, 0.32, 0.015], "#f4ce8b", glass);
          box([x, 0.94, z * 1.04], [0.025, 0.33, 0.015], "#e5d9ba", timber);
        }
      }
      box([0, 0.54, -0.756], [0.33, 0.83, 0.06], "#394948", trim);
      box([0.105, 0.54, -0.793], [0.025, 0.025, 0.02], "#d8bd7d", timber);
      box([0, 0.18, -0.94], [1.88, 0.1, 0.4], "#705742", timber);
      box([0.49, 1.95, 0.27], [0.22, 0.55, 0.23], "#7d7970", masonry);
      box([0.49, 2.24, 0.27], [0.29, 0.07, 0.29], "#3b4242", trim);
    }
    if (!alpine) {
      house = { x: 0, z: 0, angle: 0, color: "#705742" };
      for (let i = 0; i < 16; i++)
        box(
          [-4.25 + i * 0.58, 0.055, -2.35],
          [0.54, 0.09, 0.82],
          "#77614a",
          timber,
        );
      for (const x of [-3.2, -1.05, 1.1, 3.25])
        box([x, 0.46, -3.08], [0.14, 0.86, 0.14], "#534535", timber);
    }
    return [masonry, timber, trim, glass].map(mergeWorldParts);
  }, [rain, alpine]);
  useEffect(() => () => geometry.forEach((g) => g.dispose()), [geometry]);
  return (
    <group
      position={position}
      rotation={[0, heading, 0]}
      scale={alpine ? [1.34 * 1.95, 1.34 * 1.12, 1.34 * 1.63] : [1.5, 1.5, 1.5]}
    >
      {geometry.map((g, i) => (
        <mesh key={i} geometry={g} castShadow={i !== 3} receiveShadow={i !== 3}>
          <meshStandardMaterial
            vertexColors
            roughness={i === 3 ? 0.45 : 0.87}
            emissive={i === 3 ? "#d99b4c" : "#000000"}
            emissiveIntensity={i === 3 ? (rain ? 0.38 : 0.12) : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { WorldInstances, type WorldInstance } from "./WorldInstances";

export type RailSection = {
  position: [number, number, number];
  heading: number;
  length: number;
};

/** Repeated rail sections share one box mesh per visible world cell. */
export function BridgeRailing({
  sections,
  rain,
}: {
  sections: RailSection[];
  rain: boolean;
}) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.74 }),
    [],
  );
  const instances = useMemo(
    () =>
      sections.flatMap((section) => {
        const result: WorldInstance[] = [];
        const box = (
          y: number,
          z: number,
          scale: [number, number, number],
          color: string,
        ) =>
          result.push({
            position: [
              section.position[0] + Math.sin(section.heading) * z,
              section.position[1] + y,
              section.position[2] + Math.cos(section.heading) * z,
            ],
            rotation: [0, section.heading, 0],
            scale,
            color,
          });
        box(
          0.28,
          0,
          [0.34, 0.56, section.length],
          rain ? "#aab2ad" : "#d4d2c5",
        );
        box(0.6, 0, [0.4, 0.08, section.length], rain ? "#dbe4e2" : "#fff8e4");
        const count = Math.max(3, Math.min(9, Math.round(section.length / 9)));
        for (let i = 0; i < count; i++)
          box(
            0.88,
            -section.length / 2 + (section.length * i) / (count - 1),
            [0.12, 0.54, 0.12],
            rain ? "#48545a" : "#4d565b",
          );
        return result;
      }),
    [sections, rain],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return (
    <WorldInstances
      geometry={geometry}
      material={material}
      instances={instances}
    />
  );
}

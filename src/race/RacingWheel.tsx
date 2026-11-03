import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Four draws, with both rim faces merged. Every wheel rolls about the same axle. */
export function RacingWheel({
  radius,
  width,
  distance,
  side,
  steer = 0,
  hub = "#434b50",
  stripe = "#eee5d2",
}: {
  radius: number;
  width: number;
  distance: number;
  side: number;
  steer?: number;
  hub?: string;
  stripe?: string;
}) {
  const geometry = useMemo(() => {
    const h = width / 2;
    const profile = [
      [0.68, -1],
      [0.94, -1],
      [1, -0.74],
      [1, 0.74],
      [0.94, 1],
      [0.68, 1],
      [0.68, -1],
    ];
    const tire = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(radius * r, h * y)),
      20,
    );
    tire.rotateZ(Math.PI / 2);
    const parts: THREE.BufferGeometry[] = [];
    for (const face of [-1, 1]) {
      const x = face * (h + 0.004);
      const tint = new THREE.Color(face === side ? "#e1e5df" : "#718087");
      const addRimPart = (part: THREE.BufferGeometry) => {
        const colors = new Float32Array(
          part.getAttribute("position").count * 3,
        );
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = tint.r;
          colors[i + 1] = tint.g;
          colors[i + 2] = tint.b;
        }
        part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        parts.push(part);
      };
      const ring = new THREE.RingGeometry(radius * 0.5, radius * 0.69, 20);
      ring.rotateY((face * Math.PI) / 2);
      ring.translate(x, 0, 0);
      addRimPart(ring);
      const cap = new THREE.CylinderGeometry(
        radius * 0.16,
        radius * 0.16,
        0.014,
        10,
      );
      cap.rotateZ(Math.PI / 2);
      cap.translate(x, 0, 0);
      addRimPart(cap);
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const spoke = new THREE.BoxGeometry(
          0.012,
          radius * 0.105,
          radius * 0.6,
        );
        spoke.rotateX(-angle);
        spoke.translate(
          x,
          Math.sin(angle) * radius * 0.28,
          Math.cos(angle) * radius * 0.28,
        );
        addRimPart(spoke);
      }
    }
    const rim = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    return { tire, rim };
  }, [radius, width, side]);
  useEffect(
    () => () => {
      geometry.tire.dispose();
      geometry.rim.dispose();
    },
    [geometry],
  );
  return (
    <group rotation={[0, steer, 0]}>
      <group rotation={[distance / radius, 0, 0]}>
        <mesh geometry={geometry.tire} castShadow>
          <meshStandardMaterial color="#292f33" roughness={0.94} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[radius * 0.57, radius * 0.57, width * 0.88, 16]}
          />
          <meshStandardMaterial color={hub} roughness={0.44} metalness={0.24} />
        </mesh>
        <mesh geometry={geometry.rim}>
          <meshStandardMaterial vertexColors roughness={0.3} metalness={0.3} />
        </mesh>
        <mesh position={[side * (width / 2 + 0.001), radius * 0.86, 0]}>
          <boxGeometry args={[0.002, radius * 0.13, radius * 0.075]} />
          <meshStandardMaterial color={stripe} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

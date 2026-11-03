import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type SkidMark = {
  x: number;
  y: number;
  z: number;
  heading: number;
  opacity: number;
};

// Match PlaneGeometry(0.18, 1.35), including its triangle winding.
const CORNERS = [
  -0.09, 0.675, -0.09, -0.675, 0.09, 0.675, -0.09, -0.675, 0.09, -0.675, 0.09,
  0.675,
];
const ORIGIN = { x: 0, y: 0, z: 0 };

export function createSkidGeometry(capacity = 140) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(capacity * 18), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(
      new Float32Array(capacity * 24).fill(1),
      4,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  const normals = new Float32Array(capacity * 18);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.boundingBox = new THREE.Box3();
  geometry.boundingSphere = new THREE.Sphere();
  geometry.setDrawRange(0, 0);
  return geometry;
}

/** Update bounded buffers only when new marks arrive; the road height is already sampled. */
export function updateSkidGeometry(
  geometry: THREE.BufferGeometry,
  marks: readonly SkidMark[],
  origin = ORIGIN,
) {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
  const count = Math.min(marks.length, positions.count / 6);
  const start = marks.length - count;
  const bounds = geometry.boundingBox!;
  bounds.makeEmpty();
  for (let i = 0; i < count; i++) {
    const mark = marks[start + i],
      c = Math.cos(mark.heading),
      s = Math.sin(mark.heading);
    const x = mark.x - origin.x,
      y = mark.y - origin.y,
      z = mark.z - origin.z;
    bounds.min.x = Math.min(bounds.min.x, x);
    bounds.min.y = Math.min(bounds.min.y, y);
    bounds.min.z = Math.min(bounds.min.z, z);
    bounds.max.x = Math.max(bounds.max.x, x);
    bounds.max.y = Math.max(bounds.max.y, y);
    bounds.max.z = Math.max(bounds.max.z, z);
    for (let vertex = 0; vertex < 6; vertex++) {
      const u = CORNERS[vertex * 2],
        v = CORNERS[vertex * 2 + 1],
        index = i * 6 + vertex;
      positions.setXYZ(index, x + u * c + v * s, y, z + u * s - v * c);
      colors.setXYZW(index, 1, 1, 1, mark.opacity);
    }
  }
  if (count) {
    // The half diagonal is <0.69 m; padding also covers float buffer rounding.
    bounds.min.x -= 0.7;
    bounds.max.x += 0.7;
    bounds.min.z -= 0.7;
    bounds.max.z += 0.7;
    bounds.min.y -= 0.01;
    bounds.max.y += 0.01;
    bounds.getBoundingSphere(geometry.boundingSphere!);
  } else {
    bounds.set(new THREE.Vector3(), new THREE.Vector3());
    geometry.boundingSphere!.set(new THREE.Vector3(), 0);
  }
  geometry.setDrawRange(0, count * 6);
  positions.clearUpdateRanges();
  positions.addUpdateRange(0, count * 18);
  positions.needsUpdate = true;
  colors.clearUpdateRanges();
  colors.addUpdateRange(0, count * 24);
  colors.needsUpdate = true;
}

export function SkidMarkBatch({ marks }: { marks: readonly SkidMark[] }) {
  const mesh = useRef<THREE.Mesh>(null);
  // Keep the original solo maximum allocated, including during solo/split transitions.
  const geometry = useMemo(() => createSkidGeometry(), []);
  useLayoutEffect(() => {
    const origin = marks[marks.length - 1] ?? ORIGIN;
    updateSkidGeometry(geometry, marks, origin);
    mesh.current?.position.set(origin.x, origin.y, origin.z);
  }, [geometry, marks]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      visible={marks.length > 0}
      renderOrder={-1}
    >
      {/* Road decals stay behind transparent cars and tire wakes. */}
      <meshBasicMaterial
        color="#050608"
        vertexColors
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        forceSinglePass
      />
    </mesh>
  );
}

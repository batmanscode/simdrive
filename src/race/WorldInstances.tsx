import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type WorldInstance = {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
};

/** Small world cells retain frustum culling, including on stacked mountain roads. */
export function WorldInstances({
  geometry,
  material,
  instances,
  castShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instances: WorldInstance[];
  castShadow?: boolean;
}) {
  const chunks = useMemo(() => {
    const cells = new Map<
      string,
      { origin: [number, number, number]; items: WorldInstance[] }
    >();
    for (const item of instances) {
      const origin: [number, number, number] = [
        Math.floor(item.position[0] / 32) * 32,
        Math.floor(item.position[1] / 32) * 32,
        Math.floor(item.position[2] / 32) * 32,
      ];
      const key = origin.join(":");
      if (!cells.has(key)) cells.set(key, { origin, items: [] });
      cells.get(key)!.items.push(item);
    }
    return [...cells.entries()];
  }, [instances]);
  return (
    <group>
      {chunks.map(([key, cell]) => (
        <WorldChunk
          key={key}
          {...cell}
          geometry={geometry}
          material={material}
          castShadow={castShadow}
        />
      ))}
    </group>
  );
}

function WorldChunk({
  origin,
  items,
  geometry,
  material,
  castShadow,
}: {
  origin: [number, number, number];
  items: WorldInstance[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D(),
      color = new THREE.Color();
    items.forEach((item, i) => {
      dummy.position.set(
        item.position[0] - origin[0],
        item.position[1] - origin[1],
        item.position[2] - origin[2],
      );
      dummy.rotation.set(...(item.rotation ?? [0, 0, 0]));
      dummy.scale.set(...(item.scale ?? [1, 1, 1]));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
      mesh.current!.setColorAt(i, color.set(item.color ?? "#ffffff"));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    if (mesh.current.boundingSphere) mesh.current.boundingSphere.radius += 0.3;
    mesh.current.updateWorldMatrix(true, false);
  }, [geometry, material, items, origin]);
  const center = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, scene }) => {
    const object = mesh.current;
    if (!object?.boundingSphere) return;
    if (!(scene.fog instanceof THREE.Fog)) {
      object.visible = true;
      return;
    }
    // Linear fog uses view depth. A whole cell beyond opaque fog cannot contribute
    // to the picture; retain the full sphere (including wind) to avoid edge popping.
    center
      .copy(object.boundingSphere.center)
      .applyMatrix4(object.matrixWorld)
      .applyMatrix4(camera.matrixWorldInverse);
    const radius =
      object.boundingSphere.radius * object.matrixWorld.getMaxScaleOnAxis();
    object.visible = -center.z - radius <= scene.fog.far;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, items.length]}
      position={origin}
      castShadow={castShadow}
    />
  );
}

/** Parts are baked once; materials use vertex color rather than separate tiny meshes. */
export function worldPart(
  geometry: THREE.BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  tint = 1,
) {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  part.deleteAttribute("uv");
  const object = new THREE.Object3D();
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.scale.set(...scale);
  object.updateMatrix();
  part.applyMatrix4(object.matrix);
  if (!part.getAttribute("normal")) part.computeVertexNormals();
  const colors = new Float32Array(part.getAttribute("position").count * 3).fill(
    tint,
  );
  part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return part;
}

export function mergeWorldParts(parts: THREE.BufferGeometry[]) {
  const result = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return result;
}

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake fixed detail and colour into one draw, rather than separate trim meshes. */
function bake(parts: [THREE.BufferGeometry, string][]) {
  const tinted = parts.map(([source, color]) => {
    const part = source.index ? source.toNonIndexed() : source;
    if (part !== source) source.dispose();
    const tint = new THREE.Color(color);
    const colors = new Float32Array(part.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = tint.r;
      colors[i + 1] = tint.g;
      colors[i + 2] = tint.b;
    }
    part.deleteAttribute("uv");
    part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return part;
  });
  const result = mergeGeometries(tinted)!;
  for (const part of tinted) part.dispose();
  result.computeBoundingSphere();
  return result;
}

function DetailMesh({
  geometry,
  roughness = 0.4,
  metalness = 0.16,
}: {
  geometry: THREE.BufferGeometry;
  roughness?: number;
  metalness?: number;
}) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial
        vertexColors
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

function profileGeometry(
  points: readonly (readonly [number, number])[],
  width: number,
) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) =>
    i ? shape.lineTo(-z, y) : shape.moveTo(-z, y),
  );
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-width / 2, 0, 0);
  return geometry;
}

export function Aerofoil({
  width,
  chord,
  height,
  color,
}: {
  width: number;
  chord: number;
  height: number;
  color: string;
}) {
  const geometry = useMemo(() => {
    const points: [number, number][] = [
      [-0.5, -0.18],
      [-0.42, 0.3],
      [-0.12, 0.5],
      [0.33, 0.2],
      [0.5, -0.08],
      [0.3, -0.32],
      [-0.24, -0.5],
    ].map(([z, y]) => [z * chord, y * height]);
    return bake([
      [profileGeometry(points, width * 0.8), color],
      [
        profileGeometry(points, width * 0.1).translate(width * 0.45, 0, 0),
        "#eee6d3",
      ],
      [
        profileGeometry(points, width * 0.1).translate(-width * 0.45, 0, 0),
        "#eee6d3",
      ],
    ]);
  }, [width, chord, height, color]);
  return <DetailMesh geometry={geometry} roughness={0.32} />;
}

export function TruckWheelArch({ color }: { color: string }) {
  const geometry = useMemo(() => {
    const steps = 10;
    const band = (inner: number, outer: number, width: number) => {
      const points: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const angle = -0.15 + ((Math.PI + 0.3) * i) / steps;
        points.push([Math.cos(angle) * outer, Math.sin(angle) * outer]);
      }
      for (let i = steps; i >= 0; i--) {
        const angle = -0.15 + ((Math.PI + 0.3) * i) / steps;
        points.push([Math.cos(angle) * inner, Math.sin(angle) * inner]);
      }
      return profileGeometry(points, width);
    };
    return bake([
      [band(0.35, 0.375, 0.27), "#39434a"],
      [band(0.375, 0.43, 0.24), color],
    ]);
  }, [color]);
  return <DetailMesh geometry={geometry} />;
}

export function KartEngine() {
  const geometry = useMemo(() => {
    const parts: [THREE.BufferGeometry, string][] = [];
    parts.push([new THREE.BoxGeometry(0.32, 0.24, 0.3), "#687b82"]);
    for (let i = 0; i < 5; i++) {
      parts.push([
        new THREE.BoxGeometry(0.36, 0.012, 0.34).translate(
          0,
          -0.08 + i * 0.043,
          0,
        ),
        "#b5c3c1",
      ]);
    }
    const cover = new THREE.CylinderGeometry(0.105, 0.105, 0.16, 12);
    cover.rotateZ(Math.PI / 2);
    cover.translate(0.2, 0.04, 0);
    parts.push([cover, "#45535a"]);
    parts.push([
      new THREE.BoxGeometry(0.22, 0.025, 0.2).translate(0, 0.13, 0),
      "#28353b",
    ]);
    return bake(parts);
  }, []);
  return <DetailMesh geometry={geometry} roughness={0.46} metalness={0.24} />;
}

export function KartSeat() {
  const geometry = useMemo(() => {
    const shell = profileGeometry(
      [
        [-0.32, 0.14],
        [0.25, 0.14],
        [0.22, 0.23],
        [-0.15, 0.24],
        [-0.23, 0.54],
        [-0.34, 0.55],
        [-0.38, 0.45],
      ],
      0.54,
    );
    const pad = profileGeometry(
      [
        [-0.18, 0.235],
        [0.2, 0.235],
        [0.18, 0.26],
        [-0.16, 0.27],
        [-0.23, 0.49],
        [-0.26, 0.49],
      ],
      0.43,
    );
    for (const part of [shell, pad]) {
      const positions = part.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const taper = 1 - Math.max(0, positions.getY(i) - 0.28) * 0.85;
        positions.setX(i, positions.getX(i) * taper);
      }
      part.computeVertexNormals();
    }
    pad.translate(0, 0.015, 0.045);
    return bake([
      [shell, "#687d80"],
      [pad, "#303a40"],
    ]);
  }, []);
  return <DetailMesh geometry={geometry} roughness={0.86} metalness={0} />;
}

/** Painted sky/ground reflection: no texture, extra pass, or environment map. */
export function RacingGlass({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const geometry = useMemo(() => {
    const result = new THREE.PlaneGeometry(width, height, 1, 3);
    const positions = result.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    const sky = new THREE.Color("#7195a3"),
      ground = new THREE.Color("#223e4c");
    for (let i = 0; i < positions.count; i++) {
      const t = positions.getY(i) / height + 0.5;
      const tint = ground.clone().lerp(sky, t > 0.65 ? 1 : t * 0.65);
      colors.set([tint.r, tint.g, tint.b], i * 3);
    }
    result.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return result;
  }, [width, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors />
    </mesh>
  );
}

export function TukHeadlamp() {
  const geometry = useMemo(() => {
    const housing = new THREE.CylinderGeometry(0.103, 0.09, 0.06, 16);
    housing.rotateX(Math.PI / 2);
    const rim = new THREE.TorusGeometry(0.094, 0.012, 6, 20);
    rim.translate(0, 0, 0.034);
    const lens = new THREE.SphereGeometry(0.088, 16, 8);
    lens.scale(1, 1, 0.3);
    lens.translate(0, 0, 0.035);
    return bake([
      [housing, "#46575d"],
      [rim, "#bac8c1"],
      [lens, "#fff1c2"],
    ]);
  }, []);
  return <DetailMesh geometry={geometry} roughness={0.32} />;
}

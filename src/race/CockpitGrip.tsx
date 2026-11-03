import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CockpitStyle } from "../shared/types";

type Grip = "formula" | "wheel" | "bar";
type Triple = [number, number, number];

/** A closed grip with baked seams/pads: one draw per glove or paw. */
export function CockpitGrip({
  style,
  side,
  grip,
}: {
  style: Exclude<CockpitStyle, "none">;
  side: -1 | 1;
  grip: Grip;
}) {
  const geometry = useMemo(() => {
    const paw = style === "paws";
    const radius = grip === "formula" ? 0.032 : grip === "bar" ? 0.042 : 0.035;
    const width = grip === "wheel" ? 0.15 : 0.112;
    const size = width / 0.15;
    const parts: THREE.BufferGeometry[] = [];
    const glove = "#e7e2d2",
      trim = "#364a55";
    const add = (
      source: THREE.BufferGeometry,
      color: string,
      position: Triple = [0, 0, 0],
      scale: Triple = [1, 1, 1],
      rotation: Triple = [0, 0, 0],
    ) => {
      source.scale(...scale);
      source.rotateX(rotation[0]);
      source.rotateY(rotation[1]);
      source.rotateZ(rotation[2]);
      source.translate(...position);
      const part = source.index ? source.toNonIndexed() : source;
      if (part !== source) source.dispose();
      part.deleteAttribute("uv");
      const tint = new THREE.Color(color);
      const colors = new Float32Array(part.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3)
        colors.set([tint.r, tint.g, tint.b], i);
      part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      parts.push(part);
    };
    const oval = (color: string, position: Triple, scale: Triple) =>
      add(new THREE.SphereGeometry(1, 10, 6), color, position, scale);
    const depth = radius + 0.017 * size;
    const finish = () => {
      const result = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
      result.computeBoundingSphere();
      return result;
    };
    if (paw) {
      // Restore the original cartoon paw silhouettes in a natural cat palette.
      // Bake their previous poses relative to the existing grip mount.
      const fur = "#e9ece7",
        toe = "#bec6c3",
        groove = "#7c8985";
      const pose = new THREE.Matrix4();
      const mount = new THREE.Matrix4();
      const setPose = (
        matrix: THREE.Matrix4,
        position: Triple,
        rotation: Triple,
      ) =>
        matrix.compose(
          new THREE.Vector3(...position),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
          new THREE.Vector3(1, 1, 1),
        );
      if (grip === "formula") {
        add(
          new THREE.SphereGeometry(0.11, 16, 10),
          fur,
          [0, 0, 0],
          [0.72, 0.5, 0.32],
        );
        for (const x of [-0.05, 0, 0.05])
          add(
            new THREE.SphereGeometry(0.022, 9, 6),
            toe,
            [x, 0.04, -0.035],
            [0.66, 0.42, 0.3],
          );
        add(
          new THREE.SphereGeometry(0.035, 10, 7),
          toe,
          [0, -0.018, -0.036],
          [0.92, 0.55, 0.28],
        );
        setPose(
          pose,
          [side * 0.255, -0.02, -0.055],
          [0.08, side * -0.12, side * -0.1],
        );
        setPose(mount, [side * 0.245, -0.01, -0.008], [0, 0, side * 0.12]);
      } else if (grip === "bar") {
        add(
          new THREE.SphereGeometry(0.1, 16, 10),
          fur,
          [0, 0, 0],
          [0.9, 0.52, 0.46],
        );
        for (const x of [-0.055, 0, 0.055])
          add(
            new THREE.SphereGeometry(0.02, 9, 6),
            toe,
            [x * 0.78, 0.044, -0.038],
            [0.72, 0.4, 0.3],
          );
        setPose(
          pose,
          [side * 0.36, 0.078, 0],
          [0.04, side * -0.08, side * -0.14],
        );
        setPose(mount, [side * 0.36, 0.06, 0.02], [0, 0, 0]);
      } else {
        add(
          new THREE.SphereGeometry(0.158, 20, 12),
          fur,
          [0, 0, 0],
          [1.38, 0.86, 0.72],
        );
        for (const x of [-0.076, 0, 0.076])
          add(
            new THREE.BoxGeometry(0.02, 0.145, 0.018),
            groove,
            [x, 0.044, -0.115],
            [1, 1.06, 1],
            [-0.12, 0, x * -1.45],
          );
        for (const x of [-0.11, -0.037, 0.037, 0.11])
          add(
            new THREE.SphereGeometry(0.026, 10, 6),
            toe,
            [x, 0.12 - Math.abs(x) * 0.04, -0.106],
            [1.1, 0.52, 0.34],
          );
        for (const x of [-0.108, 0.108])
          add(
            new THREE.SphereGeometry(0.048, 10, 8),
            fur,
            [x, -0.004, -0.034],
            [0.78, 0.58, 0.54],
          );
        setPose(pose, [side * 0.39, -0.018, -0.012], [0.16, 0, side * -0.28]);
        setPose(mount, [side * 0.42, 0, 0], [0, 0, 0]);
      }
      pose.premultiply(mount.invert());
      for (const part of parts) part.applyMatrix4(pose);
      return finish();
    }
    oval(
      glove,
      [0, -0.025 * size, -depth],
      [width * 0.52, 0.06 * size, 0.03 * size],
    );

    // Finger arcs curl around the actual grip radius, with their ends behind it.
    const digits = 4;
    for (let i = 0; i < digits; i++) {
      const x = (i - (digits - 1) / 2) * width * 0.235;
      const fingerRadius = width * 0.11;
      const reach = radius + fingerRadius * 0.7;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, -0.015 * size, -depth),
        new THREE.Vector3(x, reach * 0.8, -depth),
        new THREE.Vector3(x, reach + fingerRadius * 0.5, -0.004),
        new THREE.Vector3(x, reach * 0.65, radius + fingerRadius),
        new THREE.Vector3(x, -0.004, radius + fingerRadius * 0.7),
      ]);
      add(new THREE.TubeGeometry(curve, 6, fingerRadius, 6, false), glove);
      oval(
        glove,
        [x, -0.004, radius + fingerRadius * 0.7],
        [fingerRadius * 0.9, fingerRadius * 0.9, fingerRadius * 0.8],
      );
    }

    // A separate thumb closes the inner edge rather than sticking up.
    const thumbX = -side * width * 0.5;
    const thumbRadius = width * 0.115;
    const thumbReach = radius + thumbRadius * 0.8;
    const thumbTip: Triple = [thumbX, -0.01 * size, thumbReach];
    const thumb = new THREE.CatmullRomCurve3([
      new THREE.Vector3(thumbX * 0.85, -0.048 * size, -depth * 0.7),
      new THREE.Vector3(thumbX, -thumbReach, -radius * 0.12),
      new THREE.Vector3(thumbX, -thumbReach * 0.72, thumbReach * 0.72),
      new THREE.Vector3(...thumbTip),
    ]);
    add(new THREE.TubeGeometry(thumb, 6, thumbRadius, 7, false), glove);
    oval(glove, thumbTip, [thumbRadius, thumbRadius * 0.9, thumbRadius * 0.9]);

    const panel = new THREE.Shape();
    panel.moveTo(-width * 0.3, -0.025 * size);
    panel.lineTo(-width * 0.34, 0);
    panel.lineTo(-width * 0.25, 0.026 * size);
    panel.lineTo(width * 0.25, 0.026 * size);
    panel.lineTo(width * 0.34, 0);
    panel.lineTo(width * 0.3, -0.025 * size);
    panel.closePath();
    add(
      new THREE.ExtrudeGeometry(panel, {
        depth: 0.003 * size,
        bevelEnabled: false,
        steps: 1,
      }),
      "#8caaa5",
      [0, -0.025 * size, -depth - 0.026 * size],
      [1, 1, 1],
      [0, Math.PI, 0],
    );
    const cuff = (center: THREE.Vector3, towardHand: THREE.Vector3) => {
      const turn = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        towardHand,
      );
      const shell = new THREE.CylinderGeometry(
        width * 0.3,
        width * 0.28,
        0.028 * size,
        10,
      );
      shell.scale(1, 1, 0.5).applyQuaternion(turn);
      add(shell, trim, center.toArray() as Triple);
      const hem = new THREE.CylinderGeometry(
        width * 0.307,
        width * 0.307,
        0.005 * size,
        10,
      );
      hem.scale(1, 1, 0.5).applyQuaternion(turn);
      add(
        hem,
        "#d7ad65",
        center
          .clone()
          .addScaledVector(towardHand, 0.01 * size)
          .toArray() as Triple,
      );
    };
    if (grip !== "wheel")
      cuff(
        new THREE.Vector3(0, -0.092 * size, -depth * 0.75),
        new THREE.Vector3(0, 1, 0),
      );

    // A mirrored bar-to-vertical conversion puts the thumb above the finger row.
    for (const part of parts) {
      if (grip === "bar") part.rotateX(0.85);
      else {
        part.rotateZ((-side * Math.PI) / 2);
        part.rotateY(-side * 0.45);
      }
    }
    if (grip === "wheel") {
      // These wheels lie nearly flat: -Y is toward the driver's lap, +Z below
      // the rim. Fit the short wrist here instead of using the upright yoke pose.
      const root = new THREE.Vector3(side * 0.015, -0.025, -0.03);
      const end = new THREE.Vector3(side * 0.055, -0.085, 0.015);
      const axis = root.clone().sub(end).normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        axis,
      );
      const wrist = new THREE.SphereGeometry(1, 10, 6);
      wrist
        .scale(width * 0.27, root.distanceTo(end) * 0.65, width * 0.22)
        .applyQuaternion(turn);
      add(
        wrist,
        glove,
        root.clone().add(end).multiplyScalar(0.5).toArray() as Triple,
      );
      cuff(end, axis);
    }
    return finish();
  }, [style, side, grip]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        roughness={style === "paws" ? 0.98 : 0.86}
        metalness={0}
      />
    </mesh>
  );
}

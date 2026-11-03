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
    const fur = "#dfa976",
      toe = "#f2cca0",
      glove = "#e7e2d2",
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
    oval(
      paw ? fur : glove,
      [0, -0.025 * size, -depth],
      [width * (paw ? 0.57 : 0.52), 0.06 * size, (paw ? 0.038 : 0.03) * size],
    );

    // Finger arcs curl around the actual grip radius, with their ends behind it.
    const digits = paw ? 3 : 4;
    for (let i = 0; i < digits; i++) {
      const x = (i - (digits - 1) / 2) * width * (paw ? 0.31 : 0.235);
      const fingerRadius = width * (paw ? 0.17 : 0.11);
      const reach = radius + fingerRadius * 0.7;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, -0.015 * size, -depth),
        new THREE.Vector3(x, reach * 0.8, -depth),
        new THREE.Vector3(x, reach + fingerRadius * 0.5, -0.004),
        new THREE.Vector3(x, reach * 0.65, radius + fingerRadius),
        new THREE.Vector3(x, -0.004, radius + fingerRadius * 0.7),
      ]);
      add(
        new THREE.TubeGeometry(curve, 6, fingerRadius, 6, false),
        paw ? toe : glove,
      );
      oval(
        paw ? "#a67151" : glove,
        [x, -0.004, radius + fingerRadius * 0.7],
        [fingerRadius * 0.9, fingerRadius * 0.9, fingerRadius * 0.8],
      );
      if (paw) {
        oval(
          toe,
          [x, 0.014 * size, -depth - 0.008 * size],
          [fingerRadius * 1.08, 0.034 * size, 0.023 * size],
        );
      }
    }

    // A separate thumb/dewclaw closes the inner edge rather than sticking up.
    const thumbX = -side * width * 0.5;
    const thumbRadius = width * (paw ? 0.13 : 0.115);
    const thumbReach = radius + thumbRadius * 0.8;
    const thumbTip: Triple = [thumbX, -0.01 * size, thumbReach];
    const thumb = new THREE.CatmullRomCurve3([
      new THREE.Vector3(thumbX * 0.85, -0.048 * size, -depth * 0.7),
      new THREE.Vector3(thumbX, -thumbReach, -radius * 0.12),
      new THREE.Vector3(thumbX, -thumbReach * 0.72, thumbReach * 0.72),
      new THREE.Vector3(...thumbTip),
    ]);
    add(
      new THREE.TubeGeometry(thumb, 6, thumbRadius, 7, false),
      paw ? fur : glove,
    );
    oval(paw ? toe : glove, thumbTip, [
      thumbRadius,
      thumbRadius * 0.9,
      thumbRadius * 0.9,
    ]);

    if (!paw) {
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
    }
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
        paw ? "#d1a66d" : "#d7ad65",
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
        paw ? fur : glove,
        root.clone().add(end).multiplyScalar(0.5).toArray() as Triple,
      );
      cuff(end, axis);
    }
    const result = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    result.computeBoundingSphere();
    return result;
  }, [style, side, grip]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={0.86} metalness={0} />
    </mesh>
  );
}

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
    const fur = "#8a88ad",
      toe = "#f0e9df",
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
    if (paw) {
      const pink = "#ed8eaf";
      const bean = (position: Triple, scale: Triple) =>
        add(new THREE.SphereGeometry(1, 8, 4), pink, position, scale);
      oval(
        fur,
        [0, -0.02 * size, -depth - 0.006 * size],
        [width * 0.7, 0.072 * size, 0.049 * size],
      );
      // Costume mitts carry beans on both faces so the paw read survives a grip.
      bean(
        [0, -0.035 * size, -depth - 0.055 * size],
        [width * 0.3, 0.029 * size, 0.01 * size],
      );
      for (const side of [-1, 1])
        bean(
          [side * width * 0.15, -0.014 * size, -depth - 0.055 * size],
          [width * 0.19, 0.021 * size, 0.011 * size],
        );
      // Stuffed toe mitts, rather than long human finger segments.
      for (let i = -1; i <= 1; i++) {
        const x = i * width * 0.39,
          r = width * 0.225;
        const reach = radius + r * 0.65;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, -0.005 * size, -depth),
          new THREE.Vector3(x, reach * 0.85, -depth * 0.75),
          new THREE.Vector3(x, reach, 0.01),
          new THREE.Vector3(x, 0.005, radius + r * 0.8),
        ]);
        add(new THREE.TubeGeometry(curve, 5, r, 7, false), toe);
        oval(
          toe,
          [x, 0.02 * size, -depth - r * 0.35],
          [r * 1.12, 0.038 * size, r * 1.05],
        );
        bean([x, 0.005, radius + r * 1.65], [r * 0.72, r * 0.85, r * 0.28]);
        bean(
          [x, 0.035 * size, -depth - r * 1.45],
          [r * 0.65, 0.023 * size, 0.008 * size],
        );
      }
      const thumbX = -side * width * 0.63,
        r = width * 0.185;
      const reach = radius + r * 0.8;
      const thumb = new THREE.CatmullRomCurve3([
        new THREE.Vector3(thumbX * 0.75, -0.04 * size, -depth * 0.65),
        new THREE.Vector3(thumbX, -reach, 0),
        new THREE.Vector3(thumbX, -0.01 * size, reach),
      ]);
      add(new THREE.TubeGeometry(thumb, 5, r, 7, false), toe);
      oval(toe, [thumbX, -0.01 * size, reach], [r, r, r]);
      oval(
        pink,
        [thumbX, -0.01 * size, reach + r * 0.85],
        [r * 0.75, r * 0.82, r * 0.28],
      );
      // A soft central palm bean and low-poly fur tufts complete the costume cue.
      oval(
        pink,
        [0, -0.058 * size, -depth + 0.043 * size],
        [width * 0.32, 0.032 * size, 0.012 * size],
      );
      for (const edge of [-1, 1])
        for (let i = 0; i < 3; i++) {
          add(
            new THREE.SphereGeometry(1, 6, 3),
            fur,
            [
              edge * width * (0.6 + i * 0.035),
              (-0.01 - i * 0.023) * size,
              -depth,
            ],
            [0.018 * size, 0.025 * size, 0.016 * size],
          );
        }
    } else {
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
      oval(glove, thumbTip, [
        thumbRadius,
        thumbRadius * 0.9,
        thumbRadius * 0.9,
      ]);

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
      if (paw) {
        const puff = new THREE.SphereGeometry(1, 10, 6);
        puff
          .scale(width * 0.44, 0.033 * size, width * 0.29)
          .applyQuaternion(turn);
        add(puff, fur, center.toArray() as Triple);
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const tuft = new THREE.SphereGeometry(1, 6, 3);
          tuft.scale(0.019 * size, 0.025 * size, 0.017 * size);
          tuft.translate(
            Math.cos(angle) * width * 0.34,
            -0.012 * size,
            Math.sin(angle) * width * 0.2,
          );
          tuft.applyQuaternion(turn);
          add(tuft, i % 3 === 0 ? "#a5a0bf" : fur, center.toArray() as Triple);
        }
        return;
      }
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
      <meshStandardMaterial
        vertexColors
        roughness={style === "paws" ? 0.98 : 0.86}
        metalness={0}
      />
    </mesh>
  );
}

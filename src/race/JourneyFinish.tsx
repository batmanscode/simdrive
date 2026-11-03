import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { raceCourseLength, sampleTrack } from "../shared/tracks";
import type { TrackDef } from "../shared/types";

export function JourneyFinish({ track }: { track: TrackDef }) {
  const point = useMemo(
    () => sampleTrack(track, raceCourseLength(track)),
    [track],
  );
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#f8f0d9";
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = "#192b2c";
    c.font = "900 54px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("FINISH", 256, 50);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 3; j++)
        if ((i + j) % 2 === 0) {
          c.fillRect(i * 12, j * 32, 12, 32);
          c.fillRect(416 + i * 12, j * 32, 12, 32);
        }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  if (!track.finishFraction) return null;
  return (
    <group
      position={[point.x, point.y, point.z]}
      rotation={[0, point.heading, 0]}
    >
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (track.width / 2 + 1), 2.4, 0]}
          castShadow
        >
          <boxGeometry args={[0.3, 4.8, 0.3]} />
          <meshStandardMaterial
            color="#e4e5da"
            roughness={0.65}
            metalness={0.12}
          />
        </mesh>
      ))}
      <mesh position={[0, 4.4, 0]}>
        <boxGeometry args={[track.width + 2.4, 1, 0.18]} />
        <meshStandardMaterial color="#28413d" />
      </mesh>
      <mesh position={[0, 4.4, -0.1]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[track.width + 2.2, 0.95]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[track.width, 0.45]} />
        <meshBasicMaterial color="#f4efd9" />
      </mesh>
    </group>
  );
}

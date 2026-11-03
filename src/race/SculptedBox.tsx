import { useEffect, useMemo } from "react";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function SculptedBox({ args }: { args: [number, number, number] }) {
  const [width, height, depth] = args;
  const geometry = useMemo(
    () =>
      new RoundedBoxGeometry(
        width,
        height,
        depth,
        2,
        Math.min(width, height, depth) * 0.16,
      ),
    [width, height, depth],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

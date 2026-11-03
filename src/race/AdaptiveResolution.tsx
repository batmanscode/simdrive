import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

/** Lower only the 3D resolution under sustained load; DOM instruments remain crisp. */
export function AdaptiveResolution({ split }: { split: boolean }) {
  const { setDpr, viewport } = useThree();
  const samples = useRef({ elapsed: 0, frames: 0, warmup: 0, cooldown: 0 });
  useFrame((_, delta) => {
    const s = samples.current;
    if (document.hidden) {
      s.elapsed = 0;
      s.frames = 0;
      return;
    }
    s.warmup += delta;
    if (s.warmup < 4) return;
    s.elapsed += Math.min(delta, 1);
    s.frames++;
    if (s.elapsed < 3 || s.frames < 12) return;
    const fps = s.frames / s.elapsed;
    s.elapsed = 0;
    s.frames = 0;
    const current = viewport.dpr;
    if (fps < 38 && current > (split ? 0.6 : 0.8))
      setDpr(Math.max(split ? 0.6 : 0.8, current - 0.15));
  });
  return null;
}

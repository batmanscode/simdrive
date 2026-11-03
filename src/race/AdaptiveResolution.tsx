import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";

/** Canvas reconfiguration must receive the same DPR selected by the frame sampler. */
export function useRaceDpr(split: boolean) {
  const [choice, setChoice] = useState<{ split: boolean; value: number }>();
  useEffect(() => setChoice(undefined), [split]);
  const deviceDpr =
    typeof window === "undefined" ? 1 : (window.devicePixelRatio ?? 2);
  const initial = Math.min(
    Math.max(split ? 0.75 : 1, deviceDpr),
    split ? 1 : 1.35,
  );
  const dpr =
    choice?.split === split ? Math.min(initial, choice.value) : initial;
  const selectDpr = useCallback(
    (value: number) => setChoice({ split, value }),
    [split],
  );
  return [dpr, selectDpr] as const;
}

/** Lower only the 3D resolution under sustained load; DOM instruments remain crisp. */
export function AdaptiveResolution({
  split,
  dpr,
  onChange,
}: {
  split: boolean;
  dpr: number;
  onChange: (value: number) => void;
}) {
  const samples = useRef({ elapsed: 0, frames: 0, warmup: 0 });
  useEffect(() => {
    samples.current = { elapsed: 0, frames: 0, warmup: 0 };
  }, [split]);
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
    if (fps < 38 && dpr > (split ? 0.6 : 0.8))
      onChange(Math.max(split ? 0.6 : 0.8, dpr - 0.15));
  });
  return null;
}

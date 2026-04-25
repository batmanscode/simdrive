import type { TrackDef, TrackId, Vec2 } from "./types.js";

export const TRACKS: Record<TrackId, TrackDef> = {
  sakura: {
    id: "sakura",
    name: "Sakura Sprint",
    description: "Short, flowing esses with one heavy braking hairpin and forgiving runoff.",
    targetLap: "35-55 sec",
    width: 11,
    curbWidth: 1.4,
    wallMargin: 7,
    points: [
      { x: 0, z: 0 },
      { x: 25, z: 3 },
      { x: 48, z: 18 },
      { x: 57, z: 39 },
      { x: 45, z: 58 },
      { x: 19, z: 62 },
      { x: -8, z: 49 },
      { x: -18, z: 25 },
      { x: -12, z: 8 }
    ]
  },
  alpine: {
    id: "alpine",
    name: "Alpine Grand Prix",
    description: "Longer high-speed course with an uphill sweep, fast changes, and a heavy chicane.",
    targetLap: "75-110 sec",
    width: 12,
    curbWidth: 1.6,
    wallMargin: 6,
    points: [
      { x: 0, z: 0 },
      { x: 40, z: 4 },
      { x: 94, z: 20 },
      { x: 126, z: 55 },
      { x: 116, z: 86 },
      { x: 76, z: 99 },
      { x: 40, z: 86 },
      { x: 18, z: 112 },
      { x: -28, z: 103 },
      { x: -61, z: 72 },
      { x: -54, z: 38 },
      { x: -23, z: 19 }
    ]
  }
};

export type TrackMetrics = {
  totalLength: number;
  segmentStarts: number[];
};

export type TrackSample = Vec2 & {
  heading: number;
};

export type NearestTrackPoint = TrackSample & {
  progress: number;
  distance: number;
};

export function trackMetrics(track: TrackDef): TrackMetrics {
  const segmentStarts: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < track.points.length; i += 1) {
    segmentStarts.push(totalLength);
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    totalLength += distance(a, b);
  }
  return { totalLength, segmentStarts };
}

export function sampleTrack(track: TrackDef, rawProgress: number): TrackSample {
  const metrics = trackMetrics(track);
  const progress = wrap(rawProgress, metrics.totalLength);
  for (let i = 0; i < track.points.length; i += 1) {
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    const segmentLength = distance(a, b);
    const start = metrics.segmentStarts[i];
    if (progress <= start + segmentLength || i === track.points.length - 1) {
      const t = clamp((progress - start) / segmentLength, 0, 1);
      const x = lerp(a.x, b.x, t);
      const z = lerp(a.z, b.z, t);
      return { x, z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }
  }
  const first = track.points[0];
  const second = track.points[1];
  return { x: first.x, z: first.z, heading: Math.atan2(second.x - first.x, second.z - first.z) };
}

export function nearestTrackPoint(track: TrackDef, point: Vec2): NearestTrackPoint {
  const metrics = trackMetrics(track);
  let best: NearestTrackPoint | undefined;
  for (let i = 0; i < track.points.length; i += 1) {
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    const t = lenSq === 0 ? 0 : clamp(((point.x - a.x) * abx + (point.z - a.z) * abz) / lenSq, 0, 1);
    const x = a.x + abx * t;
    const z = a.z + abz * t;
    const segmentLength = Math.sqrt(lenSq);
    const candidate = {
      x,
      z,
      heading: Math.atan2(abx, abz),
      progress: metrics.segmentStarts[i] + segmentLength * t,
      distance: Math.hypot(point.x - x, point.z - z)
    };
    if (!best || candidate.distance < best.distance) {
      best = candidate;
    }
  }
  return best ?? { ...sampleTrack(track, 0), progress: 0, distance: 0 };
}

export function wrap(value: number, length: number) {
  return ((value % length) + length) % length;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

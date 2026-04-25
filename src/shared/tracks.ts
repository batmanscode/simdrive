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
  samples: TrackSample[];
};

export type TrackSample = Vec2 & {
  heading: number;
};

export type NearestTrackPoint = TrackSample & {
  progress: number;
  distance: number;
};

const SAMPLES_PER_CONTROL_POINT = 24;
const metricsCache = new WeakMap<TrackDef, TrackMetrics>();

export function trackMetrics(track: TrackDef): TrackMetrics {
  const cached = metricsCache.get(track);
  if (cached) return cached;

  const samples = sampleSmoothTrack(track);
  const segmentStarts: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < samples.length; i += 1) {
    segmentStarts.push(totalLength);
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    totalLength += distance(a, b);
  }
  const metrics = { totalLength, segmentStarts, samples };
  metricsCache.set(track, metrics);
  return metrics;
}

export function sampleTrack(track: TrackDef, rawProgress: number): TrackSample {
  const metrics = trackMetrics(track);
  const progress = wrap(rawProgress, metrics.totalLength);
  for (let i = 0; i < metrics.samples.length; i += 1) {
    const a = metrics.samples[i];
    const b = metrics.samples[(i + 1) % metrics.samples.length];
    const segmentLength = distance(a, b);
    const start = metrics.segmentStarts[i];
    if (progress <= start + segmentLength || i === metrics.samples.length - 1) {
      const t = clamp((progress - start) / segmentLength, 0, 1);
      const x = lerp(a.x, b.x, t);
      const z = lerp(a.z, b.z, t);
      return { x, z, heading: angleLerp(a.heading, b.heading, t) };
    }
  }
  return metrics.samples[0] ?? { x: 0, z: 0, heading: 0 };
}

export function nearestTrackPoint(track: TrackDef, point: Vec2): NearestTrackPoint {
  const metrics = trackMetrics(track);
  let best: NearestTrackPoint | undefined;
  for (let i = 0; i < metrics.samples.length; i += 1) {
    const a = metrics.samples[i];
    const b = metrics.samples[(i + 1) % metrics.samples.length];
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
      heading: angleLerp(a.heading, b.heading, t),
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

function sampleSmoothTrack(track: TrackDef): TrackSample[] {
  const samples: TrackSample[] = [];
  const points = track.points;
  if (points.length < 2) return points.map((point) => ({ ...point, heading: 0 }));

  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    for (let step = 0; step < SAMPLES_PER_CONTROL_POINT; step += 1) {
      const t = step / SAMPLES_PER_CONTROL_POINT;
      const position = catmullRom(p0, p1, p2, p3, t);
      const tangent = catmullRomTangent(p0, p1, p2, p3, t);
      samples.push({ ...position, heading: Math.atan2(tangent.x, tangent.z) });
    }
  }

  return samples;
}

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * (2 * p1.z + (p2.z - p0.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  };
}

function catmullRomTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  return {
    x: 0.5 * ((p2.x - p0.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    z: 0.5 * ((p2.z - p0.z) + 2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t + 3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2)
  };
}

function angleLerp(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

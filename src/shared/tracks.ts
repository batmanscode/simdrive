import type { TrackDef, TrackId, Vec2 } from "./types.js";

export const TRACKS: Record<TrackId, TrackDef> = {
  sakura: {
    id: "sakura",
    name: "Sakura Sprint",
    description: "Short, flowing esses with one heavy braking hairpin and forgiving runoff.",
    inspiration: "Suzuka-style esses and compact Japanese mountain roads.",
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
    inspiration: "Spa-style elevation, Monza-style speed, and high alpine passes.",
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
  },
  fjord: {
    id: "fjord",
    name: "Fjord Loop",
    description: "Endurance loop around cliffside water, timber tunnels, high ridges, and a downhill village run.",
    inspiration: "Norway's Geiranger-Trollstigen scenery, Nordschleife endurance rhythm, and coastal mountain roads.",
    targetLap: "~4 min",
    width: 12.5,
    curbWidth: 1.35,
    wallMargin: 8,
    points: scalePoints([
      { x: 0, y: 6, z: 0 },
      { x: 420, y: 9, z: 38 },
      { x: 820, y: 18, z: 230 },
      { x: 1040, y: 38, z: 610 },
      { x: 860, y: 66, z: 980 },
      { x: 390, y: 88, z: 1235 },
      { x: -90, y: 82, z: 1130 },
      { x: -365, y: 58, z: 820 },
      { x: -250, y: 35, z: 545 },
      { x: -710, y: 28, z: 420 },
      { x: -1100, y: 46, z: 90 },
      { x: -1160, y: 74, z: -330 },
      { x: -820, y: 105, z: -655 },
      { x: -315, y: 126, z: -760 },
      { x: 180, y: 118, z: -665 },
      { x: 590, y: 92, z: -430 },
      { x: 990, y: 58, z: -350 },
      { x: 1290, y: 30, z: -20 },
      { x: 1700, y: 18, z: -380 },
      { x: 1500, y: 11, z: -1040 },
      { x: 900, y: 8, z: -1280 },
      { x: 420, y: 7, z: -920 },
      { x: 160, y: 7, z: -460 },
      { x: -160, y: 7, z: -160 }
    ], 0.5, 0.45)
  },
  cloudline: {
    id: "cloudline",
    name: "Cloudline Ascent",
    description: "A huge mountain-pass lap with stacked switchbacks, exposed ridge straights, and a long summit descent.",
    inspiration: "Pikes Peak's race-to-the-clouds climb, Stelvio-style switchbacks, and high alpine observatory roads.",
    targetLap: "~12 min",
    width: 12,
    curbWidth: 1.2,
    wallMargin: 7.5,
    points: scalePoints([
      { x: 0, y: 0, z: 0 },
      { x: 360, y: 8, z: 80 },
      { x: 730, y: 22, z: 260 },
      { x: 970, y: 42, z: 585 },
      { x: 830, y: 64, z: 930 },
      { x: 465, y: 88, z: 1090 },
      { x: 120, y: 112, z: 1015 },
      { x: -150, y: 138, z: 1260 },
      { x: 75, y: 166, z: 1575 },
      { x: 515, y: 194, z: 1665 },
      { x: 860, y: 224, z: 1885 },
      { x: 745, y: 252, z: 2280 },
      { x: 310, y: 280, z: 2410 },
      { x: -120, y: 310, z: 2325 },
      { x: -485, y: 342, z: 2520 },
      { x: -285, y: 374, z: 2935 },
      { x: 215, y: 404, z: 3060 },
      { x: 720, y: 438, z: 2975 },
      { x: 1190, y: 472, z: 3165 },
      { x: 1010, y: 506, z: 3635 },
      { x: 470, y: 538, z: 3775 },
      { x: -95, y: 568, z: 3710 },
      { x: -610, y: 598, z: 3950 },
      { x: -390, y: 630, z: 4475 },
      { x: 250, y: 656, z: 4620 },
      { x: 935, y: 680, z: 4490 },
      { x: 1525, y: 698, z: 4185 },
      { x: 1920, y: 686, z: 3740 },
      { x: 2100, y: 654, z: 3185 },
      { x: 1775, y: 614, z: 2680 },
      { x: 1295, y: 570, z: 2385 },
      { x: 1500, y: 532, z: 1930 },
      { x: 2045, y: 494, z: 1695 },
      { x: 2490, y: 452, z: 1295 },
      { x: 2225, y: 410, z: 840 },
      { x: 1690, y: 368, z: 700 },
      { x: 1290, y: 326, z: 380 },
      { x: 1555, y: 284, z: -110 },
      { x: 2180, y: 244, z: -245 },
      { x: 2725, y: 204, z: -635 },
      { x: 2445, y: 166, z: -1135 },
      { x: 1800, y: 130, z: -1270 },
      { x: 1165, y: 96, z: -1050 },
      { x: 755, y: 66, z: -720 },
      { x: 365, y: 36, z: -530 },
      { x: 70, y: 16, z: -280 }
    ], 0.6, 0.24)
  }
};

export type TrackMetrics = {
  totalLength: number;
  segmentStarts: number[];
  samples: TrackSample[];
};

export type TrackSample = {
  x: number;
  y: number;
  z: number;
  heading: number;
  grade: number;
};

export type NearestTrackPoint = TrackSample & {
  progress: number;
  distance: number;
};

const SAMPLES_PER_CONTROL_POINT = 24;
const metricsCache = new WeakMap<TrackDef, TrackMetrics>();

function scalePoints(points: Vec2[], horizontalScale: number, verticalScale = 1): Vec2[] {
  return points.map((point) => ({
    x: point.x * horizontalScale,
    y: point.y === undefined ? undefined : point.y * verticalScale,
    z: point.z * horizontalScale
  }));
}

function findSegmentIndex(metrics: TrackMetrics, progress: number) {
  let low = 0;
  let high = metrics.segmentStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = metrics.segmentStarts[mid];
    const nextStart = mid === metrics.segmentStarts.length - 1 ? metrics.totalLength : metrics.segmentStarts[mid + 1];
    if (progress < start) {
      high = mid - 1;
    } else if (progress >= nextStart) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.max(0, Math.min(metrics.segmentStarts.length - 1, low));
}

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
    totalLength += distance3D(a, b);
  }
  const metrics = { totalLength, segmentStarts, samples };
  metricsCache.set(track, metrics);
  return metrics;
}

export function sampleTrack(track: TrackDef, rawProgress: number): TrackSample {
  const metrics = trackMetrics(track);
  const progress = wrap(rawProgress, metrics.totalLength);
  if (metrics.samples.length === 0) return { x: 0, y: 0, z: 0, heading: 0, grade: 0 };
  const i = findSegmentIndex(metrics, progress);
  const a = metrics.samples[i];
  const b = metrics.samples[(i + 1) % metrics.samples.length];
  const segmentLength = distance3D(a, b);
  const start = metrics.segmentStarts[i];
  const t = segmentLength === 0 ? 0 : clamp((progress - start) / segmentLength, 0, 1);
  const x = lerp(a.x, b.x, t);
  const y = lerp(a.y, b.y, t);
  const z = lerp(a.z, b.z, t);
  return { x, y, z, heading: angleLerp(a.heading, b.heading, t), grade: lerp(a.grade, b.grade, t) };
}

export function nearestTrackPoint(track: TrackDef, point: Vec2): NearestTrackPoint {
  const metrics = trackMetrics(track);
  let best: NearestTrackPoint | undefined;
  let bestSelectionDistance = Infinity;
  for (let i = 0; i < metrics.samples.length; i += 1) {
    const a = metrics.samples[i];
    const b = metrics.samples[(i + 1) % metrics.samples.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    const t = lenSq === 0 ? 0 : clamp(((point.x - a.x) * abx + (point.z - a.z) * abz) / lenSq, 0, 1);
    const x = a.x + abx * t;
    const y = lerp(a.y, b.y, t);
    const z = a.z + abz * t;
    const segmentLength = distance3D(a, b);
    const horizontalDistance = Math.hypot(point.x - x, point.z - z);
    const selectionDistance = point.y === undefined ? horizontalDistance : Math.hypot(horizontalDistance, point.y - y);
    const candidate = {
      x,
      y,
      z,
      heading: angleLerp(a.heading, b.heading, t),
      grade: lerp(a.grade, b.grade, t),
      progress: metrics.segmentStarts[i] + segmentLength * t,
      distance: horizontalDistance
    };
    if (selectionDistance < bestSelectionDistance) {
      best = candidate;
      bestSelectionDistance = selectionDistance;
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
  if (points.length < 2) return points.map((point) => ({ x: point.x, y: point.y ?? 0, z: point.z, heading: 0, grade: 0 }));

  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    for (let step = 0; step < SAMPLES_PER_CONTROL_POINT; step += 1) {
      const t = step / SAMPLES_PER_CONTROL_POINT;
      const position = catmullRom(p0, p1, p2, p3, t);
      const tangent = catmullRomTangent(p0, p1, p2, p3, t);
      const horizontal = Math.hypot(tangent.x, tangent.z);
      samples.push({
        ...position,
        heading: Math.atan2(tangent.x, tangent.z),
        grade: horizontal === 0 ? 0 : clamp(tangent.y / horizontal, -0.22, 0.22)
      });
    }
  }

  return samples;
}

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Required<Vec2> {
  const t2 = t * t;
  const t3 = t2 * t;
  const y0 = p0.y ?? 0;
  const y1 = p1.y ?? 0;
  const y2 = p2.y ?? 0;
  const y3 = p3.y ?? 0;
  return {
    x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * y1 + (y2 - y0) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
    z: 0.5 * (2 * p1.z + (p2.z - p0.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  };
}

function catmullRomTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Required<Vec2> {
  const t2 = t * t;
  const y0 = p0.y ?? 0;
  const y1 = p1.y ?? 0;
  const y2 = p2.y ?? 0;
  const y3 = p3.y ?? 0;
  return {
    x: 0.5 * ((p2.x - p0.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    y: 0.5 * ((y2 - y0) + 2 * (2 * y0 - 5 * y1 + 4 * y2 - y3) * t + 3 * (-y0 + 3 * y1 - 3 * y2 + y3) * t2),
    z: 0.5 * ((p2.z - p0.z) + 2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t + 3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2)
  };
}

function angleLerp(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distance3D(a: TrackSample, b: TrackSample) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

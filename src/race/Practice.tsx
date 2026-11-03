import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getVehicle } from "../shared/cars";
import { raceCourseLength, sampleTrack, TRACKS } from "../shared/tracks";
import type {
  CarState,
  RaceSettings,
  RoomState,
  TrackDef,
} from "../shared/types";

type GhostFrame = {
  t: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  progress: number;
};
type PersonalLap = {
  version: 1;
  time: number;
  frames: GhostFrame[];
  sectors: number[];
};
const PREFIX = "simdrive-lap:v1:";
const cache = new Map<string, PersonalLap | undefined>();

export function practiceKey(
  track: TrackDef,
  car: CarState,
  settings: RaceSettings,
  identity = car.playerId,
) {
  return `${encodeURIComponent(identity)}:${track.id}:${car.vehicleId}:${car.carSetupId}:${settings.rain ? "wet" : "dry"}:${settings.stabilityAssist ? "assist" : "raw"}:${settings.equalPace ? "equal" : "class"}:${settings.changingWeather ? "changing" : "steady"}`;
}
export function readPersonalLap(key: string) {
  if (cache.has(key)) return cache.get(key);
  try {
    const saved = JSON.parse(localStorage.getItem(PREFIX + key) ?? "null");
    if (
      saved?.version === 1 &&
      Number.isFinite(saved.time) &&
      saved.time > 0 &&
      Array.isArray(saved.frames) &&
      saved.frames.length > 2 &&
      saved.frames.length <= 4001 &&
      saved.frames.every((f: GhostFrame) =>
        [f.t, f.x, f.y, f.z, f.heading, f.progress].every(Number.isFinite),
      )
    ) {
      cache.set(key, saved);
      return saved as PersonalLap;
    }
  } catch {
    /* Private browsing or invalid old data should never interrupt a race. */
  }
  cache.set(key, undefined);
  return undefined;
}
function savePersonalLap(key: string, lap: PersonalLap) {
  if ((readPersonalLap(key)?.time ?? Infinity) <= lap.time) return;
  cache.set(key, lap);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(lap));
  } catch {
    /* Memory-only ghosts still work when browser storage is full. */
  }
}

/** Records the authoritative, checkpoint-gated lap; never treats a reset as a personal best. */
export function usePracticeRecorder(
  car: CarState | undefined,
  track: TrackDef,
  settings: RaceSettings | undefined,
  raceTime: number,
  raceId: number | undefined,
  enabled: boolean,
  identity = car?.playerId,
) {
  const recording = useRef<
    | {
        raceId?: number;
        playerId: string;
        lap: number;
        frames: GhostFrame[];
        sectors: number[];
        valid: boolean;
        checkpoint: number;
        timed: boolean;
        interval: number;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    if (!car || !enabled || !raceId || !settings) {
      recording.current = undefined;
      return;
    }
    let r = recording.current;
    const changed = !r || r.raceId !== raceId || r.playerId !== car.playerId;
    if (changed || (r && !r.timed && car.timedLapStarted)) r = undefined;
    if (
      r &&
      car.lap > r.lap &&
      car.lastLapTime &&
      r.valid &&
      r.frames.length > 2 &&
      car.timedLapStarted
    ) {
      const final = {
        t: car.lastLapTime,
        x: car.x,
        y: car.y,
        z: car.z,
        heading: car.heading,
        progress: raceCourseLength(track),
      };
      const sectors = [
        ...r.sectors,
        car.lastLapTime - r.sectors.reduce((a, b) => a + b, 0),
      ];
      savePersonalLap(practiceKey(track, car, settings, identity), {
        version: 1,
        time: car.lastLapTime,
        frames: [
          ...r.frames.filter((frame) => frame.t < car.lastLapTime!),
          final,
        ],
        sectors,
      });
    }
    if (!r || car.lap !== r.lap) {
      r = {
        raceId,
        playerId: car.playerId,
        lap: car.lap,
        frames: [],
        sectors: [],
        valid:
          car.timedLapStarted &&
          !car.finished &&
          !car.crashed &&
          !car.dnf &&
          car.progress < raceCourseLength(track) * 0.1,
        checkpoint: car.nextCheckpoint,
        timed: car.timedLapStarted,
        interval: 0.1,
      };
      recording.current = r;
    }
    if (!car.timedLapStarted || settings.changingWeather) {
      r.valid = false;
      return;
    }
    if (car.crashed || car.dnf || car.resetInvulnerableUntil) r.valid = false;
    const elapsed = Math.max(0, raceTime - car.currentLapStartedAt);
    if (car.nextCheckpoint > r.checkpoint) {
      r.sectors.push(elapsed - r.sectors.reduce((a, b) => a + b, 0));
      r.checkpoint = car.nextCheckpoint;
    }
    if (
      !car.finished &&
      r.valid &&
      (r.frames.length === 0 ||
        elapsed - r.frames[r.frames.length - 1].t >= r.interval)
    ) {
      if (r.frames.length >= 4000) {
        r.frames = r.frames.filter((_, i) => i % 2 === 0);
        r.interval *= 2;
      }
      r.frames.push({
        t: elapsed,
        x: car.x,
        y: car.y,
        z: car.z,
        heading: car.heading,
        progress: car.progress,
      });
    }
  }, [car, enabled, raceId, raceTime, settings, track, identity]);
}

export function formatLapTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(milliseconds / 60000);
  return `${minutes}:${((milliseconds % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}

function frameAtTime(record: PersonalLap, elapsed: number) {
  const frames = record.frames;
  let lo = 0,
    hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].t <= elapsed) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo],
    b = frames[Math.min(lo + 1, frames.length - 1)];
  const amount = THREE.MathUtils.clamp(
    (elapsed - a.t) / Math.max(0.001, b.t - a.t),
    0,
    1,
  );
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, amount),
    y: THREE.MathUtils.lerp(a.y, b.y, amount),
    z: THREE.MathUtils.lerp(a.z, b.z, amount),
    heading:
      a.heading +
      Math.atan2(
        Math.sin(b.heading - a.heading),
        Math.cos(b.heading - a.heading),
      ) *
        amount,
  };
}

export function PersonalGhost({
  car,
  track,
  settings,
  raceStartedAt,
  now,
  identity,
}: {
  car: CarState;
  track: TrackDef;
  settings: RaceSettings;
  raceStartedAt?: number;
  now: () => number;
  identity: string;
}) {
  const key = practiceKey(track, car, settings, identity);
  const record = readPersonalLap(key);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const elapsed =
      (now() - (raceStartedAt ?? now())) / 1000 - car.currentLapStartedAt;
    group.current.visible = Boolean(
      record &&
      car.timedLapStarted &&
      !car.finished &&
      !car.crashed &&
      !car.dnf &&
      elapsed >= 0 &&
      elapsed <= record.time,
    );
    if (!record || !group.current.visible) return;
    const p = frameAtTime(record, elapsed);
    group.current.position.set(p.x, p.y + 0.4, p.z);
    group.current.rotation.y = p.heading;
    // Suppress distracting overlap when the player is matching their old line.
    const distance = Math.hypot(car.x - p.x, car.z - p.z);
    group.current.visible = distance > 3;
  });
  const length =
    car.vehicleId === "formula"
      ? 3.8
      : car.vehicleId === "stockTruck"
        ? 3.4
        : 2.2;
  return (
    <group ref={group} visible={false}>
      <mesh>
        <boxGeometry args={[1.5, 0.65, length]} />
        <meshBasicMaterial
          color="#9ef5e0"
          wireframe
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.45, 0.12, length]} />
        <meshBasicMaterial
          color="#9ef5e0"
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function cornerAdvice(track: TrackDef, car: CarState) {
  if (car.finished || car.crashed || car.dnf || car.speed < 2) return undefined;
  const ahead = Math.min(55, Math.max(14, car.speed * 2.2));
  const near = sampleTrack(track, car.progress + ahead * 0.2),
    far = sampleTrack(track, car.progress + ahead);
  const turn = Math.atan2(
    Math.sin(far.heading - near.heading),
    Math.cos(far.heading - near.heading),
  );
  if (Math.abs(turn) < 0.18) return undefined;
  const profile = getVehicle(car.vehicleId).physics;
  const safeSpeed =
    Math.max(4, Math.min(16, 6.5 / Math.max(0.35, Math.abs(turn)))) *
    Math.sqrt(profile.surfaceGrip.road);
  return {
    // The driving camera faces +Z at heading zero: increasing heading bends left.
    direction: turn > 0 ? "LEFT" : "RIGHT",
    braking: car.speed > safeSpeed * 1.12,
    sharp: Math.abs(turn) > 0.65,
  };
}

// Stay mounted across the racing→results transition, including a solo finish.
export function useDisplayPracticeRecorders(
  room: RoomState | undefined,
  displayGroupId: string | undefined,
  now: () => number,
) {
  const local =
    room?.players.filter((p) => p.displayGroupId === displayGroupId) ?? [];
  const players = local.length ? local : (room?.players ?? []);
  const cars = players
    .slice(0, 4)
    .map((p) => room?.cars.find((c) => c.playerId === p.id));
  const track = TRACKS[room?.settings.trackId ?? "sakura"];
  const raceTime = room?.raceStartedAt
    ? Math.max(0, (now() - room.raceStartedAt) / 1000)
    : 0;
  const enabled = room?.phase === "racing" || room?.phase === "results";
  usePracticeRecorder(
    cars[0],
    track,
    room?.settings,
    raceTime,
    room?.raceStartedAt,
    enabled,
    players[0] ? `${players[0].name}:${players[0].color}` : undefined,
  );
  usePracticeRecorder(
    cars[1],
    track,
    room?.settings,
    raceTime,
    room?.raceStartedAt,
    enabled,
    players[1] ? `${players[1].name}:${players[1].color}` : undefined,
  );
  usePracticeRecorder(
    cars[2],
    track,
    room?.settings,
    raceTime,
    room?.raceStartedAt,
    enabled,
    players[2] ? `${players[2].name}:${players[2].color}` : undefined,
  );
  usePracticeRecorder(
    cars[3],
    track,
    room?.settings,
    raceTime,
    room?.raceStartedAt,
    enabled,
    players[3] ? `${players[3].name}:${players[3].color}` : undefined,
  );
}

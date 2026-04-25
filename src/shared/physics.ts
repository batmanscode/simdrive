import { clamp, nearestTrackPoint, sampleTrack, trackMetrics } from "./tracks.js";
import type { CarState, InputFrame, Player, RaceSettings, SurfaceType, TrackDef } from "./types.js";

export function createCar(player: Player, track: TrackDef, gridIndex: number): CarState {
  const spawn = sampleTrack(track, 5 - gridIndex * 4);
  const side = gridIndex % 2 === 0 ? -1 : 1;
  const row = Math.floor(gridIndex / 2);
  const lateral = side * 2.2;
  const rightHeading = spawn.heading + Math.PI / 2;
  return {
    playerId: player.id,
    x: spawn.x + Math.sin(rightHeading) * lateral - Math.sin(spawn.heading) * row * 4,
    z: spawn.z + Math.cos(rightHeading) * lateral - Math.cos(spawn.heading) * row * 4,
    heading: spawn.heading,
    speed: 0,
    steer: 0,
    throttle: 0,
    brake: 0,
    lap: 1,
    progress: 0,
    distanceThisLap: 0,
    surface: "road",
    finished: false,
    crashed: false,
    impact: 0,
    slip: 0
  };
}

export function stepCar(car: CarState, input: InputFrame, track: TrackDef, settings: RaceSettings, dt: number, raceTime: number) {
  if (car.finished || car.crashed) {
    car.throttle = 0;
    car.brake = 0;
    car.steer *= 0.92;
    car.speed *= Math.pow(0.55, dt);
    return;
  }

  const nearestBefore = nearestTrackPoint(track, { x: car.x, z: car.z });
  const surface = getSurface(track, nearestBefore.distance);
  const rainGrip = settings.rain ? 0.76 : 1;
  const surfaceGrip = surface === "road" ? 1 : surface === "curb" ? 0.86 : 0.48;
  const surfaceDrag = surface === "road" ? 0.16 : surface === "curb" ? 0.32 : 1.15;
  const grip = surfaceGrip * rainGrip;
  const maxSpeed = (settings.rain ? 42 : 48) * (surface === "grass" ? 0.62 : 1);

  car.steer = smooth(car.steer, clamp(input.steer, -1, 1), 1 - Math.pow(0.02, dt));
  car.throttle = clamp(input.throttle, 0, 1);
  car.brake = clamp(input.brake, 0, 1);

  const accel = 21 * car.throttle * (1 - Math.max(0, car.speed - maxSpeed) / maxSpeed);
  const braking = 34 * car.brake * (car.speed > 0 ? 1 : 0);
  const drag = car.speed * car.speed * 0.012 + car.speed * surfaceDrag;
  car.speed = clamp(car.speed + (accel - braking - drag) * dt, 0, maxSpeed + 6);

  const speedFactor = clamp(car.speed / 32, 0, 1.4);
  const steeringAuthority = (0.75 + speedFactor * 1.55) * grip;
  car.heading += car.steer * steeringAuthority * dt;

  const targetHeading = nearestBefore.heading;
  const headingError = angleDelta(car.heading, targetHeading);
  const pathHelp = surface === "road" ? 0.38 : 0.14;
  car.heading -= headingError * pathHelp * grip * dt;

  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;

  const nearestAfter = nearestTrackPoint(track, { x: car.x, z: car.z });
  const totalLength = trackMetrics(track).totalLength;
  let progressDelta = nearestAfter.progress - car.progress;
  if (progressDelta < -totalLength / 2) progressDelta += totalLength;
  if (progressDelta > totalLength / 2) progressDelta -= totalLength;
  if (progressDelta > 0 && progressDelta < 50) {
    car.distanceThisLap += progressDelta;
  }
  if (car.progress > totalLength * 0.82 && nearestAfter.progress < totalLength * 0.18 && car.distanceThisLap > totalLength * 0.62) {
    car.lap += 1;
    car.distanceThisLap = 0;
    if (car.lap > settings.lapCount) {
      car.finished = true;
      car.finishTime = raceTime;
      car.speed *= 0.35;
    }
  }
  car.progress = nearestAfter.progress;

  const newSurface = getSurface(track, nearestAfter.distance);
  car.impact = 0;
  if (newSurface === "wall") {
    const snap = nearestAfter;
    const maxDistance = track.width / 2 + track.curbWidth + track.wallMargin;
    const dx = car.x - snap.x;
    const dz = car.z - snap.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    car.x = snap.x + (dx / dist) * maxDistance;
    car.z = snap.z + (dz / dist) * maxDistance;
    car.speed *= 0.28;
    car.heading = snap.heading;
    car.impact = 1;
  }

  car.surface = newSurface === "wall" ? "grass" : newSurface;
  car.slip = clamp(Math.abs(headingError) * speedFactor * (settings.rain ? 1.45 : 1), 0, 1);
}

export function resolveCarContacts(cars: CarState[], settings: RaceSettings) {
  if (settings.ghostMode) return;

  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.finished || b.finished || a.crashed || b.crashed) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.1 || dist === 0) continue;
      const relative = Math.abs(a.speed - b.speed) + Math.min(a.speed, b.speed) * 0.2;
      if (relative > 12) {
        a.crashed = true;
        b.crashed = true;
        a.impact = 1;
        b.impact = 1;
        continue;
      }
      const push = (2.1 - dist) / 2;
      a.x -= (dx / dist) * push;
      a.z -= (dz / dist) * push;
      b.x += (dx / dist) * push;
      b.z += (dz / dist) * push;
      a.speed *= 0.88;
      b.speed *= 0.88;
      a.impact = Math.max(a.impact, 0.45);
      b.impact = Math.max(b.impact, 0.45);
    }
  }
}

function getSurface(track: TrackDef, distanceFromCenter: number): SurfaceType {
  if (distanceFromCenter <= track.width / 2) return "road";
  if (distanceFromCenter <= track.width / 2 + track.curbWidth) return "curb";
  if (distanceFromCenter <= track.width / 2 + track.curbWidth + track.wallMargin) return "grass";
  return "wall";
}

function smooth(current: number, target: number, amount: number) {
  return current + (target - current) * clamp(amount, 0, 1);
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

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
    velocityX: 0,
    velocityZ: 0,
    heading: spawn.heading,
    speed: 0,
    steer: 0,
    throttle: 0,
    brake: 0,
    lap: 1,
    progress: 0,
    distanceThisLap: 0,
    nextCheckpoint: 0,
    currentLapStartedAt: 0,
    wheelDistance: 0,
    surface: "road",
    finished: false,
    crashed: false,
    dnf: false,
    impact: 0,
    slip: 0
  };
}

export function stepCar(car: CarState, input: InputFrame, track: TrackDef, settings: RaceSettings, dt: number, raceTime: number) {
  if (car.finished || car.crashed || car.dnf) {
    car.throttle = 0;
    car.brake = 0;
    car.steer *= 0.92;
    car.velocityX *= Math.pow(0.5, dt);
    car.velocityZ *= Math.pow(0.5, dt);
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    car.wheelDistance += car.speed * dt;
    return;
  }

  const nearestBefore = nearestTrackPoint(track, { x: car.x, z: car.z });
  const surface = getSurface(track, nearestBefore.distance);
  if (car.speed > 0.01 && car.velocityX === 0 && car.velocityZ === 0) {
    car.velocityX = Math.sin(car.heading) * car.speed;
    car.velocityZ = Math.cos(car.heading) * car.speed;
  }

  const rainGrip = settings.rain ? 0.72 : 1;
  const surfaceGrip = surface === "road" ? 1 : surface === "curb" ? 0.84 : 0.42;
  const surfaceDrag = surface === "road" ? 0.11 : surface === "curb" ? 0.24 : 0.82;
  const grip = surfaceGrip * rainGrip;
  const maxSpeed = (settings.rain ? 44 : 50) * (surface === "grass" ? 0.64 : 1);

  car.steer = smooth(car.steer, clamp(input.steer, -1, 1), 1 - Math.pow(0.02, dt));
  car.throttle = clamp(input.throttle, 0, 1);
  car.brake = clamp(input.brake, 0, 1);

  let speed = Math.hypot(car.velocityX, car.velocityZ);
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const forwardSpeed = car.velocityX * forwardX + car.velocityZ * forwardZ;
  const accel = 22.5 * car.throttle * clamp(1 - Math.max(0, speed - maxSpeed) / Math.max(1, maxSpeed), 0, 1);
  car.velocityX += forwardX * accel * dt;
  car.velocityZ += forwardZ * accel * dt;

  speed = Math.hypot(car.velocityX, car.velocityZ);
  if (speed > 0.001) {
    const brakeBias = clamp(Math.abs(forwardSpeed) / Math.max(speed, 1), 0.55, 1);
    const braking = 35 * car.brake * brakeBias;
    const drag = speed * speed * 0.011 + speed * surfaceDrag;
    const nextSpeed = Math.max(0, speed - (braking + drag) * dt);
    const ratio = nextSpeed / speed;
    car.velocityX *= ratio;
    car.velocityZ *= ratio;
    speed = nextSpeed;
  }

  const speedFactor = clamp(speed / 34, 0, 1.35);
  const rightX = Math.sin(car.heading + Math.PI / 2);
  const rightZ = Math.cos(car.heading + Math.PI / 2);
  const lateralBefore = car.velocityX * rightX + car.velocityZ * rightZ;
  const slipRatioBefore = clamp(Math.abs(lateralBefore) / Math.max(speed, 1), 0, 1);
  const steeringAuthority = (0.62 + speedFactor * 1.42) * grip * (1 - slipRatioBefore * 0.28);
  car.heading += car.steer * steeringAuthority * dt;

  const targetHeading = nearestBefore.heading;
  const headingError = angleDelta(car.heading, targetHeading);
  const stabilityAssist = settings.stabilityAssist ? (surface === "road" ? 0.3 : surface === "curb" ? 0.13 : 0.2) : 0;
  car.heading -= headingError * stabilityAssist * grip * dt;

  const correctedRightX = Math.sin(car.heading + Math.PI / 2);
  const correctedRightZ = Math.cos(car.heading + Math.PI / 2);
  const lateralSpeed = car.velocityX * correctedRightX + car.velocityZ * correctedRightZ;
  const lateralGripRate = (surface === "road" ? 8.5 : surface === "curb" ? 5.6 : 2.7) * rainGrip * (1 - car.brake * 0.18);
  const lateralDamping = 1 - Math.exp(-lateralGripRate * dt);
  car.velocityX -= correctedRightX * lateralSpeed * lateralDamping;
  car.velocityZ -= correctedRightZ * lateralSpeed * lateralDamping;

  speed = Math.hypot(car.velocityX, car.velocityZ);
  if (speed > maxSpeed + 6) {
    const ratio = (maxSpeed + 6) / speed;
    car.velocityX *= ratio;
    car.velocityZ *= ratio;
    speed = maxSpeed + 6;
  }

  car.x += car.velocityX * dt;
  car.z += car.velocityZ * dt;
  car.speed = speed;
  car.wheelDistance += Math.max(0, car.velocityX * Math.sin(car.heading) + car.velocityZ * Math.cos(car.heading)) * dt;

  const nearestAfter = nearestTrackPoint(track, { x: car.x, z: car.z });
  const totalLength = trackMetrics(track).totalLength;
  const previousProgress = car.progress;
  let progressDelta = nearestAfter.progress - car.progress;
  if (progressDelta < -totalLength / 2) progressDelta += totalLength;
  if (progressDelta > totalLength / 2) progressDelta -= totalLength;
  if (progressDelta > 0 && progressDelta < 50) {
    car.distanceThisLap += progressDelta;
    car.nextCheckpoint = advanceCheckpoints(car.nextCheckpoint, previousProgress, nearestAfter.progress, totalLength);
  }
  if (
    car.progress > totalLength * 0.82
    && nearestAfter.progress < totalLength * 0.18
    && car.distanceThisLap > totalLength * 0.82
    && car.nextCheckpoint >= CHECKPOINTS.length
  ) {
    const lapTime = Math.max(0, raceTime - car.currentLapStartedAt);
    car.lastLapTime = lapTime;
    car.bestLapTime = car.bestLapTime === undefined ? lapTime : Math.min(car.bestLapTime, lapTime);
    car.lap += 1;
    car.distanceThisLap = 0;
    car.nextCheckpoint = 0;
    car.currentLapStartedAt = raceTime;
    if (car.lap > settings.lapCount) {
      car.finished = true;
      car.finishTime = raceTime;
      car.velocityX *= 0.35;
      car.velocityZ *= 0.35;
      car.speed = Math.hypot(car.velocityX, car.velocityZ);
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
    car.velocityX *= 0.22;
    car.velocityZ *= 0.22;
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    car.heading = snap.heading;
    car.impact = 1;
  }

  car.surface = newSurface === "wall" ? "grass" : newSurface;
  const finalRightX = Math.sin(car.heading + Math.PI / 2);
  const finalRightZ = Math.cos(car.heading + Math.PI / 2);
  const finalLateralSpeed = Math.abs(car.velocityX * finalRightX + car.velocityZ * finalRightZ);
  car.slip = clamp(finalLateralSpeed / Math.max(car.speed, 1) * 1.8 + Math.abs(headingError) * speedFactor * 0.22 * (settings.rain ? 1.3 : 1), 0, 1);
}

export function resolveCarContacts(cars: CarState[], settings: RaceSettings) {
  if (settings.ghostMode) return;

  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.finished || b.finished || a.crashed || b.crashed || a.dnf || b.dnf) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.1 || dist === 0) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const avx = a.velocityX;
      const avz = a.velocityZ;
      const bvx = b.velocityX;
      const bvz = b.velocityZ;
      const rvx = avx - bvx;
      const rvz = avz - bvz;
      const closingSpeed = Math.max(0, rvx * nx + rvz * nz);
      const tangentialSpeed = Math.abs(rvx * -nz + rvz * nx);
      const impact = closingSpeed + tangentialSpeed * 0.22;
      if (impact > 13.2) {
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
      const damping = impact > 4.5 ? 0.8 : 0.92;
      a.velocityX *= damping;
      a.velocityZ *= damping;
      b.velocityX *= damping;
      b.velocityZ *= damping;
      a.speed = Math.hypot(a.velocityX, a.velocityZ);
      b.speed = Math.hypot(b.velocityX, b.velocityZ);
      const contactPulse = clamp(0.18 + impact / 20, 0.22, 0.78);
      a.impact = Math.max(a.impact, contactPulse);
      b.impact = Math.max(b.impact, contactPulse);
    }
  }
}

const CHECKPOINTS = [0.25, 0.5, 0.75];

function advanceCheckpoints(current: number, previousProgress: number, nextProgress: number, totalLength: number) {
  let checkpoint = current;
  while (checkpoint < CHECKPOINTS.length) {
    const target = CHECKPOINTS[checkpoint] * totalLength;
    if (!crossedProgress(previousProgress, nextProgress, target, totalLength)) break;
    checkpoint += 1;
  }
  return checkpoint;
}

function crossedProgress(previousProgress: number, nextProgress: number, target: number, totalLength: number) {
  if (previousProgress <= nextProgress) {
    return previousProgress < target && nextProgress >= target;
  }
  return target > previousProgress || target <= nextProgress || totalLength === 0;
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

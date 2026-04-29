import { DEFAULT_CAR_SETUP_ID, DEFAULT_VEHICLE_ID, getVehicle, getVehicleSetup, kmhToInternalSpeed, resolveCarSetupId } from "./cars.js";
import { clamp, isCausewayBridgeProgress, nearestTrackPoint, sampleTrack, trackMetrics, wrap } from "./tracks.js";
import type { CarState, InputFrame, Player, RaceSettings, SurfaceType, TrackDef } from "./types.js";

export const SPEEDOMETER_KMH_PER_UNIT = 8;

export function speedToKmh(speed: number) {
  return speed * SPEEDOMETER_KMH_PER_UNIT;
}

export function createCar(player: Player, track: TrackDef, gridIndex: number, warmupStart = true): CarState {
  const spawn = sampleTrack(track, 5 - gridIndex * 4);
  const side = gridIndex % 2 === 0 ? -1 : 1;
  const row = Math.floor(gridIndex / 2);
  const lateral = side * 2.2;
  const rightHeading = spawn.heading + Math.PI / 2;
  const spawnX = spawn.x + Math.sin(rightHeading) * lateral - Math.sin(spawn.heading) * row * 4;
  const spawnZ = spawn.z + Math.cos(rightHeading) * lateral - Math.cos(spawn.heading) * row * 4;
  const spawnNearest = nearestTrackPoint(track, { x: spawnX, y: spawn.y, z: spawnZ });
  return {
    playerId: player.id,
    vehicleId: player.vehicleId ?? DEFAULT_VEHICLE_ID,
    carSetupId: resolveCarSetupId(player.vehicleId, player.carSetupId ?? DEFAULT_CAR_SETUP_ID),
    x: spawnX,
    y: spawnNearest.y,
    z: spawnZ,
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
    lastValidProgress: spawnNearest.progress,
    timedLapStarted: !warmupStart,
    timedRaceStartedAt: 0,
    currentLapStartedAt: 0,
    wheelDistance: 0,
    surface: "road",
    finished: false,
    crashed: false,
    dnf: false,
    resetAvailable: false,
    impact: 0,
    slip: 0
  };
}

export function stepCar(car: CarState, input: InputFrame, track: TrackDef, settings: RaceSettings, dt: number, raceTime: number) {
  if (car.resetInvulnerableUntil !== undefined && raceTime >= car.resetInvulnerableUntil) {
    car.resetInvulnerableUntil = undefined;
  }

  if (car.finished || car.crashed || car.dnf) {
    car.throttle = 0;
    car.brake = 0;
    car.steer *= 0.92;
    car.velocityX *= Math.pow(0.5, dt);
    car.velocityZ *= Math.pow(0.5, dt);
    car.y = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z }).y;
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    car.wheelDistance += car.speed * dt;
    return;
  }

  const nearestBefore = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z });
  const surface = getSurface(track, nearestBefore.distance, nearestBefore.progress);
  if (car.speed > 0.01 && car.velocityX === 0 && car.velocityZ === 0) {
    car.velocityX = Math.sin(car.heading) * car.speed;
    car.velocityZ = Math.cos(car.heading) * car.speed;
  }

  const vehicle = getVehicle(car.vehicleId);
  const setup = getVehicleSetup(vehicle.id, car.carSetupId);
  const physics = vehicle.physics;
  car.vehicleId = vehicle.id;
  car.carSetupId = setup.id;
  const driveSurface = driveSurfaceFor(surface);
  const rainGrip = settings.rain ? physics.rainGrip : 1;
  const surfaceGrip = physics.surfaceGrip[driveSurface] * setup.multipliers.grip;
  const surfaceDrag = physics.surfaceDrag[driveSurface] * setup.multipliers.drag;
  const grip = surfaceGrip * rainGrip;
  const trackGrade = surface === "wall" ? 0 : clamp(nearestBefore.grade, -0.18, 0.18);
  const downhillSpeedBonus = Math.max(0, -trackGrade) * physics.downhillSpeedBonus;
  const maxSpeed = kmhToInternalSpeed(settings.rain ? physics.rainTopSpeedKmh : physics.dryTopSpeedKmh)
    * setup.multipliers.maxSpeed
    * (surface === "grass" ? physics.grassMaxSpeedMultiplier : 1)
    * (1 + downhillSpeedBonus);

  car.steer = smooth(car.steer, clamp(input.steer, -1, 1), 1 - Math.pow(0.02, dt));
  car.throttle = clamp(input.throttle, 0, 1);
  car.brake = clamp(input.brake, 0, 1);

  let speed = Math.hypot(car.velocityX, car.velocityZ);
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const forwardSpeed = car.velocityX * forwardX + car.velocityZ * forwardZ;
  const accel = physics.acceleration * setup.multipliers.acceleration * car.throttle * clamp(1 - Math.max(0, speed - maxSpeed) / Math.max(1, maxSpeed), 0, 1);
  car.velocityX += forwardX * accel * dt;
  car.velocityZ += forwardZ * accel * dt;

  if (trackGrade !== 0) {
    const trackForwardX = Math.sin(nearestBefore.heading);
    const trackForwardZ = Math.cos(nearestBefore.heading);
    const gradeGrip = surface === "grass" ? 0.62 : surface === "curb" ? 0.88 : 1;
    const gradeAccel = -trackGrade * physics.gradeAcceleration * gradeGrip;
    car.velocityX += trackForwardX * gradeAccel * dt;
    car.velocityZ += trackForwardZ * gradeAccel * dt;
  }

  speed = Math.hypot(car.velocityX, car.velocityZ);
  if (speed > 0.001) {
    const brakeBias = clamp(Math.abs(forwardSpeed) / Math.max(speed, 1), 0.55, 1);
    const braking = physics.braking * setup.multipliers.braking * car.brake * brakeBias;
    const drag = speed * speed * physics.aeroDrag * setup.multipliers.drag + speed * surfaceDrag;
    const nextSpeed = Math.max(0, speed - (braking + drag) * dt);
    const ratio = nextSpeed / speed;
    car.velocityX *= ratio;
    car.velocityZ *= ratio;
    speed = nextSpeed;
  }

  const speedFactor = clamp(speed / physics.steering.speedDivisor, 0, physics.steering.maxSpeedFactor);
  const downforceGrip = downforceGripForSpeed(speed, driveSurface, physics.downforce);
  const drivingGrip = grip * downforceGrip;
  const rightX = Math.sin(car.heading + Math.PI / 2);
  const rightZ = Math.cos(car.heading + Math.PI / 2);
  const lateralBefore = car.velocityX * rightX + car.velocityZ * rightZ;
  const slipRatioBefore = clamp(Math.abs(lateralBefore) / Math.max(speed, 1), 0, 1);
  const steeringAuthority = (physics.steering.base + speedFactor * physics.steering.speedGain) * drivingGrip * (1 - slipRatioBefore * physics.steering.slipReduction);
  car.heading += car.steer * steeringAuthority * dt;

  const targetHeading = nearestBefore.heading;
  const headingError = angleDelta(car.heading, targetHeading);
  const stabilityAssist = settings.stabilityAssist ? physics.stabilityAssist[driveSurface] : 0;
  car.heading -= headingError * stabilityAssist * drivingGrip * dt;

  const correctedRightX = Math.sin(car.heading + Math.PI / 2);
  const correctedRightZ = Math.cos(car.heading + Math.PI / 2);
  const lateralSpeed = car.velocityX * correctedRightX + car.velocityZ * correctedRightZ;
  const lateralGripRate = physics.lateralGripRate[driveSurface] * setup.multipliers.grip * rainGrip * downforceGrip * (1 - car.brake * physics.brakeLateralGripReduction);
  const lateralDamping = 1 - Math.exp(-lateralGripRate * dt);
  car.velocityX -= correctedRightX * lateralSpeed * lateralDamping;
  car.velocityZ -= correctedRightZ * lateralSpeed * lateralDamping;

  speed = Math.hypot(car.velocityX, car.velocityZ);
  if (speed > maxSpeed) {
    const ratio = maxSpeed / speed;
    car.velocityX *= ratio;
    car.velocityZ *= ratio;
    speed = maxSpeed;
  }

  car.x += car.velocityX * dt;
  car.z += car.velocityZ * dt;
  car.speed = speed;
  car.wheelDistance += Math.max(0, car.velocityX * Math.sin(car.heading) + car.velocityZ * Math.cos(car.heading)) * dt;

  const nearestAfter = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z });
  car.y = nearestAfter.y;
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
    if (car.timedLapStarted) {
      const lapTime = Math.max(0, raceTime - car.currentLapStartedAt);
      car.lastLapTime = lapTime;
      car.bestLapTime = car.bestLapTime === undefined ? lapTime : Math.min(car.bestLapTime, lapTime);
      car.lap += 1;
    } else {
      car.timedLapStarted = true;
      car.timedRaceStartedAt = raceTime;
      car.lap = 1;
    }
    car.distanceThisLap = 0;
    car.nextCheckpoint = 0;
    car.currentLapStartedAt = raceTime;
    if (car.lap > settings.lapCount) {
      car.finished = true;
      car.finishTime = Math.max(0, raceTime - car.timedRaceStartedAt);
      car.velocityX *= 0.35;
      car.velocityZ *= 0.35;
      car.speed = Math.hypot(car.velocityX, car.velocityZ);
    }
  }
  car.progress = nearestAfter.progress;

  const newSurface = getSurface(track, nearestAfter.distance, nearestAfter.progress);
  car.impact = 0;
  if (newSurface === "wall") {
    const snap = nearestAfter;
    const maxDistance = wallDistanceLimit(track, nearestAfter.progress);
    const settledDistance = Math.max(track.width / 2 + track.curbWidth, maxDistance - 0.35);
    const dx = car.x - snap.x;
    const dz = car.z - snap.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const normalX = dx / dist;
    const normalZ = dz / dist;
    const outwardSpeed = car.velocityX * normalX + car.velocityZ * normalZ;
    car.x = snap.x + normalX * settledDistance;
    car.y = snap.y;
    car.z = snap.z + normalZ * settledDistance;
    if (outwardSpeed > 0) {
      car.velocityX -= normalX * outwardSpeed * 0.65;
      car.velocityZ -= normalZ * outwardSpeed * 0.65;
    }
    car.velocityX *= 0.24;
    car.velocityZ *= 0.24;
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    car.heading = snap.heading;
    car.impact = 1;
  }

  car.surface = newSurface === "wall" ? "grass" : newSurface;
  if (car.surface === "road" || car.surface === "curb") {
    car.lastValidProgress = nearestAfter.progress;
  }
  const finalRightX = Math.sin(car.heading + Math.PI / 2);
  const finalRightZ = Math.cos(car.heading + Math.PI / 2);
  const finalLateralSpeed = Math.abs(car.velocityX * finalRightX + car.velocityZ * finalRightZ);
  car.slip = clamp(finalLateralSpeed / Math.max(car.speed, 1) * 1.8 + Math.abs(headingError) * speedFactor * 0.22 * (settings.rain ? 1.3 : 1), 0, 1);
  if (shouldRollover(car, physics.rollover, driveSurface)) {
    car.crashed = true;
    car.impact = 1;
    car.velocityX *= 0.2;
    car.velocityZ *= 0.2;
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
  }
}

export function resolveCarContacts(cars: CarState[], settings: RaceSettings) {
  if (settings.ghostMode) return;

  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.finished || b.finished || a.crashed || b.crashed || a.dnf || b.dnf) continue;
      if (isResetInvulnerable(a) || isResetInvulnerable(b)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const aPhysics = getVehicle(a.vehicleId).physics;
      const bPhysics = getVehicle(b.vehicleId).physics;
      const contactDistance = (aPhysics.collisionRadius + bPhysics.collisionRadius) / 2;
      if (dist > contactDistance || dist === 0) continue;
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
      const warmupContact = settings.warmupStart && (!a.timedLapStarted || !b.timedLapStarted);
      const crashImpactThreshold = (aPhysics.crashImpactThreshold + bPhysics.crashImpactThreshold) / 2;
      if (impact > crashImpactThreshold && !warmupContact) {
        a.crashed = true;
        b.crashed = true;
        a.impact = 1;
        b.impact = 1;
        continue;
      }
      const push = (contactDistance - dist) / 2;
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

export function resetCarToTrack(car: CarState, track: TrackDef, raceTime: number) {
  const resetProgress = car.lastValidProgress || car.progress;
  const resetPoint = sampleTrack(track, resetProgress);
  car.x = resetPoint.x;
  car.y = resetPoint.y;
  car.z = resetPoint.z;
  car.heading = resetPoint.heading;
  car.velocityX = Math.sin(resetPoint.heading) * 4;
  car.velocityZ = Math.cos(resetPoint.heading) * 4;
  car.speed = Math.hypot(car.velocityX, car.velocityZ);
  car.steer = 0;
  car.throttle = 0;
  car.brake = 0;
  car.progress = resetProgress;
  car.lastValidProgress = resetProgress;
  car.surface = "road";
  car.crashed = false;
  car.crashedAt = undefined;
  car.resetAvailable = false;
  car.offTrackSince = undefined;
  car.resetInvulnerableUntil = raceTime + 2.5;
  car.impact = 0.45;
  car.slip = 0;
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

function getSurface(track: TrackDef, distanceFromCenter: number, progress?: number): SurfaceType {
  if (distanceFromCenter <= track.width / 2) return "road";
  if (distanceFromCenter <= track.width / 2 + track.curbWidth) return "curb";
  if (distanceFromCenter <= wallDistanceLimit(track, progress)) return "grass";
  return "wall";
}

function wallDistanceLimit(track: TrackDef, progress?: number) {
  return track.width / 2 + track.curbWidth + wallMarginAtProgress(track, progress);
}

function wallMarginAtProgress(track: TrackDef, progress?: number) {
  if (track.id !== "causeway" || progress === undefined) return track.wallMargin;
  const totalLength = trackMetrics(track).totalLength;
  if (totalLength <= 0) return track.wallMargin;
  return isCausewayBridgeProgress(wrap(progress, totalLength) / totalLength) ? 0.75 : track.wallMargin;
}

function driveSurfaceFor(surface: SurfaceType) {
  return surface === "wall" ? "grass" : surface;
}

function downforceGripForSpeed(speed: number, surface: Exclude<SurfaceType, "wall">, downforce: ReturnType<typeof getVehicle>["physics"]["downforce"]) {
  const speedRamp = clamp((speed - downforce.startSpeed) / Math.max(1, downforce.fullSpeed - downforce.startSpeed), 0, 1);
  const maxBonus = surface === "road" ? downforce.roadBonus : surface === "curb" ? downforce.curbBonus : downforce.grassBonus;
  return 1 + speedRamp * maxBonus;
}

function shouldRollover(car: CarState, rollover: ReturnType<typeof getVehicle>["physics"]["rollover"], surface: Exclude<SurfaceType, "wall">) {
  if (!rollover || car.crashed || car.finished || car.dnf || surface === "grass") return false;
  const speedKmh = speedToKmh(car.speed);
  if (speedKmh < rollover.speedKmh || Math.abs(car.steer) < rollover.steer) return false;
  const surfaceBonus = surface === "curb" ? rollover.curbBonus : 0;
  const load = speedKmh / rollover.speedKmh
    + Math.max(0, Math.abs(car.steer) - rollover.steer) * 0.95
    + Math.max(0, car.slip - rollover.slip) * 0.85
    + car.brake * 0.12
    + surfaceBonus;
  return load > 1.38;
}

function isResetInvulnerable(car: CarState) {
  return car.resetInvulnerableUntil !== undefined && car.resetInvulnerableUntil > 0;
}

function smooth(current: number, target: number, amount: number) {
  return current + (target - current) * clamp(amount, 0, 1);
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

import { DEFAULT_CAR_SETUP_ID, DEFAULT_VEHICLE_ID, getVehicle, getVehicleSetup, kmhToInternalSpeed, resolveCarSetupId } from "./cars.js";
import { clamp, isCausewayBridgeProgress, nearestTrackPoint, raceCourseLength, sampleTrack, trackMetrics, wrap } from "./tracks.js";
import type { CarState, InputFrame, Player, RaceSettings, SurfaceType, TrackDef } from "./types.js";

export const SPEEDOMETER_KMH_PER_UNIT = 8;

export function speedToKmh(speed: number) {
  return speed * SPEEDOMETER_KMH_PER_UNIT;
}

export function createCar(player: Player, track: TrackDef, gridIndex: number, warmupStart = true): CarState {
  warmupStart = warmupStart && !track.finishFraction;
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
    slip: 0,
    yawRate: 0,
    longitudinalLoad: 0,
    lateralLoad: 0,
    gripUsage: 0,
    wallImpactSpeed: 0,
    reversing: false,
    roadGrade: spawnNearest.grade,
    rolloverRisk: 0
  };
}

export function stepCar(car: CarState, input: InputFrame, track: TrackDef, settings: RaceSettings, dt: number, raceTime: number) {
  if (car.resetInvulnerableUntil !== undefined && raceTime >= car.resetInvulnerableUntil) {
    car.resetInvulnerableUntil = undefined;
  }

  car.wallImpactSpeed = 0;
  if (car.finished || car.crashed || car.dnf) {
    car.throttle = 0;
    car.brake = 0;
    car.steer *= 0.92;
    car.velocityX *= Math.pow(0.5, dt);
    car.velocityZ *= Math.pow(0.5, dt);
    car.y = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z }).y;
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    car.wheelDistance += car.speed * dt;
    car.rolloverRisk = 0;
    car.yawRate = 0;
    car.reversing = false;
    car.longitudinalLoad = 0;
    car.lateralLoad = 0;
    car.gripUsage = 0;
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
  const wetness = clamp(settings.wetness ?? (settings.rain ? 1 : 0), 0, 1);
  const paceScale = settings.equalPace ? 180 / physics.dryTopSpeedKmh : 1;
  const rainGrip = 1 - wetness * (1 - physics.rainGrip);
  const surfaceGrip = physics.surfaceGrip[driveSurface] * setup.multipliers.grip;
  const surfaceDrag = physics.surfaceDrag[driveSurface] * setup.multipliers.drag;
  const grip = surfaceGrip * rainGrip;
  const trackGrade = surface === "wall" ? 0 : clamp(nearestBefore.grade, -0.18, 0.18);
  const downhillSpeedBonus = Math.max(0, -trackGrade) * physics.downhillSpeedBonus;
  car.reversing = Boolean(input.reverse && (car.reversing || car.speed < 3));
  const forwardCap = kmhToInternalSpeed(physics.dryTopSpeedKmh + wetness * (physics.rainTopSpeedKmh - physics.dryTopSpeedKmh)) * paceScale
    * setup.multipliers.maxSpeed
    * (surface === "grass" ? physics.grassMaxSpeedMultiplier : 1)
    * (1 + downhillSpeedBonus);
  const maxSpeed = car.reversing ? Math.min(2.2, forwardCap) : forwardCap;

  car.steer = smooth(car.steer, clamp(input.steer, -1, 1), 1 - Math.pow(0.02, dt));
  car.throttle = clamp(input.throttle, 0, 1);
  car.brake = clamp(input.brake, 0, 1);

  let speed = Math.hypot(car.velocityX, car.velocityZ);
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const forwardSpeed = car.velocityX * forwardX + car.velocityZ * forwardZ;
  const accel = physics.acceleration * paceScale * setup.multipliers.acceleration * car.throttle * clamp(1 - Math.max(0, speed - maxSpeed) / Math.max(1, maxSpeed), 0, 1);
  const driveDirection = car.reversing ? -1 : 1;
  car.velocityX += forwardX * accel * driveDirection * dt;
  car.velocityZ += forwardZ * accel * driveDirection * dt;

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
    const braking = physics.braking * paceScale * setup.multipliers.braking * car.brake * brakeBias;
    const drag = speed * speed * physics.aeroDrag / paceScale * setup.multipliers.drag + speed * surfaceDrag;
    const nextSpeed = Math.max(0, speed - (braking + drag) * dt);
    const ratio = nextSpeed / speed;
    car.velocityX *= ratio;
    car.velocityZ *= ratio;
    speed = nextSpeed;
  }

  const speedFactor = clamp(speed / (physics.steering.speedDivisor * paceScale), 0, physics.steering.maxSpeedFactor);
  const downforceGrip = downforceGripForSpeed(speed, driveSurface, physics.downforce);
  const drivingGrip = grip * downforceGrip;
  const rightX = Math.sin(car.heading + Math.PI / 2);
  const rightZ = Math.cos(car.heading + Math.PI / 2);
  const lateralBefore = car.velocityX * rightX + car.velocityZ * rightZ;
  const slipRatioBefore = clamp(Math.abs(lateralBefore) / Math.max(speed, 1), 0, 1);
  const steeringAuthority = (physics.steering.base + speedFactor * physics.steering.speedGain) * drivingGrip * (1 - slipRatioBefore * physics.steering.slipReduction);
  // Steering needs rolling tire contact. Yaw inertia differentiates a kart from a truck.
  const rolling = clamp(Math.abs(forwardSpeed) / 3.2, 0, 1);
  const combinedGrip = Math.sqrt(Math.max(0.46, 1 - Math.pow(car.brake * 0.64, 2)));
  const targetYaw = car.steer * steeringAuthority * rolling * combinedGrip * (forwardSpeed < -0.05 ? -1 : 1);
  car.yawRate = smooth(car.yawRate ?? 0, targetYaw, 1 - Math.exp(-physics.yawResponse * dt));
  if (speed < 0.025) car.yawRate = 0;
  car.heading += car.yawRate * dt;
  car.lateralLoad = smooth(car.lateralLoad ?? 0, clamp(car.yawRate * speed / 22, -1, 1), 1 - Math.exp(-9 * dt));

  const targetHeading = nearestBefore.heading;
  const headingError = angleDelta(car.heading, targetHeading);
  const stabilityAssist = settings.stabilityAssist ? physics.stabilityAssist[driveSurface] : 0;
  car.heading -= headingError * stabilityAssist * drivingGrip * rolling * dt;

  const correctedRightX = Math.sin(car.heading + Math.PI / 2);
  const correctedRightZ = Math.cos(car.heading + Math.PI / 2);
  const lateralSpeed = car.velocityX * correctedRightX + car.velocityZ * correctedRightZ;
  const lateralGripRate = physics.lateralGripRate[driveSurface] * setup.multipliers.grip * rainGrip * downforceGrip * (1 - car.brake * physics.brakeLateralGripReduction) * combinedGrip;
  car.gripUsage = clamp(Math.hypot(Math.abs(car.yawRate) * speed / Math.max(12, lateralGripRate * 3), car.brake * 0.7), 0, 1);
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

  const forwardAfter = car.velocityX * forwardX + car.velocityZ * forwardZ;
  const accelLoad = clamp((forwardAfter - forwardSpeed) / Math.max(dt, 0.001) / (physics.acceleration * paceScale), -1, 1);
  car.longitudinalLoad = smooth(car.longitudinalLoad ?? 0, accelLoad, 1 - Math.exp(-8 * dt));
  car.x += car.velocityX * dt;
  car.z += car.velocityZ * dt;
  car.speed = speed;
  car.wheelDistance += (car.velocityX * Math.sin(car.heading) + car.velocityZ * Math.cos(car.heading)) * dt;

  const nearestAfter = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z });
  car.y = nearestAfter.y;
  car.roadGrade = nearestAfter.grade;
  const totalLength = trackMetrics(track).totalLength;
  const courseLength = raceCourseLength(track);
  const previousProgress = car.progress;
  let progressDelta = nearestAfter.progress - car.progress;
  if (progressDelta < -totalLength / 2) progressDelta += totalLength;
  if (progressDelta > totalLength / 2) progressDelta -= totalLength;
  if (progressDelta > 0 && progressDelta < 50) {
    car.distanceThisLap += progressDelta;
    car.nextCheckpoint = advanceCheckpoints(car.nextCheckpoint, previousProgress, nearestAfter.progress, courseLength);
  }
  if (
    (track.finishFraction
      ? car.progress < courseLength && nearestAfter.progress >= courseLength
      : car.progress > totalLength * 0.82 && nearestAfter.progress < totalLength * 0.18)
    && car.distanceThisLap > courseLength * 0.82
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
    if (track.finishFraction || car.lap > settings.lapCount) {
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
      // Resolve only the wall-normal velocity; a scrape keeps forward momentum.
      car.velocityX -= normalX * outwardSpeed * 1.12;
      car.velocityZ -= normalZ * outwardSpeed * 1.12;
      const friction = 1 - clamp(outwardSpeed / Math.max(speed, 1), 0, 1) * 0.22;
      car.velocityX *= friction;
      car.velocityZ *= friction;
    }
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
    car.wallImpactSpeed = Math.max(0, outwardSpeed);
    car.impact = clamp(outwardSpeed / 18, 0.08, 1);
    car.yawRate = (car.yawRate ?? 0) * 0.4;
  }

  car.surface = newSurface === "wall" ? "grass" : newSurface;
  if (car.surface === "road" || car.surface === "curb") {
    car.lastValidProgress = nearestAfter.progress;
  }
  const finalRightX = Math.sin(car.heading + Math.PI / 2);
  const finalRightZ = Math.cos(car.heading + Math.PI / 2);
  const finalLateralSpeed = Math.abs(car.velocityX * finalRightX + car.velocityZ * finalRightZ);
  car.slip = clamp(finalLateralSpeed / Math.max(car.speed, 1) * 1.8 + Math.max(0, (car.gripUsage ?? 0) - 0.65) * 0.4, 0, 1);
  const instantRolloverRisk = rolloverRiskFor(car, physics.rollover, driveSurface, paceScale);
  const rolloverRiskResponse = instantRolloverRisk > car.rolloverRisk ? 1 - Math.pow(0.08, dt) : 1 - Math.pow(0.0015, dt);
  car.rolloverRisk = smooth(car.rolloverRisk, instantRolloverRisk, rolloverRiskResponse);
  if (shouldRollover(car, physics.rollover, driveSurface, car.rolloverRisk, paceScale)) {
    car.crashed = true;
    car.impact = 1;
    car.rolloverRisk = 0;
    car.velocityX *= 0.2;
    car.velocityZ *= 0.2;
    car.speed = Math.hypot(car.velocityX, car.velocityZ);
  }
}

export type ContactCrash = { x: number; y: number; z: number; playerIds: string[]; severity: number };

export function resolveCarContacts(cars: CarState[], settings: RaceSettings): ContactCrash[] {
  const crashes: ContactCrash[] = [];
  if (settings.ghostMode) return crashes;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.finished || b.finished || a.crashed || b.crashed || a.dnf || b.dnf) continue;
      if (isResetInvulnerable(a) || isResetInvulnerable(b) || Math.abs(a.y - b.y) > 2.4) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const ap = getVehicle(a.vehicleId).physics, bp = getVehicle(b.vehicleId).physics;
      const contactDistance = (ap.collisionRadius + bp.collisionRadius) / 2;
      if (dist > contactDistance) continue;
      const rvx = a.velocityX - b.velocityX, rvz = a.velocityZ - b.velocityZ;
      const relativeSpeed = Math.hypot(rvx, rvz);
      const nx = dist > 0.0001 ? dx / dist : relativeSpeed > 0.0001 ? rvx / relativeSpeed : 1;
      const nz = dist > 0.0001 ? dz / dist : relativeSpeed > 0.0001 ? rvz / relativeSpeed : 0;
      const invA = 1 / ap.mass, invB = 1 / bp.mass, invTotal = invA + invB;
      const penetration = contactDistance - dist + 0.005;
      a.x -= nx * penetration * invA / invTotal;
      a.z -= nz * penetration * invA / invTotal;
      b.x += nx * penetration * invB / invTotal;
      b.z += nz * penetration * invB / invTotal;
      const closing = Math.max(0, rvx * nx + rvz * nz);
      if (closing <= 0) continue;
      const tangent = rvx * -nz + rvz * nx;
      const impact = closing + Math.abs(tangent) * 0.08;
      const warmup = settings.warmupStart && (!a.timedLapStarted || !b.timedLapStarted);
      const threshold = (ap.crashImpactThreshold + bp.crashImpactThreshold) / 2;
      const impulse = closing * 1.12 / invTotal;
      const friction = clamp(tangent / invTotal, -impulse * 0.12, impulse * 0.12);
      a.velocityX -= (nx * impulse - nz * friction) * invA;
      a.velocityZ -= (nz * impulse + nx * friction) * invA;
      b.velocityX += (nx * impulse - nz * friction) * invB;
      b.velocityZ += (nz * impulse + nx * friction) * invB;
      for (const car of [a, b]) {
        car.speed = Math.hypot(car.velocityX, car.velocityZ);
        car.impact = Math.max(car.impact, clamp(impact / 18, 0.1, 1));
      }
      if (impact > threshold && !warmup) {
        a.crashed = b.crashed = true;
        a.impact = b.impact = 1;
        crashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, playerIds: [a.playerId, b.playerId], severity: clamp(impact / 24, 0.65, 1) });
      }
    }
  }
  return crashes;
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
  car.rolloverRisk = 0;
  car.yawRate = 0;
  car.longitudinalLoad = 0;
  car.lateralLoad = 0;
  car.gripUsage = 0;
  car.wallImpactSpeed = 0;
  car.reversing = false;
  car.roadGrade = resetPoint.grade;
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
  if (track.sceneryId !== "causeway" || progress === undefined) return track.wallMargin;
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

function shouldRollover(car: CarState, rollover: ReturnType<typeof getVehicle>["physics"]["rollover"], surface: Exclude<SurfaceType, "wall">, accumulatedRisk: number, paceScale = 1) {
  if (!rollover || car.crashed || car.finished || car.dnf || surface === "grass") return false;
  const speedKmh = speedToKmh(car.speed) / paceScale;
  if (speedKmh < rollover.speedKmh || Math.abs(car.steer) < rollover.steer) return false;
  return rolloverLoad(car, rollover, surface, paceScale) > 1.38 && accumulatedRisk > 0.86;
}

function rolloverRiskFor(car: CarState, rollover: ReturnType<typeof getVehicle>["physics"]["rollover"], surface: Exclude<SurfaceType, "wall">, paceScale = 1) {
  if (!rollover || car.crashed || car.finished || car.dnf || surface === "grass") return 0;
  const speedKmh = speedToKmh(car.speed) / paceScale;
  const speedArm = clamp((speedKmh - rollover.speedKmh * 0.72) / (rollover.speedKmh * 0.34), 0, 1);
  const steerArm = clamp((Math.abs(car.steer) - rollover.steer * 0.62) / (rollover.steer * 0.45), 0, 1);
  const loadRisk = clamp((rolloverLoad(car, rollover, surface, paceScale) - 1.03) / 0.35, 0, 1);
  return clamp(loadRisk * speedArm * steerArm, 0, 1);
}

function rolloverLoad(car: CarState, rollover: NonNullable<ReturnType<typeof getVehicle>["physics"]["rollover"]>, surface: Exclude<SurfaceType, "wall">, paceScale = 1) {
  const speedKmh = speedToKmh(car.speed) / paceScale;
  const surfaceBonus = surface === "curb" ? rollover.curbBonus : 0;
  return speedKmh / rollover.speedKmh
    + Math.max(0, Math.abs(car.steer) - rollover.steer) * 0.95
    + Math.max(0, car.slip - rollover.slip) * 0.85
    + car.brake * 0.12
    + surfaceBonus;
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

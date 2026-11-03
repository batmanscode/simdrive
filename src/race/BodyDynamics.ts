import type { CarState, VehicleId } from "../shared/types";
import { bodyMotion } from "./camera";

export type BodyDynamics = {
  vehicleId?: VehicleId;
  playerId?: string;
  pitch: number;
  roll: number;
  pitchVelocity: number;
  rollVelocity: number;
  canopy: number;
  canopyVelocity: number;
};
export const createBodyDynamics = (): BodyDynamics => ({
  pitch: 0,
  roll: 0,
  pitchVelocity: 0,
  rollVelocity: 0,
  canopy: 0,
  canopyVelocity: 0,
});

/** Cosmetic load response only. Road grade remains immediate; dynamics never feed back to physics. */
export function stepBodyDynamics(
  state: BodyDynamics,
  car: CarState,
  delta: number,
  steady = false,
) {
  const target = bodyMotion(car),
    grade = -Math.atan(car.roadGrade ?? 0);
  if (state.playerId !== car.playerId || state.vehicleId !== car.vehicleId) {
    Object.assign(state, createBodyDynamics(), {
      playerId: car.playerId,
      vehicleId: car.vehicleId,
    });
  }
  if (steady) {
    state.pitch = 0;
    state.roll = 0;
    state.pitchVelocity = 0;
    state.rollVelocity = 0;
    state.canopy = 0;
    state.canopyVelocity = 0;
    return { pitch: grade, roll: 0, heave: 0, canopy: 0 };
  }
  const omega =
    car.vehicleId === "stockTruck"
      ? 11
      : car.vehicleId === "tukTuk"
        ? 13
        : car.vehicleId === "kart"
          ? 26
          : 22;
  const damping =
    car.vehicleId === "stockTruck"
      ? 0.76
      : car.vehicleId === "tukTuk"
        ? 0.84
        : 1;
  // Substeps keep a tab stall or slow software-rendering frame from destabilizing a spring.
  let remaining = Math.min(Math.max(delta, 0), 0.12);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    const pitchTarget = target.pitch - grade,
      rollTarget = target.roll;
    state.pitchVelocity +=
      ((pitchTarget - state.pitch) * omega * omega -
        2 * damping * omega * state.pitchVelocity) *
      dt;
    state.rollVelocity +=
      ((rollTarget - state.roll) * omega * omega -
        2 * damping * omega * state.rollVelocity) *
      dt;
    state.pitch += state.pitchVelocity * dt;
    state.roll += state.rollVelocity * dt;
    const clothTarget = -state.roll * 0.15;
    state.canopyVelocity +=
      ((clothTarget - state.canopy) * 64 - 14 * state.canopyVelocity) * dt;
    state.canopy += state.canopyVelocity * dt;
  }
  const compression = -Math.min(
    0.02,
    Math.abs(car.longitudinalLoad ?? 0) *
      (car.vehicleId === "stockTruck" ? 0.018 : 0.005),
  );
  return {
    pitch: grade + state.pitch,
    roll: state.roll,
    heave: compression,
    canopy: Math.max(-0.012, Math.min(0.012, state.canopy)),
  };
}

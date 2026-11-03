import * as THREE from "three";
import type { CarState, TrackDef } from "../shared/types";
import { sampleTrack } from "../shared/tracks";

export function bodyMotion(car: CarState) {
  const strength =
    car.vehicleId === "stockTruck"
      ? 0.065
      : car.vehicleId === "tukTuk"
        ? 0.045
        : car.vehicleId === "kart"
          ? 0.012
          : 0.024;
  return {
    pitch:
      -Math.atan(car.roadGrade ?? 0) - (car.longitudinalLoad ?? 0) * strength,
    roll: (car.lateralLoad ?? 0) * strength,
  };
}

export function cameraRoadLook(track: TrackDef, car: CarState, ahead: number) {
  // A small vertical look-ahead lets the eye follow crests without steering the view into corners.
  const point = sampleTrack(track, car.progress + ahead);
  return THREE.MathUtils.clamp(point.y - car.y, -ahead * 0.18, ahead * 0.18);
}

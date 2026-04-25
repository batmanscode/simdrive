import type { CarSetupId } from "./types.js";

const DISPLAY_KMH_PER_INTERNAL_SPEED_UNIT = 8;

export type CarSetupStats = {
  topSpeedKmh: number;
  acceleration: number;
  grip: number;
  braking: number;
  difficulty: number;
};

export type CarSetup = {
  id: CarSetupId;
  name: string;
  shortName: string;
  description: string;
  multipliers: {
    maxSpeed: number;
    acceleration: number;
    braking: number;
    grip: number;
    drag: number;
  };
  stats: CarSetupStats;
};

export const DEFAULT_CAR_SETUP_ID: CarSetupId = "balanced";

export const CAR_SETUPS: Record<CarSetupId, CarSetup> = {
  balanced: {
    id: "balanced",
    name: "Balanced",
    shortName: "Balanced",
    description: "Predictable speed, braking, and cornering.",
    multipliers: {
      maxSpeed: 1,
      acceleration: 1,
      braking: 1,
      grip: 1,
      drag: 1
    },
    stats: {
      topSpeedKmh: 50 * DISPLAY_KMH_PER_INTERNAL_SPEED_UNIT,
      acceleration: 7,
      grip: 7,
      braking: 7,
      difficulty: 5
    }
  },
  highGrip: {
    id: "highGrip",
    name: "High Grip",
    shortName: "Grip",
    description: "More confidence in corners and braking, with less straight-line speed.",
    multipliers: {
      maxSpeed: 0.94,
      acceleration: 0.96,
      braking: 1.08,
      grip: 1.12,
      drag: 1.08
    },
    stats: {
      topSpeedKmh: Math.round(50 * 0.94 * DISPLAY_KMH_PER_INTERNAL_SPEED_UNIT),
      acceleration: 6,
      grip: 9,
      braking: 8,
      difficulty: 4
    }
  },
  highSpeed: {
    id: "highSpeed",
    name: "High Speed",
    shortName: "Speed",
    description: "More acceleration and top speed, but less stable in corners.",
    multipliers: {
      maxSpeed: 1.08,
      acceleration: 1.05,
      braking: 0.95,
      grip: 0.93,
      drag: 0.88
    },
    stats: {
      topSpeedKmh: Math.round(50 * 1.08 * DISPLAY_KMH_PER_INTERNAL_SPEED_UNIT),
      acceleration: 8,
      grip: 6,
      braking: 6,
      difficulty: 7
    }
  }
};

export function getCarSetup(id?: CarSetupId) {
  return id ? CAR_SETUPS[id] ?? CAR_SETUPS[DEFAULT_CAR_SETUP_ID] : CAR_SETUPS[DEFAULT_CAR_SETUP_ID];
}

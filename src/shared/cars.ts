import type { CarSetupId, SurfaceType, VehicleId } from "./types.js";

export const DISPLAY_KMH_PER_INTERNAL_SPEED_UNIT = 8;
export const VEHICLE_STAT_TOP_SPEED_MAX_KMH = 390;

type DriveSurface = Exclude<SurfaceType, "wall">;
export type EngineWaveform = "sine" | "square" | "sawtooth" | "triangle";

export type CarSetupStats = {
  topSpeedKmh: number;
  acceleration: number;
  grip: number;
  braking: number;
  difficulty: number;
};

export type CarSetupMultipliers = {
  maxSpeed: number;
  acceleration: number;
  braking: number;
  grip: number;
  drag: number;
};

export type CarSetup = {
  id: CarSetupId;
  vehicleId: VehicleId;
  name: string;
  shortName: string;
  description: string;
  multipliers: CarSetupMultipliers;
  stats: CarSetupStats;
};

export type VehiclePhysicsProfile = {
  dryTopSpeedKmh: number;
  rainTopSpeedKmh: number;
  acceleration: number;
  braking: number;
  aeroDrag: number;
  surfaceDrag: Record<DriveSurface, number>;
  surfaceGrip: Record<DriveSurface, number>;
  rainGrip: number;
  grassMaxSpeedMultiplier: number;
  downhillSpeedBonus: number;
  gradeAcceleration: number;
  steering: {
    base: number;
    speedGain: number;
    speedDivisor: number;
    maxSpeedFactor: number;
    slipReduction: number;
  };
  lateralGripRate: Record<DriveSurface, number>;
  downforce: {
    startSpeed: number;
    fullSpeed: number;
    roadBonus: number;
    curbBonus: number;
    grassBonus: number;
  };
  brakeLateralGripReduction: number;
  stabilityAssist: Record<DriveSurface, number>;
  collisionRadius: number;
  crashImpactThreshold: number;
  wallExplosionSpeedKmh: number;
  rollover?: {
    speedKmh: number;
    steer: number;
    slip: number;
    curbBonus: number;
  };
};

export type VehicleAudioProfile = {
  engineWave: EngineWaveform;
  engineBaseHz: number;
  engineRangeHz: number;
  revSpeedDivisor: number;
  throttleRev: number;
  maxRev: number;
  baseGain: number;
  revGain: number;
  tireGain: number;
  tireFilterBaseHz: number;
  tireFilterSpeedHz: number;
  brakeBaseHz: number;
  brakeRangeHz: number;
  brakeGain: number;
  curbHz: number;
  curbGain: number;
  impactGain: number;
};

export type VehicleHapticProfile = {
  crashPattern: number[];
  impactMs: number;
  impactScale: number;
  brakePattern: number[];
  curbMs: number;
  grassMs: number;
  slipMs: number;
};

export type VehicleDefinition = {
  id: VehicleId;
  name: string;
  shortName: string;
  description: string;
  researchBasis: string;
  defaultSetupId: CarSetupId;
  setupOrder: CarSetupId[];
  setups: Partial<Record<CarSetupId, CarSetup>>;
  physics: VehiclePhysicsProfile;
  audio: VehicleAudioProfile;
  haptics: VehicleHapticProfile;
  camera: {
    height: number;
    back: number;
    lateral: number;
    lookAhead: number;
    lookHeight: number;
  };
};

const FORMULA_PHYSICS: VehiclePhysicsProfile = {
  dryTopSpeedKmh: 365,
  rainTopSpeedKmh: 322,
  acceleration: 24.5,
  braking: 39,
  aeroDrag: 0.0034,
  surfaceDrag: { road: 0.052, curb: 0.13, grass: 0.58 },
  surfaceGrip: { road: 1, curb: 0.84, grass: 0.42 },
  rainGrip: 0.72,
  grassMaxSpeedMultiplier: 0.64,
  downhillSpeedBonus: 2.2,
  gradeAcceleration: 42,
  steering: { base: 0.62, speedGain: 1.42, speedDivisor: 34, maxSpeedFactor: 1.35, slipReduction: 0.28 },
  lateralGripRate: { road: 8.5, curb: 5.6, grass: 2.7 },
  downforce: { startSpeed: 8, fullSpeed: 44, roadBonus: 0.34, curbBonus: 0.23, grassBonus: 0.08 },
  brakeLateralGripReduction: 0.18,
  stabilityAssist: { road: 0.3, curb: 0.13, grass: 0.2 },
  collisionRadius: 2.1,
  crashImpactThreshold: 13.2,
  wallExplosionSpeedKmh: 192
};

const KART_PHYSICS: VehiclePhysicsProfile = {
  dryTopSpeedKmh: 125,
  rainTopSpeedKmh: 100,
  acceleration: 13.5,
  braking: 24,
  aeroDrag: 0.0048,
  surfaceDrag: { road: 0.06, curb: 0.15, grass: 0.62 },
  surfaceGrip: { road: 1.16, curb: 0.82, grass: 0.36 },
  rainGrip: 0.64,
  grassMaxSpeedMultiplier: 0.52,
  downhillSpeedBonus: 1.45,
  gradeAcceleration: 28,
  steering: { base: 0.9, speedGain: 0.86, speedDivisor: 18, maxSpeedFactor: 1.22, slipReduction: 0.34 },
  lateralGripRate: { road: 10.2, curb: 5.8, grass: 2.25 },
  downforce: { startSpeed: 8, fullSpeed: 28, roadBonus: 0.03, curbBonus: 0.01, grassBonus: 0 },
  brakeLateralGripReduction: 0.2,
  stabilityAssist: { road: 0.21, curb: 0.08, grass: 0.12 },
  collisionRadius: 1.62,
  crashImpactThreshold: 9.8,
  wallExplosionSpeedKmh: 112
};

const STOCK_TRUCK_PHYSICS: VehiclePhysicsProfile = {
  dryTopSpeedKmh: 285,
  rainTopSpeedKmh: 238,
  acceleration: 15.8,
  braking: 25.5,
  aeroDrag: 0.0043,
  surfaceDrag: { road: 0.066, curb: 0.15, grass: 0.57 },
  surfaceGrip: { road: 0.88, curb: 0.74, grass: 0.35 },
  rainGrip: 0.68,
  grassMaxSpeedMultiplier: 0.58,
  downhillSpeedBonus: 1.8,
  gradeAcceleration: 34,
  steering: { base: 0.42, speedGain: 0.9, speedDivisor: 32, maxSpeedFactor: 1.08, slipReduction: 0.38 },
  lateralGripRate: { road: 6.4, curb: 4.1, grass: 2.05 },
  downforce: { startSpeed: 10, fullSpeed: 38, roadBonus: 0.08, curbBonus: 0.04, grassBonus: 0.01 },
  brakeLateralGripReduction: 0.22,
  stabilityAssist: { road: 0.24, curb: 0.1, grass: 0.16 },
  collisionRadius: 2.36,
  crashImpactThreshold: 16,
  wallExplosionSpeedKmh: 176
};

const TUK_TUK_PHYSICS: VehiclePhysicsProfile = {
  dryTopSpeedKmh: 65,
  rainTopSpeedKmh: 52,
  acceleration: 5.4,
  braking: 10.5,
  aeroDrag: 0.0062,
  surfaceDrag: { road: 0.072, curb: 0.18, grass: 0.64 },
  surfaceGrip: { road: 0.62, curb: 0.44, grass: 0.28 },
  rainGrip: 0.58,
  grassMaxSpeedMultiplier: 0.42,
  downhillSpeedBonus: 1.25,
  gradeAcceleration: 18,
  steering: { base: 0.46, speedGain: 0.78, speedDivisor: 13, maxSpeedFactor: 0.95, slipReduction: 0.44 },
  lateralGripRate: { road: 3.4, curb: 2.15, grass: 1.25 },
  downforce: { startSpeed: 8, fullSpeed: 20, roadBonus: 0, curbBonus: 0, grassBonus: 0 },
  brakeLateralGripReduction: 0.24,
  stabilityAssist: { road: 0.12, curb: 0.04, grass: 0.08 },
  collisionRadius: 1.48,
  crashImpactThreshold: 7.3,
  wallExplosionSpeedKmh: 58,
  rollover: { speedKmh: 43, steer: 0.64, slip: 0.34, curbBonus: 0.18 }
};

const DEFAULT_SETUP_MULTIPLIERS: Record<CarSetupId, CarSetupMultipliers> = {
  balanced: { maxSpeed: 1, acceleration: 1, braking: 1, grip: 1, drag: 1 },
  highGrip: { maxSpeed: 0.94, acceleration: 0.96, braking: 1.08, grip: 1.12, drag: 1.08 },
  highSpeed: { maxSpeed: 1.07, acceleration: 1.05, braking: 0.95, grip: 0.93, drag: 0.88 }
};

function setup(vehicleId: VehicleId, id: CarSetupId, topSpeedKmh: number, stats: Omit<CarSetupStats, "topSpeedKmh">, copy: { name: string; shortName: string; description: string }, multipliers = DEFAULT_SETUP_MULTIPLIERS[id]): CarSetup {
  return {
    id,
    vehicleId,
    ...copy,
    multipliers,
    stats: {
      topSpeedKmh,
      ...stats
    }
  };
}

export const DEFAULT_VEHICLE_ID: VehicleId = "formula";
export const DEFAULT_CAR_SETUP_ID: CarSetupId = "balanced";
export const VEHICLE_ORDER: VehicleId[] = ["formula", "kart", "stockTruck", "tukTuk"];

export const VEHICLES: Record<VehicleId, VehicleDefinition> = {
  formula: {
    id: "formula",
    name: "Formula Prototype",
    shortName: "Formula",
    description: "High-downforce single seater with huge braking, aero grip, and very high top speed.",
    researchBasis: "Modern F1-style baseline: FIA 2025 mass and hybrid power-unit limits, with real speed-trap context keeping race trim below 400 km/h.",
    defaultSetupId: "balanced",
    setupOrder: ["balanced", "highGrip", "highSpeed"],
    setups: {
      balanced: setup("formula", "balanced", 365, { acceleration: 9, grip: 9, braking: 10, difficulty: 7 }, {
        name: "Balanced",
        shortName: "Balanced",
        description: "Race-trim aero, strong braking, and predictable high-speed grip."
      }),
      highGrip: setup("formula", "highGrip", 343, { acceleration: 8, grip: 10, braking: 10, difficulty: 6 }, {
        name: "High Grip",
        shortName: "Grip",
        description: "More wing and bite through corners, with less straight-line speed."
      }),
      highSpeed: setup("formula", "highSpeed", 391, { acceleration: 10, grip: 8, braking: 9, difficulty: 8 }, {
        name: "High Speed",
        shortName: "Speed",
        description: "Lower drag and more speed, but less settled in fast bends."
      })
    },
    physics: FORMULA_PHYSICS,
    audio: {
      engineWave: "triangle",
      engineBaseHz: 76,
      engineRangeHz: 260,
      revSpeedDivisor: 42,
      throttleRev: 0.48,
      maxRev: 1.35,
      baseGain: 0.034,
      revGain: 0.076,
      tireGain: 0.085,
      tireFilterBaseHz: 780,
      tireFilterSpeedHz: 42,
      brakeBaseHz: 160,
      brakeRangeHz: 380,
      brakeGain: 0.06,
      curbHz: 38,
      curbGain: 0.05,
      impactGain: 1
    },
    haptics: {
      crashPattern: [120, 45, 190, 55, 90],
      impactMs: 45,
      impactScale: 95,
      brakePattern: [18, 24, 18],
      curbMs: 18,
      grassMs: 24,
      slipMs: 16
    },
    camera: { height: 1.55, back: 0.2, lateral: 0.12, lookAhead: 18, lookHeight: 1.1 }
  },
  kart: {
    id: "kart",
    name: "KZ Kart",
    shortName: "Kart",
    description: "Light 125 cc shifter kart: low top speed, sharp steering, no aero safety net.",
    researchBasis: "FIA KZ karting reference: 125 cc two-stroke, six-speed gearbox, about 50 hp, 175 kg minimum with driver, top speed approaching 180 km/h; game trim uses a tighter sprint-circuit top speed.",
    defaultSetupId: "balanced",
    setupOrder: ["balanced"],
    setups: {
      balanced: setup("kart", "balanced", 125, { acceleration: 6, grip: 7, braking: 7, difficulty: 6 }, {
        name: "Fixed Sprint",
        shortName: "Fixed",
        description: "One simple kart setup: quick response, short gearing, and curb-sensitive grip."
      })
    },
    physics: KART_PHYSICS,
    audio: {
      engineWave: "sawtooth",
      engineBaseHz: 118,
      engineRangeHz: 420,
      revSpeedDivisor: 15,
      throttleRev: 0.72,
      maxRev: 1.55,
      baseGain: 0.026,
      revGain: 0.088,
      tireGain: 0.105,
      tireFilterBaseHz: 1040,
      tireFilterSpeedHz: 64,
      brakeBaseHz: 230,
      brakeRangeHz: 430,
      brakeGain: 0.052,
      curbHz: 52,
      curbGain: 0.076,
      impactGain: 0.8
    },
    haptics: {
      crashPattern: [80, 32, 120, 42, 70],
      impactMs: 32,
      impactScale: 70,
      brakePattern: [12, 18, 12],
      curbMs: 24,
      grassMs: 28,
      slipMs: 20
    },
    camera: { height: 0.98, back: 0.12, lateral: 0.08, lookAhead: 15, lookHeight: 0.7 }
  },
  stockTruck: {
    id: "stockTruck",
    name: "Stock Truck",
    shortName: "Truck",
    description: "NASCAR-truck-inspired pickup racer: heavy, powerful, draggy, and happier when you brake early.",
    researchBasis: "NASCAR Craftsman Truck Series / Ilmor reference: spec V8 racing pickup with high horsepower, long-life truck-series engine support, and roughly 180 mph straight-line context.",
    defaultSetupId: "balanced",
    setupOrder: ["balanced", "highGrip", "highSpeed"],
    setups: {
      balanced: setup("stockTruck", "balanced", 285, { acceleration: 6, grip: 5, braking: 5, difficulty: 6 }, {
        name: "Balanced",
        shortName: "Balanced",
        description: "Road-course compromise with manageable rear grip and braking."
      }),
      highGrip: setup("stockTruck", "highGrip", 268, { acceleration: 5, grip: 7, braking: 6, difficulty: 5 }, {
        name: "High Grip",
        shortName: "Grip",
        description: "Short-track style grip and braking, at the cost of straight-line speed."
      }),
      highSpeed: setup("stockTruck", "highSpeed", 305, { acceleration: 7, grip: 4, braking: 4, difficulty: 8 }, {
        name: "High Speed",
        shortName: "Speed",
        description: "Low-drag superspeedway feel: fast, heavy, and easier to slide."
      })
    },
    physics: STOCK_TRUCK_PHYSICS,
    audio: {
      engineWave: "square",
      engineBaseHz: 48,
      engineRangeHz: 150,
      revSpeedDivisor: 34,
      throttleRev: 0.38,
      maxRev: 1.18,
      baseGain: 0.046,
      revGain: 0.078,
      tireGain: 0.092,
      tireFilterBaseHz: 640,
      tireFilterSpeedHz: 34,
      brakeBaseHz: 130,
      brakeRangeHz: 300,
      brakeGain: 0.072,
      curbHz: 31,
      curbGain: 0.062,
      impactGain: 1.28
    },
    haptics: {
      crashPattern: [150, 55, 230, 60, 120],
      impactMs: 60,
      impactScale: 120,
      brakePattern: [24, 30, 24],
      curbMs: 24,
      grassMs: 32,
      slipMs: 18
    },
    camera: { height: 1.82, back: 0.42, lateral: 0.1, lookAhead: 20, lookHeight: 1.35 }
  },
  tukTuk: {
    id: "tukTuk",
    name: "Tuk-Tuk",
    shortName: "Tuk",
    description: "Small urban three-wheeler with tiny power, narrow track, modest brakes, and real rollover risk.",
    researchBasis: "Bajaj RE-style reference: 236 cc petrol three-wheeler, 7.6 kW, 19.2 Nm, 2000 mm wheelbase, 1300 mm width, 1700 mm height, and about 65 km/h top speed.",
    defaultSetupId: "balanced",
    setupOrder: ["balanced"],
    setups: {
      balanced: setup("tukTuk", "balanced", 65, { acceleration: 2, grip: 3, braking: 2, difficulty: 8 }, {
        name: "City Stock",
        shortName: "Stock",
        description: "One stock road setup. It is slow, narrow, and punishes sharp turns at speed."
      })
    },
    physics: TUK_TUK_PHYSICS,
    audio: {
      engineWave: "square",
      engineBaseHz: 58,
      engineRangeHz: 112,
      revSpeedDivisor: 8,
      throttleRev: 0.62,
      maxRev: 1.28,
      baseGain: 0.03,
      revGain: 0.062,
      tireGain: 0.055,
      tireFilterBaseHz: 520,
      tireFilterSpeedHz: 30,
      brakeBaseHz: 115,
      brakeRangeHz: 220,
      brakeGain: 0.045,
      curbHz: 26,
      curbGain: 0.09,
      impactGain: 0.92
    },
    haptics: {
      crashPattern: [95, 40, 150, 60, 130],
      impactMs: 38,
      impactScale: 85,
      brakePattern: [20, 32, 20],
      curbMs: 28,
      grassMs: 30,
      slipMs: 24
    },
    camera: { height: 1.42, back: 0.25, lateral: 0.05, lookAhead: 14, lookHeight: 1.08 }
  }
};

export const CAR_SETUPS: Record<CarSetupId, CarSetup> = VEHICLES.formula.setups as Record<CarSetupId, CarSetup>;

export function kmhToInternalSpeed(kmh: number) {
  return kmh / DISPLAY_KMH_PER_INTERNAL_SPEED_UNIT;
}

export function getVehicle(id?: VehicleId) {
  return id ? VEHICLES[id] ?? VEHICLES[DEFAULT_VEHICLE_ID] : VEHICLES[DEFAULT_VEHICLE_ID];
}

export function getVehicleSetups(vehicleId?: VehicleId) {
  const vehicle = getVehicle(vehicleId);
  return vehicle.setupOrder.map((setupId) => vehicle.setups[setupId]).filter((item): item is CarSetup => Boolean(item));
}

export function hasVehicleSetup(vehicleId: VehicleId | undefined, setupId: CarSetupId | undefined) {
  if (!setupId) return false;
  return Boolean(getVehicle(vehicleId).setups[setupId]);
}

export function getDefaultSetupIdForVehicle(vehicleId?: VehicleId) {
  return getVehicle(vehicleId).defaultSetupId;
}

export function resolveCarSetupId(vehicleId?: VehicleId, setupId?: CarSetupId) {
  const vehicle = getVehicle(vehicleId);
  return setupId && vehicle.setups[setupId] ? setupId : vehicle.defaultSetupId;
}

export function getCarSetup(id?: CarSetupId, vehicleId?: VehicleId) {
  return getVehicleSetup(vehicleId, id);
}

export function getVehicleSetup(vehicleId?: VehicleId, setupId?: CarSetupId) {
  const vehicle = getVehicle(vehicleId);
  return vehicle.setups[resolveCarSetupId(vehicle.id, setupId)] ?? vehicle.setups[vehicle.defaultSetupId]!;
}

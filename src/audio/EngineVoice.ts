import type { CarState, VehicleId } from "../shared/types";
import { getVehicle, getVehicleSetup } from "../shared/cars";
import { clamp } from "../shared/tracks";

// Cosmetic shift points only: race acceleration, gearing and top speed stay server-owned.
const SHIFTS: Record<VehicleId, number[]> = {
  formula: [62, 100, 143, 188, 238, 289, 337, 410],
  kart: [23, 42, 61, 80, 100, 135],
  stockTruck: [60, 115, 180, 315],
  tukTuk: [13, 26, 43, 72],
};
// Balance each spectrum against the existing tire and countdown cues.
const VOICE_LEVEL: Record<VehicleId, number> = {
  formula: 1.45,
  kart: 1.45,
  stockTruck: 1.65,
  tukTuk: 1.95,
};
const HARMONICS: Record<VehicleId, number[]> = {
  formula: [0, 1, 0.4, 0.29, 0.14, 0.1, 0.06, 0.035],
  kart: [0, 1, 0.26, 0.45, 0.15, 0.25, 0.09, 0.12],
  stockTruck: [0, 1, 0.13, 0.44, 0.07, 0.19, 0.04, 0.09],
  tukTuk: [0, 1, 0.45, 0.22, 0.31, 0.08, 0.11, 0.04],
};
export type EngineState = {
  vehicleId?: VehicleId;
  playerId?: string;
  gear: number;
  rpm: number;
  shiftUntil: number;
  lastShift: number;
  lastTime?: number;
};
export type EngineVoice = {
  state: EngineState;
  oscillators: OscillatorNode[];
  harmonicGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  intake: AudioBufferSourceNode;
  intakeFilter: BiquadFilterNode;
  intakeGain: GainNode;
  waves: Record<VehicleId, PeriodicWave>;
};
export function createEngineVoice(
  context: BaseAudioContext,
  output: AudioNode,
  noise: AudioBuffer,
): EngineVoice {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(output);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.45;
  filter.connect(gain);
  const fundamental = context.createOscillator(),
    harmonic = context.createOscillator(),
    harmonicGain = context.createGain();
  fundamental.connect(filter);
  harmonic.connect(harmonicGain);
  harmonicGain.gain.value = 0.12;
  harmonicGain.connect(filter);
  fundamental.start();
  harmonic.start();
  const intake = context.createBufferSource();
  intake.buffer = noise;
  intake.loop = true;
  const intakeFilter = context.createBiquadFilter(),
    intakeGain = context.createGain();
  intakeFilter.type = "bandpass";
  intakeFilter.frequency.value = 220;
  intakeFilter.Q.value = 0.6;
  intakeGain.gain.value = 0;
  intake.connect(intakeFilter);
  intakeFilter.connect(intakeGain);
  intakeGain.connect(output);
  intake.start();
  const waves = Object.fromEntries(
    (Object.keys(HARMONICS) as VehicleId[]).map((id) => [
      id,
      context.createPeriodicWave(
        new Float32Array(HARMONICS[id].length),
        new Float32Array(HARMONICS[id]),
      ),
    ]),
  ) as Record<VehicleId, PeriodicWave>;
  return {
    state: { gear: 0, rpm: 0.24, shiftUntil: 0, lastShift: -1 },
    oscillators: [fundamental, harmonic],
    harmonicGain,
    filter,
    gain,
    intake,
    intakeFilter,
    intakeGain,
    waves,
  };
}

export function engineEnvelope(
  state: EngineState,
  car: CarState,
  now: number,
  equalPace = false,
) {
  const vehicle = getVehicle(car.vehicleId),
    setup = getVehicleSetup(car.vehicleId, car.carSetupId);
  const scale =
    (equalPace ? 180 / vehicle.physics.dryTopSpeedKmh : 1) *
    setup.multipliers.maxSpeed;
  const speed = Math.max(0, car.speed * 8),
    thresholds = SHIFTS[car.vehicleId];
  const changed =
    state.vehicleId !== car.vehicleId || state.playerId !== car.playerId;
  if (changed || state.lastTime === undefined) {
    const gear = thresholds.findIndex((limit) => speed < limit * scale);
    state.gear = gear < 0 ? thresholds.length - 1 : gear;
    state.rpm = 0.28;
    state.shiftUntil = now;
    state.lastShift = now;
    state.vehicleId = car.vehicleId;
    state.playerId = car.playerId;
  }
  const dt = clamp(now - (state.lastTime ?? now), 0, 0.1);
  state.lastTime = now;
  if (now - state.lastShift > 0.38) {
    if (
      state.gear < thresholds.length - 1 &&
      speed > thresholds[state.gear] * scale
    ) {
      state.gear++;
      state.lastShift = now;
      state.shiftUntil = now + 0.1;
    } else if (
      state.gear > 0 &&
      speed < thresholds[state.gear - 1] * scale * 0.79
    ) {
      state.gear--;
      state.lastShift = now;
      state.shiftUntil = now + 0.07;
    }
  }
  // Signed travel distinguishes slow reverse from a forward acceleration blip.
  const reverse =
    car.velocityX * Math.sin(car.heading) +
      car.velocityZ * Math.cos(car.heading) <
    -0.2;
  const top = thresholds[reverse ? 0 : state.gear] * scale;
  const target = clamp(
    0.24 +
      (speed / Math.max(1, top)) * 0.69 +
      car.throttle * (reverse ? 0.04 : 0.13),
    0.24,
    1.08,
  );
  state.rpm +=
    (target - state.rpm) * (1 - Math.exp(-dt * (car.throttle > 0.1 ? 9 : 4.8)));
  const shifting = now < state.shiftUntil;
  const load =
    clamp(car.throttle * (1 - car.brake * 0.65), 0, 1) * (shifting ? 0.2 : 1);
  return { rpm: state.rpm, load, changed, shifting };
}

export function updateEngineVoice(
  voice: EngineVoice,
  car: CarState | undefined,
  now: number,
  equalPace = false,
) {
  if (!car || car.crashed || car.finished || car.dnf) {
    silenceEngineVoice(voice, now);
    return;
  }
  const profile = getVehicle(car.vehicleId).audio,
    envelope = engineEnvelope(voice.state, car, now, equalPace);
  if (envelope.changed) {
    voice.oscillators[0].setPeriodicWave(voice.waves[car.vehicleId]);
    voice.oscillators[1].setPeriodicWave(voice.waves[car.vehicleId]);
  }
  const hz = profile.engineBaseHz + envelope.rpm * profile.engineRangeHz;
  voice.oscillators[0].frequency.setTargetAtTime(hz, now, 0.04);
  voice.oscillators[1].frequency.setTargetAtTime(
    hz * (car.vehicleId === "stockTruck" ? 0.5 : 2.005),
    now,
    0.045,
  );
  voice.harmonicGain.gain.setTargetAtTime(
    car.vehicleId === "stockTruck" ? 0.24 : 0.1 + envelope.load * 0.09,
    now,
    0.08,
  );
  voice.filter.frequency.setTargetAtTime(
    hz * (3.0 + envelope.load * (car.vehicleId === "tukTuk" ? 3.8 : 5.5)),
    now,
    0.065,
  );
  voice.gain.gain.setTargetAtTime(
    (profile.baseGain * 0.67 + envelope.rpm * profile.revGain * 0.66) *
      (0.67 + envelope.load * 0.33) *
      VOICE_LEVEL[car.vehicleId],
    now,
    0.07,
  );
  voice.intakeFilter.frequency.setTargetAtTime(
    140 + envelope.rpm * 500,
    now,
    0.09,
  );
  voice.intakeGain.gain.setTargetAtTime(
    envelope.load *
      envelope.rpm *
      (car.vehicleId === "stockTruck" ? 0.012 : 0.006),
    now,
    0.08,
  );
}

export function silenceEngineVoice(voice: EngineVoice, now: number) {
  voice.gain.gain.setTargetAtTime(0, now, 0.065);
  voice.intakeGain.gain.setTargetAtTime(0, now, 0.065);
  voice.state.lastTime = undefined;
}

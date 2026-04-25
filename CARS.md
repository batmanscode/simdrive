# Cars

Quick reference for car definitions and tuning values. Use this as the human-facing place to see and adjust car parameters. Right now there is one formula-style car with three driver-selectable setups.

Implementation note: player-facing setup names, stat bars, and setup multipliers live in `src/shared/cars.ts`. The base physics values live in `src/shared/physics.ts`.

Speed note: physics uses internal speed units. The speedometer displays `1 internal speed unit = 8 km/h`, so the dry road cap of `50` displays as `400 km/h`.

## Formula Prototype

### Selectable Setups

| Setup | Dry Road Top Speed | Accel | Grip | Brake | Difficulty | Physics Multipliers | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Balanced | `400 km/h` | `7/10` | `7/10` | `7/10` | `5/10` | speed `1.00`, accel `1.00`, brake `1.00`, grip `1.00`, drag `1.00` | Neutral default. |
| High Grip | `376 km/h` | `6/10` | `9/10` | `8/10` | `4/10` | speed `0.94`, accel `0.96`, brake `1.08`, grip `1.12`, drag `1.08` | Easier cornering and braking, slower on straights. |
| High Speed | `432 km/h` | `8/10` | `6/10` | `6/10` | `7/10` | speed `1.08`, accel `1.05`, brake `0.95`, grip `0.93`, drag `0.88` | Faster on straights, less settled through corners. |

### Base Physics

| Parameter | Current Value | Notes |
| --- | ---: | --- |
| Player differences | Selected setup | Balanced, High Grip, or High Speed multipliers are applied per player. |
| Dry road max speed | `50` / `400 km/h` speedometer | Base road cap. |
| Rain road max speed | `44` / `352 km/h` speedometer | Used when rain is on. |
| Extra speed cap margin | `0` | Absolute cap is the current surface max. |
| Grass max speed multiplier | `0.64` | Applied to dry/rain max speed. |
| Acceleration | `22.5` | Multiplied by throttle and reduced near max speed. |
| Braking | `35` | Multiplied by brake and forward-speed bias. |
| Aero drag | `speed^2 * 0.003` | Always active. |
| Road drag | `0.05` | Surface drag term. |
| Curb drag | `0.12` | Surface drag term. |
| Grass drag | `0.55` | Surface drag term. |
| Dry grip multiplier | `1.0` | Global grip in dry mode. |
| Rain grip multiplier | `0.72` | Global grip in rain mode. |
| Road grip | `1.0` | Surface grip. |
| Curb grip | `0.84` | Surface grip. |
| Grass grip | `0.42` | Surface grip. |
| Road lateral damping | `8.5` | Multiplied by rain grip. |
| Curb lateral damping | `5.6` | Multiplied by rain grip. |
| Grass lateral damping | `2.7` | Multiplied by rain grip. |
| Downforce grip ramp | starts at `8`, full by `44` internal speed | Adds speed-based grip as the car gets faster. |
| Road downforce grip bonus | up to `+32%` | Applied to steering authority, gentle assist, and lateral damping. |
| Curb downforce grip bonus | up to `+22%` | Lower than road so curbs remain unsettled. |
| Grass downforce grip bonus | up to `+8%` | Small by design so off-track remains punishing. |
| Brake lateral grip reduction | `brake * 0.18` | Reduces lateral damping while braking. |
| Steering base | `0.62` | Part of steering authority. |
| Steering speed scale | `speed / 34`, capped `1.35` | Part of steering authority. |
| Steering speed gain | `1.42` | Part of steering authority. |
| Slip steering reduction | `slipRatio * 0.28` | Reduces steering authority while sliding. |
| Road gentle assist | `0.3` | Only if gentle assist is on. |
| Curb gentle assist | `0.13` | Only if gentle assist is on. |
| Grass gentle assist | `0.2` | Only if gentle assist is on. |
| Collision radius | `2.1` | Car-to-car contact threshold. |
| Crash impact threshold | `13.2` | Directional impact above this crashes both cars. |
| Heavy contact threshold | `4.5` | Above this uses stronger velocity damping. |
| Heavy contact damping | `0.8` | Velocity multiplier. |
| Light contact damping | `0.92` | Velocity multiplier. |
| Wall hit damping | `0.22` | Velocity multiplier on wall contact. |
| Finish slowdown | `0.35` | Velocity multiplier after race finish. |

## Visual Params

| Parameter | Current Value | Notes |
| --- | ---: | --- |
| Car visual type | Procedural formula-style open wheel | Built in `CarModel`. |
| Cockpit visual type | Procedural nose/front tyres/cockpit | Built in `Cockpit`. |
| Wheel spin scale | `wheelDistance * 3.1` | Visual only. |
| External visual wheel steer | `0.48 rad` | Binary left/right/straight. |
| Cockpit visual wheel steer | `0.52 rad` | Binary left/right/straight. |

## Future Structure

If/when multiple car models are added, keep setup data structured and add car model definitions with fields like:

```ts
type CarDefinition = {
  id: string;
  name: string;
  maxSpeedDry: number;
  maxSpeedRain: number;
  acceleration: number;
  braking: number;
  grip: {
    road: number;
    curb: number;
    grass: number;
    rainMultiplier: number;
  };
  drag: {
    aero: number;
    road: number;
    curb: number;
    grass: number;
  };
  steering: {
    base: number;
    speedGain: number;
    speedDivisor: number;
    slipReduction: number;
  };
};
```

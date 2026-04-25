# Driver Feedback

Reference for current phone-side sound and vibration feedback. This is useful when tuning the game feel because controller feedback is part of the driving model, not just polish.

## Browser Limits

- Audio is generated with Web Audio on the phone controller.
- Vibration uses `navigator.vibrate()`.
- Web vibration can vary pulse duration and patterns, but not reliable motor amplitude/intensity/sharpness like native Android or iOS haptics.
- iOS Safari does not support web vibration. Android Chromium/Samsung-style browsers are the main target. Firefox Android may expose partial or no-op support.

## Audio

- Start/test cue: short confirmation tone when audio is enabled or tested.
- Countdown: 3/2/1/go beeps after audio is unlocked.
- Engine: persistent tone follows car speed and throttle.
- Tire: filtered noise follows slip, grass/off-road driving, and curb contact.
- Brake: tone fades in during braking at speed.
- Curb: low rumble follows curb contact at speed.
- Impact: short thud cue when impact is above threshold.
- Race exit: all persistent layers fade out outside countdown/racing.

## Vibration

- Test pulse: `[35, 30, 55]`.
- Impact: one pulse, roughly `45-140ms` depending on impact strength.
- Hard braking: `[18, 24, 18]` when braking hard above about `35 km/h`.
- Curb: `18ms` pulse while on curbs above about `18 km/h`.
- Grass/off-road: `24ms` pulse while on grass above about `20 km/h`.
- High slip: `16ms` pulse when slip is high above about `25 km/h`.

## Current Gap

- Clean cornering g-force is not a separate continuous haptic layer.
- Cornering feedback currently comes through tire sound and high-slip vibration when the car starts to slide.
- Full directional/spatial audio is not implemented yet; earphones still make the layered feedback clearer.

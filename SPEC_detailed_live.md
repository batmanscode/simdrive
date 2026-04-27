# Sim Drive - Live Implementation Notes

This file tracks the current build. `SPEC_rough.md` is unchanged and remains the original product idea. `SPEC_detailed.md` remains the broader target spec.

## Implemented

- Vite + React + TypeScript browser app.
- Node + Express + WebSocket room server.
- Display flow: landing, create room, join room as another display, QR lobby with exit room action, race view, results.
- Display landing, lobby, and results support System, Light, and Dark theme modes. System is the default and follows the display device color-scheme preference.
- Display landing shows a live active-player count only when at least one driver is online.
- Display lobby shows current track, lap count, rain, warm-up/flying start, collision/ghost mode, gentle stability assist, reset mode, connected players in the current driver lineup, each player's car setup, and each player's cockpit style so non-VIP users can see race settings.
- Display refresh resumes the same display group. If every display leaves and none reconnects within the 20-second grace window, the room closes and controllers are notified so abandoned games do not keep running.
- Display results can return the room to lobby without requiring the VIP controller.
- Controller flow: room-code join, name/color setup, per-player car setup selection, per-player cockpit style selection, VIP settings, race controller.
- Controller sessions store the last room token locally and auto-resume the saved driver after phone refreshes or QR rescans when the room still exists. The setup screen shows reconnecting, reconnected, and error messages.
- One-player practice works with one display and one phone/browser controller.
- Up to 8 players per room are represented in server state.
- Display groups support split-screen panes for up to 4 local players.
- First joined controller becomes VIP.
- VIP options include track, lap count, warm-up/flying start, ghost cars, rain, gentle stability assist, and reset mode. Warm-up/flying start is on by default; the first pass is untimed and each driver's timed lap 1 and total race timer start when they cross the line. Reset mode is off by default so normal crash-out remains the default.
- Four original tracks are present: `Sakura Sprint`, `Alpine Grand Prix`, `Fjord Loop`, and `Cloudline Ascent`.
- Server-authoritative simplified racing physics: throttle, brake, steering, per-driver setup multipliers, optional warm-up/flying start timing, velocity-based lateral slip, aero/speed drag, downforce-style speed-building grip, elevation/grade acceleration effects for uphill/downhill sections, optional gentle stability assist, tuned surface grip/drag, rain grip reduction, wall slowdown, directional car contact/crash handling, optional crash/off-track reset, checkpoint-gated lap finish, DNF handling, and results.
- Active races use lightweight `race_snapshot` messages for cars/timing at the normal snapshot rate, while full room/lobby state is sent less frequently during racing. Lobby/results still use full room state. The 3D scene smooths server snapshots locally for cars, cockpit, and camera.
- 3D cockpit-style race view with procedural formula-style open-wheel cars, more F1-like slim nose/front wing/sidepod/rear wing/halo shapes, suspension/rim/rear-light details, cockpit rev lights, improved cockpit/nose/front tyre hints, per-driver Hands/Paws/None cockpit cosmetic toggle, simple binary visual front-wheel steering, proportional cockpit steering wheel/hands/paws movement, visually spinning tyres based on travelled wheel distance, smooth generated track ribbons, rubbered-in road detail, static and live skid marks, raised curbs, racing line, grass/runoff, camera shake, HUD, in-race minimap, global race leaderboard, countdown lights, and a short first-place banner.
- `CARS.md` tracks the current formula car, selectable setups, and handling parameters.
- Phone controller supports landscape race mode, orientation-aware steering, countdown-time stable median neutral capture before motion steering is sent, per-phone 1-10 motion sensitivity, saved motion-steering inversion for browser/device sign differences, explicit neutral calibration, corrected left/right steering direction, touch steering fallback with matching arrow direction, visible motion-sensor status/fallback status, recommended-browser notices, pre-race motion test meter, audio/haptic test pulse preview, full-screen brake/throttle zones, first-tap pedal preferences, locally stored audio/haptics preferences, telemetry-driven audio, and optional vibration.
- Haptics use `navigator.vibrate()` with support status, an on/off toggle, and a test pulse. The app can vary pulse duration/pattern but not true motor amplitude/intensity in web browsers. Browser support varies: Android Chromium/Samsung-style browsers are the main target, iOS Safari does not support web vibration, and current Firefox Android support may be partial/no-op even when the API exists.
- Controller audio is default-on, has an on/off toggle and test cue, and uses persistent Web Audio layers: engine tone follows speed/throttle and fades out on race exit, tire noise follows slip/off-road cornering, brake tone follows braking at speed, curb rumble follows curb contact, impacts get a thud cue, and countdown gets 5/4/3/2/1/go beeps after audio is unlocked. The current mix is louder/brighter than the muted pass but still below the first whiny pass.
- `DRIVER_FEEDBACK.md` tracks the current phone-side audio and vibration mapping.
- Race visuals include procedural smooth roads, painted edge lines, racing line, alternating raised curbs, rubber/skid detail, runoff, start/finish line, start grid markers, a simple gantry, braking boards, barriers, one `#vibejam` sponsor board, lightweight track identity props, generated terrain support for elevated Fjord/Cloudline sections, grass dust, wet spray, impact flashes, fog/lighting changes, a subtle rain visor overlay, and deliberately visible falling rain/mist in rain mode.
- Elevated-track rendering uses centerline-derived road/curb/runoff ribbons plus generated shoulder and hillside terrain. Fjord skips lower outer terrain panels that would cross nearby same-height road sections, avoiding false tunnels, grass walls, and grass stripe artifacts on overlapping route sections.
- Results show a podium, total race time, and best lap time for finished players. Earlier builds only showed total race time.
- Unfinished racing players are marked DNF if they disconnect past the grace window or if a race exceeds its generous time cap, so abandoned races do not stay active forever.
- If reset mode is on, crashed cars pause for about 2.5 seconds, then respawn near their last valid track point at low speed with brief invulnerability. If a car stays off-track for 5 seconds, that driver's phone shows a `Reset to track` button.

## Intentional First-Pass Deviations

- The implementation uses a small purpose-built WebSocket server instead of Colyseus. The message/state model is kept close to the detailed spec so this can be migrated later.
- The implementation uses custom lightweight kinematic physics instead of Rapier. This keeps the first playable slice compact; Rapier can be introduced once the desired driving feel stabilizes.
- Track visuals are generated from track centerline data rather than authored GLB assets.
- Elevated track support is purpose-built for the current procedural tracks, not a general terrain engine. Long elevated routes still need manual full-lap visual inspection after layout changes.
- Audio is synthesized with Web Audio oscillator cues. Richer samples and spatial mixing are future work.

## Next High-Value Work

- Run the real-phone checks in `HUMAN_CHECKS.md`, then adjust numeric tuning if steering feels too loose, too assisted, or too punishing in rain.
- Add display-group reassignment only if multi-display sessions become common.
- Add proper generated or authored car/track assets.
- Add automated Playwright smoke tests as checked-in tests instead of ad hoc verification scripts.

# Drive Sim - Live Implementation Notes

This file tracks the current build. `SPEC_rough.md` is unchanged and remains the original product idea. `SPEC_detailed.md` remains the broader target spec.

## Implemented

- Vite + React + TypeScript browser app.
- Node + Express + WebSocket room server.
- Display flow: landing, create room, join room as another display, QR lobby, race view, results.
- Display lobby shows current track, lap count, rain, rolling start, collision/ghost mode, gentle stability assist, and connected players so non-VIP users can see VIP race settings.
- Display refresh resumes the same display group. If every display leaves and none reconnects within the 20-second grace window, the room closes and controllers are notified so abandoned games do not keep running.
- Display results can return the room to lobby without requiring the VIP controller.
- Controller flow: room-code join, name/color setup, VIP settings, race controller.
- One-player practice works with one display and one phone/browser controller.
- Up to 8 players per room are represented in server state.
- Display groups support split-screen panes for up to 4 local players.
- First joined controller becomes VIP.
- VIP options include track, lap count, rolling start flag, ghost cars, rain, and gentle stability assist.
- Two original tracks are present: `Sakura Sprint` and `Alpine Grand Prix`.
- Server-authoritative simplified racing physics: throttle, brake, steering, velocity-based lateral slip, optional gentle stability assist, tuned surface grip/drag, rain grip reduction, wall slowdown, directional car contact/crash handling, checkpoint-gated lap finish, DNF handling, and results.
- Active races use lightweight `race_snapshot` messages for cars/timing at the normal snapshot rate, while full room/lobby state is sent less frequently during racing. Lobby/results still use full room state. The 3D scene smooths server snapshots locally for cars, cockpit, and camera.
- 3D cockpit-style race view with procedural formula-style open-wheel cars, more F1-like slim nose/front wing/sidepod/rear wing shapes, improved cockpit/nose/front tyre hints, simple binary visual front-wheel steering, visually spinning tyres based on travelled wheel distance, road, curbs, grass, camera shake, HUD, in-race minimap, and global race leaderboard.
- Phone controller supports landscape race mode, orientation-aware steering, per-phone 1-10 motion sensitivity, explicit neutral calibration, corrected left/right steering direction, touch steering fallback with matching arrow direction, visible motion-sensor status/fallback status, pre-race motion test meter, full-screen brake/throttle zones, first-tap pedal preferences, locally stored audio/haptics preferences, basic telemetry audio, and optional vibration.
- Haptics use `navigator.vibrate()` with support status, an on/off toggle, and a test pulse. Browser support varies: Android Chromium/Samsung-style browsers are the main target, iOS Safari does not support web vibration, and current Firefox Android support may be partial/no-op even when the API exists.
- Controller audio is default-on, has an on/off toggle and test cue, and uses persistent Web Audio layers: engine tone follows speed/throttle and fades out on race exit, tire noise follows slip/off-road, brake tone follows braking at speed, curb rumble follows curb contact, impacts get a thud cue, and countdown gets 3/2/1/go beeps after audio is unlocked. The current mix is louder/brighter than the muted pass but still below the first whiny pass.
- Race visuals include procedural sampled roads, painted edge lines, alternating curbs, runoff, start/finish line, start grid markers, a simple gantry, trackside boards, barriers, lightweight track identity props, fog/lighting changes, and deliberately visible falling rain/mist in rain mode. The existing first-person camera position is intentionally unchanged for now.
- Results show total race time and best lap time for finished players. Earlier builds only showed total race time.
- Unfinished racing players are marked DNF if they disconnect past the grace window or if a race exceeds its generous time cap, so abandoned races do not stay active forever.

## Intentional First-Pass Deviations

- The implementation uses a small purpose-built WebSocket server instead of Colyseus. The message/state model is kept close to the detailed spec so this can be migrated later.
- The implementation uses custom lightweight kinematic physics instead of Rapier. This keeps the first playable slice compact; Rapier can be introduced once the desired driving feel stabilizes.
- Track visuals are generated from track centerline data rather than authored GLB assets.
- Audio is synthesized with Web Audio oscillator cues. Richer samples and spatial mixing are future work.

## Next High-Value Work

- Run the real-phone checks in `HUMAN_CHECKS.md`, then adjust numeric tuning if steering feels too loose, too assisted, or too punishing in rain.
- Add controller reconnect UI and display-group reassignment.
- Add proper generated or authored car/track assets.
- Add automated Playwright smoke tests as checked-in tests instead of ad hoc verification scripts.

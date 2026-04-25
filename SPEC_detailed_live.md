# Drive Sim - Live Implementation Notes

This file tracks the current build. `SPEC_rough.md` is unchanged and remains the original product idea. `SPEC_detailed.md` remains the broader target spec.

## Implemented

- Vite + React + TypeScript browser app.
- Node + Express + WebSocket room server.
- Display flow: landing, create room, join room as another display, QR lobby, race view, results.
- Display refresh resumes the same display group. If every display leaves and none reconnects within the 20-second grace window, the room closes and controllers are notified so abandoned games do not keep running.
- Display results can return the room to lobby without requiring the VIP controller.
- Controller flow: room-code join, name/color setup, VIP settings, race controller.
- One-player practice works with one display and one phone/browser controller.
- Up to 8 players per room are represented in server state.
- Display groups support split-screen panes for up to 4 local players.
- First joined controller becomes VIP.
- VIP options include track, lap count, rolling start flag, ghost cars, and rain.
- Two original tracks are present: `Sakura Sprint` and `Alpine Grand Prix`.
- Server-authoritative simplified racing physics: throttle, brake, steering, surface grip/drag, rain grip reduction, wall slowdown, car bump/crash handling, lap finish, and results.
- 3D cockpit-style race view with simple open-wheel car forms, road, curbs, grass, camera shake, and HUD.
- Phone controller supports landscape race mode, orientation-aware steering, explicit neutral calibration, corrected left/right steering direction, touch steering fallback, full-screen brake/throttle zones, first-tap pedal preferences, locally stored audio/haptics preferences, basic telemetry audio, and optional vibration.
- Haptics are exposed with support status, an on/off toggle, and a test pulse. Browser support varies: Android Chrome commonly supports `navigator.vibrate`, while iPhone Safari commonly reports haptics unavailable.
- Controller audio is default-on, has an on/off toggle and test cue, and uses persistent Web Audio layers: engine tone follows speed/throttle and fades out on race exit, tire noise follows slip/off-road, brake tone follows braking at speed, curb rumble follows curb contact, impacts get a thud cue, and countdown gets 3/2/1/go beeps after audio is unlocked. The current engine tone is intentionally lower/softer than the first pass to avoid a thin phone-speaker whine.
- Race visuals include procedural sampled roads, painted edge lines, alternating curbs, runoff, start/finish line, start grid markers, a simple gantry, trackside boards, fog/lighting changes, and falling rain/mist in rain mode. The existing first-person camera position is intentionally unchanged for now.

## Intentional First-Pass Deviations

- The implementation uses a small purpose-built WebSocket server instead of Colyseus. The message/state model is kept close to the detailed spec so this can be migrated later.
- The implementation uses custom lightweight kinematic physics instead of Rapier. This keeps the first playable slice compact; Rapier can be introduced once the desired driving feel stabilizes.
- Track visuals are generated from track centerline data rather than authored GLB assets.
- Audio is synthesized with Web Audio oscillator cues. Richer samples and spatial mixing are future work.

## Next High-Value Work

- Improve driving feel with better lateral slip, braking balance, and off-track recovery.
- Add minimap and global leaderboard during racing.
- Add controller reconnect UI and display-group reassignment.
- Add proper generated or authored car/track assets.
- Add automated Playwright smoke tests as checked-in tests instead of ad hoc verification scripts.

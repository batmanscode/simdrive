# Features

Product-facing summary of what the game currently supports. Keep `SPEC_detailed_live.md` as the implementation truth; this file is for homepage copy, README copy, and quick feature lists.

## Current Features

- Phone-controlled browser racing with no app install.
- One display creates a room and shows a QR code for controllers.
- Lobby display can close/reset the room, return everyone to the start, show race settings, and show drivers in the current lineup.
- Display pages support System, Light, and Dark themes; System follows the device color-scheme setting.
- Home screen shows a live active-driver count when active players are online, and hides it at zero.
- Phone controllers auto-resume the last saved driver after refreshes or QR rescans when the room is still available.
- One-player practice works for solo testing.
- Up to 8 racers per room.
- Split-screen display panes for up to 4 local racers.
- VIP controller can choose track, laps, warm-up/flying start, ghost cars, rain, gentle stability assist, and reset mode.
- Warm-up/flying start is on by default. The first pass is untimed, and each driver's timed lap 1 and total race timer start when they cross the line.
- Each driver can choose a vehicle: Formula Prototype, KZ Kart, Stock Truck, or Tuk-Tuk. Formula Prototype and Stock Truck have Balanced, High Grip, and High Speed setups; KZ Kart and Tuk-Tuk use one fixed setup.
- Each driver can choose a personal cockpit style: None, Hands, or Paws; new players default to None.
- Non-VIP players can see the chosen race settings, vehicles, and driver setups in the lobby.
- Five tracks: Sakura Sprint, Alpine Grand Prix, Fjord Loop, Keys Causeway, and Cloudline Ascent.
- Cockpit-style 3D race view with procedural smooth track ribbons, raised curbs, rubbered-in road detail, generated terrain support for elevated tracks, dynamic skid marks, barriers, finish line, racing line, a light `#vibejam` sponsor board, weather visuals, dust/spray effects, vehicle-specific cockpit silhouettes, and per-driver cockpit Hands/Paws/None display cosmetics.
- Phone controller supports tilt steering, countdown-time steering centering, 1-10 motion sensitivity, saved motion-steering inversion, touch steering fallback, brake/throttle touch zones, calibration, motion test, audio/haptic test pulse preview, quick countdown control hints, and landscape race mode.
- Controller setup/lobby screens warn when the phone is not on the recommended Android Chromium-style browser path for best motion and haptic support.
- Audio feedback includes engine speed/throttle, tire slip/off-road noise, brake tone, curb rumble, impact thuds, start/test cue, server-marked countdown beeps, and a stronger race-start `GO` cue.
- Optional vibration feedback includes impacts, hard braking, curb rumble, grass/off-road rumble, high-slip pulses, and tuk-tuk tip-risk pulses on supported mobile browsers.
- Server-authoritative racing with vehicle-specific velocity-based movement, per-driver setup multipliers, warm-up/flying start timing, lateral slip, tuned braking, aero drag, downforce-style speed-building grip, elevation/grade acceleration effects, surface grip/drag, wet-weather grip and top-speed changes, tuk-tuk rollover risk, collisions, optional crash/off-track reset, lap timing, best lap, DNF handling, and results.
- In-race minimap, live global leaderboard, short first-place banner, countdown lights, display-side auto-spectate for finished racers while others are still active, and podium-style results.
- Display/host refresh can resume the same room during the grace window.

## Homepage Messaging

- Core pitch: multiplayer browser racing controlled by phones.
- Main feel pitch: sim-lite vehicle feedback through tilt steering, vehicle/setup choices, lateral slip, aero drag, downforce-style grip, tuned braking, wet-weather handling, tire/engine/curb/impact audio, and optional vibration.
- Main multiplayer pitch: create a room on one display, scan with phones, race solo or with up to 8 drivers.
- Main controller pitch: phones become steering wheels and pedals with calibration, touch fallback, and landscape race mode.
- Main race-info pitch: cockpit racing with minimap, live leaderboard, auto-spectate after finishing, best laps, and results.
- Display UI pitch: the shared screen can follow the room/device theme with light and dark display modes.
- Track pitch: short party circuits plus long real-world-inspired coastal and mountain endurance routes.

## Planned Or Experimental

- Stronger authored or generated car and track assets.
- Better wet-road effects and spray.
- Lower, more believable cockpit camera option.
- Display reassignment UI and larger-session admin controls.
- Automated browser smoke tests.
- Headless load test for server capacity estimates.

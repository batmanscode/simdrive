# Features

Product-facing summary of what the game currently supports. Keep `SPEC_detailed_live.md` as the implementation truth; this file is for homepage copy, README copy, and quick feature lists.

## Current Features

- Phone-controlled browser racing with no app install.
- One display creates a room and shows a QR code for controllers.
- Lobby display can close/reset the room and return everyone to the start.
- Phone controllers auto-resume the last saved driver after refreshes or QR rescans when the room is still available.
- One-player practice works for solo testing.
- Up to 8 racers per room.
- Split-screen display panes for up to 4 local racers.
- VIP controller can choose track, laps, rolling start, ghost cars, rain, gentle stability assist, and reset mode.
- Each driver can choose a car setup: Balanced, High Grip, or High Speed. The lobby shows each driver's setup.
- Non-VIP players can see the chosen race settings and driver setups in the lobby.
- Two tracks: Sakura Sprint and Alpine Grand Prix.
- Cockpit-style 3D race view with procedural smooth track ribbons, curbs, barriers, finish line, racing line, trackside boards, weather visuals, dust/spray effects, and formula-style cars.
- Phone controller supports tilt steering, 1-10 motion sensitivity, touch steering fallback, brake/throttle touch zones, calibration, motion test, and landscape race mode.
- Audio feedback includes engine speed/throttle, tire slip/off-road noise, brake tone, curb rumble, impact thuds, start/test cue, and countdown beeps.
- Optional vibration feedback includes impacts, hard braking, curb rumble, grass/off-road rumble, and high-slip pulses on supported mobile browsers.
- Server-authoritative racing with velocity-based car movement, per-driver setup multipliers, lateral slip, tuned braking, aero drag, downforce-style speed-building grip, surface grip/drag, wet-weather grip and top-speed changes, collisions, optional crash/off-track reset, lap timing, best lap, DNF handling, and results.
- In-race minimap and live global leaderboard.
- Display/host refresh can resume the same room during the grace window.

## Homepage Messaging

- Core pitch: multiplayer browser racing controlled by phones.
- Main feel pitch: sim-lite car feedback through tilt steering, setup choices, lateral slip, aero drag, downforce-style grip, tuned braking, wet-weather handling, tire/engine/curb/impact audio, and optional vibration.
- Main multiplayer pitch: create a room on one display, scan with phones, race solo or with up to 8 drivers.
- Main controller pitch: phones become steering wheels and pedals with calibration, touch fallback, and landscape race mode.
- Main race-info pitch: cockpit racing with minimap, live leaderboard, best laps, and results.

## Planned Or Experimental

- Stronger authored or generated car and track assets.
- Better wet-road effects and spray.
- Lower, more believable cockpit camera option.
- Display reassignment UI and larger-session admin controls.
- Automated browser smoke tests.
- Headless load test for server capacity estimates.

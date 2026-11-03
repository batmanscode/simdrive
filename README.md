# Sim Drive

Sim Drive is a multiplayer browser racing game where a shared display hosts the race and phones become tilt-steering controllers.

![Sim Drive gameplay preview](public/race-preview.jpg)

## Status

Playable prototype in active development. The core room flow, phone controller, server-authoritative race loop, split-screen display, vehicle selection, procedural tracks, audio, and optional haptics are working.

## Run locally

```bash
npm install
npm run dev
```

Open the display at `http://localhost:5173/`. The dev server also prints a LAN URL, which is useful for joining from a real phone on the same network. Phone motion sensors require a secure origin in Chrome/Chromium and iOS Safari/WebKit, so use the HTTPS Codespaces/forwarded URL, production HTTPS URL, or an HTTPS tunnel when testing tilt steering; plain LAN `http://` may only work in Firefox.

In GitHub Codespaces, open the forwarded `5173` port URL. The app proxies WebSockets through the same forwarded origin, so you do not need to separately open port `8787` for normal dev use.

## Current playable slice

### Room flow

- Create a room from a display browser.
- Join from a phone controller by QR code or room code.
- Phone controller refreshes and same-phone QR rescans auto-resume the saved driver when possible.
- First joined controller becomes VIP.
- Lobby shows the QR code, race settings, selected track, driver lineup, each driver's vehicle, setup, and cockpit style.
- The home screen shows a live active-driver count only when at least one driver is online.
- One-player practice works. Best-lap/run ghosts are stored on the display browser, matched by driver name/color, vehicle/setup, weather, assists, and pace. Resets/crashes and changing-weather runs do not record a ghost.

### Race settings

- VIP keeps manual control of track, laps, tutorial, flying start, ghost cars, rain, assist, and resets. Optional Race extras add equal straight-line pace, gradual weather changes, and a three-race championship with points and track voting.

### Vehicles and driver options

- Each driver can choose a vehicle: Formula Prototype, KZ Kart, Stock Truck, or Tuk-Tuk.
- Formula Prototype and Stock Truck offer Balanced, High Grip, and High Speed setups; KZ Kart and Tuk-Tuk use a fixed setup.
- Each driver can choose a personal cockpit style: None, Hands, or Paws; new players default to None.
- Each driver can choose a personal rear-view mirror mode: Auto, On, or Off; new players default to Auto, which shows it when other active cars exist.

### Race display

- Display landing/lobby/tutorial/results screens support System, Light, and Dark themes.
- Five circuits, Fjord Passage, and short waterfall/island/foothill sprints through the Fjord, Keys and Cloudline landscapes. One-way runs use a grid start and one finish; circuit lap/flying-start preferences are retained.
- Stylized motorsport presentation: layered skies and distant ridges, track-specific light, textured road/terrain, wet-road sheen, batched rain/spray/petals, sculpted bodywork, and load/grade-aware cockpit motion.
- Race view includes a minimap, leaderboard (compact global position in split-screen), mirror, lap/run timing, nearby overlap indicators, and auto-spectate after finishing. Personal corner hints, best-lap ghosts, and camera movement are optional.
- Results include placement, total/best time, driving awards, an optional local first-finish replay, and championship standings/voting when enabled.

### Phone controller

- VIP lobby separates Your car & controls from Race settings; device preferences and race extras are collapsible. The original phone tutorial is retained. Slow off-track recovery offers Hold to reverse; releasing it returns to normal pedals.
- Phone controller supports tilt steering with iOS/WebKit motion permission prompts, Chrome-friendly `devicemotion`/Generic Sensor fallbacks, countdown-time steering centering, 1-10 motion sensitivity, saved motion-steering inversion, fallback touch steering, touch brake/throttle zones, first-tap pedal preferences, motion/audio/haptic tests, quick countdown control hints, vehicle-specific/nearby-rival audio, and vibration where supported.
- Controller setup/lobby screens show a recommended-browser notice when the phone is not on the preferred Android Chromium-style browser path.
- Web vibration depends on browser support. Android Chromium/Samsung-style browsers are the main target; iOS Safari does not support it; Firefox Android may expose partial/no-op support.

### Server behavior

- Server owns room state, race phase, vehicle-specific velocity-based movement, rolling-contact yaw inertia, shared braking/cornering grip, mass-aware contacts, per-driver setup multipliers, warm-up/flying start timing, downforce-style speed-building grip, elevation/grade effects, tuk-tuk rollover risk, optional crash/off-track reset, checkpoint-gated lap completion, height-aware directional collisions, glancing wall recovery, DNF handling, and results.
- If every display/host browser disconnects, the room stays resumable for a 20-second grace window. If no display reconnects in that window, the room closes and controllers are sent back out of the game.

## Analytics

Production builds on `simdrive.xyz` and `www.simdrive.xyz` use the self-hosted [Umami dashboard](https://anal.personalslave.xyz/websites/2cb0ef87-81c8-4051-8978-d4c479c59d12). Pageviews and a small set of confirmed milestones help show where players get into a race or drop out:

| Events | Meaning |
| --- | --- |
| `room-created` | A display successfully created a room. |
| `controller-joined` | A phone successfully joined, with room-link/manual entry. |
| `race-started`, `race-results` | The original host display observed racing/results, with track, player count, weather and race options. Results include finish/crash/DNF counts. |
| `driver-started`, `driver-finished` | The phone's own car started driving/finished, with vehicle, setup and cockpit choice. |
| `motion-setup` | Enabling motion returned ready, unsupported, insecure or not-granted. Ready describes permission setup, not proof of sensor readings. |

The dashboard has three goals (Host: start a race, Host: reach race results, Phone: finish a race) and separate host/phone funnels with a 24-hour window to accommodate long Cloudline races. These measure browser journeys, not cross-device users or authoritative server totals. Extra displays do not multiply host milestones; bounded tab-session deduplication prevents refresh/reconnect repeats.

The tracker is asynchronous and optional. Development/local builds and Do Not Track browsers do not load it. Names, room codes, controller tokens and telemetry are not sent; URL/referrer query strings and fragments are stripped. There is no user identification, session recording or gameplay-loop instrumentation. The public website ID is configuration, not a login credential.

## Project docs

- `SPEC_detailed.md`: canonical product and technical spec.
- `FEATURES.md`: product-facing feature summary.
- `HUMAN_CHECKS.md`: real-device phone playtest checklist.
- `PLAYTEST_AUTOMATION.md`: automated full-lap and visual capture workflow.
- `DRIVER_FEEDBACK.md`: phone-side audio and haptic mapping.
- `CARS.md`: current vehicle and handling notes.
- `PERFORMANCE.md`: race performance, networking, rendering, and new-track engineering notes.
- `REMINDERS.md`: follow-up ideas.

## Useful commands

```bash
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build and WebSocket server from one Node process on port `8787`.

## Contributing

Issues and pull requests are welcome. Keep changes scoped, update the relevant docs when behavior changes, and run `npm run typecheck` plus `npm run build` before opening larger changes.

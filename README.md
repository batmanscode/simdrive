# simdrive

Multiplayer browser racing sim with phones as controllers.

## Run locally

```bash
npm install
npm run dev
```

Open the display at `http://localhost:5173/`. The dev server also prints a LAN URL, which is the best URL to use when joining from a real phone on the same network.

In GitHub Codespaces, open the forwarded `5173` port URL. The app proxies WebSockets through the same forwarded origin, so you do not need to separately open port `8787` for normal dev use.

## Current playable slice

- Create a room from a display browser.
- Join from a phone controller by QR code or room code.
- Phone controller refreshes and same-phone QR rescans auto-resume the saved driver when possible.
- First joined controller becomes VIP.
- VIP can choose track, laps, warm-up/flying start, ghost cars, rain, gentle stability assist, and reset mode.
- Each driver can choose a car setup: Balanced, High Grip, or High Speed.
- Each driver can choose a personal cockpit style: None, Hands, or Paws.
- Lobby shows the QR code, race settings, selected track, driver lineup, each driver's setup, and each driver's cockpit style.
- Display landing/lobby/results screens support System, Light, and Dark themes.
- The home screen shows a live active-driver count only when at least one driver is online.
- One-player practice works.
- Five tracks are available: Sakura Sprint, Alpine Grand Prix, Fjord Loop, Keys Causeway, and Cloudline Ascent.
- Race view renders a cockpit-style 3D scene with smooth procedural track ribbons, raised curbs, rubber/skid road detail, generated terrain support for elevated tracks, vehicle-specific cockpit silhouettes, countdown lights, and a short first-place banner.
- Race view includes a minimap and live global leaderboard.
- Results include podium-style placement, total time, and best lap.
- Phone controller supports tilt steering, countdown-time steering centering, 1-10 motion sensitivity, saved motion-steering inversion, fallback touch steering, touch brake/throttle zones, first-tap pedal preferences, motion/audio/haptic tests, quick countdown control hints, basic audio, and vibration where supported.
- Controller setup/lobby screens show a recommended-browser notice when the phone is not on the preferred Android Chromium-style browser path.
- Web vibration depends on browser support. Android Chromium/Samsung-style browsers are the main target; iOS Safari does not support it; Firefox Android may expose partial/no-op support.
- Server owns room state, race phase, velocity-based car movement, per-driver setup multipliers, warm-up/flying start timing, downforce-style speed-building grip, elevation/grade effects, optional crash/off-track reset, checkpoint-gated lap completion, directional collisions, DNF handling, and results.
- If every display/host browser disconnects, the room stays resumable for a 20-second grace window. If no display reconnects in that window, the room closes and controllers are sent back out of the game.
- Manual phone playtest notes are tracked in `HUMAN_CHECKS.md`.
- Product-facing feature copy is tracked in `FEATURES.md`.
- Phone-side sound and haptics are tracked in `DRIVER_FEEDBACK.md`.
- Current car/handling notes are tracked in `CARS.md`.
- Race performance, networking, rendering, and new-track engineering notes are tracked in `PERFORMANCE.md`.
- Follow-up ideas for the next session are tracked in `REMINDERS.md`.
- Current implementation details are tracked in `SPEC_detailed_live.md`; `SPEC_detailed.md` remains the broader target spec.

## Useful commands

```bash
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build and WebSocket server from one Node process on port `8787`.

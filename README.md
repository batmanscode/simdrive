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
- First joined controller becomes VIP.
- VIP can choose track, laps, rolling start, ghost cars, and rain.
- One-player practice works.
- Race view renders a cockpit-style 3D scene.
- Phone controller supports tilt steering, fallback touch steering, touch brake/throttle zones, first-tap pedal preferences, basic audio, and vibration where supported.
- Server owns room state, race phase, car movement, lap completion, collisions, and results.
- If every display/host browser disconnects, the room stays resumable for a 20-second grace window. If no display reconnects in that window, the room closes and controllers are sent back out of the game.

## Useful commands

```bash
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build and WebSocket server from one Node process on port `8787`.

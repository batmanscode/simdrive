# Drive Sim - Product and Technical Spec

## 1. Summary

Build `Drive Sim`, a browser-based party racing game at `drivesim.xyz` where computers/TVs act as race displays and phones act as motion/touch controllers. The game should feel close enough to a lightweight racing sim to be satisfying, while staying accessible, fast to join, and closer to Jackbox-style party flow than a hardcore simulator.

Working references: `Phonesim`, `Simvibes`, Jackbox-style room joining, gamingcouch.com / couch multiplayer energy, remote couch multiplayer, and lightweight browser racing sims. Public branding can say Drive Sim is inspired by Jackbox-style party joining and couch games, but should not imply official affiliation.

This document is intended to be given to an AI coding agent or engineering team as a build spec. Treat explicit requirements as source of truth. Treat open questions as unresolved product decisions that should not block the first vertical slice unless they directly affect implementation.

## 2. Core Product Goals

- Let players join quickly from a phone with no account.
- Let one display support local split-screen for up to 4 phone-controlled players.
- Let multiple displays join the same race room so remote couches or solo players can race together.
- Support up to 8 active racers total per room.
- Make the phone controller feel expressive through tilt steering, touch throttle/brake, vibration where supported, and strong audio feedback.
- Give the user as much car/road feedback as possible within browser limits, especially through audio, haptics, visual controller feedback, and telemetry-driven effects.
- Keep the first release small: one default F1-style open-wheel formula car, color choice, two tracks, basic lobby, race, and results.

## 3. Recommended Minimal Stack

- App/build: Vite + React + TypeScript.
- 3D rendering: React Three Fiber on top of Three.js.
- Physics: Rapier 3D JavaScript/WASM.
- Realtime multiplayer: Node.js + TypeScript + Colyseus.
- Transport: WebSockets through Colyseus.
- Storage: none for MVP; in-memory rooms only.
- Deploy shape: one Node service that serves the built web app and hosts the WebSocket game server.
- Assets: glTF/GLB for cars and track props; JSON or generated spline data for track layout.
- QR and room codes: short human-readable room codes plus QR links to the controller join URL.

### Deliberate Non-Goals for MVP

- No permanent accounts.
- No matchmaking.
- No persistent leaderboards.
- No car customization beyond color.
- No real licensed F1 branding, car names, team names, or exact real circuit copies unless licensing is handled.
- No AI cars; all active racers are real users for now.
- No native mobile apps.
- No WebRTC for gameplay transport in v1.
- No full sim-grade tire model, damage system, pit stops, weather, or advanced setup tuning.

### Stack Rationale

Use React Three Fiber for the racing renderer in v1, with imperative refs and `useFrame` where the simulation/render loop needs direct control. React should own app screens, forms, lobby state, controller UI, route-like view switching, and declarative 3D scene composition. React Three Fiber should own the race canvas, scene components, cameras, viewports, asset loading, and render integration.

This is the recommended choice because it is more pleasant to build and maintain in a React app while still exposing Three.js directly when needed. Avoid putting high-frequency game state into normal React state. Use refs, external stores, interpolation buffers, and server snapshots for per-frame race data.

## 4. Main Concepts

### Room

A room is one complete multiplayer game session. It has one room code, one synchronized race state, one lobby, and one final leaderboard.

### Display Client

A display client is a computer/TV browser. It can create a room or join an existing room. A display renders the lobby, QR code, room code, race view, split-screen views, and results.

### Controller Client

A controller client is a phone browser. It joins by scanning a QR code or entering a room code. It handles username, color, steering calibration, throttle/brake input, VIP controls, audio, and optional vibration.

### Display Group / Couch

A display group is the set of players assigned to one display. One display group can contain 1 to 4 active racers. This supports:

- One TV with 1 to 4 local players.
- Two houses with two TVs and up to 4 players per TV.
- Up to 8 solo players, each with their own computer display and phone controller.

### VIP

The first controller player to complete join setup becomes the VIP. The VIP chooses the track, race settings, and starts the race. If the VIP disconnects for too long, VIP transfers to the next joined active controller.

## 5. Player Limits

- Maximum active racers per room: 8.
- Maximum active racers per display group: 4.
- Recommended maximum display clients per room: 8.
- Recommended maximum connected clients per room: 24, allowing controllers, displays, reconnecting clients, and observers.

## 6. User Flows

### Landing Page

The landing page is minimal and game-first:

- Brand/game name: `Drive Sim`.
- Short promise: phone-controlled browser racing.
- Branding note: inspired by Jackbox-style room joining and couch games.
- Primary actions: `Create Game` and `Join Game`.
- Minimal feature hints: phones as controllers, split-screen couches, remote groups, no install.
- No heavy marketing page before the core action.

### Create Game Flow

1. User opens main webpage on a computer/TV.
2. User clicks `Create Game`.
3. Server creates a room with a short room code.
4. Display enters lobby mode.
5. Lobby shows a large QR code and room code.
6. Display is assigned a `displayGroupId`.

### Join Game from Phone

1. Player scans QR code or enters room code.
2. Phone opens controller join page.
3. Player enters username; default is generated guest name.
4. Player chooses car color.
5. Player grants motion/orientation permission if required by browser.
6. Player calibrates steering by holding the phone in comfortable neutral position.
7. Player joins lobby.
8. If this is the first completed controller join, player becomes VIP.

### Join Game from Another Computer

1. User opens main webpage on another computer.
2. User clicks `Join Game`.
3. User enters room code.
4. Computer joins as an additional display client.
5. It gets its own QR code for phones joining that display group.
6. Any phone joining from that QR is assigned to that display group unless manually reassigned later.

### Lobby Flow

The lobby display shows:

- Large QR code.
- Room code.
- Connected display groups.
- Player list with name, color, readiness, VIP badge, and assigned display group.
- Track preview.
- Race settings.
- Start button state.

The phone lobby shows:

- Player name and color.
- Ready status.
- Steering calibration.
- Throttle/brake first-tap behavior setting.
- VIP controls if player is VIP.

### VIP Settings Flow

VIP can choose:

- Track.
- Rolling start / warm-up lap: `Off` or `On`.
- Number of race laps.
- Start race.
- After race: replay same track or return to settings.

Non-VIP players can:

- Change their name.
- Change their color.
- Calibrate steering.
- Change controller preferences.
- Mark ready/unready.

## 7. Gameplay

### Race Format

- All players drive the same default F1-style open-wheel formula car.
- Each player selects only color for MVP.
- Race supports 1 to 8 active racers.
- Each display renders only the players assigned to that display group in split-screen, plus global race UI.
- Every racer exists in the same race world regardless of which display they are assigned to.
- Final ranking is global across all players.

### Car

The MVP car is a single default F1-style open-wheel formula car:

- Low, wide, single-seat silhouette.
- Exposed wheels.
- Front wing, rear wing, and halo-like cockpit protection shape.
- No official F1, FIA, team, sponsor, or manufacturer branding.
- Color tint is player-selectable.
- The same car model and handling baseline are used for every player.

### Camera and Game View

The main race view should be first-person/cockpit-style, as if the player is inside the car:

- Default camera is mounted in or just above the cockpit.
- The player should see enough of the nose, front tires, cockpit rim/halo, or steering reference to feel seated in the car.
- Field of view should feel fast but not distorted.
- Camera should include subtle shake from bumps, curbs, braking, acceleration, and collisions.
- Split-screen panes should each use the same first-person view for their assigned local player.
- Third-person chase camera can exist later as a debug or optional accessibility mode, but first-person cockpit is the product default.

### Split-Screen Rules

- 1 local player on display: full screen.
- 2 local players: vertical or horizontal split; choose best view by aspect ratio.
- 3 local players: one large pane plus two smaller panes, or equal grid if simpler.
- 4 local players: 2x2 grid.
- Leaderboard/minimap must remain readable in every layout.

### Tracks

MVP includes two original, unlicensed, real-inspired tracks. They should be inspired by fan-favorite Formula 1 circuit archetypes, but must not copy exact layouts, official circuit names, trademarks, logos, signage, or branded assets.

Research signals point repeatedly to Spa-Francorchamps, Monza, Suzuka, Silverstone, Monaco, and Interlagos/Sao Paulo as strong inspiration pools. Use those as design inspiration only.

Track A: `Sakura Sprint`

- Short technical circuit.
- Designed for quick party races and onboarding.
- Inspired by the feel of Suzuka-style flowing esses and Interlagos-style compact elevation/change-of-direction sections.
- Key features: fast esses, one tight hairpin/braking zone, one short DRS-like straight, forgiving runoff, visible curbs for haptic/audio feedback.
- Target lap time: 35-55 seconds for an average player.

Track B: `Alpine Grand Prix`

- Longer high-speed circuit.
- Designed for stronger racing drama, braking zones, and overtaking.
- Inspired by the feel of Spa-style elevation/fast sweepers, Monza-style speed, and Silverstone-style high-speed directional changes.
- Key features: uphill sweep, long straight, heavy braking chicane, fast multi-apex section, curb-heavy exit zones, a few risky wall-adjacent sections.
- Target lap time: 75-110 seconds for an average player.

Track design should be inspired by popular circuit archetypes, not copied from real F1 circuits unless licensing is explicitly handled. Track data should support:

- Centerline spline.
- Road width.
- Start/finish line.
- Checkpoints/sectors.
- Spawn grid.
- Collision barriers.
- Surface zones for road, curb, grass, gravel, wall.
- Bump/rumble metadata for haptics/audio.
- Recommended racing line metadata for camera framing, tutorial ghosting later, and controller feedback.

### Physics Target

The game should feel like a low-definition racing sim:

- Steering should have inertia and grip limits.
- Braking should shift grip and weight feel.
- Curbs and bumps should be noticeable.
- Grass/gravel should reduce traction.
- Wall hits should slow the car and create feedback.
- Handling should favor fun and readability over strict realism.
- Feedback should be rich even when the physics model is simple.

MVP physics can use a simplified vehicle model:

- Rigid body chassis.
- Forward acceleration from throttle.
- Braking force from brake input.
- Steering modifies yaw based on speed and grip.
- Lateral slip/friction approximation.
- Surface multipliers for grip and drag.
- Collision response from Rapier.

Full wheel suspension, tire temperature, aero, fuel, and mechanical damage are out of scope for v1.

## 8. Phone Controller

### Layout

During race, the phone screen is split into two full-height touch zones:

- Left half: brake.
- Right half: accelerator.

Each side behaves like a vertical analog slider:

- Touch anywhere on the side to engage.
- Initial touch value depends on player preference.
- Moving thumb up/down changes brake or throttle.
- The visible slider is feedback only; the player does not need to touch the visible knob precisely.

### Throttle/Brake Preferences

Each control can have a first-tap behavior:

- Default: first tap starts at `0%`, like a real pedal.
- Optional: first tap starts at a configured percentage, including `100%`.
- After first tap, vertical movement adjusts the value up or down.

Preferences are per controller and can be changed before race start.

### Steering

Steering uses phone orientation sensors:

- Use tilt relative to calibrated neutral position.
- Prefer left/right tilt for steering.
- Apply dead zone around neutral.
- Apply sensitivity curve.
- Apply smoothing/low-pass filtering.
- Provide an on-phone calibration button before every race.
- Provide fallback touch steering if orientation permission is denied or unavailable.

### VIP Controller Mode

When in lobby/settings and the player is VIP, phone shows:

- Direction buttons or swipe navigation for track/settings.
- Confirm/select button.
- Back button.
- Start race button.

During race, VIP controls disappear and the controller becomes the same racing controller as everyone else.

### Haptics

Phone vibration is progressive enhancement only. It must never be required for gameplay because browser support varies.

Haptic events should be driven by car telemetry:

- Curb rumble.
- Off-road vibration.
- Wall impact pulse.
- Heavy braking pulse.
- Wheel slip vibration.
- Engine rev texture if supported lightly.

Vibration should be rate-limited and user-toggleable.

Haptic intensity should be derived from event severity:

- Small pulses for curb edges and light road texture.
- Medium pulses for sustained off-road, wheel slip, and hard braking.
- Sharp pulses for wall impacts and large bumps.
- No continuous vibration longer than a short burst unless the user explicitly enables stronger haptics.

### Audio

Phone audio is a major part of feedback:

- Engine rev loop.
- Gear/shift cue, even if gears are simulated automatically.
- Brake pressure cue.
- Tire slip/screech.
- Curb rumble.
- Collision thud.
- Countdown and race start cue.

The controller should recommend earphones for better directional/spatial feel. Audio must be unlocked by a user gesture before race start.

Audio should communicate car state even when the player is looking at the main display:

- Engine pitch should map to speed/rev proxy.
- Tire slip should increase with lateral slip and understeer/oversteer.
- Brake sound should rise with brake pressure and speed.
- Curb/road rumble should be surface-based.
- Impact sounds should scale with collision impulse.
- Directional/spatial effects should be used where practical, especially for slip, nearby impacts, and environmental cues.

### Visual Controller Feedback

The phone controller should show clear live feedback:

- Throttle percentage.
- Brake percentage.
- Steering angle/tilt meter.
- Connection quality.
- Calibration state.
- Haptics/audio enabled state.

This feedback should be visible without distracting from thumb placement.

## 9. Networking Model

Use server-authoritative gameplay:

- Controllers send input to server.
- Server owns race clock, car state, lap timing, collisions, checkpoints, and final leaderboard.
- Displays receive state snapshots and render interpolated views.
- Controllers receive small telemetry/feedback messages for haptics and audio.

### Client Message Types

Controller to server:

- `join_controller`
- `set_profile`
- `set_ready`
- `calibrate_controller`
- `input_frame`
- `vip_select_track`
- `vip_set_race_options`
- `vip_start_race`
- `request_reconnect`

Display to server:

- `create_room`
- `join_display`
- `request_lobby_state`
- `request_race_snapshot`
- `request_reconnect`

Server to clients:

- `room_state`
- `lobby_update`
- `race_countdown`
- `race_snapshot`
- `controller_feedback`
- `race_results`
- `vip_changed`
- `error_notice`

### Input Frame Shape

Each controller sends compact input frames at a fixed rate:

- `seq`: monotonically increasing input sequence number.
- `clientTime`: local timestamp.
- `steer`: `-1` to `1`.
- `throttle`: `0` to `1`.
- `brake`: `0` to `1`.
- `buttons`: bitset for optional actions.

Recommended send rate: 30 Hz for controller input. Server simulation can run at 60 Hz.

### Reconnection

- Short phone disconnects should preserve the player slot for a grace period.
- Display disconnects should not end the room if controllers remain connected.
- If a controller disconnects during race, its car should ghost/coast/brake safely until reconnect or timeout.
- If VIP disconnects in lobby, transfer VIP after timeout.

## 10. State Model

Room state:

- `roomCode`
- `phase`: landing, lobby, countdown, racing, results
- `createdAt`
- `vipPlayerId`
- `displayGroups`
- `players`
- `raceSettings`
- `trackId`
- `raceClock`
- `results`

Player state:

- `playerId`
- `controllerClientId`
- `displayGroupId`
- `name`
- `color`
- `isReady`
- `isVIP`
- `isConnected`
- `joinedAt`
- `carState`
- `lapState`

Car state:

- `position`
- `rotation`
- `velocity`
- `speed`
- `steer`
- `throttle`
- `brake`
- `surfaceType`
- `lap`
- `sector`
- `checkpointIndex`
- `isFinished`

Race settings:

- `trackId`
- `lapCount`
- `rollingStartEnabled`
- `warmupLapEnabled`
- `maxPlayers`

## 11. Screens

### Display Screens

- Landing.
- Create/join game.
- Lobby with QR code.
- Track/settings selection.
- Countdown.
- Race split-screen.
- Results leaderboard.
- Replay/settings choice.

### Phone Screens

- Join by room code.
- Name/color setup.
- Motion permission and calibration.
- Lobby/ready state.
- VIP settings controls.
- Race controller.
- Results mini view.
- Reconnect screen.

## 12. Leaderboard and Timing

The server records:

- Lap times.
- Total race time.
- Sector/checkpoint progression.
- Finish order.
- DNF/disconnect status.

Anti-cheat for MVP:

- Lap only counts after passing ordered checkpoints.
- Finish only counts after required laps.
- Controller inputs are accepted only from the assigned controller client.

## 13. MVP Acceptance Criteria

- A computer can create a room and show a QR code plus room code.
- Phones can join, set name/color, calibrate steering, and appear in lobby.
- First phone to join becomes VIP.
- Additional computers can join the same room as display clients.
- Up to 8 players can join one room.
- A display can render 1 to 4 local players in split-screen.
- VIP can select one of two tracks, lap count, and rolling/warm-up option.
- The two MVP tracks are `Sakura Sprint` and `Alpine Grand Prix`.
- Race starts, runs, finishes, and shows leaderboard.
- Phone steering, brake, and throttle control the car.
- Audio feedback works on phones after user gesture.
- Haptics work where supported and fail silently where unsupported.
- Disconnected players can reconnect within a grace period.
- No AI cars are spawned when fewer than 8 players join.

## 14. Suggested Build Milestones

### Milestone 1: Room and Lobby

- Create room.
- Join display.
- Join controller.
- QR code and room code.
- Player list.
- VIP assignment.

### Milestone 2: Controller Prototype

- Phone setup screen.
- Tilt steering calibration.
- Touch throttle/brake zones.
- Input frames sent to server.
- Basic latency/debug overlay.

### Milestone 3: Single-Car Track Prototype

- React Three Fiber scene.
- One simple track.
- One controllable car.
- Rapier collisions.
- Basic first-person cockpit camera.

### Milestone 4: Server Race Loop

- Server-owned car state.
- Controller input handling.
- Display interpolation.
- Checkpoints, laps, finish order.

### Milestone 5: Multiplayer and Split-Screen

- Multiple players in one room.
- Display groups.
- 1/2/3/4 player split-screen layouts.
- Remote display join.

### Milestone 6: Game Feel

- Better steering curve.
- Surface grip/drag.
- Curbs, bumps, wall impacts.
- Engine/tire/brake audio.
- Haptic events.

### Milestone 7: Race Flow

- Track selection.
- Lap settings.
- Rolling start/warm-up option.
- Countdown.
- Results.
- Replay or return to settings.

## 15. Technical Risks

- Mobile browser motion permissions require explicit UX and testing.
- Phone vibration support varies significantly and must be optional.
- Audio playback must be unlocked by user gesture.
- Network latency can make racing feel poor if displays do not interpolate smoothly.
- Server-authoritative physics may be CPU-heavy if the room count grows; optimize after MVP.
- Real F1 branding, names, cars, and exact track layouts may create licensing/trademark issues.
- Browser/device orientation axes differ across devices, so calibration and fallback controls are required.
- A future AI builder may be tempted to implement exact real circuits. Do not do this for MVP. Use original layouts inspired by well-known racing archetypes.

## 16. Open Questions

- Should collisions between player cars be enabled in MVP, or should players ghost through each other?
- Should every display show all racers on the minimap/leaderboard, or only local display group racers plus top positions?
- Is the target visual style realistic low-poly, arcade toy-like, retro sim, or clean modern?
- What is the preferred default race length: 1 lap, 3 laps, or configurable only by VIP?
- Should the game require landscape orientation on phones during racing?
- Should players be able to reassign controllers between display groups in the lobby?

## 17. AI Builder Instructions

When this spec is handed to an AI coding agent, build toward a playable vertical slice first. Do not spend the first pass on marketing copy, auth, persistent storage, exact track art, or broad engine abstractions.

Implementation priorities:

- Prove the full room loop works: create room, join phone, start race, finish race.
- Prove phone control feels viable: tilt steering, touch throttle/brake, calibration, fallback controls.
- Prove server authority: server owns car state, lap validation, timing, and results.
- Prove display rendering: one display, one car, one original track, stable first-person cockpit camera.
- Add rich feedback early: engine audio, tire slip audio, curb/impact events, optional vibration.

Do not replace the core stack unless there is a clear technical blocker. The default build should use Vite, React, TypeScript, React Three Fiber, Three.js, Rapier 3D, Node.js, Colyseus, and WebSockets.

## 18. Recommended First Implementation Decision

Build the first vertical slice as:

- One display.
- One phone controller.
- `Sakura Sprint` as one original short track.
- One car.
- Server-authoritative movement.
- Tilt steering.
- Touch throttle/brake.
- One-lap race.
- Results screen.

After that works end-to-end, add split-screen, extra displays, and the second track.

# Sim Drive - Product and Technical Spec

Status note: this is the single canonical detailed spec for Sim Drive. `SPEC_rough.md` remains the original product idea, while this document tracks the current implementation plus clearly labeled follow-up work. When product behavior changes, update this file in the same change.

## 1. Summary

Sim Drive is a browser-based party racing game at `simdrive.xyz` where computers or TVs act as race displays and phones act as motion/touch controllers. The product should feel close enough to a lightweight racing sim to be satisfying, while staying fast to join and closer to Jackbox-style party flow than a hardcore simulator.

Working references: `Phonesim`, `Simvibes`, Jackbox-style room joining, gamingcouch.com / couch multiplayer energy, remote couch multiplayer, and lightweight browser racing sims. Public branding can say Sim Drive is inspired by Jackbox-style party joining and couch games, but should not imply official affiliation.

This document is intended to be usable by an AI coding agent or engineering team as the build spec. Treat explicit requirements as source of truth. Treat open questions as future product decisions that should not block current maintenance unless they directly affect implementation.

## 2. Current Implementation Snapshot

- Vite + React + TypeScript browser app.
- React Three Fiber and Three.js cockpit race renderer.
- Node + Express + `ws` WebSocket room server.
- In-memory rooms only; no accounts, matchmaking, persistent storage, or persistent leaderboard.
- Display flow: landing with how-to-play modal, create room, join room as another display, QR lobby with exit room action, optional pre-race tutorial display, race view, and results.
- Display landing, lobby, tutorial, and results support System, Light, and Dark theme modes. System follows the display device color-scheme preference.
- Display landing shows a live active-player count only when at least one driver is online.
- Display lobby shows the QR code, current track, lap count, pre-race tutorial setting, rain, warm-up/flying start, collision/ghost mode, gentle stability assist, reset mode, connected driver lineup, each player's vehicle, setup, and cockpit style.
- Display lobby has a mobile-display guidance overlay for small screens so players know a larger shared display is recommended before continuing.
- Display refresh resumes the same display group. If every display leaves and none reconnects within the 20-second grace window, the room closes and controllers are notified.
- Display results can return the room to lobby without requiring the VIP controller.
- Controller flow: room-code join, name/color setup, per-player vehicle selection, per-player setup selection where available, rear-view mirror mode, cockpit style, VIP settings, optional pre-race phone tutorial, and race controller.
- Controller sessions store the last room token locally and auto-resume the saved driver after phone refreshes or QR rescans when the room still exists.
- One-player practice works with one display and one phone/browser controller.
- Up to 8 players per room are represented in server state.
- Display groups support split-screen panes for up to 4 local players. New controller joins are capped at 4 players per display group so a shared-screen QR cannot overflow visible panes.
- First joined controller becomes VIP.
- Current tracks: `Sakura Sprint`, `Alpine Grand Prix`, `Fjord Loop`, `Keys Causeway`, and `Cloudline Ascent`.
- Current vehicles: `Formula Prototype`, `KZ Kart`, `Stock Truck`, and `Tuk-Tuk`.
- `Formula Prototype` and `Stock Truck` support Balanced, High Grip, and High Speed setups. `KZ Kart` and `Tuk-Tuk` use a fixed setup.
- Personal cockpit styles: None, Hands, and Paws. New players default to None.
- Personal rear-view mirror modes: Auto, On, and Off. New players default to Auto, which shows the mirror when other active cars exist.
- Public page includes the required Cursor Vibe Jam 2026 entrant widget and Tiny Adz bot-protection/conversion snippet with storage disabled, plus the creator contact link in the about modal.

## 3. Core Product Goals

- Let players join quickly from a phone with no account.
- Let one display support local split-screen for up to 4 phone-controlled players.
- Let multiple displays join the same race room so remote couches or solo players can race together.
- Support up to 8 active racers total per room.
- Make the phone controller feel expressive through tilt steering, touch throttle/brake, vibration where supported, and strong audio feedback.
- Give the player as much car/road feedback as possible within browser limits, especially through audio, haptics, visual controller feedback, and telemetry-driven effects.
- Keep the implemented stack small and easy to operate: one Node service serves the built app and hosts the WebSocket game server.
- Keep official motorsport and vehicle branding out unless licensing is explicit.

## 4. Current Stack

- App/build: Vite + React + TypeScript.
- 3D rendering: React Three Fiber on top of Three.js.
- Game server: Node.js + TypeScript + Express + `ws`.
- Transport: WebSockets.
- Server state: in-memory rooms.
- Deploy shape: one Node service serving the built web app and WebSocket server on port `8787`.
- Local dev shape: `npm run dev` starts Vite and the TypeScript server watcher.
- Assets: current cars, cockpit parts, track props, roads, terrain, and effects are procedural Three.js/R3F geometry and materials, plus static public web assets.
- QR and room codes: short room codes plus QR links to the controller join URL.

### Intentional Stack Deviations From The Original Target

- The implementation uses a small purpose-built WebSocket server instead of Colyseus. The message/state model is compact and can be migrated later if room orchestration needs grow.
- The implementation uses custom lightweight kinematic physics instead of Rapier. This keeps the playable slice compact while the desired driving feel is still evolving.
- Track visuals are generated from track centerline data instead of authored GLB assets.
- Elevated track support is purpose-built for the current procedural tracks, not a general terrain engine.
- Audio is synthesized with Web Audio oscillator/noise cues. Richer samples and full scene-wide spatial mixing are future work.

Do not replace the current stack unless there is a concrete technical blocker or a planned migration. Future Rapier/Colyseus work should be justified by a need the current implementation cannot reasonably meet.

## 5. Non-Goals

- No permanent accounts.
- No matchmaking.
- No persistent leaderboards.
- No native mobile apps.
- No WebRTC for gameplay transport.
- No AI cars; all active racers are real users.
- No licensed F1, FIA, NASCAR, manufacturer, team, sponsor, or exact real circuit branding unless licensing is handled.
- No full sim-grade tire model, tire temperature, fuel, pit stops, damage repair, or suspension simulation.
- No broad admin system unless larger multi-display sessions become common.

## 6. Main Concepts

### Room

A room is one complete multiplayer game session. It has one room code, one synchronized race state, one lobby, and one final result list.

### Display Client

A display client is a computer/TV browser. It can create a room or join an existing room. It renders the landing page, lobby, QR code, room code, tutorial display, race split-screen, and results.

### Controller Client

A controller client is a phone browser. It joins by scanning a QR code or entering a room code. It handles username, color, vehicle/setup, cockpit style, rear-view mode, steering calibration/preferences, throttle/brake input, VIP controls, audio, and optional vibration.

### Display Group / Couch

A display group is the set of players assigned to one display. One display group can contain 1 to 4 active racers. This supports:

- One TV with 1 to 4 local players.
- Multiple houses with separate TVs and up to 4 players per TV.
- Solo players, each with their own computer display and phone controller.

Current implementation creates and resumes display groups, but does not include a display-group reassignment UI.

### VIP

The first controller player to complete join setup becomes the VIP. The VIP chooses race settings and starts the race. If the VIP disconnects, VIP is reassigned to the earliest joined connected controller. Display results can return the room to lobby without VIP.

## 7. Player Limits And Phases

- Maximum active racers per room: 8.
- Maximum active racers per display group: 4.
- Recommended maximum display clients per room: 8.
- Recommended maximum connected clients per room: 24, allowing controllers, displays, reconnecting clients, and observers.
- Current room phases: `lobby`, `tutorial`, `countdown`, `racing`, and `results`.

## 8. User Flows

### Landing Page

The landing page is game-first:

- Brand/game name: `Sim Drive`.
- Short promise: phone-controlled browser racing.
- Primary actions: create a game or join a game.
- Feature signals: phones as controllers, split-screen couches, remote groups, no install, vehicle feel, and current track/vehicle showcase.
- How-to-play modal.
- Creator contact link.
- Live active-driver count only when active drivers are online.

### Create Game Flow

1. User opens the main webpage on a computer/TV.
2. User clicks create game.
3. Server creates a room with a short room code.
4. Display enters lobby mode.
5. Lobby shows a QR code and room code.
6. Display is assigned a `displayGroupId`.
7. The display session is saved in session storage so refresh can resume the same group.

### Join Game From Phone

1. Player scans QR code or enters room code.
2. Phone opens controller join page.
3. Player enters name and chooses color.
4. Existing saved room token is reused when available, allowing refreshes and QR rescans to resume the same driver.
5. Player chooses vehicle, setup where available, rear-view mirror mode, cockpit style, steering/audio/haptic preferences, and first-tap pedal behavior.
6. If this is the first completed controller join, the player becomes VIP.

### Join Game From Another Computer

1. User opens the main webpage on another computer.
2. User clicks join game.
3. User enters room code.
4. Computer joins as an additional display client.
5. It gets its own QR code for phones joining that display group.
6. Any phone joining from that QR is assigned to that display group.

### Lobby Flow

The display lobby shows:

- Large QR code and room code.
- Selected track and track preview.
- Race settings.
- Driver lineup.
- Vehicle/setup/cockpit selections.
- VIP/start status.
- Exit room action.
- Mobile-display guidance overlay on small display screens.

The phone lobby shows:

- Player name and color.
- Vehicle and setup selection.
- Rear-view mirror mode selection.
- Cockpit style selection.
- Motion steering status/test/calibration.
- Audio and haptic tests/toggles.
- Steering sensitivity and inversion.
- Brake/throttle first-tap preferences.
- VIP controls when the player is VIP.

### VIP Settings Flow

VIP can choose:

- Track.
- Lap count, 1 to 9.
- Pre-race tutorial on/off. Default is on.
- Warm-up/flying start on/off. Default is on.
- Ghost cars on/off. Default is off, so car-to-car collisions are enabled.
- Rain on/off.
- Gentle stability assist on/off. Default is on.
- Reset mode on/off. Default is off, so normal crash-out remains the default.
- Start race.

Non-VIP players can change their personal driver/controller settings in lobby but cannot change race settings.

### Pre-Race Tutorial Flow

When tutorial mode is enabled, race start moves the room into `tutorial` before countdown.

- Display shows progress for connected drivers and a return-to-lobby action.
- Phone shows a two-step tutorial for pedals and tilt steering.
- The tutorial includes motion permission/enable prompts where needed.
- Race countdown starts automatically when every connected driver is done.
- VIP can skip/start anyway from the phone if someone gets stuck.

### Race Flow

1. Countdown runs from server time.
2. Controller countdown beeps use server-marked countdown feedback.
3. Race begins only when the server reports `racing`.
4. If warm-up/flying start is enabled, the first pass is untimed; each driver's timed lap 1 and total race timer start when they cross the line.
5. Server owns car state, race clock, checkpoints, lap timing, collisions, reset/DNF state, and results.
6. Displays render interpolated race snapshots.
7. Controllers receive focused telemetry for their own audio/haptics and nearby-rival cues.

### Results Flow

- Results show podium-style placement, total race time, and best lap for finished players.
- Crashed and DNF players are sorted after finishers.
- Display can return the room to lobby without requiring VIP.

## 9. Gameplay

### Race Format

- Race supports 1 to 8 active racers.
- Each display renders only players assigned to that display group in split-screen, falling back to room players if a local group is unavailable.
- Every racer exists in the same race world regardless of display assignment.
- Final ranking is global across all players.

### Vehicles

Current vehicle roster:

- `Formula Prototype`: high-downforce open-wheel formula car. Balanced, High Grip, and High Speed setups.
- `KZ Kart`: fixed sprint kart setup, sharp steering, curb-sensitive.
- `Stock Truck`: heavy racing pickup. Balanced, High Grip, and High Speed setups.
- `Tuk-Tuk`: fixed city-stock three-wheeler setup, slow and rollover-prone.

Vehicle definitions include physics, stat bars, audio profiles, haptic profiles, visual notes, and setup availability. `CARS.md` is the quick tuning reference, while source of truth lives in `src/shared/cars.ts`.

### Cockpit And Rear View

- Default race camera is cockpit-style.
- Vehicle-specific cockpits show recognizable silhouettes and instruments:
  - Formula: nose, front tyres, compact wheel/display and shift lights.
  - Kart: floor, front wheels, steering column, and mounted data logger.
  - Stock Truck: centered POV with broad hood/cowl, roll-cage pillars, and subtle digital speedometer.
  - Tuk-Tuk: canopy, handlebars, small analog speedometer, and `TIP RISK` toast.
- Cockpit style is personal and visual-only: None, Hands, or Paws.
- Rear-view mirror mode is personal: Auto, On, or Off.
- Auto mode shows the mirror only when other active cars exist.
- Rear-view mirror rendering uses a lighter mirror scene with capped nearby cars, lower DPR, no shadows, and reduced track detail.

### Split-Screen Rules

- 1 local player on display: full screen.
- 2 local players: split layout.
- 3 or 4 local players: grid layout.
- In-race minimap, rear-view mirror, leaderboard, countdown lights, first-place banner, spectate controls, and results must remain readable and non-obstructive in split-screen.

### Tracks

Current track set:

- `Sakura Sprint`: short technical party/onboarding circuit inspired by flowing esses and compact elevation/change-of-direction sections.
- `Alpine Grand Prix`: longer high-speed circuit inspired by elevation, fast sweepers, high-speed directional changes, and heavy-braking chicanes.
- `Fjord Loop`: long endurance loop inspired by fjord/mountain scenery, ridge climbs, downhill braking zones, waterfalls, and village scenery.
- `Keys Causeway`: flat coastal endurance loop inspired by the Florida Keys Overseas Highway, long bridge straights, open water, old parallel bridge sections, palms, mangroves, lighthouse, and marina scenery.
- `Cloudline Ascent`: very long mountain-pass endurance route inspired by race-to-the-clouds climbs, stacked switchbacks, exposed ridge straights, long downhill return, snowbanks, summit observatory, and high-altitude cloud wisps.

Track design may draw from real circuit and road archetypes. Do not use protected names, logos, official signage, or branded assets unless licensing/clearance is explicit.

Research references used for long-road inspiration:

- Nuerburgring official race tracks page: Nordschleife length/context: https://nuerburgring.de/info/nuerburgring/race-tracks?locale=en
- Pikes Peak International Hill Climb official race page: course length, turns, and elevation climb: https://ppihc.org/about/
- Norwegian Scenic Routes Geiranger-Trollstigen page: fjord/mountain scenery, hairpins, climbs, and descents: https://www.nasjonaleturistveger.no/en/routes/geiranger--trollstigen/
- Florida Keys & Key West Seven Mile Bridge page: Overseas Highway ocean views, old parallel bridge, and Pigeon Key context: https://visitfloridakeys.com/plan-your-trip/plan-book/getting-here-around/seven-mile-bridge
- Britannica Seven Mile Bridge page: bridge length, Overseas Highway relationship, and old/new bridge history: https://www.britannica.com/place/Seven-Mile-Bridge

Track data supports:

- Centerline points.
- Sampled elevation and grade so uphill/downhill sections affect physics, camera height, car visuals, effects, reset/spawn, prop placement, and track geometry together.
- Road width, curb width, wall margin, start/finish line, checkpoints, spawn grid, wall/runoff behavior, and surface classification.
- Generated terrain support for elevated tracks.
- Height-aware nearest-track checks to avoid wrong-layer selection on stacked/overlapping routes.

### Track Visuals

Race visuals include:

- Smooth generated road ribbons.
- Painted edge lines.
- Racing line.
- Alternating raised curbs.
- Rubber/skid detail.
- Static and live skid marks.
- Runoff.
- Start/finish line and start grid markers.
- Simple gantry.
- Braking boards.
- Barriers.
- One `#vibejam` sponsor board.
- Lightweight track identity props.
- Generated terrain support for elevated Fjord/Cloudline sections.
- Flat coastal bridge/water scenery for Keys Causeway.
- Grass dust, wet spray, impact flashes, fog/lighting changes, subtle rain visor overlay, and visible falling rain/mist in rain mode.

Elevated-track rendering uses centerline-derived road/curb/runoff ribbons plus generated shoulder and hillside terrain. Fjord skips lower outer terrain panels that would cross nearby same-height road sections, avoiding false tunnels, grass walls, and grass stripe artifacts.

## 10. Physics And Race Rules

The game should feel like a low-definition racing sim:

- Steering has inertia, speed scaling, lateral damping, and grip limits.
- Braking shifts grip and creates stronger feedback.
- Curbs and grass are noticeable.
- Grass/off-road reduces grip and increases drag.
- Wall hits slow cars and can crash them.
- Vehicle-specific profiles make the roster feel distinct.
- Handling favors fun and readability over strict realism.

Current server-authoritative simplified racing physics includes:

- Throttle, brake, and steering input.
- Per-vehicle tuning.
- Per-driver setup multipliers where available.
- Optional warm-up/flying start timing.
- Velocity-based lateral slip.
- Aero/speed drag.
- Downforce-style speed-building grip.
- Elevation/grade acceleration for uphill/downhill sections.
- Optional gentle stability assist.
- Tuned road/curb/grass grip and drag.
- Rain grip reduction and top-speed changes.
- Tuk-tuk rollover risk.
- Wall slowdown.
- Directional car contact/crash handling.
- Optional crash/off-track reset.
- Checkpoint-gated lap finish.
- DNF handling.
- Results.

### Collision And Ghost Mode

- Ghost cars on: player cars do not collide with each other.
- Ghost cars off: directional car contact can push cars and trigger crashes.
- Walls/off-track behavior still matters in both modes.

### Reset Mode

- Reset mode off: hard crashes kick players out of the race.
- Reset mode on: crashed cars pause for about 2.5 seconds, then respawn near the last valid track point at low speed with brief invulnerability.
- If reset mode is on and a car stays off-track for 5 seconds, that driver's phone shows a `Reset to track` button.

### DNF And Race Caps

- Unfinished racing players are marked DNF if they disconnect past the race grace window.
- Unfinished racing players are marked DNF if a race exceeds its generous time cap.
- This prevents abandoned races from staying active forever.

### Leaderboard And Timing

The server records:

- Lap times.
- Best lap times.
- Total race time.
- Checkpoint progression.
- Finish order.
- Crashed/DNF status.

Results are sorted by finish status, finish time, join order, then name.

Anti-cheat basics:

- Lap only counts after passing ordered checkpoints.
- Finish only counts after required laps.
- Controller inputs are accepted only from the assigned controller client.

## 11. Phone Controller

### Layout

During race, the phone screen is split into two full-height touch zones:

- Left side: brake.
- Right side: throttle.

Each side behaves like a vertical analog slider:

- Touch anywhere on the side to engage.
- Initial touch value depends on player preference.
- Moving thumb down increases brake.
- Moving thumb up increases throttle.
- The visible slider is feedback only; the player does not need to touch a visible knob precisely.

### Motion Steering

Phone controller supports:

- Landscape race mode.
- Orientation-aware steering.
- iOS/WebKit motion permission prompts.
- Chrome-friendly `devicemotion` and Generic Sensor fallbacks.
- Countdown-time stable median neutral capture before motion steering is sent.
- Orientation-frame recentering when the phone changes orientation frame.
- Per-phone 1-10 motion sensitivity.
- Saved motion-steering inversion for browser/device sign differences.
- Explicit neutral calibration.
- Corrected left/right steering direction.
- Touch steering fallback with matching arrow direction.
- Visible motion-sensor/fallback status.
- Recommended-browser notices.
- Pre-race motion test meter.

Chrome/Chromium and iOS Safari/WebKit require HTTPS for motion sensors. Plain LAN `http://` may leave the app in touch steering fallback even when the API exists.

### Audio

Controller audio is default-on, has an on/off toggle and test cue, and uses persistent Web Audio layers:

- Start/test cue.
- Server-marked 5/4/3/2/1 countdown beeps.
- Louder/lower `GO` cue only after the server reports the race phase has started.
- Engine tone follows speed/throttle and fades out on race exit.
- Tire noise follows slip/off-road cornering.
- Brake tone follows braking at speed.
- Curb rumble follows curb contact.
- Impacts get a thud cue.
- Nearby rivals get quiet stereo-panned engine/pass-by presence.
- Nearby non-self crashes get lighter panned booms.

Current audio is synthesized. Richer samples and full scene-wide spatial mixing are future work.

### Haptics

Haptics use `navigator.vibrate()` with support status, an on/off toggle, and a test pulse. Vibration is progressive enhancement only and must never be required for gameplay.

Current haptic events:

- Test pulse.
- Explosive crash pattern.
- Impact pulse.
- Hard braking pattern.
- Curb pulse.
- Grass/off-road pulse.
- High-slip pulse.
- Tuk-tuk tip-risk warning pattern.

Web browsers can vary vibration duration/pattern but not reliable motor amplitude/intensity like native APIs. Android Chromium/Samsung-style browsers are the main target. iOS Safari does not support web vibration. Firefox Android may expose partial or no-op support.

### Visual Controller Feedback

The phone controller shows:

- Throttle percentage.
- Brake percentage.
- Steering/tilt meter.
- Connection and motion status.
- Calibration state.
- Audio/haptic enabled state.
- Countdown control hints.
- Reset button when eligible.

## 12. Networking Model

The game is server-authoritative:

- Controllers send input to server.
- Server owns race clock, car state, lap timing, collisions, checkpoints, reset/DNF state, and results.
- Displays receive state snapshots and render interpolated views.
- Controllers receive small telemetry/feedback messages for haptics, audio, crash events, countdown marks, and nearby-rival descriptors.

### Runtime Rates

- Server physics tick: 60 Hz.
- Display race snapshots: 30 Hz.
- Controller feedback: 20 Hz.
- Full room state during active races: low-frequency, currently 2 Hz.
- Lobby/results room state: change-driven/full room updates.

### Current Client Messages

- `create_room`
- `join_display`
- `set_profile`
- `set_vehicle`
- `set_car_setup`
- `set_cockpit_style`
- `set_rear_view_mode`
- `set_ready`
- `set_tutorial_done`
- `input_frame`
- `request_reset`
- `vip_set_settings`
- `vip_start_race`
- `vip_skip_tutorial`
- `vip_return_lobby`
- `display_return_lobby`
- `close_room`
- `ping`

### Current Server Messages

- `hello`
- `live_stats`
- `joined_display`
- `joined_controller`
- `room_state`
- `race_snapshot`
- `controller_feedback`
- `room_closed`
- `error_notice`
- `pong`

### Input Frame Shape

Each controller sends compact input frames:

- `seq`: monotonically increasing input sequence number.
- `steer`: `-1` to `1`.
- `throttle`: `0` to `1`.
- `brake`: `0` to `1`.

### Reconnection

- Phone controller sessions use saved room tokens and can auto-resume saved drivers after refreshes or QR rescans.
- If the same controller resumes in another tab, the previous controller tab is notified.
- Short phone disconnects preserve the player slot for a grace period.
- If the VIP disconnects, VIP is reassigned to the earliest joined connected controller.
- Display refresh can resume the same display group.
- If every display leaves and none reconnects within the 20-second grace window, the room closes and controllers are sent out.
- If a controller disconnects during race and misses the race grace window, that car is marked DNF.

## 13. State Model

Current shared state types live in `src/shared/types.ts`.

Room state:

- `roomCode`
- `phase`: `lobby`, `tutorial`, `countdown`, `racing`, or `results`
- `displayGroups`
- `players`
- `settings`
- `countdownEndsAt`
- `raceStartedAt`
- `cars`
- `crashEvents`
- `results`

Player state:

- `id`
- `token`
- `displayGroupId`
- `name`
- `color`
- `vehicleId`
- `carSetupId`
- `cockpitStyle`
- `rearViewMode`
- `isReady`
- `tutorialDone`
- `isVIP`
- `connected`
- `disconnectedAt`
- `joinedAt`

Race settings:

- `trackId`
- `lapCount`
- `tutorialEnabled`
- `warmupStart`
- `ghostMode`
- `rain`
- `stabilityAssist`
- `resetEnabled`

Car state:

- Player/vehicle/setup identifiers.
- Position, velocity, heading, speed, steering, throttle, and brake.
- Lap, progress, checkpoint, warm-up/timed-lap timing, last lap, best lap, and finish time.
- Surface, impact, slip, rollover risk, crash, DNF, reset availability, and reset invulnerability.

Race result:

- Player id, name, color.
- Total time.
- Best lap time.
- Status: `finished`, `crashed`, or `dnf`.

## 14. Screens

### Display Screens

- Landing.
- How-to-play modal.
- Create/join game.
- Lobby with QR code.
- Mobile-display guidance overlay.
- Tutorial progress display.
- Countdown lights.
- Race split-screen.
- Results leaderboard/podium.

### Phone Screens

- Join by room code.
- Name/color setup.
- Controller setup/lobby.
- Vehicle/setup selector.
- Rear-view mirror selector.
- Cockpit style selector.
- Motion permission/test/calibration.
- Audio/haptic preferences and tests.
- VIP settings controls.
- Pre-race tutorial.
- Race controller.
- Reconnect/resume states.

## 15. Acceptance Criteria For The Current Playable Slice

- A computer can create a room and show a QR code plus room code.
- Phones can join, set name/color, choose vehicle/setup/cockpit/mirror options, calibrate/test steering, and appear in lobby.
- First phone to join becomes VIP.
- Additional computers can join the same room as display clients.
- Up to 8 players can join one room.
- A display can render 1 to 4 local players in split-screen.
- VIP can select track, lap count, tutorial, warm-up/flying start, ghost cars, rain, assist, and reset mode.
- The current track set is `Sakura Sprint`, `Alpine Grand Prix`, `Fjord Loop`, `Keys Causeway`, and `Cloudline Ascent`.
- Race starts, runs, finishes, and shows podium/results.
- Phone steering, brake, and throttle control the car.
- Audio feedback works on phones after user gesture.
- Haptics work where supported and fail gracefully where unsupported.
- Disconnected phones can reconnect within a grace period.
- Display refresh can resume the same display group during the display grace window.
- No AI cars are spawned when fewer than 8 players join.

## 16. Technical Risks And Guardrails

- Mobile browser motion permissions require explicit UX and real-device testing.
- Phone vibration support varies significantly and must remain optional.
- Audio playback must be unlocked by user gesture.
- Browser/device orientation axes differ across devices, so calibration, inversion, and fallback controls are required.
- Network latency can make racing feel poor if displays do not interpolate smoothly.
- Split-screen and rear-view mirrors duplicate WebGL work. Keep mirror scenes lighter than full scenes.
- Elevated tracks need manual full-lap visual inspection after layout changes.
- Do not increase rain, prop, shadow, or mirror cost without checking split-screen.
- Server-authoritative physics may be CPU-heavy if room count grows; optimize after real load measurements.
- Real motorsport branding, names, cars, and exact track layouts may create licensing/trademark issues.
- A future builder may be tempted to implement exact real circuits. Do not do this without explicit clearance.

## 17. Next High-Value Work

- Run the real-phone checks in `HUMAN_CHECKS.md`, then adjust numeric tuning if steering feels too loose, too assisted, or too punishing in rain.
- Add display-group reassignment only if multi-display sessions become common.
- Add proper generated or authored car/track assets.
- Add automated Playwright smoke tests as checked-in tests instead of ad hoc verification scripts.
- Add a headless load test for server capacity estimates.
- Improve wet-road effects and spray.
- Consider richer audio samples and broader spatial mixing.

## 18. Open Questions

- Should display-group reassignment be a normal lobby feature or an admin-only escape hatch?
- Should larger sessions get stronger display/admin controls?
- Should every display show all racers on the minimap/leaderboard, or emphasize local display group racers plus top positions?
- Should there be an optional lower cockpit camera for players who want a more believable seated view?
- Should ghost mode become the default for public/party play, or should collision remain the current default?
- Should authored car/track assets replace procedural geometry gradually, or should procedural generation remain the main style?

## 19. AI Builder Instructions

When this spec is handed to an AI coding agent, preserve the current playable slice and make focused changes. Do not spend a maintenance pass on auth, persistent storage, exact track art, or broad engine migrations unless the user specifically asks for that work.

Implementation priorities:

- Keep the full room loop working: create room, join phone, start race, finish race, return to lobby.
- Keep phone control viable: tilt steering, touch throttle/brake, calibration, fallback controls, and clear motion permission UX.
- Preserve server authority: server owns car state, lap validation, timing, DNF/reset state, and results.
- Preserve display rendering: stable cockpit view, split-screen readability, minimap/leaderboard/rear-view layout, and smooth interpolation.
- Preserve rich feedback: engine audio, tire slip audio, curb/impact events, nearby rival cues, and optional vibration.
- Keep high-frequency game state out of normal React state; use refs, interpolation buffers, server snapshots, and focused controller feedback.
- Update this spec whenever implementation behavior changes.

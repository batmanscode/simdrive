# Performance And Engineering Notes

This file tracks the practical constraints that matter when changing Sim Drive. Use it before adding tracks, race visuals, multiplayer behavior, phone feedback, or any high-frequency UI.

## Current Race Architecture

- The server owns race truth: physics, collisions, lap timing, reset/DNF state, race phase, and results.
- Controllers send compact `input_frame` messages at about 30 Hz.
- Server physics ticks at 60 Hz.
- Physics uses a capped fixed-timestep accumulator so short server event-loop stalls catch up without letting one large dt destabilize cars.
- Display clients receive `race_snapshot` messages at 30 Hz.
- Controller clients receive `controller_feedback` at 20 Hz, including their own car feedback, own crash events, compact nearby-rival audio descriptors, nearby non-self crash events, server time, race phase, and the current server-derived countdown mark when a countdown is active.
- Full `room_state` messages are sent on lobby/results changes and less frequently during active races.
- During active races, full race snapshots should go to display clients only. Phone controllers should not parse all cars every snapshot when they only need their own feedback.

## Lag Investigation Notes

The multiplayer lag seen with two players was not primarily a server CPU problem. The strongest evidence was:

- Split-screen was worse than two separate display devices.
- Two separate devices still had some visible stepping, but less.
- The display was doing the expensive work: each split-screen pane mounted a complete Three canvas and rendered the whole race scene again.

Main contributors found:

- Display snapshots were only 20 Hz, which can look like skipped frames at racing speed.
- Controllers were receiving full `race_snapshot` messages they did not need.
- Display sockets could queue stale race snapshots if the browser/network fell behind.
- Split-screen duplicated all WebGL work per pane: track geometry, props, cars, rain, skid marks, shadows, antialiasing, and high DPR.
- Curbs were many separate stripe meshes per canvas, multiplying draw calls.
- Some static visual calculations were being re-run or reconciled during frequent race state updates.

## Current Optimizations

Networking:

- Display snapshots now run at 30 Hz.
- Controller feedback runs separately at 20 Hz and carries countdown/audio timing plus compact nearby-audio data so phone feedback does not depend on display `race_snapshot` delivery.
- Race snapshots are broadcast only to display clients.
- Stale display race snapshots may be dropped when a display socket is backed up. This is intentional: showing the newest state late is worse than skipping old state.
- Broadcast payloads are serialized once per room per broadcast where practical, instead of once per client.
- Lobby/results do not broadcast full room state at the race snapshot rate.
- Display/controller disconnect handling is based on whether another live socket still owns the same display group or player, so old sockets closing after a reconnect should not mark active clients disconnected.
- Client reconnect handlers ignore `close` events from stale sockets that are no longer the current socket. This avoids false `Connection lost` UI and duplicate reconnect timers after React dev remounts or quick reconnect races.
- Each player has one active controller socket lease. If the same saved controller token reconnects from another tab/device, stale sockets can stay connected but their inputs, VIP actions, and feedback stream are ignored.
- VIP race settings and start-race messages are accepted only in the lobby, preventing stale controller tabs from mutating or restarting an active race.
- Display and controller clients reconnect automatically after socket drops. Realtime `input_frame` messages are not queued while disconnected, so stale steering/brake inputs are not replayed after reconnect.
- Final results are sorted by finish status, finish time, join order, then name before display.

Rendering:

- Split-screen uses a lower-cost render mode:
  - lower DPR
  - no antialiasing
  - no shadows
  - fewer rain drops
  - fewer live skid marks
- Single-screen keeps the higher-quality render path.
- Rear-view mirrors are personal and default to Auto, so solo races and panes without active rivals do not mount the extra mirror canvas.
- Rear-view mirrors render continuously for smooth motion, but use lower DPR, no antialiasing, no shadows, a capped nearby-car list, and a lighter mirror track detail mode with boards/signage but without the heavier decorative scenery.
- Static track/environment components are memoized.
- Minimap track paths are memoized per track.
- Alternating curb stripe meshes are merged into two geometries, one red and one white.

Gameplay:

- Physics, inputs, collisions, lap timing, reset behavior, and results were not changed by the performance pass.
- Split-screen visuals intentionally trade a little polish for frame stability.

## Performance Rules For New Work

High-frequency state:

- Do not put per-frame or high-frequency race data into broad React state unless the UI genuinely needs to re-render.
- Prefer refs, `useFrame`, interpolation, memoized derived data, and small snapshots for moving race visuals.
- Keep normal React state for lobby/forms/results and slower UI state.

Networking:

- Keep active race messages compact.
- Do not add large cosmetic/player/settings payloads to `race_snapshot`.
- Do not send all-car display snapshots to controllers unless a controller feature truly needs them.
- If a message is only useful when fresh, it should be safe to drop when backed up.
- If a message must never be dropped, keep it separate from high-frequency streams.
- Reconnect-sensitive state must be based on currently live sockets, not only the socket that just closed.
- Browser-side reconnect state must only be updated by the current socket. Stale socket `close`/`error` handlers should return without changing UI state or scheduling reconnects.
- Any controller command that affects race truth must verify the socket is the active controller lease for that player.
- Lobby-only commands, especially race settings and race start, must stay phase guarded on the server. UI guards are not enough because stale tabs can still send old messages.
- Do not queue high-frequency realtime messages across reconnects. Dropping old `input_frame` data is better than replaying stale controls.

Rendering:

- Treat split-screen as the worst-case baseline. Any expensive visual is multiplied by the number of local panes.
- Avoid adding per-pane effects without a split-screen quality fallback.
- Avoid many separate meshes for repeated decoration. Prefer merged geometries or instancing.
- Avoid expensive transparent effects in large quantities.
- Avoid shadows on repeated small props unless they are visibly important.
- Keep generated/material-heavy visual assets modest; browser WebGL is the target, not a desktop game engine.

React Three Fiber:

- Static world components should be memoized where their props are stable.
- Geometry creation should happen in `useMemo` or shared helpers, not during every render.
- Avoid creating new arrays/objects in hot render paths when memoization depends on identity.
- Use `useFrame` for camera/car smoothing instead of React state updates per frame.

## Track And Map Authoring Rules

The track should remain generated from centerline data for now.

Reasons:

- Physics and visuals stay aligned.
- Reset-to-track and nearest-track calculations use the same track definition.
- New tracks are small data changes instead of large asset imports.
- It avoids fragile collision/visual mismatches from whole-track GLB assets.

When adding a new track:

- Add centerline points in `src/shared/tracks.ts`.
- Keep the layout original. Do not copy real F1 circuit layouts, names, branding, logos, signs, or trade dress.
- Test the track with warm-up start on and off.
- Test 1-player, 2-player split-screen, and 2-device multiplayer.
- Check checkpoint/lap completion, reset-to-track, wall distance, and off-track punishment.
- Check minimap readability.
- Check first-person camera readability through tight corners and elevation-like visual moments.
- Check rain mode if the track has long fast sections or many curbs.

Track visual guidance:

- Curbs, road ribbons, runoff, racing line, and rubber detail should be generated from the track centerline.
- Elevated tracks need generated support terrain, not only a floating road ribbon. Use narrow road/runoff/shoulder ribbons plus side terrain that cannot cross back over nearby same-height road sections.
- For overlapping or stacked layouts, use height-aware nearest-track checks for physics, effects, prop placement, and terrain conflict detection.
- Avoid wide all-in-one terrain aprons on elevated tracks. They can create grass shelves, sky gaps, false tunnels, or grass stripes where the terrain crosses another road section.
- Repeated visual elements should be merged or instanced.
- Avoid hundreds of individual board/tree/barrier meshes.
- Prefer a small number of strong landmark props over many tiny props.
- Do not generate the whole track as one GLB yet.
- If GLB props are added, clean them first: decimate, scale, set origin, fix materials, and keep draw calls low.

Track performance checklist:

- Does the new track add many more samples than existing tracks?
- Does it increase visible prop density?
- Does it create long sightlines where many props are visible at once?
- Does split-screen still feel stable with two local panes?
- Does rain mode still feel stable?

## Elevated Track Problems And Fixes

The first elevated Fjord/Cloudline pass exposed problems that flat tracks did not have:

- Road/grass layering could look like the road faded into grass because elevated road, runoff, shoulders, and terrain were only simple ribbons with very small vertical separation. The fix was to keep explicit road/runoff/shoulder height ordering and audit those offsets along each track.
- Stacked or close-return sections could select the wrong road layer when nearest-track lookup only considered `x/z`. The fix was to make nearest-track selection height-aware when a `y` value is available, and to pass car/sample height through physics, skid marks, crash visuals, reset/spawn, and prop placement.
- Fjord had a same-height curb self-intersection near the start/finish seam. The fix was to widen/smooth that closing corner and audit curb offset paths for same-height intersections.
- Wide elevated terrain aprons created floating-road and grass-shelf artifacts. The fix was to replace the wide apron with a narrower generated terrain corridor: road/runoff/shoulder ribbons plus side terrain that slopes down to a base floor.
- Fjord's lower outer terrain skirt crossed a nearby same-height road section, which looked like a grass wall or false tunnel. The fix was to detect those terrain panel conflicts and skip only the lower outer panels that would cross same-height road.

Cloudline was checked with the same terrain, curb, and large-prop clearance audits and did not show the Fjord-style same-height terrain conflicts.

## Car And Cockpit Visual Rules

- The current car is built from many primitives. Be careful adding more pieces because each player car is rendered in every pane.
- Cockpit visuals are also per pane and stay visible constantly, so small additions can have steady cost.
- Prefer reusing simple geometry/materials over adding unique materials for every small part.
- If authored car assets are introduced, use low-poly GLB/GLTF assets with a small material count.
- Test with the maximum expected visible cars, not just one player.

## Effects Rules

Rain:

- Rain is intentionally cheaper in split-screen.
- Do not increase rain drop count without testing split-screen.
- Transparent rain/mist can be expensive; keep it sparse and local to the focused car.

Skid marks:

- Live skid marks are capped.
- Split-screen uses a lower cap and slower spawn interval.
- Avoid making skid marks permanent or unbounded during a race.

Dust/spray/impact:

- Keep these conditional and short-lived.
- Prefer a few planes or simple meshes over particle systems unless performance is measured.

HUD/minimap/leaderboard:

- HUDs render once per pane, so repeated SVG/path work should be memoized.
- Keep text readable in 1/2/3/4 pane layouts.
- Avoid adding heavy animated DOM effects during the race.

## Controller Rules

- Controller input should stay compact and predictable.
- Controller feedback should stay focused on the current player's car. Nearby audio should use compact derived descriptors, not full all-car snapshots.
- Audio/haptics should use the lightweight feedback stream, not full room race snapshots.
- Keep audio/haptic loops timer/ref based; avoid state updates at audio/haptic frequency.
- Phone controller UI should not depend on display snapshot delivery.
- Countdown beeps should use server-derived controller feedback marks, and `GO` should wait for the server-reported racing phase. Do not make race-start audio depend only on local client countdown math.

## Server Rules

- Server physics is currently lightweight enough for small rooms; the two-player lag was display/render related.
- Still avoid expensive per-room or per-car work in the 60 Hz tick.
- Do not allocate large objects in the tick loop unless necessary.
- Keep collision and nearest-track calculations bounded by current max racers and track sample counts.
- Use the fixed-timestep accumulator pattern for physics. Do not replace it with one large variable dt step after stalls.
- Keep lobby/results broadcasts change-driven or low-frequency; do not send full room state at race snapshot frequency outside active races.
- Before estimating production capacity, add a headless load test that creates rooms, fake displays, and fake controllers, sends 30 Hz input, and measures tick delay, memory, CPU, and network throughput.

## Testing Checklist For Race Changes

Run:

```bash
npm run typecheck
npm run build
```

Manual checks:

- One display, one controller, no split-screen.
- One display, two local controllers, split-screen.
- Two display devices with one controller each.
- Rain on/off.
- Sakura Sprint, Alpine Grand Prix, Fjord Loop, and Cloudline Ascent.
- For Fjord Loop and Cloudline Ascent, check the full route for floating-road views, missing road, grass stripes over asphalt, false tunnels/walls, and terrain panels crossing same-height road sections.
- Warm-up start on/off.
- Reset mode on/off.
- Phone refresh during race.
- Display refresh during race.
- Phone refresh/reconnect during race should not mark the active resumed controller disconnected when the old socket closes.
- Opening the same saved controller in a second tab/device should make the newest controller authoritative; the older socket must not steer, receive feedback, or issue VIP commands.
- A short network drop should reconnect automatically and resume from saved display/controller session data.
- Display refresh/reconnect should not start the no-display room close timer while another display socket for that room/group is live.

Watch for:

- Visual stepping or stale positions.
- Input delay from phone to display.
- Split-screen frame drops.
- Controller audio/haptic delays.
- Race snapshots being sent to controllers unnecessarily.
- Socket buffered output growing during active races.
- Queued outbound client messages growing during connection loss; `input_frame` must not accumulate.
- Results ordering should put finishers first by total time, then crash/DNF statuses.

## Known Future Optimization

The biggest remaining split-screen improvement is to render all panes with one shared WebGL canvas using viewport/scissor rendering instead of mounting one canvas per pane.

Expected benefit:

- One renderer instead of multiple renderers.
- Better sharing of loaded geometry/materials.
- Lower browser/GPU overhead in 2/3/4 pane layouts.

Tradeoff:

- Bigger refactor.
- HUD overlays and camera ownership need careful handling.
- Race scene logic must support multiple cameras/views cleanly.

## Bundle Size Note

`npm run build` currently warns that the main client bundle is larger than Vite's default 500 kB chunk warning threshold. The last checked production build was about 1.30 MB minified and about 357 kB gzipped for the main JS asset.

This is not a build failure and is expected with the current architecture because React, Three.js, React Three Fiber, QR code rendering, icons, the display app, controller app, and race scene all ship in one client bundle.

Future improvement:

- Split display/controller routes or lazily load race-only 3D code.
- Keep shared lobby/controller code lightweight.
- Measure first-load time on mobile before treating the warning as urgent.
- Do not silence the warning unless bundle size is being tracked another way.

## When Adding New Features

Before implementing, decide which bucket the feature belongs to:

- Lobby/results/static UI: normal React state is fine.
- Race HUD: keep derived work memoized and per-pane cost low.
- Race pane camera/overlay features: keep display-only view state local to the pane unless the server genuinely needs to know about it.
- Race 3D visual: assume split-screen multiplies the cost.
- Controller feature: use input/feedback streams, not display snapshots.
- Server race behavior: keep tick-loop cost bounded and deterministic.

If the feature runs during an active race, test it in split-screen before calling it done.

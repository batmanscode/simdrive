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

These rates protect game feel: [PR #3](https://github.com/batmanscode/simdrive/pull/3) raised display snapshots from 20 to 30 Hz to reduce visible stepping and separated phone feedback from the display stream. Performance work should remove repeated computation or reduce 3D pixel cost while retaining the 60 Hz physics, ~30 Hz inputs, 30 Hz snapshots and 20 Hz controller feedback.

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

## Motorsports presentation

- Rain, petals, roadside grass, and soft tire wakes use instancing. Surface detail/wet sheen and distant skybox ridges use inexpensive shaders rather than reflection passes or a longer prop draw distance.
- Sun-shadow coverage follows the cockpit on long/elevated routes; split-screen retains the shadow-free tier with grade-aligned grounding blobs.
- Adaptive resolution lowers only 3D pixel density under sustained load, down to 0.6 in split-screen or 0.8 solo. The selected DPR is owned alongside the Canvas prop so live snapshots preserve the reduction; changing solo/split quality resets its sampling and choice. DOM instruments stay crisp; mirrors retain their separate fixed DPR. This does not lower rendering refresh, physics or network update rates.
- Personal ghost recordings are bounded to 4,001 frames per stored best. The ephemeral display replay is capped at 150 frames / nine seconds. Neither changes server race truth.
- A baseline/upgraded four-pane comparison in software-only headless Chromium was slow for both. It establishes render/error coverage, not real hardware FPS or phone steering feel. Shared-canvas/engine migration remains a separate profiling decision.

## Trackside artwork

- Trees share baked branch/foliage geometry and materials, partitioned into 32 m world cells for normal frustum culling. Cells entirely beyond opaque linear fog are skipped; bounds include the small shader-driven leaf movement. The higher roads retain separate vertical cells.
- Nearby pines form small groves on the existing shoulder shelf. Road-clearance helpers preserve the route's height layer. Distant Sakura trees use simpler crowns and do not cast shadows.
- Bridge rails share instanced boxes. Cabin details and irregular mountain faces are baked into a few meshes with vertex colors rather than separate objects for every detail.
- Water uses one fog-aware surface shader with distance-filtered ripples and grazing-angle color. It adds no reflection camera, render target, texture download or postprocessing pass. Water and foliage motion respect reduced-motion preferences.

Matched dry solo captures at 1280×800 measured the following totals across two fixed driver views per track, including both the color and sun-shadow passes:

| Track | Draw calls before → after | Submitted triangles before → after |
| --- | --- | --- |
| Sakura | 607 → 361 | 52,446 → 46,046 |
| Alpine | 475 → 465 | 35,814 → 38,247 |
| Fjord | 420 → 421 | 235,934 → 240,946 |
| Causeway | 1,188 → 746 | 241,066 → 240,022 |
| Cloudline | 676 → 630 | 526,966 → 528,526 |

Across these ten views, draws fell 3,366→2,623 (22%) and triangles were effectively flat, 1,092,226→1,093,787 (+0.14%). Alpine/Fjord spend a little more geometry on groves and cabin details. These are submission counts, not a hardware frame-rate measurement.

The following landscape/route pass adds coastal deck/pier/shoreline geometry, authored cuttings, a stone arch and harbor setting. At the same ten fixed views, combined color/shadow draws changed 2,623→2,621 and triangles 1,093,787→1,098,867 (+0.46%). Shoreline geometry and fewer high-elevation trees offset the new landmarks. These counts do not establish hardware FPS.

Route variants share the original scenery family and control points. Terrain probes protect other road layers; generated ribbons and new landscape buffers are disposed on replacement/unmount. Cosmetic suspension uses bounded substeps without React frame state. Engine voices run on the phone with native Web Audio nodes and reuse the tire noise buffer; no audio media downloads or new application dependencies are required.

## Local production profiling — 2026-11-03

The baseline production build was measured on this workspace's four-vCPU AMD EPYC host (Node 22.23.4). Each server scenario used a fresh process, separate WebSocket driving clients, wet Cloudline, ghost cars and reset enabled, and legal groups of at most four drivers per display. Sampling followed eight seconds of warmup: ten seconds normally, twenty seconds with CPU sampling for the 64-driver stress case. Event-loop delay was sampled at 1 ms resolution. These short runs describe this machine and workload, not a production capacity guarantee.

| Rooms × drivers | CPU, % of one core | Event-loop delay p95 | Display / phone updates per second | Server RSS |
| --- | --- | --- | --- | --- |
| 1 × 1 | 6.0% | 1.49 ms | 30.2 / 19.9 | 88.5 MB |
| 1 × 4 | 15.9% | 2.59 ms | 30.2 / 20.0 | 93.6 MB |
| 1 × 8 | 27.5% | 4.06 ms | 30.1 / 19.9 | 97.0 MB |
| 2 × 8 | 46.9% | 7.40 ms | 29.7 / 19.6 | 101.5 MB |
| 8 × 8 | 103.1% | 459 ms | 1.2 / 1.1 | 110.5 MB |

The overloaded baseline spent about 93% of sampled time in `nearestTrackPoint`, `distance3D` and `angleLerp`, with another 4% in garbage collection. Lookup scanned every smoothed segment and calculated a complete candidate for each one. The 64-driver case had all cars active but could no longer sustain the configured update rates; the CPU figure can exceed 100% because it includes process helper threads.

Application JSON traffic averaged 124 kB/s per display and 40 kB/s per phone in the four-driver room; the eight-driver room used 241 kB/s per display and 49 kB/s per phone. This includes full room updates and nearby audio descriptors, excludes WebSocket/TLS overhead, and uses uncompressed local connections. It does not measure internet latency or packet loss.

The follow-up caches each segment's length, horizontal projection terms and conservatively padded bounds in the existing track cache. Bounds reject only segments that cannot beat the current distance; the exact original projection, height-aware comparison, scan/tie order and winning result are retained. Heading/grade/progress are calculated only for the winner. No track samples or physics/network frequencies were reduced. Local reference checks matched 53,824 queries and 64,800 physics steps exactly; a warmed 6,000-query Cloudline sample improved 1.19 s→0.16 s (~7.3×).

Fresh matched server runs used the same workload and profiler setup, including CPU sampling on both 64-driver runs:

| Drivers | CPU, % of one core, before → after | Event-loop delay p95, before → after | Display / phone Hz, before → after |
| --- | --- | --- | --- |
| 4, one room | 15.4% → 4.8% | 2.58 → 1.26 ms | 30.2 / 19.9 → 30.2 / 19.9 |
| 64, eight rooms | 103.3% → 22.4% | 403 → 2.07 ms | 1.3 / 1.3 → 30.0 / 20.0 |

Initial browser probes used fresh contexts, fixed driving poses at 1280×800, five seconds of warmup and twelve-second frame samples. Solo Keys was dry; multiplayer views used rain, with mirrors enabled except for an explicit four-player comparison. These are rendering fixtures, not additional completed races. Chromium reported ANGLE/SwiftShader with no hardware GPU. Observed animation rates were only 1.4–2.9 Hz, so their frame times cannot establish laptop performance. Adaptive resolution changed one three-player pane during sampling; the four-player mirror comparison retained matching main-view pixel sizes.

Those probes exposed a DPR reset: the sampled pane returned from 0.85 to 1.0 because Fiber canvas reconfiguration reapplied the original range after an internal reduction. The fix passes the selected numeric DPR to both the Canvas and sampler. It retains the four-second warmup, three-second/minimum-twelve-frame windows, 38 FPS threshold, 0.15 steps and existing floors. The only React updates added by adaptation happen on a reduction or quality-mode change.

| Display fixture | WebGL contexts | Tracked geometry-buffer allocation | Observed JS heap |
| --- | --- | --- | --- |
| Keys, solo, no mirror | 1 | 4.5 MB | 33 MB |
| Keys, two players + mirrors | 4 | 13.1 MB | 65 MB |
| Keys, three players + mirrors | 6 | 22.4 MB | 125 MB |
| Keys, four players + mirrors | 8 | 30.9 MB | 169 MB |
| Keys, four players, mirrors off | 4 | 20.5 MB | 120 MB |
| Cloudline, four players + mirrors | 8 | 62.0 MB | 113 MB |

Buffer totals track WebGL buffer allocations, excluding textures, framebuffers and driver overhead. JS heaps were not forced to the same garbage-collection point and are observations rather than retained-memory/leak measurements. The repeated scene resources make a shared renderer/scene worth a focused prototype; every camera would still incur its own visible draw work. No page/console/shader errors occurred in these six display configurations. Generated captures and profiles remain ignored.

An actual controller page joined a four-driver room, unlocked audio through Test Audio, and ran parked in the race for twelve seconds. It received 20.1 feedback messages/s with no 3D canvas. JavaScript took about 13 ms per second and renderer-main-thread CPU about 39 ms per second, excluding audio/other threads. In a targeted collection check, listeners returned to 202 after garbage collection and the collected JS heap changed from 7.0 to 7.3 MB. This short stationary check does not establish mobile battery use, sensor cost or long-session memory behavior; it makes a broad controller React rewrite a lower priority than the measured server search work.

## Current Optimizations

Cockpit gloves and paws bake their details into one vertex-coloured mesh per hand. A pair uses two draws instead of 10 on the Formula, 30/20 for Hands/Paws on the round wheel, or 10/8 on the Tuk handlebar. Static geometry totals for a pair are 2,144–2,344 triangles (gloves, including the round-wheel wrist fit) and 1,116–2,312 (restored classic paws). The four-class classic-paw fixture changed 1,106→1,056 draws with 118,098 triangles retained; `None` retained its original counts. These are geometry/submission counts, not hardware FPS. Hands use the existing wheel rotation directly, without a separate per-frame hand smoothing callback.

The completed Alpine viaduct bakes the arch, masonry, earth banks and both approach paths into one static vertex-coloured mesh: 928 triangles versus the original 420. It adds no draws, textures or per-frame callbacks. The race road, collision definitions and cameras are unchanged.

The subsequent vehicle material/body polish keeps wheel dimensions, animation and cockpit cameras unchanged. Fixed details and livery colours are baked into one mesh per part; glass adds no reflection pass or texture. Matched focused previews with the same floor measured:

| Vehicle | Draw calls before → after | Triangles before → after |
| --- | --- | --- |
| Formula | 63 → 63 | 6,552 → 7,036 |
| Kart | 60 → 48 | 4,756 → 3,824 |
| Truck | 45 → 41 | 4,300 → 4,340 |
| Tuk-Tuk | 42 → 42 | 3,472 → 4,080 |

Combined draws fell 210→194 (7.6%); triangles changed 19,080→19,280 (+1.05%). These asset submission counts are not hardware FPS measurements. Native wet four-class driving and all eight race/mirror canvases were also checked.

The vehicle-art pass merges both rim faces and spokes into one draw, and replaces stacked body pieces with single profiled panels. Matched focused asset previews (including the same preview floor) measured:

| Vehicle | Draw calls before → after | Triangles before → after |
| --- | --- | --- |
| Formula | 78 → 63 | 8,304 → 6,552 |
| Kart | 73 → 60 | 5,296 → 4,756 |
| Truck | 53 → 45 | 4,736 → 4,300 |
| Tuk-tuk | 47 → 42 | 3,272 → 3,472 |

Together these previews submit 16% fewer draws and 12% fewer triangles. The open tuk-tuk cabin trades 200 extra triangles for five fewer draws. These counts describe rendering work, not hardware FPS.

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

Live marks share a fixed 140-slot geometry with per-mark vertex alpha, updated only when marks arrive. The existing 140/60 solo/split retention caps, 115/180 ms intervals, footprint, height and opacity rules are retained. One single-pass material replaces individual double-sided transparent plane submissions. Active bounds are conservative; the batch may submit a few offscreen quads, bounded to 280 triangles. Ground decals render before transparent cars/wakes, and the owned buffers are released when the scene unmounts.

Matched 1280×800 fixed-pose probes at fixed DPR with populated marks measured combined color/shadow/mirror submissions of 1,132→853 in solo Keys and 2,504→2,260 in four-player wet Cloudline. Empty-scene and mirror draw counts were unchanged; restarting cleared the marks in all panes. An isolated fully visible 140-mark case reduced the skid contribution from 280 draws to one. These are render submissions, not hardware FPS.

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
- Sakura Sprint, Alpine Grand Prix, Fjord Loop, Keys Causeway, and Cloudline Ascent.
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

`npm run build` currently warns that the main client bundle is larger than Vite's default 500 kB chunk warning threshold. The checked production build on 2026-11-03 was about 1.40 MB minified and about 393 kB gzipped for the main JS asset. Gzip size is the build estimate; actual transfer size depends on hosting compression.

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

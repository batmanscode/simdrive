# Playtest Automation Notes

These notes capture the browser/server approach that worked for full-lap map checks.

## Goal

Use automation to drive a real race through the server physics while the display renders the normal cockpit view. This is not a substitute for phone-device feel testing, but it is useful for checking:

- A track can be completed through the authoritative race loop.
- New props do not obviously block the road.
- Lap/checkpoint/results logic still works.
- The cockpit camera sees sane scenery through the lap.
- Browser console errors and blank WebGL canvases are caught.

## Setup

- Run `npm install` first if `node_modules` is missing.
- Use `npm run typecheck` for the normal app, server, and playtest script TypeScript checks.
- Use `npm run build` for the normal TypeScript/Vite/server build check.
- For browser automation, use Playwright temporarily through `npx` instead of adding it to app dependencies.
- If Chromium is missing runtime libraries in a fresh container, run `npx -y playwright@latest install-deps chromium`.

## Repo Scripts

Reusable playtest scripts live under `playtests/`.

- `npm run playtest:lap -- --track alpine` runs a pure WebSocket full-lap completion check. It creates a room through the server protocol, joins a controller, drives one lap, and prints JSON with finish state, surfaces, max center distance, progress marks, and results.
- `npm run playtest:lap -- --track sakura --json` does the same with quieter output.
- `npm run playtest:capture -- --track alpine --target 0.24:vista` runs one browser visual capture. It creates the display in Playwright, drives to the target progress, briefly brakes, saves a screenshot under `playtest-captures/`, and prints JSON. Target values are `0-1` fractions or `1-100` percents, optionally followed by `:label`.
- Add `--speed-scale 1.55` when a very long track needs a faster automation pass. The default is `1`, so existing Sakura/Alpine behavior is unchanged.
- Add `--progress-log-ms 30000` to `playtest:lap` for long maps. It writes progress heartbeats to stderr so long runs do not sit silent for many minutes.
- At startup, `playtest:capture` deletes and recreates its output folder. By default that is `playtest-captures/`, so the repo only keeps the latest visual capture run.
- Local capture output folders are ignored by git so screenshots do not pollute the worktree.
- `npm run typecheck:playtests` checks the playtest scripts only; the main `npm run typecheck` includes this.

Both scripts expect the app server to already be running:

```bash
npm run dev
```

The visual capture script requires Playwright. Use it without adding Playwright to project dependencies:

```bash
npx -y -p playwright@latest -c 'NODE_PATH=$(dirname $(dirname $(which playwright))) npm run playtest:capture -- --track alpine --target 0.24:vista'
```

For Alpine, prefer one `playtest:capture` target per command. Fjord and Cloudline later completed multi-target visual runs in one browser process, so this seems map/environment dependent rather than a universal rule.

## Dev Asset Gallery

When identifying scenery or car parts from screenshots, open the dev-only asset gallery first:

```bash
npm run dev
```

Then visit `http://127.0.0.1:5173/dev-assets`.

- The gallery renders the live procedural prop components with their component names, grouped by generic track props, map props, and vehicle/cockpit props.
- It uses one WebGL canvas for the visible set so the `All` view can show every asset without hitting browser context limits.
- The theme control defaults to `System`, which follows `prefers-color-scheme`; switch to explicit dark or light only when comparing a specific mode.
- Use search for quick identification, the side index for crisp component names, and focus mode for inspecting one asset at a larger scale.
- Use the dark/light/system theme control and rain toggle to check contrast and wet-material variants.
- When validating the spin toggle, take several screenshots across the rotation, for example immediately, then roughly 900 ms, 1800 ms, and 2700 ms later. This catches assets with bad origins that orbit around a wide radius instead of rotating in place.
- For long asymmetric previews such as the start gantry plus grid boxes, verify both spin and rain toggles. If rain changes make the asset jump while spin is paused, the gallery centering or explicit preview pivot likely needs adjustment.
- The `/dev-assets` route is gated by Vite's `import.meta.env.DEV`; production builds should fall through to the normal app instead of the gallery.
- Do not save gallery screenshots to the repo by default. Render assets on demand so the repo does not fill with generated images; use `playtest:capture` only when route context or before/after visual evidence is needed.

## Server Choice

Best path found:

- Start the app with `npm run dev`.
- Use the server-served app at `http://127.0.0.1:8787/` for automation.
- Connect the automation controller directly to `ws://127.0.0.1:8787/ws`.

Avoid using `http://127.0.0.1:5173/` for long automated race checks when possible. The Vite dev server proxies `/ws`, and repeated automated browser opens/closes caused noisy proxy `ECONNRESET` / `EPIPE` logs. Port `8787` avoids that proxy layer.

## WebSocket Notes

- The server sends `hello` immediately after connection. A one-shot listener can miss it if attached after the socket opens.
- Do not make automation depend on seeing `hello`.
- Attach the `joined_controller` listener before sending `set_profile`.
- Use the display page to create the room, then read `sim-drive-display-session` from `sessionStorage` to get the display group id.
- Send `set_profile` over a separate Node `ws` client to create the controller player.
- For pass/fail, trust the authoritative `room_state.results` payload over the last `controller_feedback` car. The final controller feedback can be one tick stale after results are collected.
- After joining, send:
  - `set_car_setup`
  - `set_cockpit_style` if needed
  - `vip_set_settings`
  - `vip_start_race`
- For single-lap visual checks, set `warmupStart: false`. Otherwise the first pass is an untimed warm-up.

## Driver Loop

The practical controller loop:

- Listen to `controller_feedback` for the current car.
- Send `input_frame` at about 30 Hz.
- Use `nearestTrackPoint` and `sampleTrack` from `src/shared/tracks.ts`.
- Aim at a lookahead point along the track.
- Steer from heading error plus lateral error.
- Estimate upcoming curve from future heading changes.
- Lower desired speed for sharp curves, then brake if current speed exceeds desired speed.
- Use `highGrip`, `ghostMode: true`, and `stabilityAssist: true` for visual map checks. This reduces unrelated driving failures.

This is good enough for Sakura, Alpine, and Fjord at the default speed scale. Alpine needs conservative braking because it has longer fast sections and a heavier chicane. For Alpine, a desired-speed range around `4.6` to `14.5` with stronger braking on future heading deltas completed the lap reliably.

Cloudline is too long for the default review speed. Use `--speed-scale 1.55 --progress-log-ms 30000` for Cloudline completion and visual checks; that kept the lap stable while finishing in about 11 minutes.

## Screenshot Notes

What worked:

- Full-page Playwright screenshots reliably captured the rendered cockpit view.
- For a full Sakura pass, a screenshot set at representative progress targets was enough to inspect the new scenery.
- Targeted short runs are useful: capture start/early, then separate mid/end runs if Chromium gets unstable.
- For longer tracks, split the test into a pure WebSocket completion pass and separate one-screenshot browser visual passes. The pure WebSocket lap is more reliable for proving finish/results, and the targeted browser runs are better for inspecting scenery.

What did not work:

- `canvas.toDataURL()` produced black images. The WebGL canvas does not preserve the drawing buffer.
- `gl.readPixels()` is good for nonblank/varied pixel smoke checks, but not for human-readable screenshots.
- Taking many full-page screenshots during one fast lap can skip large chunks of progress because screenshots are slow.
- On Alpine, repeated screenshots in one long browser-backed run caused Chromium to die after the first capture in this container.
- Helper scripts created under `/tmp` do not automatically resolve repo dependencies like `ws`. Prefer the committed `playtests/` scripts. If a throwaway helper is still needed, run it from the repo root or import repo-local packages by absolute path.

Workaround:

- Keep the automated driver slow for review laps.
- During a screenshot capture, briefly send `brake: 1`, `throttle: 0`, `steer: 0` so the car does not jump far down the lap while the screenshot is being taken.
- For visual inspection, prefer a few targeted captures over trying to capture every milestone in one run.
- For Alpine visual inspection, one screenshot per browser process was the most stable pattern in that run.
- Fjord and Cloudline both completed multi-target browser capture runs in the later long-map check, with no console errors.
- A visual capture target should fail if the race ends, crashes, or DNFs before reaching the requested progress. Do not accept an end-of-race screenshot as a successful target capture.

Target selection:

- Pick screenshots by what needs judgment, not by a fixed interval.
- Use start/early if the track's first impression changed.
- Use approach targets shortly before signature landmarks; the cockpit camera usually reads an upcoming feature better than a target placed exactly on top of it.
- Add one mid/late section when checking scenery repetition, sparse areas, or special route moments.
- Add finish approach when route closure or late-lap scenery changed.
- Keep long-map visual sets to roughly `4-6` screenshots unless there is a specific issue to chase. Screenshots slow the automation and can destabilize long browser runs.

## Map Peculiarities

Sakura:

- Short enough that a browser-backed visual pass with multiple checkpoints was stable in the first scenery check.
- The committed generic driver can finish the lap but may briefly clip grass near the finish. Treat it as a route/results proof, not a perfect racing-line validator.
- Good targets after the current scenery pass: start/torii, blossom tunnel, mid-lap, finish approach.
- Avoid overhead transparent blossom canopy blobs. They can read as pink circles floating in the sky; keep the tunnel effect on the roadside trees instead.
- After removing the overhead canopy blobs, Sakura is cleaner but the blossom tunnel is lighter. If it needs more identity, add/scale roadside trees rather than floating canopy meshes.
- The large pale ground petal patches were cut down to fewer, smaller, lower-opacity decals. That reads cleaner from cockpit view and avoids the soft oval sky/cloud look at horizon distance.

Alpine:

- Use the more conservative driver profile from `playtests/lib/driver.ts`; Alpine has longer fast sections and a heavier chicane than Sakura.
- Split completion and visuals: `playtest:lap` for finish/results proof, then one-target `playtest:capture` runs for scenery.
- A small amount of grass sampling is possible in the automated line; judge it against wall hits/DNF and max center distance, not as an automatic failure.
- Pay attention to the mountain silhouette in captures. The first attempt read like floating boulder stacks until foothill bases and low-poly mountain cores were added.
- Keep Alpine's skyline mixed rather than all jagged or all cone. The current direction is cone-dominant for a few large peaks, with some jagged peaks left for variety.
- The mixed cone/jagged mountains read better than all-jagged.
- The cable-car and chalet landmarks were enlarged and moved closer/earlier on the lap so they read as stronger signature moments without adding more rocks.

Fjord:

- The default driver finished cleanly. The line stayed on `road`/brief `curb` only in the latest pass.
- Multi-target browser capture stayed stable for waterfall/lookout/village/finish and for the earlier approach set.
- Water, distant peaks, road ribbon, and minimap readability are good.
- After the scenery pass, the village is larger and closer, with dock/sign detail, and the lookout has a clearer turnout/rail shape.
- The waterfall was strengthened with a broader rock face and larger water/mist planes, but should stay off-road enough that it remains a scenic cue rather than the dominant object.
- The late dark overhead section is treated as Fjord's tunnel/underpass moment. Do not remove it as an artifact unless it blocks visibility or clips through the car.
- Small cliff rails help the road edge read more like a fjord route. Avoid adding many more generic rocks; the map benefits from clean water/road views.

Cloudline:

- Use `--speed-scale 1.55 --progress-log-ms 30000` for full-lap checks. The default driver is stable but too slow/silent for practical Cloudline completion.
- The latest faster full-lap pass finished cleanly with road-only samples.
- Multi-target browser capture was stable at early climb, switchbacks, summit, descent, and finish.
- The vertical route and minimap read clearly. The road feels huge and playable.
- After the scenery pass, the summit observatory is closer/larger and has stronger marker poles/radio detail.
- Sparse snow poles and cliff breaks help interrupt the flat snow/cloud shelf without cluttering the whole map.
- The late lap remains intentionally clean. Add only high-signal ridge details if it needs more identity later.

## Current Baselines

Keep these as recent reference points, not permanent expected values. Update them when map geometry, physics, or driver logic changes meaningfully.

Sakura:

- Command: `npm run playtest:lap -- --track sakura --timeout-ms 90000 --json`
- Latest recorded result: finished, no crash, no DNF.
- Latest recorded finish time: about `31.849s`.
- Latest recorded max center distance: `7.58`.
- Surfaces sampled by the generic script: mostly `road`/`curb`, brief `grass`.
- Latest visual recheck: early torii, after-torii, tunnel, mid-lap, finish, and reduced-petal captures had no browser console errors.
- Visual notes: torii reads well early; blossom identity should come from roadside trees; avoid overhead blossom blobs.

Alpine:

- Command: `npm run playtest:lap -- --track alpine --timeout-ms 120000 --json`
- Latest recorded result: finished, no crash, no DNF.
- Latest recorded finish time: about `59.879s`.
- Latest recorded max center distance: `8.25`.
- Surfaces sampled by the generic script: mostly `road`, some `curb`, brief `grass`.
- Visual smoke command: `npx -y -p playwright@latest -c 'NODE_PATH=$(dirname $(dirname $(which playwright))) npm run playtest:capture -- --track alpine --target 0.24:smoke --out-dir /tmp/simdrive-playtest-captures --timeout-ms 90000'`
- Latest visual recheck: mixed-mountains, rockwall, stronger cable, stronger chalet, and finish captures had no browser console errors.
- Visual notes: cable car, chalet, bridge, and rock-wall section are readable; keep the mountain skyline mixed cone/jagged and grounded with low foothill bases.

Fjord:

- Command: `npm run playtest:lap -- --track fjord --timeout-ms 420000 --json`
- Latest recorded result: finished, no crash, no DNF.
- Latest recorded finish time: about `411.027s`.
- Latest recorded max center distance: `6.63`.
- Surfaces sampled by the generic script: `road` with a tiny amount of `curb`.
- Latest visual command: `npx -y -p playwright@latest -c 'NODE_PATH=$(dirname $(dirname $(which playwright))) npm run playtest:capture -- --track fjord --targets 0.145:waterfall-approach,0.445:lookout-approach,0.675:village-approach,0.91:tunnel-finish --out-dir playtest-captures-fjord-refresh --timeout-ms 540000'`
- Latest visual recheck: waterfall approach, lookout approach, village approach, and tunnel/finish captures had no browser console errors.
- Visual notes: water and route read cleanly; village/lookout are more readable; waterfall is visible but intentionally secondary; late tunnel/underpass view is expected.

Cloudline:

- Command: `npm run playtest:lap -- --track cloudline --timeout-ms 1800000 --speed-scale 1.55 --progress-log-ms 30000 --json`
- Latest recorded result: finished, no crash, no DNF.
- Latest recorded finish time: about `650.925s`.
- Latest recorded max center distance: `5.73`.
- Surfaces sampled by the faster script: `road` only.
- Latest visual command: `npx -y -p playwright@latest -c 'NODE_PATH=$(dirname $(dirname $(which playwright))) npm run playtest:capture -- --track cloudline --targets 0.12:early-climb,0.32:switchbacks,0.52:summit,0.70:descent,0.94:finish --out-dir playtest-captures-cloudline-refresh --timeout-ms 900000 --speed-scale 1.55'`
- Latest visual recheck: early climb, switchbacks, summit, descent, and finish captures had no browser console errors. A follow-up summit-only capture also had no console errors after moving the observatory closer.
- Visual notes: huge ascent/descent reads clearly; summit landmark reads a bit stronger; ridge details are intentionally sparse.

## Limits

- This is not manual phone handling validation.
- It does not judge steering feel, haptics, phone orientation, or real player mistakes.
- A successful automation lap means the route is playable and visually plausible, not that the track is perfectly tuned.
- For long tracks, keep runs targeted and expect to adjust the driver loop per map.

## Suggested Flow For Future Map Checks

1. Run `npm run build`.
2. Start `npm run dev`.
3. Create a display room in Playwright on `http://127.0.0.1:8787/`.
4. Join a controller through direct `ws://127.0.0.1:8787/ws`.
5. Set the track and one-lap dry settings with warm-up off.
6. Run a pure WebSocket automated driver until results show `finished`.
7. Record max center distance, surfaces, crash/DNF state, and result status.
8. Run targeted browser visual captures at start, feature sections, mid-lap, late-lap, and finish approach.
9. Record console errors from those visual captures.
10. Stop the dev server when done so no background sessions remain.

For Cloudline, run the completion and visual commands with `--speed-scale 1.55`; add `--progress-log-ms 30000` to the completion command so progress is visible during the long pass.

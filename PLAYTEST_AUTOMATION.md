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

For Alpine and other longer maps, prefer one `playtest:capture` target per command. That matched the most stable pattern from this run.

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

This is good enough for Sakura. Alpine needs slower target speeds and more conservative braking because it has longer fast sections and a heavier chicane. For Alpine, a desired-speed range around `4.6` to `14.5` with stronger braking on future heading deltas completed the lap reliably.

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
- For long-map visual inspection, one screenshot per browser process was the most stable pattern in this run.
- A visual capture target should fail if the race ends, crashes, or DNFs before reaching the requested progress. Do not accept an end-of-race screenshot as a successful target capture.

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

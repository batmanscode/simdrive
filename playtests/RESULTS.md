# Playtest Results

Append notable automated and human playtest runs here so tuning changes have a baseline to compare against.

## Result Format

| Field | Notes |
| --- | --- |
| Date | UTC date of the run. |
| Commit | Short commit hash when available. |
| Driver | `Automated RaceDriver`, `Human`, or another clear label. |
| Track | Track name and id. |
| Vehicle / setup | Vehicle class and selected setup. |
| Race settings | Laps, warm-up, rain, assist, reset mode, ghost mode if relevant. |
| Run params | Automation settings such as `speedScale`, timeout, or capture targets. |
| Result | Finished, crashed, DNF, timeout, or aborted. |
| Time / speed | Lap time, average speed, max speed when available. |
| Notes | Short context that explains how to interpret the result. |

## 2026-05-02

### Cloudline Stock Truck Fast Automation

| Field | Value |
| --- | --- |
| Commit | `cd884cd` plus local steering-sensitivity changes |
| Driver | Automated `RaceDriver` line-following driver |
| Track | Cloudline Ascent (`cloudline`) |
| Vehicle / setup | Stock Truck / Balanced |
| Race settings | 1 lap, dry, no warm-up, gentle assist on, reset on, ghost mode on |
| Track selection basis | Highest measured turn count/cumulative turning: 46 control points, 1104 samples, 14352.01 length, 2215.1 degrees cumulative absolute heading change |

| Attempt | Run params | Result | Lap time | Avg speed | Max speed | Max center distance | Surface samples | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Conservative aborted | `speedScale=1`, default CLI driver | Aborted at 65% after user clarified fastest-pace goal | - | - | - | `2.61` | Road only through abort | Not counted as a fast attempt. |
| 1 | `speedScale=3`, CLI max | Finished | `513.386s` | `~223.6 km/h` | `~227.1 km/h` | `5.23` | Road only | First fast clean finish. |
| 2 | `speedScale=4`, direct driver | Finished | `512.625s` | `~224.0 km/h` | `~227.0 km/h` | `4.82` | Road only | Faster than scale 3; driver mostly hit target-speed cap. |
| 3 | `speedScale=6`, direct driver | Finished | `512.607s` | `~224.0 km/h` | `~226.9 km/h` | `4.80` | Road only | Best run in this set. |
| 4 | `speedScale=10`, direct driver | Finished | `512.689s` | `~224.0 km/h` | `~227.1 km/h` | `4.81` | Road only | Slightly slower than scale 6 from run-to-run noise. |

Summary: the fastest clean automated stock-truck lap was `512.607s` (`8:32.607`) at `speedScale=6`, averaging about `224 km/h` (`139 mph`) using the game speedometer scale. Higher `speedScale` values did not materially improve the lap because the automation driver was already hitting its internal target-speed cap.

### Sakura Other-Vehicle Fast Automation

| Field | Value |
| --- | --- |
| Commit | `cd884cd` plus local steering-sensitivity changes |
| Driver | Automated `RaceDriver` line-following driver |
| Track | Sakura Sprint (`sakura`) |
| Race settings | 1 lap, dry, no warm-up, gentle assist on, reset on, ghost mode on |
| Run params | Fast sweep at `speedScale=3`, `4`, `6`, `10`; additional Formula/Kart clean-search sweep at `speedScale=0.6`, `0.8`, `1`, `1.2`, `1.5`, `2`, `2.5` |

Fast completed sweep:

| Vehicle / setup | Attempts | Best attempt | Result | Lap time | Avg speed | Max speed | Max center distance | Surface samples | Notes |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Formula Prototype / Balanced | 4 | `speedScale=10` | Finished | `7.618s` | `~227.5 km/h` | `~226.2 km/h` sampled | `7.60` | Road `191`, curb `56`, grass `31` | Fastest completion, but not a no-grass lap. Sampled max speed can read below average on very short laps because feedback is discrete. |
| KZ Kart / Fixed Sprint | 4 | `speedScale=6` | Finished | `15.344s` | `~112.9 km/h` | `~125.0 km/h` | `8.04` | Road `205`, curb `146`, grass `98` | Scale `4`, `6`, and `10` were effectively top-speed limited and nearly identical. |
| Tuk-Tuk / City Stock | 4 | `speedScale=4` | Finished | `60.935s` | `~28.4 km/h` | `~65.0 km/h` | `4.05` | Road `1442` | Road-only in every fast attempt; higher scales were effectively identical. |

Clean-search note: Formula and Kart touched grass at every tested lower `speedScale`, including `0.6`, so no no-grass automated baseline was found with the current line-following driver on Sakura. Tuk-Tuk was road-only during the fast sweep.

### Sakura Truck And Cloudline Remaining Vehicles

| Field | Value |
| --- | --- |
| Commit | `cd884cd` plus local steering-sensitivity changes |
| Driver | Automated `RaceDriver` line-following driver |
| Race settings | 1 lap, dry, no warm-up, gentle assist on, reset on, ghost mode on |
| Run params | One sequential fast attempt per requested vehicle at `speedScale=10` |

| Vehicle / setup | Track | Result | Lap time | Avg speed | Max speed | Max center distance | Surface samples | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Stock Truck / Balanced | Sakura Sprint (`sakura`) | Finished | `9.667s` | `~179.2 km/h` | `~225.2 km/h` | `7.23` | Road `280`, curb `32`, grass `10` | Fast completion, but not a no-grass lap. |
| Formula Prototype / Balanced | Cloudline Ascent (`cloudline`) | Finished | `508.009s` | `~226.0 km/h` | `~232.6 km/h` | `6.79` | Road `11173`, curb `11` | Mostly road; slight curb sampling. Faster than stock truck on the same speed-capped automation. |
| KZ Kart / Fixed Sprint | Cloudline Ascent (`cloudline`) | Finished | `900.386s` | `~127.5 km/h` | `~132.5 km/h` | `6.49` | Road `19717`, curb `11` | Mostly road; slight curb sampling. Downhill sections let it exceed nominal flat top speed. |
| Tuk-Tuk / City Stock | Cloudline Ascent (`cloudline`) | Finished | `1738.112s` | `~66.1 km/h` | `~68.3 km/h` | `3.40` | Road `38034` | Road-only, no rollover/crash. Downhill sections let it exceed nominal flat top speed. |

## 2026-11-02–03 — Motorsports update

- Baseline build/typecheck, browser join/tutorial and Alpine live lap established before changes. Alpine live lap remained comparable: 59.863s baseline, 60.046s after the initial handling pass.
- 39 local, fixed-timestep driven scenarios covered all vehicles on Sakura/Alpine dry/wet, Formula on Fjord/Causeway/Cloudline/Passage dry/wet, the other vehicles on Fjord, Sakura with assist off, and all vehicles on Sakura dry/wet with equal pace. All finished with the warning-aware driver. The initial generic bot tipped the tuk-tuk in six cases; the same rollover was reproduced in baseline physics. Responding to its existing tip warning fixed the bot, without relaxing the vehicle limit.
- Three genuine live championship rounds finished with voting, 12→24→36 points, gradual weather, equal pace, settings locks and end flow. Fjord Passage completed a live full run in 153.337s at automation speed scale 3; three route-context captures, including the finish gate, had no console errors.
- Targeted local checks covered stationary steering, pedals, mass/height/coincident/ghost contacts, glancing walls, reverse/reset, course checkpoint gates, scoring/vote ties and gradual wetness.
- Browser checks covered real rendered pedal/steering/reverse pointer controls, synthetic orientation centering/inversion and touch override, saved-driver refresh, return to lobby, first-ever personal best available on lap two, ghost reuse, native replay/pause/close isolation, original tutorial, and four-vehicle wet split-screen rendering without page/console/shader errors.
- Multiplayer browser flow covered finished-phone waiting/neutral inputs, display auto-spectate, VIP transfer, native phone voting/next-round tuning, and countdown abort preserving round two and completed points. Updated landing preview rendered on desktop/mobile without errors.
- Software-only headless Chromium is unsuitable for judging hardware frame rate or physical phone steering/haptic feel. Real-device follow-ups remain in `HUMAN_CHECKS.md`. Local scenario scripts/captures were not added as CI or application dependencies.

## 2026-11-03 — Vehicle artwork

- Matched focused asset captures and WebGL submission counts covered all four vehicles. Combined draw calls fell 251→210 and submitted triangles 21,608→19,080; the open tuk-tuk adds 200 triangles while saving five draws. These are rendering-work counts, not hardware FPS.
- Front/side views and native four-player wet rendering covered the shaped bodies, shared wheels, mirrors and translucent rivals without page/console/shader errors. A full dry Sakura run and finish replay completed with the new Formula artwork; the home preview was refreshed from actual driving.
- Gemini reviewed visual coherence/readability. Inboard rim contrast and tire-mark placement were refined. Its alleged tuk-tuk ceiling artifact was traced to the existing track's torii beam/lanterns, rather than passenger-cabin geometry.
- This pass changes visual assets only; shared physics, vehicle tuning, collision dimensions, controls and race rules are unchanged. The previous gameplay matrix was not rerun for these art changes.

## 2026-11-03 — Trackside artwork

- Matched driver-camera fixtures cover two views each on Sakura, Alpine, Fjord, Causeway and Cloudline with no page/console/shader errors. Combined color/shadow submissions fell 3,366→2,623 across these ten views; triangles changed +0.14%. These fixed-pose artwork comparisons are separate from live driven checks.
- Native driving covered a full Alpine finish and representative Fjord (through 69%), Causeway (70%) and Cloudline (56%, over 8 km) sections. Four different vehicles also rendered in wet Causeway split-screen with all eight race/mirror canvases and no page, console or shader errors.
- Gemini reviewed visual coherence and driving readability. The pass retained clear track edges and sightlines; nearby snow faces and pine clusters were refined after review. Sakura keeps its rounded, faceted hills.
- Typecheck and production build passed. No new CI, test dependency, physics, collision, control or race-rule changes. Generated captures and exploratory helpers remain ignored; hardware FPS still requires a real-device check.
- Browser captures isolate external widgets. An additional unblocked home check traced `Unexpected identifier 'a'` to line 7 of the existing hosted Vibe Jam widget; its script currently fails standalone syntax parsing. The competition snippet is unchanged by this pass, and the home/podium still render.

## 2026-11-03 — Scenic routes and feedback

- All 24 fixed-timestep runs finished across the three new sprints, all four vehicles, dry/wet. Targeted checks covered course lengths/checkpoints and Causeway sprint bridge-wall parity with the full circuit.
- Native browser driving completed Alpine and all three sprint finishes with route-context captures and no page/console/shader errors. Phone route selection preserved circuit laps/flying-start preferences; real phone-page audio unlock/start/throttle/exit checks reached silence outside the race.
- Wet four-player Causeway Sprint rendered all eight race/mirror canvases without page/console/shader errors, including overlapping ghost rivals and a steady-camera preference.
- 27,335 road/curb/runoff ray probes found no new bank/shore geometry above the driven surface. Cosmetic spring checks covered settling, slow frames and steady-camera behavior. Four engine trajectories rendered finite, unclipped samples and silent tails after crash; listening comfort still needs real phone/speaker judgment.
- Matched scenery captures and Gemini visual/UX reviews refined bridge cues, snow-verge contrast, village grounding and route controls. Combined draw submissions stayed approximately level with +0.46% triangles across the ten comparison views. External widgets were isolated as in the previous art checks.
- Typecheck and the production client/server build passed. The home preview was refreshed from an actual driven lap, retaining the original joke podium.
- Generated scripts, captures and audio clips remain ignored. Car artwork/liveries/drivers, the vehicle roster and handling tuning are unchanged; no new CI or application dependencies.

## 2026-11-03 — Three-player layout and local profiling

- The third pane is centered below the first two, with equal view sizes. At widths up to 800 px all three stack with equal heights. Native production-page checks covered 1280, 768, 800 and 801 px widths, six race/mirror canvases, pane clipping and unchanged 1/2/4-player layout dimensions; no page/console/shader errors occurred.
- Matched before/after fixtures and Gemini visual/UX review supported the centered layout; HUDs and mirrors retain their anchors. Comparisons were sent privately. This CSS change did not require another full driving matrix.
- Five fresh-process production-server workloads covered 1, 4, 8, 16 and 64 active drivers on wet Cloudline. The larger workload exposed a nearest-road-search CPU limit. Browser probes covered six solo/multiplayer/mirror configurations, plus a real controller page with audio unlocked and a targeted garbage-collection check. Measurements, methods and limits are in PERFORMANCE.md.
- The probes also found that live canvas reconfiguration can undo adaptive DPR reductions. This existing issue is documented for follow-up; performance behavior was not changed in this layout PR.
- Typecheck and the production build passed. Browser probes isolated external widgets as above; software WebGL and short localhost workloads do not establish hardware FPS, mobile battery use or production capacity. Generated captures, profiles and exploratory scripts remain ignored; no CI, dependencies or permanent profiling instrumentation were added.

## 2026-11-03 — Preserve adaptive resolution and optimize road queries

- Against the previous implementation, 53,824 nearest-road queries matched exactly across all routes, layers, curb/off-road positions and degenerate/fallback inputs. Track sampling matched exactly; 64,800 physics steps matched every car-state field across all nine routes, four vehicles and dry/wet settings. All 24 offline sprint/vehicle/weather runs finished again.
- Fresh matched production-server probes used the same timing/profiler setup before and after. Four-driver CPU changed 15.4%→4.8% of one core. The 64-driver workload changed from saturation/~1.3 Hz streams to 22.4% CPU with ~30 Hz display/~20 Hz phone updates. Methods and limitations remain in PERFORMANCE.md.
- A production rendering fixture retained the 0.6 split-screen floor through live updates, including 1,716 snapshots across its slow-case checks. Solo reset/floor, split reset, hidden sampling and independent mirror resolution passed. A synthetic fast renderer retained 1.35 DPR at ~60 Hz; this is a branch check rather than hardware performance evidence.
- Native three-player wet Fjord Sprint finished with Formula, Truck and Kart (104.84 / 106.33 / 123.09 s), six race/mirror canvases and the live 0.6 main-view floor. No pose overrides, resets or page/console/shader errors; the normal finish/results flow completed.
- Gemini reviewed the initial/adapted visual comparison; road boundaries, vehicle silhouettes, HUD and mirrors remained readable at the existing fallback floor. Captures were shared privately. The 60 Hz physics, ~30 Hz input, 30 Hz display and 20 Hz controller rates, handling, track samples and controls are unchanged.
- Typecheck and the production build passed. No new CI, dependencies or permanent instrumentation; reference implementations, exploratory checks, profiles and captures remain ignored.

## 2026-11-03 — Batch live skid marks

- The mark-emission function is unchanged. Local geometry checks covered 3,018 vertices against the original plane transforms, per-mark opacity, conservative bounds, stable buffer identity, FIFO/cap behavior and shrinking/empty ranges.
- Matched production rendering fixtures covered dry solo Keys and wet four-player Cloudline with all eight race/mirror canvases, nearby ghost/reset cars, populated/retained marks and restart. Combined draw submissions fell 1,132→853 and 2,504→2,260 respectively; empty-scene/mirror counts stayed the same. The four-player restart returned every view to its empty-scene counts.
- Isolated comparisons covered flat/sloped roads, fog and transparent ghost/spray overlap. Geometry/alpha checks and visual inspection found no noticeable regression; Gemini reviewed visual/UX readability. Ground decals render before transparent cars/wakes, and bounded conservative culling can submit a few offscreen quads.
- A native Alpine lap finished without application errors. A separate native two-driver braking run produced visible marks from actual inputs and verified GPU-buffer release on return to the lobby; both cars remained on the road without crashing. No pose overrides were used for these driving checks.
- Typecheck and production build passed. Physics, controls, update rates, mark thresholds/placement/opacity/intervals/caps and race rules are unchanged. Browser checks isolated external widgets as above; measured submissions do not establish hardware FPS. Captures, probes and reference artifacts remain ignored; no CI or dependencies were added.


## 2026-11-03 — Vehicle material and body polish

- Matched four-class asset previews covered geometry, paint/trim contrast and shared wheels without page/console/shader errors. Combined submissions changed 210→194 draws and 19,080→19,280 triangles; details and measurement limits are in PERFORMANCE.md.
- A native production-page wet Sakura race finished with all four classes: Formula 25.952 s, Kart 27.263 s, Truck 28.345 s and Tuk-Tuk 40.337 s. All eight driving/mirror canvases, Hands/Paws/None, steady-camera preference, overlapping ghost rivals, results and finish replay passed without application errors. No crashes, pose overrides or resets occurred.
- Gemini reviewed exterior art and live cockpit visual/UX readability. Refinements included the truck cage, darker glass gradient, seat insert and housed Tuk headlight; final sightlines and mirrors remained clear. Before/afters were shared privately. The racing-miniatures redesign remains a future idea in IMPROVEMENTS.md.
- A separate dry native driving capture refreshed the actual gameplay home preview. Physics, collisions, controls, camera positions, race rules and update rates are unchanged. Generated captures/helpers remain ignored; no new dependencies, tests or CI were added.
- All eight player colours rendered across all four classes. A 390 px controller page joined and switched through the four vehicle previews in pink without application errors; the desktop home retained the original joke podium.


## 2026-11-03 — Cockpit gloves and paws

- All four cockpits were inspected with Hands/Paws at centre and both full steering locks, driven by parked native inputs. Checks covered left/right handedness, palm/thumb direction, cuff approach, rim contact and instrument/sightline clearance. Numeric thumb-arc probes covered all six grip/style combinations; round-wheel wrists fit toward the lap separately from the upright Formula grips. Paws use a deliberately cute costume-handpaw silhouette with lavender fur, cream toe mitts, fur ruffs and double-sided pink bean motifs.
- The final production-page wet Sakura race with costume Paws on all four classes finished with Formula 25.862 s, Kart 27.194 s, Truck 28.290 s and Tuk-Tuk 40.094 s. All eight driving/mirror canvases and ghost rivals rendered without crashes, resets, pose overrides or application errors. An earlier mixed glove/paw run also finished cleanly. Finish replay/pause/close also passed during the pass.
- Showroom previews, 390 px controller style switching, fresh default None and saved-driver reload passed. A dry native driving capture refreshed the home preview. The original joke podium, vehicle dimensions, cameras, controls, physics and update rates are unchanged.
- Each pair is two draws. Matched four-class paw submissions changed 1,106→1,056 draws with +6.85% triangles; None retained identical counts in all four views. PERFORMANCE.md records the geometry budget and measurement limits.
- Gemini reviewed visual/UX readability and explicitly rechecked orientations; final thumbs, wrist approaches and sightlines passed the visual review. Before/afters and experiments were shared privately.
- Typecheck and production client/server build passed. Generated captures/helpers remain ignored; no new dependencies or CI.

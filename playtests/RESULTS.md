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

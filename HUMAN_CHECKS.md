# Human Checks

Things that need real-device playtesting before we trust the tuning.

## Driving Feel

- Test on a phone controller in dry mode with gentle assist on.
- Test on a phone controller in dry mode with gentle assist off.
- Test on a phone controller in rain mode with gentle assist on.
- Test grass/off-track recovery: it should punish mistakes without feeling like the car is stuck forever.
- Test braking into the Sakura hairpin and Alpine chicane: braking should feel strong but not instant.
- Test Fjord Loop manually for a full lap: watch for road disappearing into grass, grass stripe artifacts across the road, false tunnels/walls, or floating-sky gaps.
- Test Keys Causeway manually for a full lap: check that the bridge straight feels fast but not empty, water/shore props stay off the road, and the flat coastal route remains readable through the island bends.
- Test Cloudline Ascent manually for several representative sections and at least one long climb/descent: watch for the same terrain artifacts as Fjord, especially around stacked switchbacks.
- Test uphill/downhill sections on Fjord and Cloudline: grade physics should feel like a hill effect without snapping the car to the wrong elevated road layer.
- Test steering at low speed and high speed: the car should feel responsive without snapping.
- Test hard wall hits and hard car-to-car crashes: all displays should see a short fireball/smoke crash effect, and the crashing phone should get the strongest boom/vibration cue without changing collision physics.
- Test motion steering from a secure phone URL. Android Chrome/Chromium may not deliver device orientation over plain LAN `http://` URLs.
- Test motion steering direction. If the browser/device reports landscape orientation with the opposite sign, the saved invert-motion-steering toggle should make the motion test meter and race steering match the physical tilt direction.
- Test race countdown while the phone is still portrait: the phone should ask to turn sideways instead of saving a portrait steering center.
- Test race countdown while holding the phone straight in landscape: the phone should briefly show `Hold steady, centering :D`.
- Test race start without pressing `Calibrate`: holding the phone straight during the countdown should keep steering centered after the race controller appears.
- Test race-start audio with phone audio enabled: countdown should play distinct 5/4/3/2/1 beeps without skipping late marks, and the louder `GO` cue should happen only at or just after the race starts.
- Rotate or orientation-lock the phone as the race starts: steering should briefly center itself instead of latching a hard left/right input.
- Test touch steering while tilting the phone: holding the left or right arrow should override motion steering and turn the car in the matching direction.
- Test downforce-style grip at speed: fast road corners should feel more planted than slow corners without making rain or grass too forgiving.
- Test the 1-10 phone motion sensitivity control: default level 6 should feel slightly tighter than the original steering, and the range should cover both relaxed and sensitive steering.
- Test all selectable car setups in dry mode: Balanced should feel neutral, High Grip should corner/brake easier, and High Speed should be quicker but less settled. Confirm KZ Kart and Tuk-Tuk show stats but do not expose setup switching.
- Test sliding/lateral slip: tire sound and vibration should match moments where the car feels loose.
- Test visible front-wheel direction: left input should show left lock, right input should show right lock, with no confusing partial-turn animation.
- Test vehicle/cockpit view: formula, kart, stock truck, and tuk-tuk cockpits should each read as their own vehicle class, and the None/Hands/Paws per-driver cockpit styles should read clearly without blocking the road.
- Test lobby readability: QR code, room code, race settings, selected track, driver lineup, vehicles, driver setups, and cockpit styles should be obvious at a glance.
- Test warm-up/flying start: first pass should show `Warm-up`, timed lap 1 and total race time should begin at the line, and hard car-to-car contact during warm-up should not crash players out.
- Test race presentation: countdown lights, first-place banner, live leaderboard, top-left minimap, finished-racer auto-spectate controls, and podium results should feel useful without obstructing driving.
- Test finished-racer spectate flow in multiplayer: after one local/display player finishes while others are still active, that pane should switch to the leading active racer after about 2.5 seconds; previous/next should switch active racers; `My finish` should return to the finished car and show `Finished`; `Watch` should re-enter spectate.
- Test haptics on Android Chrome/Chromium and Samsung Internet if available. If a supported browser reports a requested pulse but the phone does not buzz, check Silent mode, Do Not Disturb, power saving, and Android/Samsung touch vibration or system haptics before treating it as an app bug.
- Test haptics on Firefox Android if available, but treat failure as likely browser support rather than an app bug unless the test pulse reports a clear app-side error.
- Test whether normal fast cornering produces enough tire sound/slip feedback; current web haptics mostly pulse for slip/curbs/grass/braking/impacts and tuk-tuk tip risk, not continuous true g-force.
- Test tuk-tuk tip risk on a sharp high-speed bend: the lower-center `TIP RISK` toast should be noticeable without blocking the racing line, haptics should arrive closer to real danger, and a quick steering correction should usually avoid rollover.
- Test collisions with another player if possible: light touches should bump, hard directional hits should crash.
- Test reset mode off: hard crashes should still kick players out of the race.
- Test reset mode on: a crashed car should pause briefly, respawn near the last valid track point, and avoid instant re-crash during the brief invulnerable window.
- Test after 5 seconds off-track: the phone should show `Reset to track`, and the button should disappear after use.
- Test mid-race exit from the display using Esc and the `Exit Race` button; both should return the room to the lobby.
- Test the recommended-browser notice on iOS, Android Chromium/Chrome/Samsung Internet, and at least one in-app browser path if available.

## Reconnect

- Refresh a phone controller in the lobby: it should reconnect as the same saved driver without creating a duplicate.
- Refresh a phone controller during a race: it should resume control if it returns before the DNF grace window.
- Scan the same room QR again from the same phone: it should reuse the saved driver token.
- Scan the room QR from the real phone dev URL: after a successful join, the phone should not remain stuck on `Connection lost. Reconnecting...`.
- Try an old saved controller session after the room closes: it should show an error and fall back to normal join.

## Things To Judge

- Is steering too loose, too twitchy, or too assisted?
- Is rain meaningfully harder without being frustrating?
- Is off-track drag fair?
- Is the gentle assist toggle noticeable but not mandatory?
- Does the minimap help without cluttering the race view?
- Does the live leaderboard stay readable during racing?

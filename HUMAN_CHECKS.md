# Human Checks

Things that need real-device playtesting before we trust the tuning.

## Driving Feel

- Test on a phone controller in dry mode with gentle assist on.
- Test on a phone controller in dry mode with gentle assist off.
- Test on a phone controller in rain mode with gentle assist on.
- Test grass/off-track recovery: it should punish mistakes without feeling like the car is stuck forever.
- Test braking into the Sakura hairpin and Alpine chicane: braking should feel strong but not instant.
- Test steering at low speed and high speed: the car should feel responsive without snapping.
- Test the 1-10 phone motion sensitivity control: default level 6 should feel slightly tighter than the original steering, and the range should cover both relaxed and sensitive steering.
- Test sliding/lateral slip: tire sound and vibration should match moments where the car feels loose.
- Test visible front-wheel direction: left input should show left lock, right input should show right lock, with no confusing partial-turn animation.
- Test cockpit/nose view: front wing, nose, tyres, and cockpit shapes should read clearly without blocking the road.
- Test haptics on Android Chrome/Chromium and Samsung Internet if available.
- Test haptics on Firefox Android if available, but treat failure as likely browser support rather than an app bug unless the test pulse reports a clear app-side error.
- Test collisions with another player if possible: light touches should bump, hard directional hits should crash.

## Things To Judge

- Is steering too loose, too twitchy, or too assisted?
- Is rain meaningfully harder without being frustrating?
- Is off-track drag fair?
- Is the gentle assist toggle noticeable but not mandatory?
- Does the minimap help without cluttering the race view?
- Does the live leaderboard stay readable during racing?

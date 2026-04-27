# Commit Messages

## Recommended Single Commit

Improve Sakura and Alpine scenery with playtest automation

- add Sakura torii, blossom tunnel, and cleaner petal treatment
- refresh Alpine landmarks, rock-wall section, and mixed cone/jagged mountain skyline
- add reusable full-lap and visual-capture playtest scripts
- document playtest setup, map notes, screenshot handling, and current baselines
- keep local capture output ignored and reset it before each visual run
- include playtest script compilation in the normal TypeScript check

## Split Commit Option

### Commit 1

Improve Sakura and Alpine track scenery

- add Sakura signature props and remove floating blossom canopy artifacts
- reduce distant petal decals that read as sky blobs
- strengthen Alpine cable-car and chalet landmarks
- mix cone and jagged Alpine mountains while keeping the road view clear

### Commit 2

Add map playtest automation

- add reusable WebSocket full-lap driver and Playwright visual capture scripts
- add npm scripts for lap checks and screenshot captures
- ignore local playtest screenshot output
- document setup, workflow, map-specific notes, and known browser capture limits

### Commit 3

Harden playtest capture tooling

- reset capture output folders before each visual run
- fail visual captures when the target progress is not reached
- validate CLI numeric arguments and target ranges
- include playtest script compilation in `npm run typecheck`

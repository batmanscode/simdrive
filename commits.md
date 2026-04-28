# Commit Messages

## Recommended Single Commit

Add dev asset gallery for procedural props

- add a Vite dev-only `/dev-assets` gallery for inspecting procedural track and vehicle assets
- render generic, map-specific, and cockpit props in grouped tabs with live 3D previews
- add dark/light, rain, and spin controls for visual inspection
- improve gallery readability with crisp numbered asset cards and local preview variants for track-positioned props
- document the gallery workflow and keep generated screenshots out of the repo

## Split Commit Option

### Commit 1

Add dev-only procedural asset gallery

- add `/dev-assets` behind `import.meta.env.DEV`
- render prop groups in a single WebGL canvas to avoid browser context limits
- add tabs for generic track, map, vehicle, and all-asset views

### Commit 2

Polish asset gallery inspection UI

- add dark/light, rain, and spin controls
- replace blurry in-canvas names with numbered CSS asset cards
- add local previews for route-positioned and large backdrop assets
- document the gallery in playtest automation notes

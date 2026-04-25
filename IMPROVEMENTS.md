# Potential Improvements

- First-person camera: later, test a lower and more believable cockpit placement with stronger nose/front-wheel framing. Keep the current camera for now because it is readable and comfortable.
- Track art: replace procedural track/car primitives with authored or generated GLB assets once the gameplay loop stabilizes.
- Weather: add spray from other cars and stronger wet reflections after performance is measured on phones.
- Reconnect escape hatch: add a deliberate "Join as new driver" action for cases where the same phone should stop reusing its saved driver token.
- Lower-priority room management: display reassignment UI, admin controls for moving players, complex multi-device account recovery, and choosing from a list of disconnected players. These are not needed until multi-display or larger casual sessions become common.
- Scaling: add a headless load test that creates rooms, fake displays, and fake controllers, sends 30 Hz inputs, and measures tick delay, memory, CPU, and network throughput before estimating production capacity.

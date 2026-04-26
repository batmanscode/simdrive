# Potential Improvements

- First-person camera: later, test a lower and more believable cockpit placement with stronger nose/front-wheel framing. Keep the current camera for now because it is readable and comfortable.
- Track art: replace procedural track/car primitives with authored or generated GLB assets once the gameplay loop stabilizes.
- Weather: add spray from other cars and stronger wet reflections after performance is measured on phones.
- Reconnect escape hatch: add a deliberate "Join as new driver" action for cases where the same phone should stop reusing its saved driver token.
- Steering reliability: if real-phone tests still show inverted or inconsistent motion steering, replace the current orientation-angle heuristic with a two-step calibration flow. Step 1 captures neutral center; step 2 asks the player to tilt right and stores the detected sign/direction per phone. This is more reliable than trusting `screen.orientation.angle`, which can vary by browser, device, landscape side, and refresh/orientation-lock behavior.
- Steering debug mode: add a temporary/controller-hidden debug readout for `beta`, `gamma`, screen angle, chosen axis/sign, neutral value, final steer, and whether touch override is active. Use this only for diagnosis so we can prove what the browser is reporting before changing tuning.
- Lower-priority room management: display reassignment UI, admin controls for moving players, complex multi-device account recovery, and choosing from a list of disconnected players. These are not needed until multi-display or larger casual sessions become common.
- Scaling: add a headless load test that creates rooms, fake displays, and fake controllers, sends 30 Hz inputs, and measures tick delay, memory, CPU, and network throughput before estimating production capacity.

# Potential Improvements

- Cockpit camera: evaluate a lower seat option on real phones. Load/grade-aware motion and a steadier camera option are now available; preserve road visibility when tuning further.
- Track art: keep the stylized motorsport direction. Consider selective authored GLB hero assets when their visual benefit fits the split-screen draw budget.
- Weather: profile the current batched rain/tire wakes and stylized wet sheen on real display hardware before considering heavier reflections.
- Cockpit cosmetics: later, consider optional forearms/wrists for Hands/Paws if the cockpit needs more physicality, but keep them off for now to avoid cluttering the first-person view.
- Cockpit cosmetic materials: later, consider racing-glove styling, tiny cuff bands, or paw glove bands if the bare hand/paw materials feel too toy-like against the formula cockpit.
- Reconnect escape hatch: add a deliberate "Join as new driver" action for cases where the same phone should stop reusing its saved driver token.
- Steering reliability: if real-phone tests still show inverted or inconsistent motion steering, replace the current orientation-angle heuristic with a two-step calibration flow. Step 1 captures neutral center; step 2 asks the player to tilt right and stores the detected sign/direction per phone. This is more reliable than trusting `screen.orientation.angle`, which can vary by browser, device, landscape side, and refresh/orientation-lock behavior.
- Steering debug mode: add a temporary/controller-hidden debug readout for `beta`, `gamma`, screen angle, chosen axis/sign, neutral value, final steer, and whether touch override is active. Use this only for diagnosis so we can prove what the browser is reporting before changing tuning.
- Crash audio: phone-side nearby-player crash booms are in place. Later, consider display-side crash audio if a single shared speaker mix can be made clear in split-screen sessions.
- Lobby polish: the lobby already has the data for same-screen player count, total room players, and ready players. Later, consider tightening the stat labels or adding clearer per-screen context if multi-screen sessions confuse users.
- Multi-screen identity: later, consider showing subtle per-display context in the lobby/player list so players can understand which drivers are attached to this screen without adding a heavy reassignment UI.
- Home page visual: keep the gameplay preview current when the art changes.
- Trackside boards: later, vary the roadside board artwork/copy so the new `simdrive.xyz` signs are not identical on every route placement.
- Lower-priority room management: display reassignment UI, admin controls for moving players, complex multi-device account recovery, and choosing from a list of disconnected players. These are not needed until multi-display or larger casual sessions become common.
- Scaling: add a headless load test that creates rooms, fake displays, and fake controllers, sends 30 Hz inputs, and measures tick delay, memory, CPU, and network throughput before estimating production capacity.

# Potential Problems

Known risks to revisit if playtesting shows weird behavior.

- Crash explosions: car-to-car explosions are currently inferred after contact resolution by collecting all newly crashed cars in the same tick. If two separate crash pairs happen during the same 60 Hz tick, the game could show one averaged explosion between them. If this becomes visible, make `resolveCarContacts` return the actual crash pair/event instead of inferring it later.
- Crash explosion visuals: only the first smoke puff fades dynamically right now; the other smoke puffs keep their initial opacity until the short event expires. If the smoke pop feels too abrupt, fade all smoke materials together.
- Wall explosions: wall crash explosions intentionally use total pre-hit speed, not wall-normal impact force. This keeps fast scrapes funny, but if it starts feeling noisy or unfair, change the trigger near `server/index.ts` wall-event emission to use wall-normal impact strength from physics.

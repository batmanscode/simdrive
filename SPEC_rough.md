Phonesim/simvibes/simdrive.xyz

Racing sim with phone as controller

Inspired by Jackbox games and gamingcouch.com

User opens main webpage (landing, features, fun stuff, super minimal)

User sees button to create game or join game

There’s two ways to play, where one person hosts and screen shares or connects to a tv or each person plays with their own computer + phone controller (maybe this is not two ways and has overlap and this is the same thing?)

Main page appears showing the lobby with a QR code in big AND a room code

The top of the page shows the players who have scanned and joined from their phone

Each player gets to choose their username and by default joins as a guest. For now there are no permanent accounts

When one computer is sharing the screen and multiple phones are playing, this will be split screen up to 4 players

But also, other computers (each up to 4 players) can join in by another computer joining the “hosting” via room code

So there could be two couches/groups of friends in two houses, each with 4 players playing on a computer/tv and have 4 phone controllers playing

OR

Each computer can be a single person

So 8 people (max) can each have their own computer and phone controller

Basically up to 8 people can play in total but max 4 in split screen and other computers can join in too

The game is a racing game

For now, everyone gets the same standard f1 car but they can choose their colour the same place they write their name

When players enter the lobby, the first person to scan the code and enter with a username is the “VIP” and is the one who gets to choose the maps and start the game and as such they should have these arrow buttons on their phone/controller

For now, there will just be two f1 maps. The ai making this will research and find fan favourites and make them. Maybe one can be a shorter one and the other one, longer

The vip will have the option to set rolling start/warm up lap off/on and number of laps after a map is selected

At the end of the race, there will be a leaderboard with times

And options to re-play in the same map or go back to the map selections and race settings

This game is not a full simulation like the pros use but is kinda there like a low def one or the best we can do with this
So the phones sensors must be used to the fullest to steer the car

During the game, the phone controller screen should be split into two

The left should be for the thumb and have a sliding brake scale (the buttons can be in the centre of the left side but it if the thumb touches anywhere on screen and movies up or down it should still work like the button/slider shouldn’t directly have to be pressed this is more so the entire left side is for braking) and the right side should have a sliding scale for acceleration 

Users, before the race starts on their own controller can make the settings for brake/accelerator always start at 100% or any % on first tap, and then changes up or down by moving their finger on screen but default for any new user is to start at 0% just like a real car

And the phone should vibrate and the user should “feel” their car as much as possible when it comes to road feel with bumps and such and the effect of the brakes and the turning g-force

The sound should also play as much of a part as possible. This should work from the users phone controller and let them know it’ll be better and directional with earphones

The game screen should be first person view like you’re inside the car

make the ghost car without car collisions a togglable mode in the settings where the lap count is set. default off and if its on, and two cars crash, both players are out of the game but is ghost car mode (no car to car crashes) is on then no car collisions but still have environment crashes. Cars can “bump” into each other and the phone controllers should “feel” it but anything more than a bump should be a crash you can decide the amount

Visual style is not hyper realistic but not Minecraft blocks either

Also, rain should be togglable in the settings as well and this should give all cars rain tyres and it should realistically affect the drive “feel” and game physics since this is a simulation

Changes 25/04/26

Original above is preserved

Current game name is Sim Drive

For now tracks are original tracks, not fan favourite copies

Everyone still uses one f1 style car, but players can choose setup: balanced, high grip, high speed

VIP settings now also include ghost cars, rain, gentle assist, and reset mode

Default crash mode is still crash-out

Reset mode can respawn crashed cars and lets off-track players reset after 5 seconds

Phone controller has audio, haptics, motion test, calibration, and sensitivity

Race screen now has minimap and live leaderboard

Phone controllers can reconnect after refresh

Visuals are procedural for now, not authored assets

Rolling start is now warm-up / flying start

Players can choose cockpit style: none, hands, paws

Changes 26/04/26

Before a race starts, the phone should be sideways before it saves the steering center

Ready / start should handle this automatically so players do not have to press calibrate every race

Actually this should happen on the phone countdown screen, not in the lobby

Countdown should start from 5 so players have time to turn the phone sideways and see quick controls

Changes 30/04/2026

Vehicle selection is now bigger than the original single F1-style car idea

Current playable vehicles are Formula Prototype, KZ Kart, Stock Truck, and Tuk-Tuk

Formula Prototype and Stock Truck have three setup options: Balanced, High Grip, and High Speed

KZ Kart and Tuk-Tuk are simpler fixed-setup vehicles, but players should still see their stats

All vehicles use the same controller colour choices

Players can still choose cockpit style: none, hands, paws

The asset viewer now shows hands/paws separately from vehicles and shows all available vehicle colours

Cockpit views have been polished per vehicle so the player should feel like they are inside that vehicle, not just looking at a generic steering wheel

Stock Truck POV is intentionally centered for gameplay readability, even though real trucks are left-hand drive

Tuk-Tuk can roll/tip from risky high-speed cornering and now has a provisional TIP RISK cockpit warning, extra lean, and phone haptic warning

Phone audio and haptics are now vehicle-specific enough to give each vehicle a different feel

The gameplay poster / social image has been refreshed using current gameplay captures

Changes 01/05/2026

Finished players on the display can auto-spectate active racers after the finish view delay

Finished players can switch between active racers, return to their own finish view, and re-enter spectate

New players default to cockpit style none

Playtests keep cockpit style hands explicitly

Changes 17/05/2026

Canonical detailed product and technical spec is now SPEC_detailed.md

SPEC_detailed_live.md has been folded into SPEC_detailed.md and removed

Current display flow includes a how-to-play modal, optional pre-race tutorial display, race view, and results

Display landing, lobby, tutorial, and results support System, Light, and Dark themes

Display lobby has small-screen guidance so phone-sized displays know a larger shared screen is recommended

Display refresh can resume the same display group

If every display leaves and none reconnects within the 20-second grace window, the room closes and controllers are notified

Display results can return the room to lobby without requiring the VIP controller

VIP settings now include the optional pre-race tutorial, which is on by default

The pre-race tutorial teaches phone pedals and tilt steering before countdown, and the VIP can start anyway if someone gets stuck

Each player can choose rear-view mirror mode: Auto, On, or Off

Rear-view mirror Auto is the default and shows the mirror when other active cars exist

Phone motion support now includes iOS/WebKit permission prompts, Chrome-friendly devicemotion / Generic Sensor fallbacks, saved inversion, and countdown-time steering centering

Race networking now uses lightweight display race snapshots and focused controller feedback messages for the player's car, crash cues, nearby-rival audio, and countdown marks

The current implementation uses a purpose-built Node + Express + ws WebSocket server and lightweight kinematic physics, not Colyseus or Rapier

The public page includes the required Cursor Vibe Jam 2026 entrant widget and Tiny Adz bot-protection/conversion snippet with storage disabled

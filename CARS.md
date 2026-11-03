# Vehicles

Quick reference for vehicle definitions and tuning values. Player-facing names, stat bars, vehicle physics, audio profiles, haptic profiles, and setup availability live in `src/shared/cars.ts`. The step loop that applies those values lives in `src/shared/physics.ts`.

Speed note: physics uses internal speed units. The speedometer displays `1 internal speed unit = 8 km/h`, so a `365 km/h` vehicle cap is `45.625` internal speed units.

## Research Anchors

These are simulation anchors, not exact rulebook replicas.

| Vehicle | Anchor |
| --- | --- |
| Formula Prototype | Modern F1-style car. FIA 2025 technical rules list an 800 kg minimum car mass without fuel plus driver mass rules, and the hybrid MGU-K limit is 120 kW. Real speed-trap context keeps race-trim top speed below 400 km/h on normal circuits. |
| KZ Kart | FIA KZ kart reference: 125 cc two-stroke, six-speed gearbox, power approaching 50 hp, 175 kg minimum including driver, and top speed approaching 180 km/h. The game uses a tighter sprint gearing top speed so it fits the tracks. |
| Stock Truck | NASCAR Craftsman Truck Series / Ilmor reference: purpose-built racing pickup with truck-series Ilmor engine support and roughly 180 mph straight-line context. Exact current NASCAR truck parameters are not fully public, so this is a NASCAR-style road-course truck tune. |
| Tuk-Tuk | Bajaj RE-style three-wheeler reference: 236.2 cc petrol engine, 7.6 kW, 19.2 Nm, 2000 mm wheelbase, 1300 mm width, 1700 mm height, about 362 kg kerb weight, and about 65 km/h top speed. |

Source links:

- Formula: [FIA 2025 Formula 1 Technical Regulations](https://www.fia.com/sites/default/files/fia_2025_formula_1_technical_regulations_-_issue_01_-_2024-12-11_1.pdf), [FIA speed-trap context](https://www.fia.com/sites/default/files/speed_trap_37.pdf), and [Red Bull's F1 speed overview](https://www.redbull.com/us-en/how-fast-do-f1-cars-go).
- Kart: [FIA Karting technical regulations](https://www.fiakarting.com/sites/default/files/2024-02/2024%20Karting%20Technical%20Regulations_v1.1_Clean_0.pdf) and [FIA KZ championship context](https://www.fia.com/events/karting/season-2019/fia-karting-kz-championships).
- Stock Truck: [NASCAR Craftsman Truck Series context](https://www.nascar.com/series/craftsman-truck-series/) and [Ilmor NASCAR engine information](https://www.ilmor.com/Racing/NASCAR).
- Tuk-Tuk: [Bajaj RE official specifications](https://www.bajajauto.com/three-wheelers/re/specifications).

## Vehicle Setups

| Vehicle | Setups | Dry Top Speeds | Intended Feel |
| --- | --- | --- | --- |
| Formula Prototype | Balanced, High Grip, High Speed | `365`, `343`, `391 km/h` | High downforce, huge brakes, grip that builds with speed. |
| KZ Kart | Fixed Sprint | `125 km/h` | Fast steering, strong low-speed response, no meaningful downforce, curb-sensitive. |
| Stock Truck | Balanced, High Grip, High Speed | `285`, `268`, `305 km/h` | Heavy, powerful, draggy, slower to stop, easy to slide if overdriven. |
| Tuk-Tuk | City Stock | `65 km/h` | Slow and narrow with modest grip/brakes; hard high-speed steering can roll it. |

## Shared Setup Rules

| Rule | Value |
| --- | --- |
| Default vehicle | `formula` |
| Default setup | Vehicle default, usually `balanced` |
| Multi-setup vehicles | `formula`, `stockTruck` |
| Fixed-setup vehicles | `kart`, `tukTuk` |
| Motion steering defaults | Formula Prototype `1`, KZ Kart `1`, Stock Truck `4`, Tuk-Tuk `2` on the `1-10` slider |
| Colour choices | Same controller palette for every vehicle |
| Cockpit cosmetics | None, Hands, or Paws; visual only; new players default to None |

## Motorsports handling update

Steering requires rolling contact and has vehicle-specific yaw response. Braking uses part of the available cornering grip. Body/cockpit pitch and roll visualize longitudinal/lateral load with vehicle-specific damped settling; road grade stays aligned and the tuk-tuk canopy has restrained secondary movement. Camera comfort/reduced-motion preferences suppress added cockpit movement. This remains a lightweight handling model, not a full suspension solver.

Contacts use gameplay masses (Formula 800, Kart 175, Truck 1540, Tuk-Tuk 360) and ignore cars on separate road elevations. Wall scrapes resolve the normal velocity instead of snapping the heading and removing all forward speed. Slow off-track recovery has a deliberate hold-to-reverse control capped at 2.2 internal units (~18 km/h); brake behavior is unchanged.

Optional Equal pace uses a 180 km/h dry baseline before setups/weather, scaling acceleration/braking/drag while retaining steering, grip and mass differences. Tuk-tuk tip thresholds scale with that pace. Standard class speeds below are unchanged.

Vehicle art uses shaped body panels and shared wheels across external/cockpit views. Rims and sidewall marks sit on the axle, and both sides roll from signed travel distance. The truck has a sloped cab/hood; the tuk-tuk has an open passenger cabin and cloth canopy. These visual shapes do not change handling or collision dimensions.

## Physics Notes

| Area | Behavior |
| --- | --- |
| Top speed | Each vehicle has dry/rain caps in km/h; setup max-speed multipliers apply after that. |
| Grip | Each vehicle has separate road, curb, grass, and rain grip values. Formula has the strongest downforce ramp; kart and tuk-tuk have nearly none. |
| Steering | Vehicle-specific steering authority, speed scaling, lateral damping, and slip reduction. Kart reacts quickly; truck and tuk-tuk need earlier inputs. |
| Contact | Collision radius and crash threshold are vehicle-specific. Trucks can absorb more; kart and tuk-tuk crash more easily. |
| Rollover | Tuk-tuk checks speed, steer angle, slip, and curb load. If over-limit load persists, it crashes and visually tips. A provisional accumulating `TIP RISK` cockpit toast appears before the haptic threshold, with extra cockpit/body lean and a short phone haptic pattern warning nearer the limit; tune or remove this if it feels too noisy after playtesting. |
| Feedback | Audio and vibration profiles vary by vehicle: formula high and smooth, kart buzzy, truck lower/heavier, tuk-tuk rattlier. |

## Visual Params

| Vehicle | External Visual | Cockpit Visual |
| --- | --- | --- |
| Formula Prototype | Open-wheel formula body, wings, exposed tyres, slimmer suspension, airbox/headrest detail | Formula nose, front tyres, compact formula wheel with integrated display and shift lights |
| KZ Kart | Low kart chassis, layered nose/side pod panels, exposed small wheels | Low kart floor, layered nose pod, front wheels, visible steering column, mounted kart data logger, small wheel |
| Stock Truck | Stock pickup body, cab, bed, fenders, spoiler | Centered driver POV for gameplay readability, broad hood/cowl, roll-cage pillars, wheel, steering column, analog gauge, subtle digital speedometer |
| Tuk-Tuk | Three-wheeler body, canopy, single front wheel | Narrow nose, canopy, handlebar-like dash, small analog speedometer, wheel |

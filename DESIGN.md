# Andbasadøren: game design

## The point

Every crew member is the expert on one station. The knowledge lives **in their head, not on screen**. The rules are only shown during training. When someone gets seasick, a crewmate takes over the station, and the only way to learn it is to have the sick person explain it.

That makes the gap between "owner" and "substitute" measurable, and the debrief shows it.

## Flow

| Phase | What happens |
|---|---|
| Lobby | The main screen shows the ship code. People join from laptops. The captain assigns stations and tunes settings. |
| Training | Each player practises **only their own station(s)**, with the rules on screen and hints on mistakes. Practice tasks cycle through every variant (storm, side wind and so on). With handover notes on, players can write a 300-character note for their substitute. |
| Voyage | Tasks appear at stations. Done means an oar stroke: the ship surges and progress goes up. Missed (timed out) means water in the hold. Wrong answers let in a little water but you can retry. |
| Seasickness | Every *N* seconds (default 180) one healthy crew member gets sick for *M* seconds (default 60). It rotates so everyone gets a turn before anyone gets a second one. Their stations move to the least-loaded healthy crewmate. The sick player's laptop hides the controls and shows the ship, the countdown and their stations' alerts. |
| Storms | Mild by default: darker sky, rain, bigger waves, slightly faster tasks, a slow leak. Some rules change in a storm. |
| Debrief | Arrived, sank or ended. Average task time and misses for owners vs. substitutes, per station and per handover, plus discussion prompts. |

A disconnected player (closed laptop) is treated like a seasick one after 10 s: someone covers until they're back.

## Ship state

- **Progress**: each completed task rows ~0.7–1.2 nm, scaled by crew strength. Default voyage is 200 nm.
- **Water** (0–100): slow leak (faster in storms), +4–10 per missed task, +1 per wrong answer, −22 per bilge pump task. The ship sinks at 100 (can be switched off).
- **Strength** (0–100): slowly decays, +30 per galley task. Weak crews row shorter strokes.
- **Wind**: shifts every 60–100 s (never in the middle of a rigging task).

## The six stations (rules = what the owner must explain)

### Helm: "Buoy ahead!"
Turn the wheel, then press **Set course**.
- Red buoy: turn right. Green buoy: turn left.
- Two white stripes: turn **hard** (all the way).
- Yellow buoy: straight ahead, always.
- Lighthouse blinking: flip it (left becomes right).

### Rigging: "Sail is luffing!"
Haul every rope, one at a time.
- Order: red, yellow, green, blue, white (traffic light, then sea, then clouds). Skip colours that aren't there.
- Wind from the side (east or west): reverse the order.
- Wrong rope: start over.

### Bilge pump: "Water in the hold!"
- Pump only while the needle is in the zone matching the **lantern colour**. Keep going until the hold is empty.
- White lantern: don't pump, open the **drain valve**.
- Pumping in the wrong zone lets water back in.

### Signals: "Ship hailing us!"
- Answer with the same three flags in **reverse order** (their bottom flag goes on our top).
- Never hoist the checkered flag. Use the **duck flag** instead.
- Red hull = pirates: don't answer, sound the **foghorn**.

### Lookout: "Something in the fog…"
Find it with the spyglass, then ring the bell and press **Report**.
- Whale 1 · rock 2 · ship 3 · iceberg 4.
- Storm: one extra ring.

### Galley: "The crew is hungry!"
- Fish soup = fish + potato + milk. Porridge = oats + milk + butter. Sailor's stew = sausage + potato + carrot. Exactly those, nothing extra.
- Stove on LOW, or HIGH in a storm.
- Stir three full circles, then ring the dinner bell.

## Settings (all live-adjustable)

| Setting | Default |
|---|---|
| Seasickness every / sick for / first after | 180 s / 60 s / 120 s |
| Storm every / lasts / strength | 240 s / 40 s / mild |
| Voyage distance | 200 nm (~12–15 min with 5 players) |
| Task pace / time per task | 1.0× / 40 s |
| Training time | 180 s (or when everyone presses ready) |
| Handover notes | off (try round 1 without, round 2 with) |
| Ship can sink | on |
| Stations in play | all six (with 5 players one person runs two) |

## Ideas for later
- Let the team choose the substitute (10-second vote) instead of auto-assigning.
- A "lost voice" variant: the sick player can only draw or type.
- Rotate roles between rounds so everyone learns a new station.
- Per-player stats in the debrief ("best explainer").

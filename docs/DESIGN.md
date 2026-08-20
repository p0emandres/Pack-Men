# Pack-Men — Game Design

> Prototype design notes. Devnet only, unaudited, no token or wagering associated with this repository.

## The core loop

A Pack-Men match is a short, fixed-length session in which two players independently work the same city and are scored against each other at the end.

```
   plant  ──────►  wait  ──────►  harvest  ──────►  deliver
     ▲                                                  │
     │                                                  │
     └──────────────  score, and more heat  ◄────────────┘
```

Each player is doing four things at once, in tension:

| Action | Gains you | Costs you |
|---|---|---|
| **Plant** | Future inventory | Heat — cops respond to what's growing |
| **Wait** | Higher-tier yield | Match clock |
| **Harvest** | Sellable goods | Nothing — but inventory is capped |
| **Deliver** | Score | Exposure — you must leave safety to do it |

## The central mechanic: greed generates the risk

The design pillar is that **players are never offered a risk dial — they build one by playing well.**

Cop pressure scales with how much a player has actively growing. This means:

- A player who plants conservatively moves through a calm city, and scores too little to win.
- A player who fills every slot has the inventory to win and a city actively hunting them.

There is no "safe mode" and "risky mode." There is one continuous curve, and each player picks their point on it every few seconds, implicitly, by deciding whether to plant one more.

This is the whole game. Every other mechanic exists to protect this loop from being solved or bypassed.

## Supporting mechanics, and what each one defends against

### Grow slots (limited)

A player has a fixed number of grow slots. Strains come in tiers that trade **growth time against yield** — a fast cheap plant, or a slow valuable one.

*Defends against:* unlimited scaling. Without a slot cap, the optimal play is simply "plant everything," and the greed/heat curve has no shape.

### Inventory cap

Harvested goods occupy a capped inventory. You cannot stockpile an entire match's production and make one triumphant delivery run at the end.

*Defends against:* risk avoidance. An uncapped inventory would let a skilled player take exactly one exposure per match. The cap forces repeated trips, so evasion has to be survived many times, not once.

### Layered city

Customers are distributed across districts at varying depth. Deeper districts pay more and are harder to withdraw from.

*Defends against:* a flat map. The geography itself becomes a risk gradient, so route planning is a real decision rather than a shortest-path calculation.

### Rotating demand

The set of buying customers cycles on a timer. A route that was optimal a minute ago may now be worthless.

*Defends against:* solved play. If demand were static, expert play would collapse into one memorized circuit and the game would stop being about reading a situation.

### Endgame planting lock

Planting is disabled during the final stretch of the match.

*Defends against:* a degenerate last-second dump. Without it, the dominant strategy is to avoid heat for most of the match and then flood every slot once cops no longer have time to punish you — which would invalidate the risk everyone else took all match.

### Reputation

Alongside raw sales, players carry a bounded reputation value moved by how delivery interactions go. Final standing is a composite of sales and reputation, with sales weighted more heavily.

*Defends against:* pure volume play. Reputation gives the scoring a second axis, so "move the most units" and "play the best match" are not perfectly identical.

## Scoring

Final standing is a **composite of sales volume and reputation**, with sales dominant and reputation acting as a tiebreaker-weight rather than a parallel path to victory.

The properties that matter:

- It is **deterministic** — same state in, same winner out.
- It is **computed on-chain** from values the chain itself recorded.
- It uses **no randomness**, so there is no seed to grind and no VRF to wait on.

Exact coefficients and bounds are implementation detail and live with the program.

## The cops

Cops are the pressure system, and they are AI-driven rather than scripted patrol loops. The design requirement is that their behavior be **legible**: a player must be able to look at their own grow slots and correctly predict that they are about to have a bad time.

An unpredictable cop is just noise, and noise cannot be played around. A legible cop turns the greed decision into a real one, because the consequence is foreseeable at the moment of choosing.

The Pac-Man lineage is intentional — distinct pursuit personalities rather than one homogeneous chase behavior, so evasion is about reading *which* pursuer is on you.

## Session shape

Matches are short and fixed-length. This is a deliberate constraint:

- Short enough that a bad start is not a long punishment.
- Fixed-length so both players face an identical clock and the endgame arrives simultaneously.
- Long enough that a full plant → harvest → deliver cycle can repeat several times, since a loop you only execute once is not a loop.

## What this design does not solve

Written down honestly, because prototype design docs that only list strengths are not useful:

- **Client authority over movement.** Position and evasion are simulated client-side. A modified client can cheat at the movement layer. The on-chain model protects custody and scoring arithmetic, not physics.
- **Asymmetric skill floor.** The greed/heat coupling rewards players who can already evade well, which may compress the range of players for whom the central decision is actually interesting.
- **Cold-start matchmaking.** A 1v1 design needs a second player. The mechanic does nothing to solve liquidity of opponents, which is a product problem the design cannot answer on its own.

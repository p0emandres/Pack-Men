# Pack-Men

<p align="center">
  <img src="assets/packmen-logo.png" alt="Pack-Men" width="220">
</p>

<p align="center">
  <strong>A competitive grow-and-deliver game on Solana, with Pac-Man inspired cops.</strong>
</p>

<p align="center">
  <em>This is the design repository — the idea, not the implementation.</em>
</p>

---

## What this repo is

This repo publishes the **design** of Pack-Men: the gameplay model, the trust architecture, and the reasoning behind both. It is documentation only.

The game client, backend, and on-chain programs are **not** published here. That is a deliberate choice, explained in [Why the code is private](#why-the-code-is-private).

If you're here for ideas, prior art, or a look at how to structure a game where a server is not allowed to decide who wins — that's what's inside.

## Status

> **Prototype / research.** Devnet only. Nothing here is live, and there is no token, sale, or wagering associated with this repository. Nothing in this repo is an offer, a solicitation, or financial advice.

## The idea

Pack-Men is a short-session competitive game built around a three-part tension: **grow, deliver, evade**.

1. **Grow** — Plant strains in a limited set of grow slots. Different strains trade growth time against yield.
2. **Deliver** — Carry harvested inventory out into a stylized 3D city and sell to customers. Customers rotate on a timer, so routes go stale and must be re-planned.
3. **Evade** — AI cops patrol the city. Crucially, *they respond to what you're doing*: the more you have growing, the more heat you draw.
4. **Compete** — Outscore your opponent inside a fixed match window.

### The design pillar

The interesting part isn't any single mechanic — it's the **coupling** between them.

Growing more is how you score more. Growing more is also what makes the cops hunt you harder. Players are never choosing "safe vs. risky" from a menu; the risk is generated continuously by their own greed. A cautious player has an easy trip to market and little to sell. A greedy player has a full inventory and a city that wants them caught.

That single feedback loop is the game.

### Supporting mechanics

- **Layered city** — Customers sit at varying depths. Deeper districts pay better and are harder to escape from, so the map itself is a risk gradient.
- **Rotating demand** — Customers cycle on a timer. Memorized routes decay, which keeps expertise from flattening the game into a solved path.
- **Inventory cap** — You cannot bank an entire match's harvest and cash out once. You must repeatedly expose yourself.
- **Endgame lock** — Planting is disabled in the final stretch of a match, preventing a last-second dump that would trivialize the earlier risk-taking.

See [docs/DESIGN.md](docs/DESIGN.md) for the full design.

## The architecture idea

The other half of this repo is a trust model that may be more broadly useful than the game.

**The server is not allowed to decide anything that matters.**

```
┌──────────────────────────────────────────────┐
│  CLIENT — rendering, input, prediction       │
└──────────────────────────────────────────────┘
                    │  signed transactions
                    ▼
┌──────────────────────────────────────────────┐
│  SERVER — RPC proxy, auth, matchmaking       │
│  Explicitly NOT: scoring, outcomes, custody  │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  CHAIN — state, scoring, resolution          │
│  The only source of truth                    │
└──────────────────────────────────────────────┘
```

The server exists for the three things a chain is bad at: hiding an RPC provider key, authenticating a session, and introducing two players to each other. It holds no custody and has no authority over outcomes. If the server is fully compromised, an attacker can degrade the service — but cannot steal a match, mint a score, or move funds.

Outcome resolution is deterministic. No RNG, no oracle, no off-chain signer. Two players given the same on-chain state always resolve to the same winner.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full model, including what this approach costs you.

## Why the code is private

Publishing an idea and publishing an implementation are different decisions, and they deserve different answers.

The design is worth sharing — the greed/heat coupling and the zero-authority server model are genuinely reusable, and nothing about them is safer for being secret.

The implementation is a different matter. An escrow program that has not been independently audited does not become safe by being published, and it does not become safe by being hidden either. But an unaudited program with published source is a convenient starting point for someone hunting a bug in it, and that trade buys nothing while the project is still a prototype.

Two things worth being honest about, since this is exactly where projects mislead people:

- **Private source is not a security measure.** Deployed on-chain bytecode is public and can be decompiled. Keeping Rust source private protects design work; it does not protect a program. Real protection is an audit and a frozen upgrade authority.
- **This code is unaudited.** It has never been reviewed by a third party and has never held anything of value. Treat any description of its safety properties as an intention, not a guarantee.

If the on-chain programs are ever audited and deployed somewhere real, publishing them becomes the honest thing to do — and the plan is to do exactly that.

## License

Documentation in this repository is licensed under [CC BY 4.0](LICENSE). Use the ideas, with attribution.

The Pack-Men name, logo, and artwork are not covered by that license and remain reserved.

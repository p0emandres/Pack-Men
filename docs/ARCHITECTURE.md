# Pack-Men — Trust Architecture

> Prototype design notes. Devnet only, unaudited. This describes an intended model, not an audited guarantee.

## The rule

**No component may decide something it could profit from deciding.**

Applied to a competitive game with stakes, that rule produces one specific constraint: the server may never determine an outcome. Everything else in this document follows from it.

## The three tiers

```
┌────────────────────────────────────────────────────────────┐
│  CLIENT                                                    │
│  Rendering, input, local prediction, tx signing            │
│  Trusted with: presentation                                │
│  Never trusted with: anything it reports about itself      │
└────────────────────────────────────────────────────────────┘
                       │  user-signed transactions
                       ▼
┌────────────────────────────────────────────────────────────┐
│  SERVER                                                    │
│  RPC proxy · session auth · matchmaking / peer introduction│
│  Trusted with: availability                                │
│  Never trusted with: scoring, outcomes, custody, funds     │
└────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  CHAIN                                                     │
│  Match state · scoring · resolution · escrow               │
│  The single source of truth                                │
└────────────────────────────────────────────────────────────┘
```

## Why the server exists at all

A common instinct is that a trustless game should have no server. That is wrong, and the reason is worth stating plainly: there are jobs a chain is genuinely bad at, and pretending otherwise pushes those jobs onto the client, which is a *worse* trust position.

The server does three things, all chosen because none of them can influence who wins.

**1. It proxies RPC.** A production RPC provider key cannot ship in a browser bundle. Shipping it means anyone can lift it and burn the quota. Proxying keeps the credential server-side. The proxy relays; it does not author transactions.

**2. It authenticates sessions.** Wallet-based auth establishes who is talking, so per-user data can be scoped. Authentication answers *who is this*, never *what did they score*.

**3. It introduces peers.** Two players need to find each other and agree on a match to join. Introduction is not adjudication — once both players are in, the server's role in the match is over.

## What a full server compromise gets an attacker

The useful test of an architecture is what it costs you when it fails. Assuming total control of the server:

| Attacker can | Attacker cannot |
|---|---|
| Take the game offline | Alter a score |
| Degrade or delay matchmaking | Declare a winner |
| Burn the RPC quota | Move escrowed funds |
| Read session metadata | Forge a match result |
| Refuse to introduce peers | Mint, burn, or reassign tokens |

The right column is empty of anything financial. That is the entire point of the arrangement: a server breach is an **availability** incident, not a **solvency** incident.

## Determinism over randomness

Outcome resolution is deterministic. Given the same on-chain state, resolution always produces the same winner.

This deliberately gives up some design space — no loot rolls, no random events at resolution — in exchange for removing three failure modes that repeatedly damage on-chain games:

- **Oracle risk.** No external feed can be manipulated or stall, because none is consulted.
- **Grindable randomness.** No seed exists to farm, so there is no advantage in predicting or re-rolling one.
- **Centralized adjudication.** No off-chain signer is required to attest to a result, so no key holder is in a position to be bribed or coerced.

Determinism also makes disputes trivial: anyone can recompute the result from public state and check it.

## Custody

Stakes are held in program-derived escrow rather than by any account a person controls. The properties intended:

- Funds lock when a match is created.
- No unilateral withdrawal once both sides are committed.
- Resolution pays out programmatically at finalization.
- Arithmetic is overflow-checked throughout.
- Cancellation is available only before a match activates, under a timeout, and refunds fully.

## Data scoping

Per-user records (metrics, history) are scoped to the authenticated identity from a verified session token, and every read and write is filtered by that identity.

The correct version of this pattern enforces scoping **at the database layer as well as in application code**, so that an application bug cannot widen access on its own. Application-level filtering alone is one missing `where` clause away from a leak, which is why it should never be the only layer.

## Honest limitations

Every one of these is a real gap, not a hypothetical:

- **The client is not trustworthy, and movement lives there.** Player position and cop evasion are simulated client-side for responsiveness. A modified client can cheat at the movement layer. The on-chain model constrains custody and scoring arithmetic; it does not make physics honest. Closing this requires either server-authoritative simulation — which reintroduces the trust this design removes — or proofs, which are impractical at the tick rate a game like this needs.
- **Private source is not security.** Deployed program bytecode is public and decompilable. Keeping source private protects design work and raises effort for casual attackers. It does not make a program safe.
- **Unaudited.** These programs have never had third-party review and have never custodied anything of value. Every safety property above is an intention.
- **Availability is genuinely centralized.** The trust model deliberately trades availability for integrity. If the server is down, nobody plays — that is an accepted cost, not an oversight.

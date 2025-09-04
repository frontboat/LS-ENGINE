# Loot Survivor 2 Context Engine

Minimal API for deriving game state, combat math, and activity from Torii.

## Quick start

```bash
bun install
export TORII_URL=https://api.cartridge.gg/x/pg-sepolia/torii
export NAMESPACE=ls_0_0_6
bun run index.ts
```

## Endpoints

- `GET /game/:id/context`
  - Sections: `game`, `adventurer` (with `combatStats`), `currentBeast`, `damagePreview`, `market`, `recentEvents`
  - Filter with `?include=game,adventurer,currentBeast,damagePreview,market,recentEvents`
- `POST /combat/simulate` – One combat round (RNG crits/outcomes)
- `GET /beast/:id` – Beast formatted + rewards
- `GET /item/:id?xp=0&seed=0` – Item formatted + derived specials/price
- `GET /leaderboard?limit=10`
- `POST /query` – Raw SQL (debug)

## Context details

- `adventurer.combatStats`: generic (target-agnostic) attack/defense/crit
- `currentBeast`: only when in battle
- `damagePreview`: your damage vs current beast; includes `incoming` per-slot damage taken and protection%
- `recentEvents`: unified feed (newest first) from `GameEvent` + packed snapshots (`AdventurerPacked`, `BagPacked`); each entry has `kind`, `at`, concise `data`, human `message`, and on-chain `meta`

Example messages: “Defeated Chupacabra: +4 XP, +1 gold”, “Discovered gold: +3”, “Adventurer snapshot”.

## Smoke test

```bash
bun run scripts/smoke.ts --id 101 --base http://localhost:3000 --out logs/smoke.json
```

## Env

- `TORII_URL` (required)
- `NAMESPACE` (default: ls_0_0_6)
- `RPC_URL`
- `PORT` (default: 3000)

Built with Bun.
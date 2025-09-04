# Loot Survivor 2 Context Engine

Modular context preparation engine for Loot Survivor 2. Provides game data processing, combat simulation, and entity management through a clean API.

## Quick Start

```bash
# Install and run
bun install
export TORII_URL=https://api.cartridge.gg/x/pg-sepolia/torii
export NAMESPACE=ls_0_0_6
bun run index.ts
```

## API Endpoints

### Game Context
- `GET /game/:id/context` – Full game snapshot
  - Includes: `game`, `adventurer` (formatted + combatStats), `currentBeast` (when in battle), `damagePreview`, `market`, `recentEvents` (unified activity feed)
  - Filtering: `?include=game,adventurer,currentBeast,damagePreview,market,recentEvents`

### Entities
- `GET /beast/:id` – Beast with rewards (use formatted fields)
- `GET /item/:id?xp=0&seed=0` – Item with derived name/specials/price

### Combat
- `POST /combat/simulate` – Simulate a combat round (RNG crits/outcomes)

### Other
- `GET /leaderboard?limit=10` - Top adventurers
- `POST /query` - Raw SQL (debug only)

## Usage Example

```bash
# Get game context (full)
curl http://localhost:3000/game/123/context

# Get selected sections
curl "http://localhost:3000/game/123/context?include=game,adventurer,currentBeast,damagePreview,recentEvents"

# Simulate combat round
curl -X POST http://localhost:3000/combat/simulate \
  -H "Content-Type: application/json" \
  -d '{"gameId": 123, "beastId": 45}'
```

## Unified Activity Feed

- `recentEvents` merges multiple sources into a single, sorted feed (newest first):
  - Action events from `GameEvent` (e.g., BeastDefeated, Discovery, Obstacle, LevelUp, Purchase/Equip/Drop)
  - Snapshots from `AdventurerPacked` and `BagPacked`
- Each entry includes:
  - `kind`, `at`, optional `actionCount`
  - `data` (concise summary) and `message` (human-readable)
  - `meta` with on-chain identifiers (blockNumber, txHash, eventIndex when available)

Examples of messages:
- "Defeated Chupacabra: +4 XP, +1 gold"
- "Discovered gold: +3"
- "Adventurer snapshot", "Bag snapshot"

## Smoke Test

Run a local smoke test against all endpoints and write results to a log file:

```bash
bun run scripts/smoke.ts --id 101 --base http://localhost:3000 --out logs/smoke.json
```

## Project Structure

```
src/
├── core/          # Base classes
├── entities/      # Game entities
├── systems/       # High-level systems
├── indexer/       # Torii client
├── constants/     # Game constants
└── utils/         # Helpers
```

## Architecture

- **Entities**: Encapsulated game objects (Adventurer, Beast, Item) with lazy loading
- **Systems**: High-level orchestration (Combat, GameContext)  
- **Indexer**: Direct SQL queries to Torii blockchain indexer
- **Caching**: Computed values cached at entity level

## Environment Variables

- `TORII_URL`: Torii indexer URL
- `NAMESPACE`: Game namespace (default: ls_0_0_6)
- `RPC_URL`: StarkNet RPC endpoint
- `PORT`: Server port (default: 3000)

Built with [Bun](https://bun.sh).
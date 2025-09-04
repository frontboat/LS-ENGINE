# Loot Survivor 2 Context Engine

Modular context preparation engine for Loot Survivor 2. Provides game data processing, combat simulation, and entity management through a clean API.

## Quick Start

```bash
# Install and run
bun install
export TORII_URL=https://api.cartridge.gg/x/pg-sepolia/torii
export NAMESPACE=ls_0_0_8
bun run index.ts
```

## API Endpoints

### Game Context
- `GET /game/:id/context` - Full game state
- `GET /game/:id/combat-ready` - Combat-ready adventurer
- `GET /game/:id/market` - Market analysis

### Entities
- `GET /adventurer/:gameId` - Adventurer with equipment
- `GET /beast/:id` - Beast with rewards
- `GET /item/:id?xp=0&seed=0` - Item with specials

### Combat
- `POST /combat/simulate` - Simulate combat
- `POST /calculate/damage` - Calculate damage

### Other
- `GET /leaderboard?limit=10` - Top adventurers
- `POST /query` - Raw SQL (debug only)

## Usage Example

```bash
# Get game context
curl http://localhost:3000/game/123/context

# Simulate combat
curl -X POST http://localhost:3000/combat/simulate \
  -H "Content-Type: application/json" \
  -d '{"gameId": 123, "beastId": 45}'
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
- `NAMESPACE`: Game namespace (default: ls_0_0_8)
- `RPC_URL`: StarkNet RPC endpoint
- `PORT`: Server port (default: 3000)

Built with [Bun](https://bun.sh).
# Loot Survivor Context Engine

API for game state and LLM-ready context generation for agent frameworks.

## Quick start

```bash
bun install
bun run index.ts
```

Defaults to
```bash
export TORII_URL=https://api.cartridge.gg/x/pg-sepolia/torii
export NAMESPACE=ls_0_0_6
```

## Endpoints

### Context Endpoints

- **`GET /game/:id/context`** – Compact XML for LLM/agent frameworks
  - Returns inline XML optimized for token usage
  - Automatically detects game phase: `exploration`, `combat`, `level_up`, `death`
  - Includes all adventurer details and affordable market items
  - Example: `<context><phase>exploration</phase><adventurer health="100" level="5" gold="50" xp="200"/>...</context>`

- **`GET /game/:id/context-json`** – Full game state as JSON
  - Complete game data including all entities and calculations
  - Filter with `?include=game,adventurer,currentBeast,damagePreview,market,recentEvents`
  - Used for debugging and detailed analysis

### Other Endpoints

- `POST /combat/simulate` – Simulate one combat round
- `GET /beast/:id` – Beast details and rewards
- `GET /item/:id?xp=0&seed=0` – Item with derived specials/price
- `GET /leaderboard?limit=10` – Top adventurers
- `POST /query` – Raw SQL (debug)

## LLM Context Format

The `/game/:id/context` endpoint returns compact XML optimized for agent frameworks:

### Phase Detection
- **`exploration`** – Default state, includes market items (market is always available during exploration)
- **`combat`** – Active battle with a beast
- **`level_up`** – Stat points available to upgrade
- **`death`** – Adventurer has died

### XML Structure
```xml
<context>
  <phase>exploration</phase>
  <adventurer health="100" level="5" gold="50" xp="200"/>
  <stats str="10" dex="8" vit="12" int="6" wis="7" cha="5"/>
  <equipment weapon="Sword:L5:T3" chest="Leather:L3:T4" .../>
  <market>
    <item name="Grimoire" price="100" tier="2" slot="Weapon" type="Magic"/>
    <item name="Shield" price="50" tier="3" slot="Hand" type="Metal"/>
  </market>
</context>
```

Equipment format: `Name:L{level}:T{tier}` (e.g., "Sword:L5:T3" = Sword, Level 5, Tier 3)

## Agent Framework Integration

```typescript
import { getLLMContext } from './src/context';

// Fetch context for game
const context = await getLLMContext(gameId);

// Send to your agent/LLM
const decision = await agent.process(context);
```

## JSON Context Details

The `/game/:id/context-json` endpoint provides:
- `adventurer.combatStats`: generic attack/defense/crit stats
- `currentBeast`: only present when in battle
- `damagePreview`: damage calculations vs current beast
- `recentEvents`: activity feed with newest events first
- `market`: all available market items with prices

## Env

- `TORII_URL` (required)
- `NAMESPACE` (default: ls_0_0_6)
- `RPC_URL`
- `PORT` (default: 3000)

Built with Bun.
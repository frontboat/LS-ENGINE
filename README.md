# Loot Survivor Context Engine

Simplified API for game state and LLM-ready context generation for agent frameworks.

## Quick Start

```bash
bun install
bun run index.ts
```

Defaults to:
```bash
export TORII_URL=https://api.cartridge.gg/x/pg-sepolia/torii
export NAMESPACE=ls_0_0_6
```

## Architecture

This engine has been dramatically simplified from the original complex Entity-System pattern to leverage the denormalized Torii database structure:

- **Single Query**: One SQL query fetches complete game state (vs. 6+ separate queries)
- **Direct Mapping**: Raw database rows map directly to game objects  
- **Minimal Processing**: ~800 lines total vs. 3000+ in the original design

## Endpoints

### Primary Endpoint

- **`GET /game/:id/context`** – XML context for LLM/agent frameworks
  - Returns inline XML optimized for token usage
  - Automatically detects game phase: `exploration`, `combat`, `level_up`, `death`
  - Includes combat damage calculations and outcome estimates
  - Example: `<context><phase>combat</phase><adventurer health="95" level="5"/>...</context>`

### Health Check

- **`GET /`** – Service status and configuration

## LLM Context Format

The `/game/:id/context` endpoint returns compact XML optimized for agent frameworks:

### Phase Detection
- **`exploration`** – Default state, includes market items and bag contents
- **`combat`** – Active battle with beast, damage calculations, and outcome estimate  
- **`level_up`** – Stat points available to upgrade
- **`death`** – Adventurer has died

### XML Structure Examples

**Exploration Phase:**
```xml
<context>
  <phase>exploration</phase>
  <adventurer health="100" level="5" gold="250" xp="200"/>
  <stats str="10" dex="8" vit="12" int="6" wis="7" cha="5"/>
  <equipment weapon="Sword:L5:T3" chest="Leather:L3:T4" head="None" .../>
  <market>
    <item name="Grimoire" price="100" tier="2" slot="Weapon" type="Magic"/>
    <item name="Shield" price="50" tier="3" slot="Hand" type="Metal"/>
  </market>
  <bag>
    <item name="Short Sword" level="3" tier="4"/>
  </bag>
</context>
```

**Combat Phase:**
```xml
<context>
  <phase>combat</phase>
  <adventurer health="95" level="5" gold="250" xp="200"/>
  <stats str="10" dex="8" vit="12" int="6" wis="7" cha="5"/>
  <equipment weapon="Sword:L5:T3" chest="Leather:L3:T4" .../>
  <beast name="Nephilim" health="80" level="6" tier="2"/>
  <damage player="24" critical="48" beast="12"/>
  <flee chance="80"/>
  <estimate>Win in 4 rounds, take 36 damage</estimate>
</context>
```

Equipment format: `Name:L{level}:T{tier}` (e.g., "Sword:L5:T3" = Sword, Level 5, Tier 3)

## Combat Calculations

The engine performs accurate combat damage calculations with:
- **Elemental adjustments** (Magic vs Metal, Blade vs Cloth, Bludgeon vs Hide)
- **Per-armor-slot calculations** with special name bonuses (8x prefix, 2x suffix)
- **Neck item reductions** (Amulet for Cloth, Pendant for Hide, Necklace for Metal)
- **Outcome estimation** based on turn-based combat (adventurer always goes first)

## File Structure

```
.
├── index.ts                     # Main API server (Hono framework)
├── src/
│   ├── services/
│   │   └── GameStateService.ts  # Single service replaces all entities/indexer
│   ├── context/
│   │   └── SimplifiedContextEngine.ts  # XML generation
│   ├── constants/               # Game data (beast names, items, etc.)
│   └── utils/
│       └── game.ts             # Core game calculations
```

## Environment Variables

- `TORII_URL` (required) - Torii indexer endpoint
- `NAMESPACE` (default: ls_0_0_6) - Database namespace
- `PORT` (default: 3000) - Server port

Built with Bun.
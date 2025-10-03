# Loot Survivor Context Engine

XML context API for LLM agents. Single query fetches complete game state from denormalized Torii database.

## Usage

```bash
bun install
bun run index.ts
```

**Environment:**
- `TORII_URL` - Torii indexer endpoint  
- `NAMESPACE` - Database namespace (default: ls_0_0_9)
- `PORT` - Server port (default: 3000)

## API

- `GET /` - Health check
- `GET /game/:id/context` - XML context for LLM agents

## Context Format

**Phases:** `exploration` | `combat` | `level_up` | `death`

**Equipment format:** `Name:L{level}:T{tier}`  
**Market format:** `Name:T{tier}:{price}g`  
**Bag format:** `Name:L{level}:T{tier}`

**Combat example:**
```xml
<context><phase>combat</phase><adventurer health="95" level="5"/><beast name="Nephilim" health="80" level="6" tier="2"/><damage player="24" critical="48" beast="12"/><estimate>Win in 4 rounds, take 36 damage</estimate></context>
```

## Architecture

```
├── index.ts                          # Hono API server
├── src/services/GameStateService.ts  # Single SQL query + calculations  
├── src/context/ContextEngine.ts      # XML generation
└── src/{constants,utils}/             # Game data + calculations
```

Built with Bun.
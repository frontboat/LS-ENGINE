---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Loot Survivor Context Engine - Simplified Architecture

This project has been dramatically simplified from a complex Entity-System pattern to a streamlined approach that leverages the denormalized Torii database structure.

## Key Simplifications Made

1. **Single Query Architecture**: Replaced 6+ separate SQL queries with one comprehensive query
2. **Direct Data Mapping**: Raw database rows map directly to game objects without complex Entity reconstruction
3. **Eliminated Abstractions**: Removed Entity classes, IndexerClient, and complex type systems
4. **Focused API**: Reduced from 8+ endpoints to 2 essential ones

## Current File Structure

```
├── index.ts                     # Main API server (Hono framework)
├── src/
│   ├── services/
│   │   └── GameStateService.ts  # Single service (replaces IndexerClient + all entities)
│   ├── context/
│   │   └── SimplifiedContextEngine.ts  # XML generation for LLM agents
│   ├── constants/               # Game data (beast names, items, obstacles)
│   └── utils/
│       └── game.ts             # Core calculations (elemental damage, XP, etc.)
```

## Core Implementation Details

### GameStateService.ts (~400 lines)
- **Single SQL query** fetches complete game state from denormalized database
- **Direct field mapping** from database columns to game objects
- **Embedded combat calculations** with proper elemental adjustments and per-slot damage
- **Phase detection logic** (exploration, combat, level_up, death)

### SimplifiedContextEngine.ts (~100 lines) 
- **XML generation** optimized for LLM token usage
- **Phase-specific context** with relevant data only
- **Combat estimates** ("Win in 3 rounds, take 12 damage")

## Combat Calculation Accuracy

The simplified system maintains full combat calculation accuracy:
- ✅ **Elemental type advantages** (Magic/Blade/Bludgeon vs Cloth/Hide/Metal)
- ✅ **Per-armor-slot damage** with individual elemental adjustments
- ✅ **Special name bonuses** (8x prefix match, 2x suffix match)  
- ✅ **Neck item reductions** (Amulet/Pendant/Necklace bonuses)
- ✅ **Turn-based outcome estimation** (adventurer always goes first)

## Development Commands

- `bun run index.ts` - Start the API server
- `bun test` - Run tests (if any)
- Primary endpoint: `GET /game/:id/context` - Returns XML context for LLM agents

## Result

Reduced from ~3000 lines across 19 files down to ~800 lines across 7 files while maintaining full functionality and improving performance through single-query architecture.

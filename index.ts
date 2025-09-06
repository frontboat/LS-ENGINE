/**
 * Death Mountain Context Engine
 * API server using Hono framework
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { IndexerClient, type IndexerConfig } from './src/indexer/IndexerClient';
import { GameContext } from './src/systems/GameContext';
import { AdventurerEntity } from './src/entities/AdventurerEntity';
import { BeastEntity } from './src/entities/BeastEntity';
import { ItemEntity } from './src/entities/ItemEntity';
import { SimpleContextEngine } from './src/context/SimpleContextEngine';

// Environment configuration
const config: IndexerConfig = {
  toriiUrl: process.env.TORII_URL || 'https://api.cartridge.gg/x/pg-sepolia/torii',
  namespace: process.env.NAMESPACE || 'ls_0_0_6',
  rpcUrl: process.env.RPC_URL || 'https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9'
};

// Initialize app
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Initialize services
const indexer = new IndexerClient(config);
const gameContext = new GameContext(indexer);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Loot Survivor 2 Context Engine',
    version: '1.0.1',
    status: 'online',
    config: {
      namespace: config.namespace,
      toriiUrl: config.toriiUrl
    }
  });
});

// List available adventurers
app.get('/adventurers', async (c) => {
  try {
    const query = `
      SELECT DISTINCT 
        adventurer_id,
        MAX(action_count) as last_action,
        MAX("details.adventurer.health") as health,
        MAX("details.adventurer.xp") as xp
      FROM "${config.namespace}-GameEvent"
      GROUP BY adventurer_id
      ORDER BY adventurer_id ASC
      LIMIT 50
    `;
    const result = await indexer.sql(query);
    
    // Convert hex IDs to numbers for easier use
    const adventurers = result.map((row: any) => ({
      id: parseInt(row.adventurer_id.slice(2), 16),
      hexId: row.adventurer_id,
      lastAction: row.last_action,
      health: row.health,
      xp: row.xp
    }));
    
    return c.json({
      count: adventurers.length,
      adventurers,
      hint: "Use these IDs with /adventurer/:id or /game/:id/context"
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// Game Context Routes
// ============================================

// Get LLM-ready context (XML format for agent frameworks)
app.get('/game/:id/context', async (c) => {
  try {
    const gameId = parseInt(c.req.param('id'));
    const gameState = await gameContext.getGameContext(gameId);
    
    // Generate compact XML context
    const engine = new SimpleContextEngine();
    const result = engine.build(gameState);
    
    // Return inline XML without newlines
    c.header('Content-Type', 'application/xml');
    const inlineXml = result.content.replace(/\n\s*/g, '');
    
    return c.text(inlineXml);
  } catch (error: any) {
    // Return error as inline XML
    c.header('Content-Type', 'application/xml');
    return c.text(`<error><message>${error.message}</message><gameId>${c.req.param('id')}</gameId></error>`, 404);
  }
});

// Get full game context as JSON
app.get('/game/:id/context-json', async (c) => {
  try {
    const gameId = parseInt(c.req.param('id'));
    const context = await gameContext.getGameContext(gameId);

    // Optional filtering via include=query,param list (e.g., include=game,adventurer,currentBeast)
    const includeParam = c.req.query('include');
    if (includeParam) {
      const allowed = new Set(includeParam.split(',').map(s => s.trim()).filter(Boolean));
      const filtered: Record<string, any> = {};
      for (const key of ['game', 'adventurer', 'currentBeast', 'damagePreview', 'market', 'recentEvents']) {
        if (allowed.has(key) && (context as any)[key] !== undefined) {
          (filtered as any)[key] = (context as any)[key];
        }
      }
      return c.json(filtered);
    }

    return c.json(context);
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

// removed deprecated alias endpoint: /game/:id/combat-ready

// Simulate combat
app.post('/combat/simulate', async (c) => {
  try {
    const { gameId, beastId } = await c.req.json();
    const result = await gameContext.simulateCombat(gameId, beastId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// removed deprecated alias endpoint: /game/:id/market

// ============================================
// Entity Routes
// ============================================

// removed deprecated endpoint: /adventurer/:gameId

// Get beast
app.get('/beast/:id', async (c) => {
  try {
    const beastId = parseInt(c.req.param('id'));
    const beast = new BeastEntity(indexer);
    await beast.fetch(beastId);
    
    return c.json({
      raw: beast.getRaw(),
      formatted: beast.format(),
      rewards: beast.calculateRewards()
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

// Get item details
app.get('/item/:id', async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    const xp = parseInt(c.req.query('xp') || '0');
    const seed = parseInt(c.req.query('seed') || '0');
    
    const item = new ItemEntity(indexer);
    await item.fetch(itemId);
    
    if (xp > 0) {
      item.withXP(xp);
    }
    
    if (seed > 0) {
      item.withSpecials(seed);
    }
    
    return c.json({
      formatted: item.format(),
      tier: item.getTier(),
      type: item.getType(),
      slot: item.getSlot(),
      price: {
        base: item.getPrice(0),
        withCharisma: (charisma: number) => item.getPrice(charisma)
      }
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

// ============================================
// Calculation Routes
// ============================================

// removed calculation endpoint: /calculate/damage (use context.damagePreview or /combat/simulate)

// ============================================
// Leaderboard Routes
// ============================================

app.get('/leaderboard', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const leaderboard = await gameContext.getLeaderboard(limit);
    return c.json(leaderboard);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// Raw Query Route (for debugging)
// ============================================

app.post('/query', async (c) => {
  try {
    const { sql } = await c.req.json();
    
    if (!sql) {
      return c.json({ error: 'SQL query required' }, 400);
    }
    
    const result = await indexer.sql(sql);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Start server
const port = parseInt(process.env.PORT || '3000');

console.log(`🗡️  Death Mountain Context Engine`);
console.log(`📍 Starting on port ${port}`);
console.log(`🔗 Torii: ${config.toriiUrl}`);
console.log(`🏷️  Namespace: ${config.namespace}`);

export default {
  port,
  fetch: app.fetch
};
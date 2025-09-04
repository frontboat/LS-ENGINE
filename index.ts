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

// Environment configuration
const config: IndexerConfig = {
  toriiUrl: process.env.TORII_URL || 'https://api.cartridge.gg/x/pg-sepolia/torii',
  namespace: process.env.NAMESPACE || 'ls_0_0_8',
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

// Get full game context
app.get('/game/:id/context', async (c) => {
  try {
    const gameId = parseInt(c.req.param('id'));
    const context = await gameContext.getGameContext(gameId);
    return c.json(context);
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

// Get combat-ready adventurer
app.get('/game/:id/combat-ready', async (c) => {
  try {
    const gameId = parseInt(c.req.param('id'));
    const data = await gameContext.getAdventurerCombatReady(gameId);
    return c.json(data);
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

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

// Get market analysis
app.get('/game/:id/market', async (c) => {
  try {
    const gameId = parseInt(c.req.param('id'));
    const analysis = await gameContext.getMarketAnalysis(gameId);
    return c.json(analysis);
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

// ============================================
// Entity Routes
// ============================================

// Get adventurer
app.get('/adventurer/:gameId', async (c) => {
  try {
    const gameId = parseInt(c.req.param('gameId'));
    const adventurer = new AdventurerEntity(indexer);
    await adventurer.fetch(gameId);
    await adventurer.withEquipment();
    
    return c.json({
      raw: adventurer.getRaw(),
      formatted: adventurer.format(),
      combatStats: adventurer.getCombatStats()
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

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

// Calculate damage
app.post('/calculate/damage', async (c) => {
  try {
    const { gameId, beastId } = await c.req.json();
    
    const adventurer = new AdventurerEntity(indexer);
    await adventurer.fetch(gameId);
    await adventurer.withEquipment();
    
    const beast = new BeastEntity(indexer);
    await beast.fetch(beastId);
    
    const damage = adventurer.calculateDamageVsBeast(beast);
    
    return c.json({
      damage,
      adventurer: {
        level: adventurer.getLevel(),
        weapon: adventurer.getWeapon()?.format()
      },
      beast: {
        name: beast.getName(),
        level: beast.getLevel(),
        tier: beast.getTier(),
        armor: beast.getArmorType()
      }
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

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
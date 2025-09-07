/**
 * Death Mountain Context Engine
 * API server using Hono framework
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { GameStateService, type GameStateConfig } from './src/services/GameStateService';
import { ContextEngine } from './src/context/ContextEngine';

// Environment configuration
const config: GameStateConfig = {
  toriiUrl: process.env.TORII_URL || 'https://api.cartridge.gg/x/pg-sepolia/torii',
  namespace: process.env.NAMESPACE || 'ls_0_0_6'
};

// Initialize app
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Initialize services
const gameService = new GameStateService(config);
const contextEngine = new ContextEngine();

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Loot Survivor 2 Context Engine',
    version: '1.0.3',
    status: 'online',
    config: {
      namespace: config.namespace,
      toriiUrl: config.toriiUrl
    }
  });
});

// ============================================
// Game Context Route (Primary API)
// ============================================

// Get LLM-ready context (XML format for agent frameworks)
app.get('/game/:id/context', async (c) => {
  try {
    const gameId = parseInt(c.req.param('id'));
    const gameState = await gameService.getGameState(gameId);
    
    // Generate compact XML context
    const result = contextEngine.generateContext(gameState);
    
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


// Start server
const port = parseInt(process.env.PORT || '3000');

console.log(`Port: ${port}`);
console.log(`Torii: ${config.toriiUrl}`);
console.log(`Namespace: ${config.namespace}`);

export default {
  port,
  fetch: app.fetch
};
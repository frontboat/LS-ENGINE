/**
 * Context Engine for LLM/Agent Framework
 * 
 * Simple usage:
 * ```typescript
 * import { getLLMContext } from './context';
 * 
 * // In your agent framework
 * const context = await getLLMContext(gameId);
 * const agentResponse = await agent.process(context);
 * ```
 * 
 * Direct processing:
 * ```typescript
 * import { processGameState } from './context';
 * 
 * const context = processGameState(gameState);
 * ```
 */

// Main hooks for agent framework
export { getLLMContext, getLLMContextWithMeta, processGameState } from './getLLMContext';

// Core engine
export { SimpleContextEngine } from './SimpleContextEngine';
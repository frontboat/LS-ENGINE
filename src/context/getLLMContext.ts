/**
 * Get LLM Context Hook
 * Simple function to get game context formatted for agent framework
 * 
 * Usage:
 * ```typescript
 * import { getLLMContext } from './context/getLLMContext';
 * 
 * // In your agent framework
 * const context = await getLLMContext(gameId);
 * const agentResponse = await agent.process(context);
 * ```
 */

import { SimpleContextEngine } from "./SimpleContextEngine";

/**
 * Fetches game state and returns XML context for LLM/Agent processing
 * @param gameId - The game ID to fetch context for
 * @param apiUrl - Optional API URL (defaults to localhost:3000)
 * @returns XML string ready for agent framework
 */
export async function getLLMContext(
  gameId: number, 
  apiUrl: string = "http://localhost:3000"
): Promise<string> {
  // Fetch game state from existing API
  const response = await fetch(`${apiUrl}/game/${gameId}/context`);
  if (!response.ok) {
    throw new Error(`Failed to fetch game ${gameId}: ${response.statusText}`);
  }
  
  const gameState = await response.json();
  
  // Generate context
  const engine = new SimpleContextEngine();
  const result = engine.build(gameState);
  
  return result.content;
}

/**
 * Gets context with additional metadata
 */
export async function getLLMContextWithMeta(
  gameId: number,
  apiUrl: string = "http://localhost:3000"  
): Promise<{ content: string; phase: string; tokens: number }> {
  const response = await fetch(`${apiUrl}/game/${gameId}/context`);
  if (!response.ok) {
    throw new Error(`Failed to fetch game ${gameId}: ${response.statusText}`);
  }
  
  const gameState = await response.json();
  
  const engine = new SimpleContextEngine();
  return engine.build(gameState);
}

/**
 * Process game state directly (if you already have it)
 */
export function processGameState(gameState: any): string {
  const engine = new SimpleContextEngine();
  const result = engine.build(gameState);
  return result.content;
}
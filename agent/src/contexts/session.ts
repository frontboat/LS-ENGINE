import { context } from '@daydreamsai/core';
import * as z from 'zod';

import {
  loadGameState,
  resetGameStateCache,
} from '../services/gameState';
import { battleContext } from './battle';
import { explorationContext } from './exploration';
import { marketContext } from './market';
import { startGameContext } from './startGame';
import { statUpgradeContext } from './statUpgrade';

const DEFAULT_GAME_ID = Number.parseInt(process.env.DEFAULT_GAME_ID ?? '21603', 10); //this is a gameid boat used for testing REMOVE

interface SessionMemory {
  hasActiveGame: boolean;
  phase: 'start' | 'exploration' | 'combat' | 'level_up' | 'death';
  summary: string;
  gameId?: number;
}

export const sessionContext = context({
  type: 'loot-survivor-session',
  schema: z.object({
    playerId: z.string().describe('Player interacting with the Loot Survivor agent'),
    gameId: z.number().optional().describe('Current adventurer identifier if a run is active'),
  }),
  create: (): SessionMemory => ({
    hasActiveGame: false,
    phase: 'start',
    summary: 'Session not loaded yet.',
    gameId: Number.isFinite(DEFAULT_GAME_ID) ? DEFAULT_GAME_ID : undefined,
  }),
  loader: async (state) => {
    resetGameStateCache();

    const preferredGameId =
      typeof state.args.gameId === 'number'
        ? state.args.gameId
        : Number.isFinite(DEFAULT_GAME_ID)
          ? DEFAULT_GAME_ID
          : undefined;

    state.memory.gameId = preferredGameId;

    if (typeof preferredGameId !== 'number') {
      state.memory.hasActiveGame = false;
      state.memory.phase = 'start';
      state.memory.summary = 'No active game detected. Prepare onboarding context.';
      return;
    }

    try {
      const gameState = await loadGameState(preferredGameId);
      state.memory.hasActiveGame = true;
      state.memory.phase = gameState.phase;
      state.memory.summary = `Loaded game ${preferredGameId} at action ${gameState.actionCount} (phase: ${gameState.phase}).`;
    } catch (error) {
      state.memory.hasActiveGame = false;
      state.memory.phase = 'start';
      state.memory.summary = `Failed to load game ${preferredGameId}: ${error instanceof Error ? error.message : 'Unknown error'}.`;
    }
  },
  instructions: (state) => {
    return [
      'You coordinate which specialized context should run based on the player\'s current state.',
      'Always rely on composed contexts for detailed data—your role is orchestration and summarization.',
      `Player: ${state.args.playerId}.`,
      `Active game: ${state.memory.gameId ?? 'none'}.`,
      `Phase: ${state.memory.phase}.`,
    ].join('\n');
  },
}).use((state) => {
  const contexts: Array<{ context: any; args: any }> = [];

  if (!state.memory.hasActiveGame || state.memory.phase === 'start') {
    contexts.push({
      context: startGameContext,
      args: { playerId: state.args.playerId },
    });
    return contexts;
  }

  const gameId = state.memory.gameId ?? state.args.gameId;
  if (typeof gameId !== 'number') {
    return contexts;
  }

  if (state.memory.phase === 'combat') {
    contexts.push({ context: battleContext, args: { gameId } });
    return contexts;
  }

  if (state.memory.phase === 'level_up') {
    contexts.push({ context: statUpgradeContext, args: { gameId } });
    return contexts;
  }

  if (state.memory.phase === 'exploration') {
    contexts.push({ context: explorationContext, args: { gameId } });
    contexts.push({ context: marketContext, args: { gameId } });
    return contexts;
  }

  if (state.memory.phase === 'death') {
    // After death, treat like start to encourage new runs with context about previous attempt.
    contexts.push({ context: startGameContext, args: { playerId: state.args.playerId } });
    return contexts;
  }

  // Fallback: provide exploration data when phase is unknown but game exists.
  contexts.push({ context: explorationContext, args: { gameId } });
  contexts.push({ context: marketContext, args: { gameId } });
  return contexts;
});

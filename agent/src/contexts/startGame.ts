import { context } from '@daydreamsai/core';
import * as z from 'zod';

import { loadLeaderboard } from '../services/gameState';
import { mintGameAction } from '../actions/systemCalls';

interface StartGameMemory {
  leaderboard: string[];
}

export const startGameContext = context({
  type: 'start-game',
  schema: z.object({
    playerId: z.string().describe('Unique identifier for the player starting a run'),
  }),
  create: (): StartGameMemory => ({
    leaderboard: [],
  }),
  loader: async (state) => {
    const leaderboard = await loadLeaderboard();
    state.memory.leaderboard = leaderboard.map(
      (entry) => `Rank ${entry.rank}: Adventurer ${entry.adventurerId} (Lvl ${entry.level}, ${entry.xp} XP)`
    );
  },
  render: (state) => {
    return [
      `Player ${state.args.playerId} has not started a run yet.`,
      'Leaderboard Snapshot:',
      state.memory.leaderboard.join('\n') || 'No completed runs recorded yet.',
    ].join('\n');
  },
}).setActions([mintGameAction]);

import { context } from '@daydreamsai/core';
import * as z from 'zod';

import { loadGameState } from '../services/gameState';

interface StatUpgradeMemory {
  availablePoints: number;
  statLines: string[];
}

export const statUpgradeContext = context({
  type: 'stat-upgrade',
  schema: z.object({
    gameId: z.number().describe('Active game identifier for stat upgrade decisions'),
  }),
  create: (): StatUpgradeMemory => ({
    availablePoints: 0,
    statLines: [],
  }),
  loader: async (state) => {
    const gameState = await loadGameState(state.args.gameId);
    const adventurer = gameState.adventurer;
    const { stats } = adventurer;

    state.memory.availablePoints = adventurer.statUpgradesAvailable;
    state.memory.statLines = [
      `STR: ${stats.strength}`,
      `DEX: ${stats.dexterity}`,
      `VIT: ${stats.vitality}`,
      `INT: ${stats.intelligence}`,
      `WIS: ${stats.wisdom}`,
      `CHA: ${stats.charisma}`,
      `LUK: ${stats.luck}`,
    ];

    // No additional derived data—leave decision making to the model.
  },
  render: (state) => {
    return [
      `Stat points available: ${state.memory.availablePoints}`,
      'Current stats:',
      state.memory.statLines.join(', '),
    ].join('\n');
  },
});

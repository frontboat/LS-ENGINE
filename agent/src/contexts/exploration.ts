import { context } from '@daydreamsai/core';
import * as z from 'zod';

import { loadGameState } from '../services/gameState';

interface ExplorationMemory {
  phase: string;
  adventurerSummary: string;
  equipmentSummary: string;
  bagSummary: string[];
}

export const explorationContext = context({
  type: 'exploration',
  schema: z.object({
    gameId: z.number().describe('Active game identifier for exploration decisions'),
  }),
  create: (): ExplorationMemory => ({
    phase: 'unknown',
    adventurerSummary: 'No adventurer snapshot loaded.',
    equipmentSummary: 'No equipment data loaded.',
    bagSummary: [],
  }),
  loader: async (state) => {
    const gameState = await loadGameState(state.args.gameId);

    state.memory.phase = gameState.phase;

    const adventurer = gameState.adventurer;
    state.memory.adventurerSummary = [
      `Health: ${adventurer.health}`,
      `Gold: ${adventurer.gold}`,
      `Bag slots used: ${gameState.bag.length}`,
    ].join(' | ');

    const equipmentEntries = Object.entries(adventurer.equipment).map(([slot, item]) => {
      if (!item) {
        return `${slot}: None`;
      }
      return `${slot}: ${item.name} [${item.type}] (Tier ${item.tier}, Level ${item.level})`;
    });
    state.memory.equipmentSummary = equipmentEntries.join(' | ');

    state.memory.bagSummary = gameState.bag.map((item, index) => {
      return `Slot ${index + 1}: ${item.name} [${item.type}] L${item.level} T${item.tier}`;
    });

    // Leave decision making to the model; no objective recommendations here.
  },
  render: (state) => {
    return [
      `Exploration phase: ${state.memory.phase}`,
      'Adventurer Overview:',
      state.memory.adventurerSummary,
      'Equipment Loadout:',
      state.memory.equipmentSummary,
      'Bag Storage:',
      state.memory.bagSummary.join('\n') || 'Bag is empty.',
    ].join('\n');
  },
});

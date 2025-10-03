import { context } from '@daydreamsai/core';
import * as z from 'zod';

import { loadGameState } from '../services/gameState';
import { calculateMaxHealth, potionPrice } from '../utils/derived';

interface StatUpgradeMemory {
  availablePoints: number;
  statLines: string[];
  maxHealth: number;
  potionCost: number;
  currentHealth: number;
  gold: number;
}

export const statUpgradeContext = context({
  type: 'stat-upgrade',
  schema: z.object({
    gameId: z.number().describe('Active game identifier for stat upgrade decisions'),
  }),
  create: (): StatUpgradeMemory => ({
    availablePoints: 0,
    statLines: [],
    maxHealth: 0,
    potionCost: 0,
    currentHealth: 0,
    gold: 0,
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

    state.memory.maxHealth = calculateMaxHealth(stats.vitality);
    state.memory.potionCost = potionPrice(adventurer.level, stats.charisma);
    state.memory.currentHealth = adventurer.health;
    state.memory.gold = adventurer.gold;
  },
  render: (state) => {
    return [
      `Stat points available: ${state.memory.availablePoints}`,
      'Current stats:',
      state.memory.statLines.join(', '),
      `Current health: ${state.memory.currentHealth}/${state.memory.maxHealth}`,
      `Gold: ${state.memory.gold}`,
      `Potion price: ${state.memory.potionCost}g`,
    ].join('\n');
  },
});

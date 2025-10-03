import { context } from '@daydreamsai/core';
import * as z from 'zod';

import { loadGameState } from '../services/gameState';

interface MarketMemory {
  gold: number;
  items: string[];
  affordableItems: string[];
}

export const marketContext = context({
  type: 'market',
  schema: z.object({
    gameId: z.number().describe('Active game identifier for market evaluation'),
  }),
  create: (): MarketMemory => ({
    gold: 0,
    items: [],
    affordableItems: [],
  }),
  loader: async (state) => {
    const gameState = await loadGameState(state.args.gameId);
    state.memory.gold = gameState.adventurer.gold;

    const ownedIds = new Set<number>();
    Object.values(gameState.adventurer.equipment).forEach((item) => {
      if (item) {
        ownedIds.add(item.id);
      }
    });
    gameState.bag.forEach((item) => ownedIds.add(item.id));

    const marketInventory = gameState.market.filter((item) => !ownedIds.has(item.id));

    state.memory.items = marketInventory.map(
      (item) => `${item.name} [${item.type}] (Slot: ${item.slot}, Tier ${item.tier}) - ${item.price}g`
    );

    const affordable = marketInventory.filter((item) => item.price <= gameState.adventurer.gold);
    state.memory.affordableItems = affordable.map(
      (item) => `${item.name} [${item.type}] (Tier ${item.tier}) for ${item.price}g`
    );
  },
  render: (state) => {
    return [
      `Current gold: ${state.memory.gold}`,
      'Market Inventory:',
      state.memory.items.join('\n') || 'Market stall is empty.',
      'Affordable Items:',
      state.memory.affordableItems.join('\n') || 'No items are currently affordable.',
    ].join('\n');
  },
});

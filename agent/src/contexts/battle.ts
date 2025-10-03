import { context } from '@daydreamsai/core';
import * as z from 'zod';

import { loadGameState } from '../services/gameState';
import { calculateMaxHealth } from '../utils/derived';

interface BattleMemory {
  phase: string;
  adventurerSummary: string;
  equipmentSummary: string;
  beastSummary: string;
  combatSummary: string;
}

export const battleContext = context({
  type: 'battle',
  schema: z.object({
    gameId: z.number().describe('Active game identifier for this adventurer'),
  }),
  create: (): BattleMemory => ({
    phase: 'unknown',
    adventurerSummary: 'No adventurer data loaded.',
    equipmentSummary: 'No equipment data loaded.',
    beastSummary: 'No beast encountered.',
    combatSummary: 'No combat preview available.',
  }),
  loader: async (state) => {
    const gameState = await loadGameState(state.args.gameId);

    state.memory.phase = gameState.phase;

    const adventurer = gameState.adventurer;
    const maxHealth = calculateMaxHealth(adventurer.stats.vitality);
    state.memory.adventurerSummary = [
      `Health: ${adventurer.health}/${maxHealth}`,
      `Level: ${adventurer.level}`,
    ].join(' | ');

    const equipmentEntries = Object.entries(adventurer.equipment).map(([slot, item]) => {
      const slotLabel = `${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;
      if (!item) {
        return `${slotLabel}: None`;
      }
      return `${slotLabel}: ${item.name} [${item.type}] (ID ${item.id}, Tier ${item.tier}, Level ${item.level})`;
    });
    state.memory.equipmentSummary = equipmentEntries.join(' | ');

    if (gameState.beast) {
      const beast = gameState.beast;
      state.memory.beastSummary = [
        `Name: ${beast.name}`,
        `Level: ${beast.level}`,
        `Health: ${beast.health}`,
        `Tier: ${beast.tier}`,
        beast.prefix ? `Special: ${beast.prefix}` : null,
        beast.suffix ? `Special: ${beast.suffix}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
    } else {
      state.memory.beastSummary = 'No beast currently engaged.';
    }

    if (gameState.combatPreview) {
      const preview = gameState.combatPreview;
      const fleePercent = preview.fleeChance > 1 ? preview.fleeChance : preview.fleeChance * 100;
      state.memory.combatSummary = [
        `Player Damage => base:${preview.playerDamage.base}, crit:${preview.playerDamage.critical}`,
        `Beast Damage => max:${preview.beastDamage.max}`,
        `Flee Chance: ${Math.round(fleePercent)}%`,
        `Outcome: ${preview.outcome}`,
      ].join(' | ');
    } else {
      state.memory.combatSummary = 'No combat preview available.';
    }
  },
  render: (state) => {
    return [
      `Battle phase: ${state.memory.phase}`,
      'Adventurer Snapshot:',
      state.memory.adventurerSummary,
      'Equipment Loadout:',
      state.memory.equipmentSummary,
      'Beast Snapshot:',
      state.memory.beastSummary,
      'Combat Outlook:',
      state.memory.combatSummary,
    ].join('\n');
  },
});

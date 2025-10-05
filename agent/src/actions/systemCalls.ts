import { action } from '@daydreamsai/core';
import * as z from 'zod';

import { resolveSystemCalls } from '../services/systemCalls';
import type { TranslatedActionEvent } from '../services/systemCalls';

const gameIdSchema = z.number().int().nonnegative();

const statsSchema = z.object({
  strength: z.number().int().nonnegative(),
  dexterity: z.number().int().nonnegative(),
  vitality: z.number().int().nonnegative(),
  intelligence: z.number().int().nonnegative(),
  wisdom: z.number().int().nonnegative(),
  charisma: z.number().int().nonnegative(),
  luck: z.number().int().nonnegative(),
});

const itemPurchaseSchema = z.object({
  item_id: z.number().int().nonnegative(),
  equip: z.boolean(),
});

const beastSummarySchema = z.object({
  id: z.number().int().nonnegative(),
  specialPrefix: z.string().nullable().default(null),
  specialSuffix: z.string().nullable().default(null),
});

function normalizeOutcome(events?: TranslatedActionEvent[]) {
  return events ?? [];
}

export const startGameAction = action({
  name: 'start-game',
  description: 'Start the current game with a random starter weapon.',
  schema: z.object({
    gameId: gameIdSchema,
  }),
  handler: async ({ gameId }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.startGame(gameId)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const exploreAction = action({
  name: 'explore',
  description: 'Explore the world, optionally until a beast encounter.',
  schema: z.object({
    gameId: gameIdSchema,
    untilBeast: z.boolean().default(false),
  }),
  handler: async ({ gameId, untilBeast }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.explore(gameId, untilBeast)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const attackAction = action({
  name: 'attack',
  description: 'Attack the current beast.',
  schema: z.object({
    gameId: gameIdSchema,
    toTheDeath: z.boolean().default(false),
  }),
  handler: async ({ gameId, toTheDeath }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.attack(gameId, toTheDeath)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const fleeAction = action({
  name: 'flee',
  description: 'Attempt to flee from the current beast.',
  schema: z.object({
    gameId: gameIdSchema,
    toTheDeath: z.boolean().default(false),
  }),
  handler: async ({ gameId, toTheDeath }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.flee(gameId, toTheDeath)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const equipAction = action({
  name: 'equip-items',
  description: 'Equip specific item IDs from the bag.',
  schema: z.object({
    gameId: gameIdSchema,
    items: z.array(z.number().int().nonnegative()).min(1),
  }),
  handler: async ({ gameId, items }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.equip(gameId, items)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const dropAction = action({
  name: 'drop-items',
  description: 'Drop items from the bag or equipment.',
  schema: z.object({
    gameId: gameIdSchema,
    items: z.array(z.number().int().nonnegative()).min(1),
  }),
  handler: async ({ gameId, items }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.drop(gameId, items)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const buyItemsAction = action({
  name: 'buy-items',
  description: 'Purchase potions and market items.',
  schema: z.object({
    gameId: gameIdSchema,
    potions: z.number().int().nonnegative().default(0),
    items: z.array(itemPurchaseSchema).default([]),
  }),
  handler: async ({ gameId, potions, items }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.buyItems(gameId, potions, items)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const selectStatsAction = action({
  name: 'select-stat-upgrades',
  description: 'Allocate stat upgrade points for the adventurer.',
  schema: z.object({
    gameId: gameIdSchema,
    stats: statsSchema,
  }),
  handler: async ({ gameId, stats }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.executeAction([client.selectStatUpgrades(gameId, stats)], { gameId });
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const claimBeastAction = action({
  name: 'claim-beast',
  description: 'Claim the defeated collectable beast as an NFT.',
  schema: z.object({
    gameId: gameIdSchema,
    beast: beastSummarySchema,
  }),
  handler: async ({ gameId, beast }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const result = await client.claimBeast(gameId, beast);
    return result
      ? { status: 'claimed', tokenId: result.tokenId, tokenURI: result.tokenURI }
      : { status: 'pending' };
  },
});

export const claimSurvivorTokensAction = action({
  name: 'claim-survivor-tokens',
  description: 'Claim accumulated Survivor reward tokens.',
  schema: z.object({
    gameId: gameIdSchema,
  }),
  handler: async ({ gameId }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const events = await client.claimSurvivorTokens(gameId);
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const requestRandomAction = action({
  name: 'request-randomness',
  description: 'Request randomness from the VRF provider with a specific salt.',
  schema: z.object({
    salt: z.union([z.string(), z.number(), z.bigint()]).default(() => `0x${Date.now().toString(16)}`),
  }),
  handler: async ({ salt }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const saltBigInt = typeof salt === 'bigint' ? salt : BigInt(salt);
    const events = await client.executeAction([client.requestRandom(saltBigInt)]);
    return {
      status: events ? 'accepted' : 'reverted',
      events: normalizeOutcome(events),
    };
  },
});

export const mintGameAction = action({
  name: 'mint-game',
  description: 'Mint a new game token with an optional settings template.',
  schema: z.object({
    name: z.string().min(1),
    settingsId: z.number().int().nonnegative().optional(),
  }),
  handler: async ({ name, settingsId }, ctx, agent) => {
    const client = resolveSystemCalls(agent.container);
    const tokenId = await client.mintGame(name, settingsId ?? 0);
    return { status: 'minted', tokenId };
  },
});

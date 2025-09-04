/**
 * Torii Indexer Client
 * Handles all communication with the Dojo Torii indexer
 */

import { toHexAddress, fromHexAddress } from '../utils/format';
import * as starknet from '@scure/starknet';

export interface IndexerConfig {
  toriiUrl: string;
  namespace: string;
  rpcUrl?: string;
}

export class IndexerClient {
  constructor(private config: IndexerConfig) {}
  
  /**
   * Execute raw SQL query against Torii
   */
  async sql<T = any>(query: string): Promise<T> {
    // Clean up the query - remove extra whitespace and newlines
    const cleanQuery = query.trim().replace(/\s+/g, ' ');
    
    const url = `${this.config.toriiUrl}/sql?query=${encodeURIComponent(cleanQuery)}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Indexer query failed: ${response.statusText}`);
      }
      
      return await response.json() as T;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get adventurer by game ID
   */
  async getAdventurer(gameId: number): Promise<any> {
    // First try with hex format
    const hexId = toHexAddress(gameId);
    
    const query = `
      SELECT 
        adventurer_id,
        "details.adventurer.health" as health,
        "details.adventurer.xp" as xp,
        "details.adventurer.gold" as gold,
        "details.adventurer.beast_health" as beast_health,
        "details.adventurer.stat_upgrades_available" as stat_upgrades_available,
        "details.adventurer.stats.strength" as strength,
        "details.adventurer.stats.dexterity" as dexterity,
        "details.adventurer.stats.vitality" as vitality,
        "details.adventurer.stats.intelligence" as intelligence,
        "details.adventurer.stats.wisdom" as wisdom,
        "details.adventurer.stats.charisma" as charisma,
        "details.adventurer.stats.luck" as luck,
        "details.adventurer.equipment.weapon.id" as weapon_id,
        "details.adventurer.equipment.weapon.xp" as weapon_xp,
        "details.adventurer.equipment.chest.id" as chest_id,
        "details.adventurer.equipment.chest.xp" as chest_xp,
        "details.adventurer.equipment.head.id" as head_id,
        "details.adventurer.equipment.head.xp" as head_xp,
        "details.adventurer.equipment.waist.id" as waist_id,
        "details.adventurer.equipment.waist.xp" as waist_xp,
        "details.adventurer.equipment.foot.id" as foot_id,
        "details.adventurer.equipment.foot.xp" as foot_xp,
        "details.adventurer.equipment.hand.id" as hand_id,
        "details.adventurer.equipment.hand.xp" as hand_xp,
        "details.adventurer.equipment.neck.id" as neck_id,
        "details.adventurer.equipment.neck.xp" as neck_xp,
        "details.adventurer.equipment.ring.id" as ring_id,
        "details.adventurer.equipment.ring.xp" as ring_xp,
        "details.adventurer.item_specials_seed" as item_specials_seed,
        action_count
      FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}' OR adventurer_id = ${gameId}
      ORDER BY action_count DESC
      LIMIT 1
    `;
    const result = await this.sql(query);
    
    // Convert the adventurer_id back to number if result exists
    if (result[0]) {
      // Handle both hex and numeric IDs
      if (typeof result[0].adventurer_id === 'string' && result[0].adventurer_id.startsWith('0x')) {
        result[0].id = fromHexAddress(result[0].adventurer_id);
      } else {
        result[0].id = result[0].adventurer_id;
      }
    }
    
    return result[0] || null;
  }
  
  /**
   * Get beast by ID
   */
  async getBeast(beastId: number): Promise<any> {
    // Derive beast data from latest GameEvent row that references this beast id
    const query = `
      SELECT 
        "details.beast.id" as beast_id,
        "details.beast.seed" as beast_seed,
        "details.beast.health" as beast_health,
        "details.beast.level" as beast_level,
        "details.beast.specials.special2" as special2,
        "details.beast.specials.special3" as special3
      FROM "${this.config.namespace}-GameEvent"
      WHERE "details.beast.id" = ${beastId}
      ORDER BY action_count DESC
      LIMIT 1
    `;
    const result = await this.sql<any[]>(query);
    const row = result?.[0];
    if (!row) {
      return {
        id: beastId,
        level: 1,
        health: 1,
        seed: '0x0',
        special2: 0,
        special3: 0
      };
    }
    return {
      id: Number(row.beast_id || beastId),
      level: row.beast_level ?? 1,
      health: row.beast_health ?? 0,
      seed: row.beast_seed ?? '0x0',
      special2: row.special2 ?? 0,
      special3: row.special3 ?? 0
    };
  }

  /**
   * Deterministically generate a beast from adventurer XP and entropy, matching client logic
   */
  async getBeastFromSeed(adventurerXp: number, entropy: number): Promise<{ id: number; seed: bigint; health: number; level: number; special2: number; special3: number; }> {
    const level = Math.floor(Math.sqrt(adventurerXp));

    // poseidon hash of [xp, entropy]
    const poseidonFelt = starknet.poseidonHashMany([BigInt(adventurerXp), BigInt(entropy)]);

    // lower 128 bits
    const mask128 = (1n << 128n) - 1n;
    const u128 = poseidonFelt & mask128;

    const TWO_POW_64 = 1n << 64n;
    const TWO_POW_32 = 1n << 32n;
    const TWO_POW_16 = 1n << 16n;
    const TWO_POW_8 = 1n << 8n;

    const u64_1 = u128 / TWO_POW_64;
    const u64_2 = u128 % TWO_POW_64;

    const rnd1_u32 = u64_1 / TWO_POW_32;
    const rnd2_u32 = u64_1 % TWO_POW_32;
    const rnd3_u32 = u64_2 / TWO_POW_32;
    const rnd4_u32 = u64_2 % TWO_POW_32;

    const rnd1_u16 = rnd3_u32 / TWO_POW_16;
    const rnd2_u16 = rnd3_u32 % TWO_POW_16;
    const rnd3_u16 = rnd4_u32 / TWO_POW_16;
    const rnd4_u16 = rnd4_u32 % TWO_POW_16;

    const rnd1_u8 = rnd3_u16 / TWO_POW_8;
    const rnd2_u8 = rnd3_u16 % TWO_POW_8;
    const rnd3_u8 = rnd4_u16 / TWO_POW_8;
    const rnd4_u8 = rnd4_u16 % TWO_POW_8;

    // Randomness set (names mirror client)
    const rnd1 = rnd1_u32;
    const rnd3 = rnd1_u16;
    const rnd4 = rnd2_u16;
    const rnd5 = rnd1_u8;
    const rnd6 = rnd2_u8;
    const rnd7 = rnd3_u8;
    // const rnd8 = rnd4_u8; // not needed here

    const MAX_ID = 75n;
    const beast_id = (rnd1 % MAX_ID) + 1n;

    const bigLevel = BigInt(level);

    // health logic per client
    const getBeastHealth = (lvl: bigint, seedVal: bigint): bigint => {
      let health = 1n + (seedVal % (lvl * 20n));
      if (lvl >= 50n) health += 500n;
      else if (lvl >= 40n) health += 400n;
      else if (lvl >= 30n) health += 200n;
      else if (lvl >= 20n) health += 100n;
      else health += 10n;
      return health > 1023n ? 1023n : health;
    };

    const getTier = (id: bigint): bigint => {
      if ((id >= 1n && id <= 5n) || (id >= 26n && id < 31n) || (id >= 51n && id < 56n)) return 1n;
      if ((id >= 6n && id < 11n) || (id >= 31n && id < 36n) || (id >= 56n && id < 61n)) return 2n;
      if ((id >= 11n && id < 16n) || (id >= 36n && id < 41n) || (id >= 61n && id < 66n)) return 3n;
      if ((id >= 16n && id < 21n) || (id >= 41n && id < 46n) || (id >= 66n && id < 71n)) return 4n;
      return 5n;
    };

    const getObstacleLevel = (lvl: bigint, entropyVal: bigint): bigint => {
      let obstacleLevel = 1n + (entropyVal % (lvl * 3n));
      if (lvl >= 50n) obstacleLevel += 80n;
      else if (lvl >= 40n) obstacleLevel += 40n;
      else if (lvl >= 30n) obstacleLevel += 20n;
      else if (lvl >= 20n) obstacleLevel += 10n;
      return obstacleLevel;
    };

    const beast_level = getObstacleLevel(bigLevel, rnd4);
    const beast_health = getBeastHealth(bigLevel, rnd3);

    // specials (1-based)
    const special2 = 1 + Number(rnd5 % 69n);
    const special3 = 1 + Number(rnd6 % 18n);

    return {
      id: Number(beast_id),
      seed: u64_1,
      health: Number(beast_health),
      level: Number(beast_level),
      special2,
      special3
    };
  }
  
  /**
   * Get game events
   */
  async getGameEvents(gameId: number, limit: number = 50): Promise<any[]> {
    const hexId = toHexAddress(gameId);
    
    const query = `
      SELECT * FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}' OR adventurer_id = ${gameId}
      ORDER BY action_count DESC
      LIMIT ${limit}
    `;
    return await this.sql(query);
  }

  /**
   * Get recent AdventurerPacked rows for unified activity feed
   */
  async getAdventurerPacked(gameId: number, limit: number = 10): Promise<any[]> {
    const hexId = toHexAddress(gameId);
    const query = `
      SELECT internal_event_id, internal_executed_at, packed
      FROM "${this.config.namespace}-AdventurerPacked"
      WHERE adventurer_id = '${hexId}' OR adventurer_id = ${gameId}
      ORDER BY internal_executed_at DESC
      LIMIT ${limit}
    `;
    return await this.sql(query);
  }

  /**
   * Get recent BagPacked rows for unified activity feed
   */
  async getBagPacked(gameId: number, limit: number = 10): Promise<any[]> {
    const hexId = toHexAddress(gameId);
    const query = `
      SELECT internal_event_id, internal_executed_at, packed
      FROM "${this.config.namespace}-BagPacked"
      WHERE adventurer_id = '${hexId}' OR adventurer_id = ${gameId}
      ORDER BY internal_executed_at DESC
      LIMIT ${limit}
    `;
    return await this.sql(query);
  }

  /**
   * Get current beast for an adventurer from latest GameEvent row
   */
  async getCurrentBeastForAdventurer(gameId: number): Promise<{
    action_count: number;
    beast_id: number | null;
    beast_seed: string | null;
    beast_health: number | null;
    beast_level: number | null;
    special2: number | null;
    special3: number | null;
  } | null> {
    const hexId = toHexAddress(gameId);
    const query = `
      SELECT 
        action_count,
        "details.beast.id" as beast_id,
        "details.beast.seed" as beast_seed,
        "details.beast.health" as beast_health,
        "details.beast.level" as beast_level,
        "details.beast.specials.special2" as special2,
        "details.beast.specials.special3" as special3
      FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}' OR adventurer_id = ${gameId}
      ORDER BY action_count DESC
      LIMIT 1
    `;
    const result = await this.sql<any[]>(query);
    if (!result || !result[0]) return null;
    return result[0];
  }
  
  /**
   * Get market items
   */
  async getMarketItems(adventurerId: number): Promise<any[]> {
    const hexId = toHexAddress(adventurerId);
    const query = `
      SELECT "details.market_items.items" as items
      FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}' OR adventurer_id = ${adventurerId}
      ORDER BY action_count DESC
      LIMIT 1
    `;
    const result = await this.sql<any[]>(query);
    const itemsField = result?.[0]?.items;
    if (!itemsField) return [];
    if (typeof itemsField === 'string') {
      try {
        const arr = JSON.parse(itemsField);
        return Array.isArray(arr) ? arr : [];
      } catch (_) {
        return [];
      }
    }
    if (Array.isArray(itemsField)) return itemsField;
    return [];
  }
  
  /**
   * Get adventurer's bag items
   */
  async getBagItems(adventurerId: number): Promise<any[]> {
    const query = `
      SELECT * FROM "${this.config.namespace}-BagPacked"
      WHERE adventurer_id = ${adventurerId}
      LIMIT 1
    `;
    return await this.sql(query);
  }
  
  /**
   * Get game settings
   */
  async getGameSettings(settingsId: number): Promise<any> {
    const query = `
      SELECT * FROM "${this.config.namespace}-GameSettings"
      WHERE settings_id = ${settingsId}
      LIMIT 1
    `;
    const result = await this.sql(query);
    return result[0] || null;
  }
  
  /**
   * Get leaderboard
   */
  async getLeaderboard(limit: number = 10): Promise<any[]> {
    const query = `
      SELECT 
        adventurer_id,
        MAX("details.adventurer.xp") as xp,
        MIN("details.adventurer.health") as health
      FROM "${this.config.namespace}-GameEvent"
      GROUP BY adventurer_id
      HAVING health = 0
      ORDER BY xp DESC
      LIMIT ${limit}
    `;
    return await this.sql(query);
  }
  
  /**
   * Batch query multiple entities
   */
  async batch<T extends Record<string, any>>(queries: Record<string, string>): Promise<T> {
    const results = {} as T;
    
    // Execute queries in parallel
    const promises = Object.entries(queries).map(async ([key, query]) => {
      const result = await this.sql(query);
      return [key, result];
    });
    
    const resolvedQueries = await Promise.all(promises);
    
    for (const [key, result] of resolvedQueries) {
      results[key as keyof T] = result;
    }
    
    return results;
  }
}
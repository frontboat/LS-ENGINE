/**
 * Torii Indexer Client
 * Handles all communication with the Dojo Torii indexer
 */

import { toHexAddress, fromHexAddress } from '../utils/format';

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
      
      return await response.json();
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
    // For now, return mock data as there's no Beast table
    // In a real implementation, beasts would be derived from game events
    return {
      id: beastId,
      level: 1,
      health: 10,
      seed: 12345,
      special2: 1,
      special3: 1
    };
  }
  
  /**
   * Get game events
   */
  async getGameEvents(gameId: number, limit: number = 100): Promise<any[]> {
    const hexId = toHexAddress(gameId);
    
    const query = `
      SELECT * FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}'
      ORDER BY action_count DESC
      LIMIT ${limit}
    `;
    return await this.sql(query);
  }
  
  /**
   * Get market items
   */
  async getMarketItems(adventurerId: number): Promise<any[]> {
    // Market items would be in GameEvent details
    // For now return empty array
    return [];
  }
  
  /**
   * Get adventurer's bag items
   */
  async getBagItems(adventurerId: number): Promise<any[]> {
    // Bag items would be in BagPacked table or GameEvent details
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
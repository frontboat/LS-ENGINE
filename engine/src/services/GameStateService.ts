/**
 * Simplified Game State Service
 * Replaces IndexerClient, all Entity classes, and GameContext
 * One query gets everything from the denormalized database
 */

import { BEAST_MIN_DAMAGE, BEAST_NAMES, BEAST_NAME_PREFIXES, BEAST_NAME_SUFFIXES } from '../constants/beast';
import { ItemId, ITEM_NAME_PREFIXES, ITEM_NAME_SUFFIXES } from '../constants/loot';
import { OBSTACLE_NAMES } from '../constants/obstacle';
import { calculateCombatStats, calculateBeastDamage as computeBeastDamage } from '../utils/game';
import { getCollectableTraits } from '../utils/beast';
import { ItemUtils } from '../utils/loot';
import type { Adventurer as UtilsAdventurer, Beast as UtilsBeast, Item as UtilsItem, Equipment as UtilsEquipment } from '../types/game';

export interface GameStateConfig {
  toriiUrl: string;
  namespace: string;
}

export class GameStateService {
  constructor(private config: GameStateConfig) {}

  /**
   * Get complete game state with a single query
   */
  async getGameState(gameId: number): Promise<GameState> {
    const hexId = '0x' + gameId.toString(16).padStart(16, '0');
    
    const query = `
      SELECT * FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}'
      ORDER BY action_count DESC
      LIMIT 1
    `;
    
    const result = await this.sql<any[]>(query);
    const row = result[0];
    
    if (!row) {
      throw new Error(`Game ${gameId} not found`);
    }
    
    return this.mapRowToGameState(row, gameId);
  }

  /**
   * Get recent game events for activity feed
   */
  async getGameEvents(gameId: number, limit: number = 50): Promise<GameEvent[]> {
    const hexId = '0x' + gameId.toString(16).padStart(16, '0');
    
    const query = `
      SELECT * FROM "${this.config.namespace}-GameEvent"
      WHERE adventurer_id = '${hexId}'
      ORDER BY action_count DESC
      LIMIT ${limit}
    `;
    
    const rows = await this.sql<any[]>(query);
    return rows.map(row => this.parseGameEvent(row));
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const query = `
      SELECT 
        adventurer_id,
        MAX("details.adventurer.xp") as xp,
        MAX("details.adventurer.level") as max_level,
        MIN("details.adventurer.health") as final_health
      FROM "${this.config.namespace}-GameEvent"
      GROUP BY adventurer_id
      HAVING final_health = 0
      ORDER BY xp DESC
      LIMIT ${limit}
    `;
    
    const rows = await this.sql<any[]>(query);
    return rows.map((row, index) => ({
      rank: index + 1,
      adventurerId: this.parseHexId(row.adventurer_id),
      xp: row.xp || 0,
      level: Math.floor(Math.sqrt(row.xp || 0))
    }));
  }

  /**
   * Map database row to structured game state
   */
  private mapRowToGameState(row: any, gameId: number): GameState {
    const state: GameState = {
      gameId,
      actionCount: row.action_count || 0,
      phase: this.determinePhase(row),
      
      adventurer: {
        id: gameId,
        health: row['details.adventurer.health'] || 0,
        xp: row['details.adventurer.xp'] || 0,
        level: Math.floor(Math.sqrt(row['details.adventurer.xp'] || 0)),
        gold: row['details.adventurer.gold'] || 0,
        beastHealth: row['details.adventurer.beast_health'] || 0,
        statUpgradesAvailable: row['details.adventurer.stat_upgrades_available'] || 0,
        itemSpecialsSeed: row['details.adventurer.item_specials_seed'] || 0,
        
        stats: {
          strength: row['details.adventurer.stats.strength'] || 0,
          dexterity: row['details.adventurer.stats.dexterity'] || 0,
          vitality: row['details.adventurer.stats.vitality'] || 0,
          intelligence: row['details.adventurer.stats.intelligence'] || 0,
          wisdom: row['details.adventurer.stats.wisdom'] || 0,
          charisma: row['details.adventurer.stats.charisma'] || 0,
          luck: row['details.adventurer.stats.luck'] || 0
        },
        
        equipment: {
          weapon: this.parseItem(row, 'weapon', row['details.adventurer.item_specials_seed']),
          chest: this.parseItem(row, 'chest', row['details.adventurer.item_specials_seed']),
          head: this.parseItem(row, 'head', row['details.adventurer.item_specials_seed']),
          waist: this.parseItem(row, 'waist', row['details.adventurer.item_specials_seed']),
          foot: this.parseItem(row, 'foot', row['details.adventurer.item_specials_seed']),
          hand: this.parseItem(row, 'hand', row['details.adventurer.item_specials_seed']),
          neck: this.parseItem(row, 'neck', row['details.adventurer.item_specials_seed']),
          ring: this.parseItem(row, 'ring', row['details.adventurer.item_specials_seed'])
        }
      },
      
      beast: this.parseBeast(row),
      bag: this.parseBag(row, row['details.adventurer.item_specials_seed']),
      market: this.parseMarket(row)
    };
    
    // Add combat calculations if in battle
    if (state.beast) {
      state.combatPreview = this.calculateCombatPreview(state.adventurer, state.beast, state.bag);
    }
    
    return state;
  }

  /**
   * Parse item from row
   */
  private parseItem(row: any, slot: string, seed: number): Item | null {
    const id = row[`details.adventurer.equipment.${slot}.id`];
    const xp = row[`details.adventurer.equipment.${slot}.xp`] || 0;
    
    if (!id || id === 0) return null;
    
    const level = Math.floor(Math.sqrt(xp));
    const item: Item = {
      id,
      xp,
      level,
      name: this.getItemName(id),
      tier: this.getItemTier(id),
      type: this.getItemType(id),
      slot
    };
    
    // Add specials if level is high enough
    if (level >= 19 && seed) {
      item.prefix = this.getItemPrefix(id, seed);
    }
    if (level >= 15 && seed) {
      item.suffix = this.getItemSuffix(id, seed);
    }
    
    return item;
  }

  /**
   * Parse beast from row
   */
  private parseBeast(row: any): Beast | null {
    const health = row['details.beast.health'];
    if (!health || health <= 0) return null;
    
    const id = row['details.beast.id'];
    const level = row['details.beast.level'] || 1;
    const special2 = row['details.beast.specials.special2'];
    const special3 = row['details.beast.specials.special3'];
    const currentHealth = row['details.adventurer.beast_health'];
    const isCollectable = row['details.beast.is_collectable'];
    
    const beast: Beast = {
      id,
      health: currentHealth && currentHealth > 0 ? currentHealth : health,
      level,
      seed: row['details.beast.seed'] || '0x0',
      name: BEAST_NAMES[id] || `Beast ${id}`,
      tier: this.getBeastTier(id),
      type: this.getBeastType(id),
      armorType: this.getBeastArmorType(id),
      isCollectable: Boolean(isCollectable)
    };
    
    // Add special names if level 19+
    if (level >= 19) {
      if (special2) beast.prefix = BEAST_NAME_PREFIXES[special2];
      if (special3) beast.suffix = BEAST_NAME_SUFFIXES[special3];
    }
    
    return beast;
  }

  /**
   * Parse bag items
   */
  private parseBag(row: any, seed: number): Item[] {
    const items: Item[] = [];
    
    for (let i = 1; i <= 15; i++) {
      const id = row[`details.bag.item_${i}.id`];
      if (id && id > 0) {
        const xp = row[`details.bag.item_${i}.xp`] || 0;
        const level = Math.floor(Math.sqrt(xp));
        
        const item: Item = {
          id,
          xp,
          level,
          name: this.getItemName(id),
          tier: this.getItemTier(id),
          type: this.getItemType(id),
          slot: this.getItemSlot(id),
          bagSlot: i
        };
        
        if (level >= 19 && seed) {
          item.prefix = this.getItemPrefix(id, seed);
        }
        if (level >= 15 && seed) {
          item.suffix = this.getItemSuffix(id, seed);
        }
        
        items.push(item);
      }
    }
    
    return items;
  }

  /**
   * Parse market items
   */
  private parseMarket(row: any): MarketItem[] {
    const marketData = row['details.market_items.items'];
    if (!marketData) return [];
    
    try {
      const items = typeof marketData === 'string' ? JSON.parse(marketData) : marketData;
      if (!Array.isArray(items)) return [];
      
      const charisma = row['details.adventurer.stats.charisma'] || 0;
      
      return items.map((id: number) => ({
        id,
        name: this.getItemName(id),
        tier: this.getItemTier(id),
        type: this.getItemType(id),
        slot: this.getItemSlot(id),
        price: this.calculatePrice(id, charisma)
      }));
    } catch {
      return [];
    }
  }

  /**
   * Parse game event for activity feed
   */
  private parseGameEvent(row: any): GameEvent {
    const base = {
      id: row.internal_event_id,
      actionCount: row.action_count,
      timestamp: row.internal_executed_at
    };
    
    // Detect event type based on populated fields
    if (row['details.defeated_beast.beast_id']) {
      return {
        ...base,
        type: 'BeastDefeated',
        data: {
          beastId: row['details.defeated_beast.beast_id'],
          beastName: BEAST_NAMES[row['details.defeated_beast.beast_id']],
          goldReward: row['details.defeated_beast.gold_reward'],
          xpReward: row['details.defeated_beast.xp_reward']
        }
      };
    }
    
    if (row['details.fled_beast.beast_id']) {
      return {
        ...base,
        type: 'FledBeast',
        data: {
          beastId: row['details.fled_beast.beast_id'],
          xpReward: row['details.fled_beast.xp_reward']
        }
      };
    }
    
    if (row['details.obstacle.obstacle_id']) {
      return {
        ...base,
        type: 'Obstacle',
        data: {
          obstacleId: row['details.obstacle.obstacle_id'],
          obstacleName: OBSTACLE_NAMES[row['details.obstacle.obstacle_id']],
          dodged: !!row['details.obstacle.dodged'],
          damage: row['details.obstacle.damage'],
          critical: !!row['details.obstacle.critical_hit']
        }
      };
    }
    
    if (row['details.discovery.discovery_type.Gold']) {
      return {
        ...base,
        type: 'Discovery',
        data: {
          type: 'Gold',
          amount: row['details.discovery.discovery_type.Gold'],
          xpReward: row['details.discovery.xp_reward']
        }
      };
    }
    
    if (row['details.discovery.discovery_type.Health']) {
      return {
        ...base,
        type: 'Discovery',
        data: {
          type: 'Health',
          amount: row['details.discovery.discovery_type.Health'],
          xpReward: row['details.discovery.xp_reward']
        }
      };
    }
    
    if (row['details.level_up.level']) {
      return {
        ...base,
        type: 'LevelUp',
        data: {
          newLevel: row['details.level_up.level']
        }
      };
    }
    
    if (row['details.attack.damage']) {
      return {
        ...base,
        type: 'Attack',
        data: {
          damage: row['details.attack.damage'],
          critical: !!row['details.attack.critical_hit']
        }
      };
    }
    
    if (row['details.beast_attack.damage']) {
      return {
        ...base,
        type: 'BeastAttack',
        data: {
          damage: row['details.beast_attack.damage'],
          critical: !!row['details.beast_attack.critical_hit']
        }
      };
    }
    
    return {
      ...base,
      type: 'Unknown',
      data: {}
    };
  }

  /**
   * Calculate combat preview
   */
  private calculateCombatPreview(adventurer: Adventurer, beast: Beast, bag: Item[]): CombatPreview {
    const utilsAdventurer = this.toUtilsAdventurer(adventurer);
    const utilsBag = this.toUtilsBag(bag);
    const utilsBeast = this.toUtilsBeast(beast);

    const combatStats = calculateCombatStats(utilsAdventurer, utilsBag, utilsBeast);
    const collectableEligible = (utilsBeast.isCollectable ?? false) && utilsBeast.seed !== 0n;
    const collectableTraits = collectableEligible
      ? getCollectableTraits(utilsBeast.seed)
      : { shiny: false, animated: false };

    const baseDamage = Math.max(1, Math.round(combatStats.baseDamage));
    const criticalDamage = Math.max(baseDamage, Math.round(combatStats.criticalDamage));
    const critChance = Math.min(100, Math.max(0, Math.round(combatStats.critChance ?? 0)));

    const armorSlots: Array<keyof UtilsEquipment> = ['head', 'chest', 'waist', 'hand', 'foot'];
    const beastBaseAttack = utilsBeast.level * (6 - Number(utilsBeast.tier));
    let totalBeastDamage = 0;
    let highestBeastDamage = BEAST_MIN_DAMAGE;

    for (const slot of armorSlots) {
      const armor = utilsAdventurer.equipment[slot];
      if (armor && armor.id !== 0) {
        const slotDamage = Math.max(
          BEAST_MIN_DAMAGE,
          Math.round(computeBeastDamage(utilsBeast, utilsAdventurer, armor).baseDamage)
        );
        totalBeastDamage += slotDamage;
        if (slotDamage > highestBeastDamage) {
          highestBeastDamage = slotDamage;
        }
      } else {
        const unarmoredDamage = Math.max(BEAST_MIN_DAMAGE, Math.floor(beastBaseAttack * 1.5));
        totalBeastDamage += unarmoredDamage;
        if (unarmoredDamage > highestBeastDamage) {
          highestBeastDamage = unarmoredDamage;
        }
      }
    }

    const averageBeastDamage = Math.max(
      BEAST_MIN_DAMAGE,
      Math.round(totalBeastDamage / armorSlots.length)
    );

    const averagePlayerDamage = Math.max(
      1,
      baseDamage + ((critChance / 100) * (criticalDamage - baseDamage))
    );

    const outcome = this.estimateCombatOutcome(
      adventurer,
      beast,
      averagePlayerDamage,
      averageBeastDamage
    );

    return {
      playerDamage: { base: baseDamage, critical: criticalDamage },
      beastDamage: { max: highestBeastDamage },
      fleeChance: this.calculateFleeChance(adventurer),
      ambushChance: this.calculateAmbushChance(adventurer),
      collectable: {
        shiny: collectableTraits.shiny,
        animated: collectableTraits.animated,
        eligible: collectableEligible,
      },
      outcome,
    };
  }

  private toUtilsItem(item: Item | null): UtilsItem {
    return item
      ? { id: item.id, xp: item.xp }
      : { id: 0, xp: 0 };
  }

  private toUtilsEquipment(equipment: Adventurer['equipment']): UtilsEquipment {
    return {
      weapon: this.toUtilsItem(equipment.weapon),
      chest: this.toUtilsItem(equipment.chest),
      head: this.toUtilsItem(equipment.head),
      waist: this.toUtilsItem(equipment.waist),
      foot: this.toUtilsItem(equipment.foot),
      hand: this.toUtilsItem(equipment.hand),
      neck: this.toUtilsItem(equipment.neck),
      ring: this.toUtilsItem(equipment.ring),
    };
  }

  private toUtilsAdventurer(adventurer: Adventurer): UtilsAdventurer {
    return {
      health: adventurer.health,
      xp: adventurer.xp,
      gold: adventurer.gold,
      beast_health: adventurer.beastHealth,
      stat_upgrades_available: adventurer.statUpgradesAvailable,
      stats: { ...adventurer.stats },
      equipment: this.toUtilsEquipment(adventurer.equipment),
      item_specials_seed: adventurer.itemSpecialsSeed,
      action_count: 0,
    };
  }

  private toUtilsBeast(beast: Beast): UtilsBeast {
    let seedValue = 0n;
    if (beast.seed) {
      try {
        seedValue = BigInt(beast.seed);
      } catch {
        seedValue = 0n;
      }
    }

    return {
      id: beast.id,
      seed: seedValue,
      baseName: beast.name,
      name: beast.name,
      health: beast.health,
      level: beast.level,
      type: beast.type,
      tier: beast.tier,
      specialPrefix: beast.prefix ?? null,
      specialSuffix: beast.suffix ?? null,
      isCollectable: beast.isCollectable ?? false,
    };
  }

  private toUtilsBag(bag: Item[]): UtilsItem[] {
    return bag.map((item) => ({ id: item.id, xp: item.xp }));
  }

  /**
   * Estimate combat outcome assuming alternating turns (adventurer first)
   */
  private estimateCombatOutcome(
    adventurer: Adventurer,
    beast: Beast,
    averagePlayerDamage: number,
    beastDamage: number
  ): string {
    const adventurerHealth = adventurer.health;
    const beastHealth = beast.health;

    const adjustedPlayerDamage = Math.max(1, averagePlayerDamage);
    const roundsToKillBeast = Math.max(1, Math.ceil(beastHealth / adjustedPlayerDamage));
    const roundsToKillAdventurer = beastDamage > 0 ? Math.ceil(adventurerHealth / beastDamage) : Infinity;

    if (roundsToKillBeast <= roundsToKillAdventurer) {
      const beastAttackRounds = Math.max(0, roundsToKillBeast - 1);
      const damageTaken = beastAttackRounds * beastDamage;

      if (damageTaken === 0) {
        return `Win in ${roundsToKillBeast} round${roundsToKillBeast === 1 ? '' : 's'}, no damage`;
      }

      return `Win in ${roundsToKillBeast} round${roundsToKillBeast === 1 ? '' : 's'}, take ${damageTaken} damage`;
    }

    return `Lose in ${roundsToKillAdventurer} round${roundsToKillAdventurer === 1 ? '' : 's'}`;
  }

  /**
   * Helper functions
   */
  
  private determinePhase(row: any): GamePhase {
    const adventurerHealth = row['details.adventurer.health'];
    const adventurerBeastHealth = row['details.adventurer.beast_health'];
    const statUpgrades = row['details.adventurer.stat_upgrades_available'];
    
    // Death: adventurer health is 0 or null
    if (!adventurerHealth || adventurerHealth <= 0) {
      return 'death';
    }
    
    // Combat: adventurer has a beast with health > 0
    if (adventurerBeastHealth && adventurerBeastHealth > 0) {
      return 'combat';
    }
    
    // Level up: adventurer has stat upgrades available (and not in combat)
    if (statUpgrades && statUpgrades > 0) {
      return 'level_up';
    }
    
    // Default: exploration (includes market access)
    return 'exploration';
  }
  
  private calculateFleeChance(adventurer: Adventurer): number {
    const dex = adventurer.stats.dexterity;
    const level = adventurer.level;
    return dex >= level ? 100 : Math.floor((dex / level) * 100);
  }
  
  private calculateAmbushChance(adventurer: Adventurer): number {
    const wis = adventurer.stats.wisdom;
    const level = adventurer.level;
    return wis >= level ? 0 : Math.floor(((level - wis) / level) * 100);
  }
  
  
  private calculatePrice(itemId: number, charisma: number): number {
    const tier = ItemUtils.getItemTier(itemId);
    const basePrice = ItemUtils.getItemBasePrice(tier);
    const discount = charisma;
    return Math.max(1, basePrice - discount);
  }
  
  private getItemName(id: number): string {
    const entry = Object.entries(ItemId).find(([_, value]) => value === id);
    return entry ? entry[0].replace(/([A-Z])/g, ' $1').trim() : `Item ${id}`;
  }
  
  private getItemTier(id: number): number {
    if (id <= 0) return 5;

    // Necklaces (ids 1-3) are Tier 1
    if (id >= 1 && id <= 3) return 1;

    // Silver Ring (id 4) is Tier 2
    if (id === 4) return 2;

    // Bronze Ring (id 5) is Tier 3
    if (id === 5) return 3;

    // Other rings (6-8) are Tier 1
    if (id >= 6 && id <= 8) return 1;

    // T1 items
    if ([9, 13, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77, 82, 87, 92, 97].includes(id)) return 1;

    // T2 items
    if ([10, 14, 18, 23, 28, 33, 38, 43, 48, 53, 58, 63, 68, 73, 78, 83, 88, 93, 98].includes(id)) return 2;

    // T3 items
    if ([11, 15, 19, 24, 29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79, 84, 89, 94, 99].includes(id)) return 3;

    // T4 items
    if ([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].includes(id)) return 4;
    
    // T5 items (default)
    return 5;
  }
  
  private getItemType(id: number): string {
    if (id <= 3) return 'Necklace';
    if (id >= 4 && id <= 8) return 'Ring';
    if ((id >= 9 && id <= 16) || (id >= 42 && id <= 46) || (id >= 72 && id <= 76)) {
      return this.getWeaponType(id);
    }
    if ((id >= 17 && id <= 41)) return 'Cloth';
    if ((id >= 47 && id <= 71)) return 'Hide';
    if ((id >= 77 && id <= 101)) return 'Metal';
    return 'None';
  }
  
  private getWeaponType(id: number): string {
    if (id >= 9 && id <= 16) return 'Magic';
    if (id >= 42 && id <= 46) return 'Blade';
    if (id >= 72 && id <= 76) return 'Bludgeon';
    return 'None';
  }
  
  private getItemSlot(id: number): string {
    if (id <= 3) return 'Neck';
    if (id >= 4 && id <= 8) return 'Ring';
    if ((id >= 9 && id <= 16) || (id >= 42 && id <= 46) || (id >= 72 && id <= 76)) return 'Weapon';
    if ((id >= 17 && id <= 21) || (id >= 47 && id <= 51) || (id >= 77 && id <= 81)) return 'Chest';
    if ((id >= 22 && id <= 26) || (id >= 52 && id <= 56) || (id >= 82 && id <= 86)) return 'Head';
    if ((id >= 27 && id <= 31) || (id >= 57 && id <= 61) || (id >= 87 && id <= 91)) return 'Waist';
    if ((id >= 32 && id <= 36) || (id >= 62 && id <= 66) || (id >= 92 && id <= 96)) return 'Foot';
    if ((id >= 37 && id <= 41) || (id >= 67 && id <= 71) || (id >= 97 && id <= 101)) return 'Hand';
    return 'None';
  }
  
  private getItemPrefix(id: number, seed: number): string | undefined {
    // Simplified - would need full calculation from ItemEntity
    const index = ((seed + id) % 69) + 1;
    return ITEM_NAME_PREFIXES[index];
  }
  
  private getItemSuffix(id: number, seed: number): string | undefined {
    // Simplified - would need full calculation from ItemEntity
    const index = ((seed + id) % 18) + 1;
    return ITEM_NAME_SUFFIXES[index];
  }
  
  private getBeastTier(id: number): number {
    if ((id >= 1 && id <= 5) || (id >= 26 && id <= 30) || (id >= 51 && id <= 55)) return 1;
    if ((id >= 6 && id <= 10) || (id >= 31 && id <= 35) || (id >= 56 && id <= 60)) return 2;
    if ((id >= 11 && id <= 15) || (id >= 36 && id <= 40) || (id >= 61 && id <= 65)) return 3;
    if ((id >= 16 && id <= 20) || (id >= 41 && id <= 45) || (id >= 66 && id <= 70)) return 4;
    return 5;
  }
  
  private getBeastType(id: number): string {
    if (id >= 1 && id <= 25) return 'Magic';
    if (id >= 26 && id <= 50) return 'Blade';
    if (id >= 51 && id <= 75) return 'Bludgeon';
    return 'None';
  }
  
  private getBeastArmorType(id: number): string {
    if (id >= 1 && id <= 25) return 'Cloth';
    if (id >= 26 && id <= 50) return 'Hide';
    if (id >= 51 && id <= 75) return 'Metal';
    return 'None';
  }
  
  /**
   * Get armor type for elemental calculations (matches ItemEntity logic)
   */
  // Item type classification helpers (from ItemEntity)
  private parseHexId(hexId: string): number {
    if (!hexId) return 0;
    const cleanHex = hexId.startsWith('0x') ? hexId.slice(2) : hexId;
    return parseInt(cleanHex, 16);
  }
  
  private async sql<T>(query: string): Promise<T> {
    const url = `${this.config.toriiUrl}/sql?query=${encodeURIComponent(query.trim())}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }
    
    return response.json() as any;
  }
}

// Type definitions
export type GamePhase = 'exploration' | 'combat' | 'level_up' | 'death';

export interface GameState {
  gameId: number;
  actionCount: number;
  phase: GamePhase;
  adventurer: Adventurer;
  beast: Beast | null;
  bag: Item[];
  market: MarketItem[];
  combatPreview?: CombatPreview;
}

export interface Adventurer {
  id: number;
  health: number;
  xp: number;
  level: number;
  gold: number;
  beastHealth: number;
  statUpgradesAvailable: number;
  itemSpecialsSeed: number;
  stats: {
    strength: number;
    dexterity: number;
    vitality: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    luck: number;
  };
  equipment: {
    weapon: Item | null;
    chest: Item | null;
    head: Item | null;
    waist: Item | null;
    foot: Item | null;
    hand: Item | null;
    neck: Item | null;
    ring: Item | null;
  };
}

export interface Item {
  id: number;
  xp: number;
  level: number;
  name: string;
  tier: number;
  type: string;
  slot: string;
  prefix?: string;
  suffix?: string;
  bagSlot?: number;
}

export interface Beast {
  id: number;
  health: number;
  level: number;
  seed: string;
  name: string;
  tier: number;
  type: string;
  armorType: string;
  prefix?: string;
  suffix?: string;
  isCollectable?: boolean;
}

export interface MarketItem {
  id: number;
  name: string;
  tier: number;
  type: string;
  slot: string;
  price: number;
}

export interface CombatPreview {
  playerDamage: {
    base: number;
    critical: number;
  };
  beastDamage: {
    max: number;
  };
  fleeChance: number;
  ambushChance: number;
  collectable: {
    shiny: boolean;
    animated: boolean;
    eligible: boolean;
  } | null;
  outcome: string;
}

export interface GameEvent {
  id: string;
  actionCount: number;
  timestamp: string;
  type: string;
  data: any;
}

export interface LeaderboardEntry {
  rank: number;
  adventurerId: number;
  xp: number;
  level: number;
}

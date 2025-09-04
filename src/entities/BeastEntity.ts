/**
 * Beast Entity
 * Handles all beast-related operations
 */

import { Entity } from "../core/Entity";
import type { IndexerClient } from "../indexer/IndexerClient";
import type { RawBeast, FormattedBeast } from "../types/game";
import { BEAST_NAMES, BEAST_NAME_PREFIXES, BEAST_NAME_SUFFIXES, BEAST_SPECIAL_NAME_LEVEL_UNLOCK, GOLD_MULTIPLIER, GOLD_REWARD_DIVISOR, MINIMUM_XP_REWARD } from "../constants/beast";

export class BeastEntity extends Entity<RawBeast, FormattedBeast> {
  
  async fetch(beastId: number | string | bigint): Promise<this> {
    const id = Number(beastId);
    const data = await this.indexer.getBeast(id);
    
    if (!data) {
      throw new Error(`Beast ${id} not found`);
    }
    
    this.raw = {
      id: data.id,
      seed: BigInt(data.seed || 0),
      health: data.health,
      level: data.level,
      special2: data.special2 || 0,
      special3: data.special3 || 0
    };
    
    return this;
  }
  
  /**
   * Create from raw data
   */
  fromRaw(raw: RawBeast): this {
    this.raw = raw;
    return this;
  }
  
  getLevel(): number {
    this.ensureLoaded();
    return this.raw!.level;
  }
  
  getHealth(): number {
    this.ensureLoaded();
    return this.raw!.health;
  }
  
  getName(): string {
    this.ensureLoaded();
    return this.cache('name', () => {
      const baseName = BEAST_NAMES[this.raw!.id] || `Beast ${this.raw!.id}`;
      const level = this.getLevel();
      
      if (level < BEAST_SPECIAL_NAME_LEVEL_UNLOCK) {
        return baseName;
      }
      
      const prefix = BEAST_NAME_PREFIXES[this.raw!.special2];
      const suffix = BEAST_NAME_SUFFIXES[this.raw!.special3];
      
      if (prefix && suffix) {
        return `"${prefix} ${suffix}" ${baseName}`;
      } else if (prefix) {
        return `"${prefix}" ${baseName}`;
      } else if (suffix) {
        return `"${suffix}" ${baseName}`;
      }
      
      return baseName;
    });
  }
  
  getTier(): number {
    this.ensureLoaded();
    return this.cache('tier', () => {
      const id = this.raw!.id;
      
      if (this.isT1(id)) return 1;
      if (this.isT2(id)) return 2;
      if (this.isT3(id)) return 3;
      if (this.isT4(id)) return 4;
      return 5;
    });
  }
  
  getType(): string {
    this.ensureLoaded();
    return this.cache('type', () => {
      const id = this.raw!.id;
      
      if (id >= 1 && id <= 25) return 'Magic';
      if (id >= 26 && id <= 50) return 'Hunter';
      if (id >= 51 && id <= 75) return 'Brute';
      return 'None';
    });
  }
  
  getArmorType(): string {
    this.ensureLoaded();
    return this.cache('armorType', () => {
      const id = this.raw!.id;
      
      if (id >= 1 && id <= 25) return 'Cloth';
      if (id >= 26 && id <= 50) return 'Hide';
      if (id >= 51 && id <= 75) return 'Metal';
      return 'None';
    });
  }
  
  getSpecials(): { prefix: string | null; suffix: string | null } {
    this.ensureLoaded();
    return this.cache('specials', () => {
      const level = this.getLevel();
      
      if (level < BEAST_SPECIAL_NAME_LEVEL_UNLOCK) {
        return { prefix: null, suffix: null };
      }
      
      return {
        prefix: BEAST_NAME_PREFIXES[this.raw!.special2] || null,
        suffix: BEAST_NAME_SUFFIXES[this.raw!.special3] || null
      };
    });
  }
  
  calculateRewards(): { gold: number; xp: number } {
    this.ensureLoaded();
    return this.cache('rewards', () => {
      const tier = this.getTier();
      const level = this.getLevel();
      
      const goldMultiplier = GOLD_MULTIPLIER[`T${tier}` as keyof typeof GOLD_MULTIPLIER] || 1;
      const gold = Math.floor(level * goldMultiplier / GOLD_REWARD_DIVISOR);
      
      const xp = Math.max(MINIMUM_XP_REWARD, level * 2);
      
      return { gold, xp };
    });
  }
  
  isCollectable(): boolean {
    this.ensureLoaded();
    return this.cache('collectable', () => {
      const tier = this.getTier();
      const level = this.getLevel();
      return tier <= 3 && level >= 19; // T1-T3 beasts at level 19+ are collectable
    });
  }
  
  // Helper methods for tier checking
  private isT1(id: number): boolean {
    return (id >= 1 && id <= 5) || (id >= 26 && id <= 30) || (id >= 51 && id <= 55);
  }
  
  private isT2(id: number): boolean {
    return (id >= 6 && id <= 10) || (id >= 31 && id <= 35) || (id >= 56 && id <= 60);
  }
  
  private isT3(id: number): boolean {
    return (id >= 11 && id <= 15) || (id >= 36 && id <= 40) || (id >= 61 && id <= 65);
  }
  
  private isT4(id: number): boolean {
    return (id >= 16 && id <= 20) || (id >= 41 && id <= 45) || (id >= 66 && id <= 70);
  }
  
  format(): FormattedBeast {
    this.ensureLoaded();
    const rewards = this.calculateRewards();
    const specials = this.getSpecials();
    
    return {
      id: this.raw!.id,
      name: this.getName(),
      level: this.getLevel(),
      tier: this.getTier(),
      health: this.getHealth(),
      type: this.getType(),
      armorType: this.getArmorType(),
      specials,
      rewards
    };
  }
}
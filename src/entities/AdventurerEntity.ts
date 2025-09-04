/**
 * Adventurer Entity
 * Core entity for player character management
 */

import { Entity } from "../core/Entity";
import type { IndexerClient } from "../indexer/IndexerClient";
import type { RawAdventurer, FormattedAdventurer, RawEquipment, CombatStats, FormattedEquipment } from "../types/game";
import { ItemEntity } from "./ItemEntity";
import { BeastEntity } from "./BeastEntity";
import { 
  calculateLevel, 
  calculateNextLevelXP, 
  calculateProgress, 
  elementalAdjustedDamage,
  MIN_DAMAGE,
  strength_dmg,
  critical_hit_bonus,
  calculateFleeChance,
  calculateAmbushChance
} from "../utils/game";

export class AdventurerEntity extends Entity<RawAdventurer, FormattedAdventurer> {
  private equipment: Map<string, ItemEntity> = new Map();
  private equipmentLoaded = false;
  
  async fetch(gameId: number | string | bigint): Promise<this> {
    const id = Number(gameId);
    const data = await this.indexer.getAdventurer(id);
    
    if (!data) {
      throw new Error(`Adventurer for game ${id} not found`);
    }
    
    this.raw = {
      id: data.adventurer_id || data.id,
      game_id: id,
      health: data.health,
      xp: data.xp,
      gold: data.gold,
      beast_health: data.beast_health || 0,
      stat_upgrades_available: data.stat_upgrades_available || 0,
      stats: {
        strength: data.strength || 0,
        dexterity: data.dexterity || 0,
        vitality: data.vitality || 0,
        intelligence: data.intelligence || 0,
        wisdom: data.wisdom || 0,
        charisma: data.charisma || 0,
        luck: data.luck || 0
      },
      equipment: {
        weapon: { id: data.weapon_id || 0, xp: data.weapon_xp || 0 },
        chest: { id: data.chest_id || 0, xp: data.chest_xp || 0 },
        head: { id: data.head_id || 0, xp: data.head_xp || 0 },
        waist: { id: data.waist_id || 0, xp: data.waist_xp || 0 },
        foot: { id: data.foot_id || 0, xp: data.foot_xp || 0 },
        hand: { id: data.hand_id || 0, xp: data.hand_xp || 0 },
        neck: { id: data.neck_id || 0, xp: data.neck_xp || 0 },
        ring: { id: data.ring_id || 0, xp: data.ring_xp || 0 }
      },
      item_specials_seed: data.item_specials_seed || 0,
      action_count: data.action_count || 0
    };
    
    return this;
  }
  
  /**
   * Load equipment entities
   */
  async withEquipment(): Promise<this> {
    this.ensureLoaded();
    
    for (const [slot, item] of Object.entries(this.raw!.equipment)) {
      if (item.id && item.id !== 0) {
        const itemEntity = new ItemEntity(this.indexer)
          .fromRaw(item)
          .withSpecials(this.raw!.item_specials_seed);
        this.equipment.set(slot, itemEntity);
      }
    }
    
    this.equipmentLoaded = true;
    return this;
  }
  
  /**
   * Get level
   */
  getLevel(): number {
    this.ensureLoaded();
    return this.cache('level', () => calculateLevel(this.raw!.xp));
  }
  
  /**
   * Get XP progress to next level
   */
  getProgress(): number {
    this.ensureLoaded();
    return this.cache('progress', () => calculateProgress(this.raw!.xp));
  }
  
  /**
   * Get next level XP requirement
   */
  getNextLevelXP(): number {
    return calculateNextLevelXP(this.getLevel());
  }
  
  /**
   * Get specific equipped item
   */
  getEquippedItem(slot: string): ItemEntity | null {
    if (!this.equipmentLoaded) {
      throw new Error('Equipment not loaded. Call withEquipment() first');
    }
    return this.equipment.get(slot) || null;
  }
  
  /**
   * Get weapon
   */
  getWeapon(): ItemEntity | null {
    return this.getEquippedItem('weapon');
  }
  
  /**
   * Get ring (for special bonuses)
   */
  getRing(): ItemEntity | null {
    return this.getEquippedItem('ring');
  }
  
  /**
   * Calculate combat stats
   */
  getCombatStats(): CombatStats {
    return this.cache('combatStats', () => {
      const weapon = this.getWeapon();
      const stats = this.raw!.stats;
      
      // Base attack from weapon
      let attack = MIN_DAMAGE;
      let baseAttack = MIN_DAMAGE;
      if (weapon) {
        const weaponLevel = weapon.getLevel();
        const weaponTier = weapon.getTier();
        baseAttack = weaponLevel * (6 - weaponTier);
        attack = baseAttack;
      }
      
      // Add strength bonus (client uses floor((base * strength * 10) / 100) when no beast)
      const strengthBonus = Math.floor((attack * stats.strength * 10) / 100);
      attack += strengthBonus;
      
      // Calculate defense from armor
      let defense = 0;
      for (const [slot, item] of this.equipment) {
        if (slot !== 'weapon' && slot !== 'ring' && slot !== 'neck') {
          const itemLevel = item.getLevel();
          const itemTier = item.getTier();
          defense += itemLevel * (6 - itemTier);
        }
      }
      
      // Crit chance matches client: direct luck value (0-100 scale)
      const critChance = stats.luck;
      
      // Critical damage (no beast): (baseAttack * 2) + strengthBonus
      const critDamage = (baseAttack * 2) + strengthBonus;
      
      return {
        attack,
        defense,
        critChance,
        critDamage,
        weaponDamage: attack,
        armorProtection: defense
      };
    });
  }
  
  /**
   * Calculate damage against a specific beast
   */
  calculateDamageVsBeast(beast: BeastEntity): DamageCalculation {
    this.ensureLoaded();
    const weapon = this.getWeapon();
    
    if (!weapon) {
      return {
        baseDamage: MIN_DAMAGE,
        criticalDamage: MIN_DAMAGE * 2,
        elementalBonus: 0,
        strengthBonus: 0,
        specialBonus: 0,
        total: MIN_DAMAGE
      };
    }
    
    const weaponLevel = weapon.getLevel();
    const weaponTier = weapon.getTier();
    const baseAttack = weaponLevel * (6 - weaponTier);
    
    // Elemental damage
    const weaponType = weapon.getType();
    const beastArmorType = beast.getArmorType();
    const elementalDamage = elementalAdjustedDamage(baseAttack, weaponType, beastArmorType);
    const elementalBonus = elementalDamage - baseAttack;
    
    // Strength bonus (client uses * 10 / 100)
    const stats = this.raw!.stats;
    const strengthBonus = stats.strength > 0 ? Math.floor((elementalDamage * stats.strength * 10) / 100) : 0;
    
    // Special bonus (matching prefixes/suffixes)
    let specialBonus = 0;
    const weaponSpecials = weapon.format().specials;
    const beastSpecials = beast.getSpecials();
    
    if (weaponSpecials && beastSpecials) {
      // Prefix match gives 8x damage
      if (weaponSpecials.prefix && weaponSpecials.prefix === beastSpecials.prefix) {
        specialBonus += elementalDamage * 8;
      }
      // Suffix match gives 2x damage
      if (weaponSpecials.suffix && weaponSpecials.suffix === beastSpecials.suffix) {
        specialBonus += elementalDamage * 2;
      }
    }
    
    // Ring bonuses
    const ring = this.getRing();
    if (ring) {
      const ringName = ring.getName();
      const ringLevel = ring.getLevel();
      
      // Platinum Ring: 3% bonus per level on special matches
      if (ringName.includes("Platinum Ring") && specialBonus > 0) {
        specialBonus += Math.floor(specialBonus * 3 * ringLevel / 100);
      }
      
      // Titanium Ring: 3% bonus per level on critical hits
      // (handled in critical damage calculation)
    }
    
    // Calculate beast armor value
    const beastLevel = beast.getLevel();
    const beastTier = beast.getTier();
    const beastArmorValue = beastLevel * (6 - beastTier);
    
    // Final damage calculations
    const baseDamage = Math.max(MIN_DAMAGE, (elementalDamage + strengthBonus + specialBonus) - beastArmorValue);
    
    // Critical damage
    let critBonus = elementalDamage;
    if (ring && ring.getName().includes("Titanium Ring")) {
      const ringLevel = ring.getLevel();
      critBonus += Math.floor(elementalDamage * 3 * ringLevel / 100);
    }
    const criticalDamage = Math.max(MIN_DAMAGE, (elementalDamage + strengthBonus + specialBonus + critBonus) - beastArmorValue);
    
    return {
      baseDamage,
      criticalDamage,
      elementalBonus,
      strengthBonus,
      specialBonus,
      total: baseDamage
    };
  }
  
  /**
   * Check if adventurer is alive
   */
  isAlive(): boolean {
    this.ensureLoaded();
    return this.raw!.health > 0;
  }
  
  /**
   * Check if adventurer is in battle
   */
  isInBattle(): boolean {
    this.ensureLoaded();
    return this.raw!.beast_health > 0;
  }
  
  /**
   * Format equipment for response
   */
  private formatEquipment(): FormattedEquipment {
    const formatted: FormattedEquipment = {};
    
    for (const [slot, item] of this.equipment) {
      formatted[slot as keyof FormattedEquipment] = item.format();
    }
    
    return formatted;
  }
  
  format(): FormattedAdventurer {
    this.ensureLoaded();
    
    return {
      id: this.raw!.id,
      gameId: this.raw!.game_id,
      level: this.getLevel(),
      health: this.raw!.health,
      xp: this.raw!.xp,
      gold: this.raw!.gold,
      stats: this.raw!.stats,
      equipment: this.equipmentLoaded ? this.formatEquipment() : {},
      combatStats: this.equipmentLoaded ? this.getCombatStats() : undefined,
      statUpgradesAvailable: this.raw!.stat_upgrades_available,
      actionCount: this.raw!.action_count
    };
  }
}

interface DamageCalculation {
  baseDamage: number;
  criticalDamage: number;
  elementalBonus: number;
  strengthBonus: number;
  specialBonus: number;
  total: number;
}
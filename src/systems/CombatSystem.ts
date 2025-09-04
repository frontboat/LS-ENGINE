/**
 * Combat System
 * Handles combat simulation and damage calculations
 */

import { AdventurerEntity } from "../entities/AdventurerEntity";
import { BeastEntity } from "../entities/BeastEntity";
import type { CombatResult, DamageCalculation } from "../types/game";
import { elementalAdjustedDamage } from "../utils/game";
import { ItemEntity } from "../entities/ItemEntity";
import { BEAST_MIN_DAMAGE } from "../constants/beast";

export class CombatSystem {
  constructor(
    private adventurer: AdventurerEntity,
    private beast: BeastEntity
  ) {}
  
  /**
   * Simulate a combat encounter
   */
  async simulate(): Promise<CombatResult> {
    // Ensure entities are loaded
    if (!this.adventurer.isLoaded()) {
      throw new Error('Adventurer must be loaded before combat');
    }
    if (!this.beast.isLoaded()) {
      throw new Error('Beast must be loaded before combat');
    }
    
    // Calculate damage
    const damage = this.adventurer.calculateDamageVsBeast(this.beast);
    
    // Determine if hit is critical
    const combatStats = this.adventurer.getCombatStats();
    const isCritical = Math.random() * 100 < combatStats.critChance;
    const finalDamage = isCritical ? damage.criticalDamage : damage.baseDamage;
    
    // Calculate remaining health
    const beastHealth = this.beast.getHealth();
    const remainingHealth = Math.max(0, beastHealth - finalDamage);
    
    // Determine outcome
    const outcome = remainingHealth === 0 ? 'victory' : 'ongoing';
    
    return {
      damage: {
        ...damage,
        total: finalDamage
      },
      defenderHealth: remainingHealth,
      outcome,
      rewards: outcome === 'victory' ? this.beast.calculateRewards() : undefined
    };
  }
  
  /**
   * Calculate flee chance based on dexterity
   */
  calculateFleeChance(): number {
    const adventurerLevel = this.adventurer.getLevel();
    const dexterity = this.adventurer.getRaw()?.stats.dexterity || 0;
    
    if (dexterity >= adventurerLevel) {
      return 100;
    }
    
    return (dexterity / adventurerLevel) * 100;
  }
  
  /**
   * Calculate ambush chance (beast attacks first)
   */
  calculateAmbushChance(): number {
    const adventurerLevel = this.adventurer.getLevel();
    const wisdom = this.adventurer.getRaw()?.stats.wisdom || 0;
    
    // Higher wisdom reduces ambush chance
    if (wisdom >= adventurerLevel) {
      return 0;
    }
    
    return ((adventurerLevel - wisdom) / adventurerLevel) * 100;
  }
  
  /**
   * Calculate beast's damage to adventurer
   */
  calculateBeastDamage(): number {
    const beastLevel = this.beast.getLevel();
    const beastTier = this.beast.getTier();
    const maxDamage = beastLevel * (6 - beastTier) * 1.5;

    // Sum defense across armor slots using client logic
    let totalDefense = 0;

    const armorSlots: Array<keyof ReturnType<AdventurerEntity['getEquippedItem']> | string> = ['head', 'chest', 'waist', 'hand', 'foot'];

    for (const slot of armorSlots) {
      const armor = this.adventurer.getEquippedItem(String(slot));
      if (!armor) continue;
      const damageAgainstArmor = this.calculateBeastDamageAgainstArmor(armor);
      const armorDefense = Math.max(0, maxDamage - damageAgainstArmor);
      totalDefense += armorDefense;
    }

    const reduced = Math.max(BEAST_MIN_DAMAGE, Math.floor(maxDamage - totalDefense));
    return reduced;
  }
  
  /**
   * Simulate full combat round
   */
  async simulateRound(): Promise<CombatRound> {
    const adventurerAttack = await this.simulate();
    
    let beastAttack = null;
    if (adventurerAttack.outcome === 'ongoing') {
      const beastDamage = this.calculateBeastDamage();
      const adventurerHealth = this.adventurer.getRaw()?.health || 0;
      const remainingHealth = Math.max(0, adventurerHealth - beastDamage);
      
      beastAttack = {
        damage: beastDamage,
        remainingHealth,
        outcome: remainingHealth === 0 ? 'defeat' : 'ongoing'
      };
    }
    
    return {
      adventurerAttack,
      beastAttack,
      roundOutcome: this.determineRoundOutcome(adventurerAttack, beastAttack)
    };
  }
  
  private determineRoundOutcome(
    adventurerAttack: CombatResult,
    beastAttack: { damage: number; remainingHealth: number; outcome: string } | null
  ): 'victory' | 'defeat' | 'ongoing' {
    if (adventurerAttack.outcome === 'victory') return 'victory';
    if (beastAttack?.outcome === 'defeat') return 'defeat';
    return 'ongoing';
  }

  /**
   * Calculate beast damage against a single armor item (client parity)
   */
  private calculateBeastDamageAgainstArmor(armor: ItemEntity): number {
    const beastLevel = this.beast.getLevel();
    const beastTier = this.beast.getTier();
    let damage = beastLevel * (6 - beastTier);

    // Apply elemental adjustment (beast attack type vs armor type)
    const beastAttackType = this.getBeastAttackType();
    const armorType = armor.getType();
    damage = elementalAdjustedDamage(damage, beastAttackType, armorType);

    // Apply name match bonus (item specials vs beast specials)
    const beastSpecials = this.beast.getSpecials();
    const itemSpecials = armor.format().specials;
    if (itemSpecials && (beastSpecials.prefix || beastSpecials.suffix)) {
      if (itemSpecials.suffix && beastSpecials.suffix && itemSpecials.suffix === beastSpecials.suffix) {
        damage *= 2; // Suffix match
      }
      if (itemSpecials.prefix && beastSpecials.prefix && itemSpecials.prefix === beastSpecials.prefix) {
        damage *= 8; // Prefix match
      }
    }

    // Subtract armor value
    const armorLevel = armor.getLevel();
    const armorValue = armorLevel * (6 - armor.getTier());
    damage = Math.max(BEAST_MIN_DAMAGE, damage - armorValue);

    // Neck reduction bonus
    const neck = this.adventurer.getEquippedItem('neck');
    if (neck && this.neckReductionApplies(armor.getType(), neck.getName())) {
      const neckLevel = neck.getLevel();
      damage -= Math.floor((armorLevel * (6 - armor.getTier()) * neckLevel * 3) / 100);
    }

    return Math.max(BEAST_MIN_DAMAGE, damage);
  }

  private neckReductionApplies(armorType: string, neckName: string): boolean {
    if (!armorType || !neckName) return false;
    if (armorType === 'Cloth' && neckName.includes('Amulet')) return true;
    if (armorType === 'Hide' && neckName.includes('Pendant')) return true;
    if (armorType === 'Metal' && neckName.includes('Necklace')) return true;
    return false;
  }

  private getBeastAttackType(): string {
    const id = this.beast.getRaw()?.id || 0;
    if (id >= 1 && id <= 25) return 'Magic';
    if (id >= 26 && id <= 50) return 'Blade';
    if (id >= 51 && id <= 75) return 'Bludgeon';
    return 'None';
  }
}

interface CombatRound {
  adventurerAttack: CombatResult;
  beastAttack: {
    damage: number;
    remainingHealth: number;
    outcome: string;
  } | null;
  roundOutcome: 'victory' | 'defeat' | 'ongoing';
}
/**
 * Combat System
 * Handles combat simulation and damage calculations
 */

import { AdventurerEntity } from "../entities/AdventurerEntity";
import { BeastEntity } from "../entities/BeastEntity";
import type { CombatResult, DamageCalculation } from "../types/game";

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
    const baseDamage = Math.max(2, beastLevel * (6 - beastTier)); // Min 2 damage
    
    // Get adventurer's defense
    const combatStats = this.adventurer.getCombatStats();
    const defense = combatStats.defense;
    
    // Apply armor reduction
    const damage = Math.max(2, baseDamage - defense);
    
    // Check for critical hit (beasts have base 10% crit chance)
    const isCritical = Math.random() < 0.1;
    
    return isCritical ? damage * 2 : damage;
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
    beastAttack: { outcome: string } | null
  ): 'victory' | 'defeat' | 'ongoing' {
    if (adventurerAttack.outcome === 'victory') return 'victory';
    if (beastAttack?.outcome === 'defeat') return 'defeat';
    return 'ongoing';
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
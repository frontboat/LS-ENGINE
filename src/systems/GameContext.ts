/**
 * Game Context System
 * High-level orchestration of game entities and systems
 */

import { IndexerClient } from "../indexer/IndexerClient";
import { AdventurerEntity } from "../entities/AdventurerEntity";
import { BeastEntity } from "../entities/BeastEntity";
import { ItemEntity } from "../entities/ItemEntity";
import { CombatSystem } from "./CombatSystem";

export class GameContext {
  constructor(private indexer: IndexerClient) {}
  
  /**
   * Get full game context for a specific game
   */
  async getGameContext(gameId: number) {
    // Fetch all related data in parallel
    const [adventurerData, events, marketItems] = await Promise.all([
      this.indexer.getAdventurer(gameId),
      this.indexer.getGameEvents(gameId),
      this.indexer.getMarketItems(gameId)
    ]);
    
    if (!adventurerData) {
      throw new Error(`Game ${gameId} not found`);
    }
    
    // Create and load adventurer entity
    const adventurer = new AdventurerEntity(this.indexer);
    await adventurer.fetch(gameId);
    await adventurer.withEquipment();
    
    // Get current beast if in battle
    let currentBeast = null;
    if (adventurer.isInBattle()) {
      // Find current beast from events or state
      const beastId = this.extractCurrentBeastId(events);
      if (beastId) {
        currentBeast = new BeastEntity(this.indexer);
        await currentBeast.fetch(beastId);
      }
    }
    
    // Process market items
    const market = await this.processMarketItems(marketItems, adventurer);
    
    return {
      game: {
        id: gameId,
        status: this.getGameStatus(adventurer),
        actionCount: adventurer.getRaw()?.action_count || 0
      },
      adventurer: adventurer.format(),
      currentBeast: currentBeast?.format() || null,
      market,
      recentEvents: this.processEvents(events.slice(0, 10))
    };
  }
  
  /**
   * Get adventurer with full combat readiness
   */
  async getAdventurerCombatReady(gameId: number) {
    const adventurer = new AdventurerEntity(this.indexer);
    await adventurer.fetch(gameId);
    await adventurer.withEquipment();
    
    const combatStats = adventurer.getCombatStats();
    const weapon = adventurer.getWeapon();
    
    return {
      adventurer: adventurer.format(),
      combatStats,
      weapon: weapon?.format() || null,
      isInBattle: adventurer.isInBattle(),
      canFight: adventurer.isAlive() && weapon !== null
    };
  }
  
  /**
   * Simulate combat between adventurer and beast
   */
  async simulateCombat(gameId: number, beastId: number) {
    // Load entities
    const adventurer = new AdventurerEntity(this.indexer);
    await adventurer.fetch(gameId);
    await adventurer.withEquipment();
    
    const beast = new BeastEntity(this.indexer);
    await beast.fetch(beastId);
    
    // Create combat system
    const combat = new CombatSystem(adventurer, beast);
    
    // Simulate round
    const result = await combat.simulateRound();
    
    return {
      ...result,
      adventurer: adventurer.format(),
      beast: beast.format(),
      fleeChance: combat.calculateFleeChance(),
      ambushChance: combat.calculateAmbushChance()
    };
  }
  
  /**
   * Get market analysis for an adventurer
   */
  async getMarketAnalysis(gameId: number) {
    const [adventurer, marketItems] = await Promise.all([
      this.getAdventurerCombatReady(gameId),
      this.indexer.getMarketItems(gameId)
    ]);
    
    const charisma = adventurer.adventurer.stats.charisma;
    const gold = adventurer.adventurer.gold;
    
    const analysis = marketItems.map((item: any) => {
      const itemEntity = new ItemEntity(this.indexer).fromRaw({
        id: item.item_id,
        xp: 0
      });
      
      const price = itemEntity.getPrice(charisma);
      const canAfford = gold >= price;
      const tier = itemEntity.getTier();
      const type = itemEntity.getType();
      const slot = itemEntity.getSlot();
      
      // Compare with currently equipped item
      const currentItem = adventurer.adventurer.equipment[slot as keyof typeof adventurer.adventurer.equipment];
      const isUpgrade = !currentItem || (currentItem && tier < currentItem.tier);
      
      return {
        ...itemEntity.format(),
        price,
        canAfford,
        isUpgrade,
        slot,
        recommendation: this.getItemRecommendation(itemEntity, adventurer.adventurer)
      };
    });
    
    return {
      gold,
      charisma,
      marketItems: analysis,
      recommendations: analysis
        .filter(item => item.canAfford && item.isUpgrade)
        .sort((a, b) => b.recommendation.score - a.recommendation.score)
        .slice(0, 3)
    };
  }
  
  /**
   * Get leaderboard with context
   */
  async getLeaderboard(limit: number = 10) {
    const leaderboardData = await this.indexer.getLeaderboard(limit);
    
    const leaderboard = await Promise.all(
      leaderboardData.map(async (entry: any) => {
        const adventurer = new AdventurerEntity(this.indexer);
        adventurer.fromRaw(entry);
        await adventurer.withEquipment();
        
        return {
          rank: 0, // Will be set after sorting
          ...adventurer.format(),
          deathCause: this.extractDeathCause(entry)
        };
      })
    );
    
    // Sort by XP and add ranks
    leaderboard.sort((a, b) => b.xp - a.xp);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return leaderboard;
  }
  
  // Helper methods
  
  private getGameStatus(adventurer: AdventurerEntity): string {
    if (!adventurer.isAlive()) return 'dead';
    if (adventurer.isInBattle()) return 'in_battle';
    return 'exploring';
  }
  
  private extractCurrentBeastId(events: any[]): number | null {
    // Look for most recent beast encounter event
    const beastEvent = events.find(e => e.event_type === 'BeastEncounter');
    return beastEvent?.beast_id || null;
  }
  
  private processMarketItems(marketItems: any[], adventurer: AdventurerEntity) {
    const charisma = adventurer.getRaw()?.stats.charisma || 0;
    
    return marketItems.map((item: any) => {
      const itemEntity = new ItemEntity(this.indexer).fromRaw({
        id: item.item_id,
        xp: 0
      });
      
      return {
        ...itemEntity.format(),
        price: itemEntity.getPrice(charisma),
        slot: item.slot
      };
    });
  }
  
  private processEvents(events: any[]) {
    return events.map(event => ({
      id: event.event_id,
      type: event.event_type,
      timestamp: event.timestamp,
      data: event.data
    }));
  }
  
  private getItemRecommendation(item: ItemEntity, adventurer: any) {
    let score = 0;
    const reasons: string[] = [];
    
    // Tier score (lower is better)
    score += (6 - item.getTier()) * 10;
    
    // Type matching score
    const type = item.getType();
    if (type === 'Blade' && adventurer.stats.strength > adventurer.stats.intelligence) {
      score += 5;
      reasons.push('Matches high strength');
    }
    if (type === 'Magic' && adventurer.stats.intelligence > adventurer.stats.strength) {
      score += 5;
      reasons.push('Matches high intelligence');
    }
    
    // Slot priority (weapon > armor)
    if (item.getSlot() === 'Weapon') {
      score += 15;
      reasons.push('Weapon upgrade');
    }
    
    return { score, reasons };
  }
  
  private extractDeathCause(adventurerData: any): string {
    // This would be extracted from events or death record
    if (adventurerData.killed_by_beast) {
      return `Killed by ${adventurerData.killed_by_beast}`;
    }
    if (adventurerData.killed_by_obstacle) {
      return `Killed by ${adventurerData.killed_by_obstacle}`;
    }
    return 'Unknown';
  }
}
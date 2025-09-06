/**
 * Game Context System
 * High-level orchestration of game entities and systems
 */

import { IndexerClient } from "../indexer/IndexerClient";
import { AdventurerEntity } from "../entities/AdventurerEntity";
import { BeastEntity } from "../entities/BeastEntity";
import { ItemEntity } from "../entities/ItemEntity";
import { CombatSystem } from "./CombatSystem";
import { BEAST_NAMES } from "../constants/beast";
import { elementalAdjustedDamage } from "../utils/game";
import { BEAST_MIN_DAMAGE } from "../constants/beast";
import { SimpleContextEngine } from "../context";

export class GameContext {
  private contextEngine: SimpleContextEngine;

  constructor(private indexer: IndexerClient) {
    this.contextEngine = new SimpleContextEngine();
  }
  
  /**
   * Get LLM-ready context for intent prediction
   */
  async getLLMContext(gameId: number) {
    const gameContext = await this.getGameContext(gameId);
    const result = this.contextEngine.build(gameContext);
    return result.content;
  }
  
  /**
   * Get full game context for a specific game
   */
  async getGameContext(gameId: number) {
    // Fetch all related data in parallel
    const [adventurerData, events, marketItems, packed, bagPacked] = await Promise.all([
      this.indexer.getAdventurer(gameId),
      this.indexer.getGameEvents(gameId),
      this.indexer.getMarketItems(gameId),
      this.indexer.getAdventurerPacked(gameId),
      this.indexer.getBagPacked(gameId)
    ]);
    
    if (!adventurerData) {
      throw new Error(`Game ${gameId} not found`);
    }
    
    // Create and load adventurer entity
    const adventurer = new AdventurerEntity(this.indexer);
    await adventurer.fetch(gameId);
    await adventurer.withEquipment();
    
    // Get current beast if in battle (prefer Torii event data)
    let currentBeast = null;
    let damagePreview = null as any;
    if (adventurer.isInBattle()) {
      const beastRow = await this.indexer.getCurrentBeastForAdventurer(gameId);
      if (beastRow && beastRow.beast_id) {
        const beast = new BeastEntity(this.indexer).fromRaw({
          id: beastRow.beast_id,
          seed: BigInt(beastRow.beast_seed || 0),
          health: beastRow.beast_health || 0,
          level: beastRow.beast_level || 1,
          special2: beastRow.special2 || 0,
          special3: beastRow.special3 || 0
        } as any);
        currentBeast = beast;

        // Compute damage preview using aligned combat math
        const damage = adventurer.calculateDamageVsBeast(beast);
        damagePreview = {
          baseDamage: damage.baseDamage,
          criticalDamage: damage.criticalDamage
        };

        // Detailed incoming damage preview per slot
        const incoming = this.calculateBeastDamagePerSlot(adventurer, beast);
        (damagePreview as any).incoming = incoming;
      } else {
        // Fallback: attempt previous logic if event data missing
        const beastId = this.extractCurrentBeastId(events);
        if (beastId) {
          currentBeast = new BeastEntity(this.indexer);
          await currentBeast.fetch(beastId);
          const damage = adventurer.calculateDamageVsBeast(currentBeast);
          damagePreview = {
            baseDamage: damage.baseDamage,
            criticalDamage: damage.criticalDamage
          };
          const incoming = this.calculateBeastDamagePerSlot(adventurer, currentBeast);
          (damagePreview as any).incoming = incoming;
        }
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
      damagePreview,
      market,
      recentEvents: this.buildUnifiedActivityFeed(events, packed, bagPacked).slice(0, 10)
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
        const idStr = entry.adventurer_id;
        const idNum = typeof idStr === 'string' && idStr.startsWith('0x')
          ? parseInt(idStr.slice(2), 16)
          : (entry.adventurer_id || entry.id || 0);
        await adventurer.fetch(idNum);
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
    
    return marketItems.map((raw: any) => {
      // Support arrays of ids or objects with item_id
      let id: number | null = null;
      if (typeof raw === 'number') id = raw;
      else if (raw && typeof raw.item_id === 'number') id = raw.item_id;
      else if (typeof raw === 'string') {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) id = parsed;
      }
      if (!id || id <= 0) {
        return {
          name: 'Unknown Item',
          level: 1,
          tier: 5,
          type: 'None',
          xp: 0,
          price: 1
        };
      }
      
      const itemEntity = new ItemEntity(this.indexer).fromRaw({ id, xp: 0 });
      return {
        ...itemEntity.format(),
        price: itemEntity.getPrice(charisma),
        slot: itemEntity.getSlot()
      };
    });
  }
  
  private processEvents(events: any[]) {
    const items: any[] = [];
    for (const event of events.filter(Boolean)) {
      const get = (k: string) => (event as any)[k];
      const has = (k: string) => get(k) !== undefined && get(k) !== null;
      const parseMaybeJson = (v: any) => {
        if (typeof v === 'string') {
          try { const p = JSON.parse(v); return p; } catch (_) { return v; }
        }
        return v;
      };
      const pushItem = (type: string, summary: any) => {
        const internalId = event?.internal_event_id ?? event?.event_id ?? null;
        let blockNumber: number | null = null;
        let txHash: string | null = null;
        let eventIndex: number | null = null;
        if (typeof internalId === 'string' && internalId.includes(':')) {
          const parts = internalId.split(':');
          if (parts[0]?.startsWith('0x')) {
            try { blockNumber = parseInt(parts[0], 16); } catch (_) {}
          }
          txHash = parts[1] || null;
          if (parts[3]?.startsWith('0x')) {
            try { eventIndex = parseInt(parts[3], 16); } catch (_) {}
          }
        }
        items.push({
          id: internalId,
          type,
          actionCount: event?.action_count ?? null,
          executedAt: event?.internal_executed_at ?? null,
          blockNumber,
          txHash,
          eventIndex,
          summary
        });
      };

      if (has('details.defeated_beast.beast_id')) {
        pushItem('BeastDefeated', {
          beastId: get('details.defeated_beast.beast_id'),
          beastName: BEAST_NAMES[get('details.defeated_beast.beast_id')] || undefined,
          gold: get('details.defeated_beast.gold_reward'),
          xp: get('details.defeated_beast.xp_reward')
        });
      }
      if (has('details.fled_beast.beast_id')) {
        pushItem('FledBeast', {
          beastId: get('details.fled_beast.beast_id'),
          beastName: BEAST_NAMES[get('details.fled_beast.beast_id')] || undefined,
          xp: get('details.fled_beast.xp_reward')
        });
      }
      if (has('details.beast.id') || has('details.beast.level')) {
        pushItem('BeastEncounter', {
          id: get('details.beast.id'),
          name: BEAST_NAMES[get('details.beast.id')] || undefined,
          level: get('details.beast.level'),
          health: get('details.beast.health'),
          specials: {
            special2: get('details.beast.specials.special2'),
            special3: get('details.beast.specials.special3')
          }
        });
      }
      if (has('details.obstacle.obstacle_id')) {
        pushItem('Obstacle', {
          obstacleId: get('details.obstacle.obstacle_id'),
          dodged: get('details.obstacle.dodged'),
          damage: get('details.obstacle.damage'),
          location: get('details.obstacle.location'),
          critical: get('details.obstacle.critical_hit')
        });
      }
      if (has('details.discovery.discovery_type') || has('details.discovery.xp_reward') || has('details.discovery.discovery_type.Gold') || has('details.discovery.discovery_type.Health') || has('details.discovery.discovery_type.Loot')) {
        const gold = get('details.discovery.discovery_type.Gold');
        const health = get('details.discovery.discovery_type.Health');
        const loot = get('details.discovery.discovery_type.Loot');
        let discovery: any = {};
        if (gold !== undefined && gold !== null) discovery = { kind: 'Gold', amount: gold };
        else if (health !== undefined && health !== null) discovery = { kind: 'Health', amount: health };
        else if (loot !== undefined && loot !== null) discovery = { kind: 'Loot' };
        pushItem('Discovery', { ...discovery, xp: get('details.discovery.xp_reward') });
      }
      if (has('details.buy_items.potions') || has('details.buy_items.items_purchased')) {
        pushItem('Purchase', { potions: get('details.buy_items.potions') ?? 0, items: parseMaybeJson(get('details.buy_items.items_purchased')) });
      }
      if (has('details.equip.items')) {
        pushItem('Equip', { items: parseMaybeJson(get('details.equip.items')) });
      }
      if (has('details.drop.items')) {
        pushItem('Drop', { items: parseMaybeJson(get('details.drop.items')) });
      }
      if (has('details.level_up.level')) {
        pushItem('LevelUp', { level: get('details.level_up.level') });
      }
      if (has('details.attack.damage')) {
        pushItem('Attack', { damage: get('details.attack.damage'), location: get('details.attack.location'), critical: get('details.attack.critical_hit') });
      }
      if (has('details.beast_attack.damage')) {
        pushItem('BeastAttack', { damage: get('details.beast_attack.damage'), location: get('details.beast_attack.location'), critical: get('details.beast_attack.critical_hit') });
      }
      if (has('details.ambush.damage') || has('details.ambush.location')) {
        pushItem('Ambush', { damage: get('details.ambush.damage'), location: get('details.ambush.location'), critical: get('details.ambush.critical_hit') });
      }
      if (has('details.flee')) {
        pushItem('Flee', { success: !!get('details.flee') });
      }
      if (has('details.market_items.items')) {
        const itemsVal = parseMaybeJson(get('details.market_items.items'));
        pushItem('MarketUpdated', { itemsCount: Array.isArray(itemsVal) ? itemsVal.length : undefined });
      }
      if (items.length === 0) {
        pushItem('Unknown', {});
      }
    }
    return items;
  }

  private buildUnifiedActivityFeed(events: any[], packed: any[], bagPacked: any[]) {
    const feed: any[] = [];

    // 1) Derived action events
    const derived = this.processEvents(events);
    for (const e of derived) feed.push({ kind: e.type, at: e.executedAt, actionCount: e.actionCount, data: e.summary, meta: { id: e.id, blockNumber: e.blockNumber, txHash: e.txHash, eventIndex: e.eventIndex } });

    // 2) AdventurerPacked snapshots
    for (const row of packed || []) {
      const metaParsed = this.parseInternalId(row.internal_event_id);
      feed.push({ kind: 'AdventurerPacked', at: row.internal_executed_at, data: this.safeParse(row.packed), meta: { id: row.internal_event_id, ...metaParsed } });
    }

    // 3) BagPacked snapshots
    for (const row of bagPacked || []) {
      const metaParsed = this.parseInternalId(row.internal_event_id);
      feed.push({ kind: 'BagPacked', at: row.internal_executed_at, data: this.safeParse(row.packed), meta: { id: row.internal_event_id, ...metaParsed } });
    }

    // 4) Add human-readable message
    for (const e of feed) {
      e.message = this.formatActivityMessage(e.kind, e.data);
    }

    // 5) Stable sort: by time desc, then eventIndex asc, then kind weight
    const kindWeight: Record<string, number> = {
      BeastEncounter: 10,
      Ambush: 20,
      Attack: 30,
      BeastAttack: 40,
      Obstacle: 45,
      Discovery: 50,
      Purchase: 60,
      Equip: 70,
      Drop: 80,
      LevelUp: 90,
      BeastDefeated: 100,
      MarketUpdated: 110,
      AdventurerPacked: 120,
      BagPacked: 130,
      Unknown: 200,
    };
    feed.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      const ea = typeof a.meta?.eventIndex === 'number' ? a.meta.eventIndex : Number.POSITIVE_INFINITY;
      const eb = typeof b.meta?.eventIndex === 'number' ? b.meta.eventIndex : Number.POSITIVE_INFINITY;
      if (ea !== eb) return ea - eb;
      const wa = kindWeight[a.kind] ?? 999;
      const wb = kindWeight[b.kind] ?? 999;
      return wa - wb;
    });
    return feed;
  }

  private safeParse(v: any) {
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch (_) { return v; }
    }
    return v;
  }

  private formatActivityMessage(kind: string, data: any): string {
    switch (kind) {
      case 'BeastDefeated':
        return `Defeated ${data?.beastName || `Beast ${data?.beastId}`}: +${data?.xp || 0} XP, +${data?.gold || 0} gold`;
      case 'FledBeast':
        return `Fled from ${data?.beastName || `Beast ${data?.beastId}`}: +${data?.xp || 0} XP`;
      case 'BeastEncounter':
        return `Encountered ${data?.name || `Beast ${data?.id}`}${data?.level ? ` (Lv ${data.level})` : ''}`;
      case 'Obstacle':
        return `${data?.dodged ? 'Dodged' : 'Hit by'} obstacle${data?.damage ? ` for ${data.damage}` : ''}${data?.critical ? ' (critical)' : ''}`;
      case 'Discovery':
        if (data?.kind === 'Gold') return `Discovered gold: +${data?.amount || 0}`;
        if (data?.kind === 'Health') return `Recovered health: +${data?.amount || 0}`;
        if (data?.kind === 'Loot') return `Discovered loot`;
        return 'Discovery';
      case 'Purchase':
        return `Purchased ${Array.isArray(data?.items) ? data.items.length : (data?.potions ? `${data.potions} potions` : 'items')}`;
      case 'Equip':
        return `Equipped items`;
      case 'Drop':
        return `Dropped items`;
      case 'LevelUp':
        return `Leveled up to ${data?.level}`;
      case 'Attack':
        return `You hit for ${data?.damage}${data?.critical ? ' (critical)' : ''}`;
      case 'BeastAttack':
        return `Beast hit for ${data?.damage}${data?.critical ? ' (critical)' : ''}`;
      case 'Ambush':
        return `Ambushed: -${data?.damage || 0} health${data?.critical ? ' (critical)' : ''}`;
      case 'Flee':
        return data?.success ? 'Fled successfully' : 'Failed to flee';
      case 'MarketUpdated':
        return `Market updated (${data?.itemsCount || 0} items)`;
      case 'AdventurerPacked':
        return 'Adventurer snapshot';
      case 'BagPacked':
        return 'Bag snapshot';
      default:
        return kind || 'Event';
    }
  }

  private parseInternalId(internalId: string | null | undefined) {
    if (!internalId || typeof internalId !== 'string' || !internalId.includes(':')) return {};
    const parts = internalId.split(':');
    let blockNumber: number | undefined;
    let txHash: string | undefined;
    let eventIndex: number | undefined;
    if (parts[0]?.startsWith('0x')) {
      try { blockNumber = parseInt(parts[0], 16); } catch (_) {}
    }
    txHash = parts[1];
    if (parts[3]?.startsWith('0x')) {
      try { eventIndex = parseInt(parts[3], 16); } catch (_) {}
    }
    return { blockNumber, txHash, eventIndex };
  }

  // Helpers for incoming damage preview (beast -> adventurer) per equipped slot
  private calculateBeastDamagePerSlot(adventurer: AdventurerEntity, beast: BeastEntity) {
    const slots = ['head', 'chest', 'waist', 'hand', 'foot'] as const;
    const beastLevel = beast.getLevel();
    const beastTier = beast.getTier();
    const maxDamage = beastLevel * (6 - beastTier) * 1.5;
    const attackType = this.getBeastAttackType(beast);
    let perSlot: Record<string, number> = {};
    let totalDefense = 0;

    for (const slot of slots) {
      const armor = adventurer.getEquippedItem(slot);
      if (!armor) {
        perSlot[slot] = Math.floor(maxDamage);
        continue;
      }

      const damage = this.calculateDamageAgainstArmor(attackType, beast, adventurer, armor);
      perSlot[slot] = damage;
      const defense = Math.max(0, maxDamage - damage);
      totalDefense += defense;
    }

    let protection = 0;
    if (maxDamage <= 2) {
      protection = 100;
    } else {
      protection = Math.floor((totalDefense / ((maxDamage - BEAST_MIN_DAMAGE) * 5)) * 100);
    }

    return {
      perSlot,
      maxDamage: Math.floor(maxDamage),
      protectionPercent: Math.max(0, Math.min(100, protection))
    };
  }

  private getBeastAttackType(beast: BeastEntity): string {
    const id = (beast.getRaw() as any)?.id || 0;
    if (id >= 1 && id <= 25) return 'Magic';
    if (id >= 26 && id <= 50) return 'Blade';
    if (id >= 51 && id <= 75) return 'Bludgeon';
    return 'None';
  }

  private calculateDamageAgainstArmor(attackType: string, beast: BeastEntity, adventurer: AdventurerEntity, armor: ItemEntity) {
    const beastLevel = beast.getLevel();
    const beastTier = beast.getTier();
    let damage = beastLevel * (6 - beastTier);

    // Elemental adjustment (beast attack type vs armor type)
    const armorType = armor.getType();
    damage = elementalAdjustedDamage(damage, attackType, armorType);

    // Name match bonus (prefix/suffix)
    const armorLevel = armor.getLevel();
    const beastSpecials = beast.getSpecials();
    const itemSpecials = armor.format().specials;
    if (itemSpecials && (beastSpecials.prefix || beastSpecials.suffix)) {
      if (itemSpecials.suffix && beastSpecials.suffix && itemSpecials.suffix === beastSpecials.suffix) {
        damage *= 2;
      }
      if (itemSpecials.prefix && beastSpecials.prefix && itemSpecials.prefix === beastSpecials.prefix) {
        damage *= 8;
      }
    }

    // Subtract armor value
    const armorValue = armorLevel * (6 - armor.getTier());
    damage = Math.max(BEAST_MIN_DAMAGE, damage - armorValue);

    // Neck reduction bonus
    const neck = adventurer.getEquippedItem('neck');
    if (neck) {
      const neckName = neck.getName();
      if ((armorType === 'Cloth' && neckName.includes('Amulet')) ||
          (armorType === 'Hide' && neckName.includes('Pendant')) ||
          (armorType === 'Metal' && neckName.includes('Necklace'))) {
        const neckLevel = neck.getLevel();
        damage -= Math.floor((armorLevel * (6 - armor.getTier()) * neckLevel * 3) / 100);
      }
    }

    return Math.max(BEAST_MIN_DAMAGE, damage);
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
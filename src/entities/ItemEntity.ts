/**
 * Item Entity
 * Handles all item-related operations and calculations
 */

import { Entity } from "../core/Entity";
import type { IndexerClient } from "../indexer/IndexerClient";
import type { RawItem, FormattedItem, ItemType, Tier } from "../types/game";
import { ItemId, ItemIndex, ItemSlotLength, ITEM_NAME_PREFIXES, ITEM_NAME_SUFFIXES, PREFIXES_UNLOCK_GREATNESS, SUFFIX_UNLOCK_GREATNESS, NUM_ITEMS } from "../constants/loot";
import { TIER_PRICE } from "../constants/game";
import { calculateLevel } from "../utils/game";

export class ItemEntity extends Entity<RawItem, FormattedItem> {
  private specials?: {
    prefix?: string;
    suffix?: string;
  };
  
  async fetch(itemId: number | string | bigint): Promise<this> {
    const id = Number(itemId);
    // Items are typically embedded in other entities, but we can fetch directly if needed
    this.raw = { id, xp: 0 };
    return this;
  }
  
  /**
   * Create from raw data (used when item is embedded in adventurer)
   */
  fromRaw(raw: RawItem): this {
    this.raw = raw;
    return this;
  }
  
  /**
   * Load item with specific XP
   */
  withXP(xp: number): this {
    if (!this.raw) throw new Error('Item not loaded');
    this.raw.xp = xp;
    this.clearCache();
    return this;
  }
  
  /**
   * Calculate and load item specials based on seed
   */
  withSpecials(seed: number): this {
    this.ensureLoaded();
    const level = this.getLevel();
    
    if (level >= PREFIXES_UNLOCK_GREATNESS) {
      const specialsSeed = this.getSpecialsSeed(seed);
      const prefix = this.getSpecialPrefix(specialsSeed);
      const suffix = level >= SUFFIX_UNLOCK_GREATNESS ? this.getSpecialSuffix(specialsSeed) : undefined;
      
      this.specials = { prefix, suffix };
    }
    
    return this;
  }
  
  getLevel(): number {
    this.ensureLoaded();
    return this.cache('level', () => calculateLevel(this.raw!.xp));
  }
  
  getName(): string {
    this.ensureLoaded();
    return this.cache('name', () => {
      const baseName = this.getBaseName();
      
      if (!this.specials) {
        return baseName;
      }
      
      const { prefix, suffix } = this.specials;
      
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
  
  private getBaseName(): string {
    const id = this.raw!.id;
    // Convert ItemId enum key to proper name
    const entry = Object.entries(ItemId).find(([_, value]) => value === id);
    if (!entry) return `Unknown Item ${id}`;
    
    // Convert CamelCase to Space Case
    return entry[0].replace(/([A-Z])/g, ' $1').trim();
  }
  
  getTier(): Tier {
    this.ensureLoaded();
    return this.cache('tier', () => this.calculateTier(this.raw!.id));
  }
  
  private calculateTier(id: number): Tier {
    if (id <= 0) return 0; // Tier.None
    
    // Necklace items (1-3) are all T1
    if (id <= 3) return 1;
    
    // silver ring (4) is T2
    if (id === 4) return 2;
    
    // bronze ring (5) is T3
    if (id === 5) return 3;
    
    // other rings are T1
    if (id <= 8) return 1;
    
    // Magic/Cloth items (9-41)
    if (id <= 41) {
      if ([9, 13, 17, 22, 27, 32, 37].includes(id)) return 1;
      if ([10, 14, 18, 23, 28, 33, 38].includes(id)) return 2;
      if ([11, 15, 19, 24, 29, 34, 39].includes(id)) return 3;
      if ([20, 25, 30, 35, 40].includes(id)) return 4;
      return 5;
    }
    
    // Blade/Hide items (42-71)
    if (id <= 71) {
      if ([42, 47, 52, 57, 62, 67].includes(id)) return 1;
      if ([43, 48, 53, 58, 63, 68].includes(id)) return 2;
      if ([44, 49, 54, 59, 64, 69].includes(id)) return 3;
      if ([45, 50, 55, 60, 65, 70].includes(id)) return 4;
      return 5;
    }
    
    // Bludgeon/Metal items (72-101)
    if ([72, 77, 82, 87, 92, 97].includes(id)) return 1;
    if ([73, 78, 83, 88, 93, 98].includes(id)) return 2;
    if ([74, 79, 84, 89, 94, 99].includes(id)) return 3;
    if ([75, 80, 85, 90, 95, 100].includes(id)) return 4;
    return 5;
  }
  
  getType(): ItemType {
    this.ensureLoaded();
    return this.cache('type', () => this.calculateType(this.raw!.id));
  }
  
  private calculateType(id: number): ItemType {
    if (this.isNecklace(id)) return "Necklace" as ItemType;
    if (this.isRing(id)) return "Ring" as ItemType;
    if (this.isMagicOrCloth(id)) return this.isWeapon(id) ? "Magic" as ItemType : "Cloth" as ItemType;
    if (this.isBladeOrHide(id)) return this.isWeapon(id) ? "Blade" as ItemType : "Hide" as ItemType;
    if (this.isBludgeonOrMetal(id)) return this.isWeapon(id) ? "Bludgeon" as ItemType : "Metal" as ItemType;
    return "None" as ItemType;
  }
  
  getSlot(): string {
    this.ensureLoaded();
    return this.cache('slot', () => this.calculateSlot(this.raw!.id));
  }
  
  private calculateSlot(id: number): string {
    if (this.isNecklace(id)) return "Neck";
    if (this.isRing(id)) return "Ring";
    if (this.isWeapon(id)) return "Weapon";
    if (this.isChest(id)) return "Chest";
    if (this.isHead(id)) return "Head";
    if (this.isWaist(id)) return "Waist";
    if (this.isFoot(id)) return "Foot";
    if (this.isHand(id)) return "Hand";
    return "None";
  }
  
  getPrice(charisma: number = 0): number {
    const tier = this.getTier();
    const basePrice = this.getBasePrice(tier);
    return this.applyCharismaDiscount(basePrice, charisma);
  }
  
  private getBasePrice(tier: Tier): number {
    switch (tier) {
      case 1: return 5 * TIER_PRICE;
      case 2: return 4 * TIER_PRICE;
      case 3: return 3 * TIER_PRICE;
      case 4: return 2 * TIER_PRICE;
      case 5: return TIER_PRICE;
      default: return 0;
    }
  }
  
  private applyCharismaDiscount(basePrice: number, charisma: number): number {
    const CHARISMA_ITEM_DISCOUNT = 1;
    const MINIMUM_ITEM_PRICE = 1;
    
    const discount = CHARISMA_ITEM_DISCOUNT * charisma;
    if (discount >= basePrice) {
      return MINIMUM_ITEM_PRICE;
    }
    return basePrice - discount;
  }
  
  private getSpecialsSeed(entropy: number): number {
    const id = this.raw!.id;
    let itemEntropy = entropy + id;
    if (itemEntropy > 65535) {
      itemEntropy = entropy - id;
    }

    // Scope rnd between 0 and NUM_ITEMS-1
    const rnd = itemEntropy % NUM_ITEMS;

    // Get item name and index
    const entry = Object.entries(ItemId).find(([_, value]) => value === id);
    const itemName = entry ? entry[0] : undefined;
    const itemIndex = itemName ? (ItemIndex as any)[itemName] || 0 : 0;

    // Get slot length based on item slot
    const slot = this.calculateSlot(id);
    let slotLength = 1;
    switch (slot) {
      case "Weapon": slotLength = ItemSlotLength.SlotItemsLengthWeapon; break;
      case "Chest": slotLength = ItemSlotLength.SlotItemsLengthChest; break;
      case "Head": slotLength = ItemSlotLength.SlotItemsLengthHead; break;
      case "Waist": slotLength = ItemSlotLength.SlotItemsLengthWaist; break;
      case "Foot": slotLength = ItemSlotLength.SlotItemsLengthFoot; break;
      case "Hand": slotLength = ItemSlotLength.SlotItemsLengthHand; break;
      case "Neck": slotLength = ItemSlotLength.SlotItemsLengthNeck; break;
      case "Ring": slotLength = ItemSlotLength.SlotItemsLengthRing; break;
    }

    // Return the item specific entropy
    return rnd * slotLength + itemIndex;
  }
  
  private getSpecialPrefix(seed: number): string | undefined {
    const index = (seed % 69) + 1; // MAX_SPECIAL2
    return ITEM_NAME_PREFIXES[index];
  }
  
  private getSpecialSuffix(seed: number): string | undefined {
    const index = (seed % 18) + 1; // MAX_SPECIAL3
    return ITEM_NAME_SUFFIXES[index];
  }
  
  // Helper methods for item type checking
  private isNecklace(id: number): boolean { return id <= 3; }
  private isRing(id: number): boolean { return id >= 4 && id <= 8; }
  private isWeapon(id: number): boolean {
    return (id >= 9 && id <= 16) || (id >= 42 && id <= 46) || (id >= 72 && id <= 76);
  }
  private isChest(id: number): boolean {
    return (id >= 17 && id <= 21) || (id >= 47 && id <= 51) || (id >= 77 && id <= 81);
  }
  private isHead(id: number): boolean {
    return (id >= 22 && id <= 26) || (id >= 52 && id <= 56) || (id >= 82 && id <= 86);
  }
  private isWaist(id: number): boolean {
    return (id >= 27 && id <= 31) || (id >= 57 && id <= 61) || (id >= 87 && id <= 91);
  }
  private isFoot(id: number): boolean {
    return (id >= 32 && id <= 36) || (id >= 62 && id <= 66) || (id >= 92 && id <= 96);
  }
  private isHand(id: number): boolean {
    return (id >= 37 && id <= 41) || (id >= 67 && id <= 71) || (id >= 97 && id <= 101);
  }
  private isMagicOrCloth(id: number): boolean { return id >= 9 && id <= 41; }
  private isBladeOrHide(id: number): boolean { return id >= 42 && id <= 71; }
  private isBludgeonOrMetal(id: number): boolean { return id >= 72; }
  
  format(): FormattedItem {
    this.ensureLoaded();
    
    return {
      id: this.raw!.id,
      name: this.getName(),
      level: this.getLevel(),
      tier: this.getTier(),
      type: this.getType(),
      slot: this.getSlot(),
      xp: this.raw!.xp,
      specials: this.specials
    };
  }
}
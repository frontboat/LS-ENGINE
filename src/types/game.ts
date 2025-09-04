/**
 * Core game type definitions
 */

export interface RawItem {
  id: number;
  xp: number;
}

export interface RawStats {
  strength: number;
  dexterity: number;
  vitality: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  luck: number;
}

export interface RawEquipment {
  weapon: RawItem;
  chest: RawItem;
  head: RawItem;
  waist: RawItem;
  foot: RawItem;
  hand: RawItem;
  neck: RawItem;
  ring: RawItem;
}

export interface RawAdventurer {
  id: number;
  game_id: number;
  health: number;
  xp: number;
  gold: number;
  beast_health: number;
  stat_upgrades_available: number;
  stats: RawStats;
  equipment: RawEquipment;
  item_specials_seed: number;
  action_count: number;
}

export interface RawBeast {
  id: number;
  seed: bigint;
  health: number;
  level: number;
  special2: number; // prefix
  special3: number; // suffix
}

export interface FormattedItem {
  id: number;
  name: string;
  level: number;
  tier: number;
  type: string;
  slot: string;
  xp: number;
  specials?: {
    prefix?: string;
    suffix?: string;
  };
}

export interface FormattedStats {
  strength: number;
  dexterity: number;
  vitality: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  luck: number;
}

export interface FormattedEquipment {
  weapon?: FormattedItem;
  chest?: FormattedItem;
  head?: FormattedItem;
  waist?: FormattedItem;
  foot?: FormattedItem;
  hand?: FormattedItem;
  neck?: FormattedItem;
  ring?: FormattedItem;
}

export interface FormattedAdventurer {
  id: number;
  gameId: number;
  level: number;
  health: number;
  xp: number;
  gold: number;
  stats: FormattedStats;
  equipment: FormattedEquipment;
  combatStats?: CombatStats;
  statUpgradesAvailable: number;
  actionCount: number;
}

export interface FormattedBeast {
  id: number;
  name: string;
  level: number;
  tier: number;
  health: number;
  type: string;
  armorType: string;
  specials: {
    prefix: string | null;
    suffix: string | null;
  };
  rewards: {
    gold: number;
    xp: number;
  };
}

export interface CombatStats {
  attack: number;
  defense: number;
  critChance: number;
  critDamage: number;
  weaponDamage: number;
  armorProtection: number;
}

export interface DamageCalculation {
  baseDamage: number;
  criticalDamage: number;
  elementalBonus: number;
  strengthBonus: number;
  specialBonus: number;
  total: number;
}

export interface CombatResult {
  damage: DamageCalculation;
  defenderHealth: number;
  outcome: 'victory' | 'defeat' | 'ongoing';
  rewards?: {
    gold: number;
    xp: number;
  };
}

export enum ItemType {
  Magic = "Magic",
  Bludgeon = "Bludgeon",
  Blade = "Blade",
  Cloth = "Cloth",
  Hide = "Hide",
  Metal = "Metal",
  Ring = "Ring",
  Necklace = "Necklace",
  None = "None"
}

export enum Tier {
  T1 = 1,
  T2 = 2,
  T3 = 3,
  T4 = 4,
  T5 = 5,
  None = 0
}
/**
 * Game utility functions
 * Core calculations for levels, XP, combat, and other game mechanics
 */

// Constants
export const MIN_DAMAGE = 4;
export const BEAST_MIN_DAMAGE = 2;

export const calculateLevel = (xp: number): number => {
  if (xp === 0) return 1;
  return Math.floor(Math.sqrt(xp));
};

export const calculateNextLevelXP = (currentLevel: number, item: boolean = false): number => {
  if (item) {
    return Math.min(400, (currentLevel + 1) ** 2);
  }
  return (currentLevel + 1) ** 2;
};

export const calculateProgress = (xp: number, item: boolean = false): number => {
  const currentLevel = calculateLevel(xp);
  const nextLevelXP = calculateNextLevelXP(currentLevel, item);
  const currentLevelXP = currentLevel ** 2;
  return ((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
};

// Correct elemental damage calculation from client
export const elementalAdjustedDamage = (base_attack: number, weapon_type: string, armor_type: string): number => {
  let elemental_effect = Math.floor(base_attack / 2);

  // Strong against (1.5x damage)
  if (
    (weapon_type === "Magic" && armor_type === "Metal") ||
    (weapon_type === "Blade" && armor_type === "Cloth") ||
    (weapon_type === "Bludgeon" && armor_type === "Hide")
  ) {
    return base_attack + elemental_effect;
  }

  // Weak against (0.5x damage)  
  if (
    (weapon_type === "Magic" && armor_type === "Hide") ||
    (weapon_type === "Blade" && armor_type === "Metal") ||
    (weapon_type === "Bludgeon" && armor_type === "Cloth")
  ) {
    return base_attack - elemental_effect;
  }

  return base_attack;
};

export const ability_based_percentage = (adventurer_xp: number, relevant_stat: number): number => {
  let adventurer_level = calculateLevel(adventurer_xp);

  if (relevant_stat >= adventurer_level) {
    return 100;
  } else {
    return Math.floor((relevant_stat / adventurer_level) * 100);
  }
};

export const ability_based_avoid_threat = (adventurer_level: number, relevant_stat: number, rnd: number): boolean => {
  if (relevant_stat >= adventurer_level) {
    return true;
  } else {
    let scaled_chance = (adventurer_level * rnd) / 255;
    return relevant_stat > scaled_chance;
  }
};

export const ability_based_damage_reduction = (adventurer_xp: number, relevant_stat: number): number => {
  let adventurer_level = calculateLevel(adventurer_xp);
  const SCALE = 1_000_000;

  let ratio = SCALE * relevant_stat / adventurer_level;
  if (ratio > SCALE) {
    ratio = SCALE;
  }

  let r2 = (ratio * ratio) / SCALE;
  let r3 = (r2 * ratio) / SCALE;
  let smooth = 3 * r2 - 2 * r3;

  return Math.floor((100 * smooth / SCALE));
};

export const strength_dmg = (damage: number, strength: number): number => {
  if (strength === 0) return 0;
  return Math.floor((damage * strength * 10) / 100);
};

// Critical hit bonus calculation
export const critical_hit_bonus = (base_damage: number, ringId: number, ringXp: number, ringName?: string): number => {
  let total = base_damage;

  // Titanium Ring gives 3% bonus per level on critical hits
  if ((ringName && ringName.includes("Titanium Ring")) || ringId === 7) {
    const ringLevel = calculateLevel(ringXp);
    total += Math.floor((total * 3 * ringLevel) / 100);
  }
  return total;
};

// Check if neck item provides bonus armor reduction
export const neck_reduction = (armorType: string, neckName: string): boolean => {
  if (!armorType || !neckName) return false;

  if (armorType === "Cloth" && neckName === "Amulet") return true;
  if (armorType === "Hide" && neckName === "Pendant") return true;
  if (armorType === "Metal" && neckName === "Necklace") return true;

  return false;
};

// Calculate flee chance based on dexterity
export const calculateFleeChance = (adventurerLevel: number, dexterity: number): number => {
  if (dexterity >= adventurerLevel) {
    return 100;
  }
  return (dexterity / adventurerLevel) * 100;
};

// Calculate ambush chance based on wisdom
export const calculateAmbushChance = (adventurerLevel: number, wisdom: number): number => {
  if (wisdom >= adventurerLevel) {
    return 0; // No ambush if wisdom is high enough
  }
  return ((adventurerLevel - wisdom) / adventurerLevel) * 100;
};

// Calculate discovery chance based on intelligence
export const calculateDiscoveryChance = (adventurerLevel: number, intelligence: number): number => {
  return ability_based_percentage(adventurerLevel * adventurerLevel, intelligence);
};

// Calculate obstacle dodge chance based on intelligence for magic obstacles, wisdom for others
export const calculateObstacleDodgeChance = (adventurerXp: number, intelligence: number, wisdom: number, obstacleType: string): number => {
  if (obstacleType === "Magic") {
    return ability_based_percentage(adventurerXp, intelligence);
  }
  return ability_based_percentage(adventurerXp, wisdom);
};

// XP rewards
export const calculateXpReward = (beastLevel: number, beastTier: number): number => {
  const MIN_XP_REWARD = 4;
  return Math.max(MIN_XP_REWARD, beastLevel * 2);
};

export const calculateGoldReward = (beastLevel: number, beastTier: number): number => {
  const GOLD_MULTIPLIER: Record<number, number> = {
    1: 5, // T1
    2: 4, // T2
    3: 3, // T3
    4: 2, // T4
    5: 1, // T5
  };
  const GOLD_REWARD_DIVISOR = 2;
  
  const multiplier = GOLD_MULTIPLIER[beastTier] || 1;
  return Math.floor(beastLevel * multiplier / GOLD_REWARD_DIVISOR);
};
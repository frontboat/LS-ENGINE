const STARTING_HEALTH = 100;
const MAX_HEALTH_CAP = 1023;
const HEALTH_PER_VITALITY = 15;

export function calculateMaxHealth(vitality: number): number {
  const bonus = vitality * HEALTH_PER_VITALITY;
  return Math.min(MAX_HEALTH_CAP, STARTING_HEALTH + bonus);
}

export function potionPrice(level: number, charisma: number): number {
  return Math.max(1, level - charisma * 2);
}

export const POTION_HEAL_AMOUNT = 10;

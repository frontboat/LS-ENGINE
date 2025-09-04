/**
 * Formatting utilities for handling StarkNet data
 */

/**
 * Convert a number to a padded hex address for querying
 */
export function toHexAddress(id: number | string): string {
  const num = typeof id === 'string' ? parseInt(id) : id;
  // Convert to hex and pad to 16 characters (without 0x prefix)
  const hex = num.toString(16);
  return '0x' + hex.padStart(16, '0');
}

/**
 * Convert hex address back to number
 */
export function fromHexAddress(hex: string): number {
  if (!hex) return 0;
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return parseInt(cleanHex, 16);
}

/**
 * Convert BigInt to hex string
 */
export const bigintToHex = (v: bigint | number | string): `0x${string}` => {
  if (!v) return "0x0";
  return `0x${BigInt(v).toString(16)}` as `0x${string}`;
};
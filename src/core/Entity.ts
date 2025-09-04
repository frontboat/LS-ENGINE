/**
 * Base entity class for all game entities
 * Provides caching, lazy loading, and method chaining
 */

import type { IndexerClient } from "../indexer/IndexerClient";

export abstract class Entity<TRaw, TFormatted> {
  protected raw: TRaw | null = null;
  protected cached: Map<string, any> = new Map();
  
  constructor(protected indexer: IndexerClient) {}
  
  /**
   * Fetch the entity data from the indexer
   */
  abstract fetch(id: number | string | bigint): Promise<this>;
  
  /**
   * Format the entity for API response
   */
  abstract format(): TFormatted;
  
  /**
   * Cache computed values for performance
   */
  protected cache<T>(key: string, compute: () => T): T {
    if (this.cached.has(key)) {
      return this.cached.get(key);
    }
    const value = compute();
    this.cached.set(key, value);
    return value;
  }
  
  /**
   * Clear cached values
   */
  clearCache(): void {
    this.cached.clear();
  }
  
  /**
   * Check if entity has been fetched
   */
  isLoaded(): boolean {
    return this.raw !== null;
  }
  
  /**
   * Ensure entity is loaded before operations
   */
  protected ensureLoaded(): void {
    if (!this.isLoaded()) {
      throw new Error(`${this.constructor.name} must be fetched before use`);
    }
  }
  
  /**
   * Get raw data (for debugging)
   */
  getRaw(): TRaw | null {
    return this.raw;
  }
}
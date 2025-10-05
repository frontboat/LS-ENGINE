import {
  GameStateService,
  type GameState,
  type LeaderboardEntry,
} from '../../../engine/src/services/GameStateService';

const serviceConfig = {
  toriiUrl: process.env.TORII_URL ?? 'https://api.cartridge.gg/x/boat-ls2-mainnet-v2/torii',
  namespace: process.env.NAMESPACE ?? 'ls_0_0_9',
};

const gameStateService = new GameStateService(serviceConfig);

const gameStateCache = new Map<number, GameState>();
let leaderboardCache: LeaderboardEntry[] | null = null;

export async function loadGameState(gameId: number): Promise<GameState> {
  if (gameStateCache.has(gameId)) {
    return gameStateCache.get(gameId)!;
  }

  const gameState = await gameStateService.getGameState(gameId);
  gameStateCache.set(gameId, gameState);
  return gameState;
}

export function resetGameStateCache(): void {
  gameStateCache.clear();
  leaderboardCache = null;
}

export async function loadLeaderboard(limit = 5): Promise<LeaderboardEntry[]> {
  if (leaderboardCache) {
    return leaderboardCache;
  }

  const leaderboard = await gameStateService.getLeaderboard(limit);
  leaderboardCache = leaderboard;
  return leaderboard;
}

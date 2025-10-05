import { service } from '@daydreamsai/core';
import type { AccountInterface, Call } from 'starknet';
import { CairoOption, CairoOptionVariant, CallData, byteArray, constants, num } from 'starknet';
import path from 'path';
import { createRequire } from 'module';
import { getContractByName } from '@dojoengine/core';

import { ChainId, getNetworkConfig, type NetworkConfig } from '../../../engine/src/utils/networkConfig';
import { translateGameEvent } from '../../../engine/src/utils/translation';
import { delay, stringToFelt, decodeHexByteArray } from '../../../engine/src/utils/utils';
import type { Beast, GameSettingsData, ItemPurchase, Payment, Stats } from '../../../engine/src/types/game';
import { BEAST_NAME_PREFIXES, BEAST_NAME_SUFFIXES } from '../../../engine/src/constants/beast';

interface SystemCallsConfig {
  network: NetworkConfig;
  vrfProviderAddress: string;
  storagePath: string;
}

interface ExecuteOptions {
  onReset?: () => void;
  gameId?: number;
}

export interface TranslatedActionEvent {
  type: string;
  action_count: number;
  [key: string]: unknown;
}

export class SystemCallsClient {
  private readonly gameAddress: string;
  private readonly gameTokenAddress: string;
  private readonly settingsAddress: string;

  constructor(private readonly account: AccountInterface, private readonly config: SystemCallsConfig) {
    const { manifest, namespace } = config.network;

    const gameContract = getContractByName(manifest, namespace, 'game_systems');
    const gameTokenContract = getContractByName(manifest, namespace, 'game_token_systems');
    const settingsContract = getContractByName(manifest, namespace, 'settings_systems');

    if (!gameContract?.address || !gameTokenContract?.address || !settingsContract?.address) {
      throw new Error('Unable to resolve game contract addresses from manifest.');
    }

    this.gameAddress = gameContract.address;
    this.gameTokenAddress = gameTokenContract.address;
    this.settingsAddress = settingsContract.address;
  }

  private async callRpc(payload: unknown): Promise<any> {
    const fetchFn = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Fetch API not available in this runtime. Ensure Node 18+ or a fetch polyfill is present.');
    }

    const response = await fetchFn(this.config.network.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return response.json();
  }

  async executeAction(calls: Call[], options: ExecuteOptions = {}): Promise<TranslatedActionEvent[] | undefined> {
    const { onReset, gameId } = options;

    try {
      const tx = await this.account.execute(calls);
      const receipt = await this.waitForPreConfirmedTransaction(tx.transaction_hash, 0);

      if (receipt.execution_status === 'REVERTED') {
        onReset?.();
        return undefined;
      }

      const translatedEvents = receipt.events
        .map((event: any) => translateGameEvent(event, this.config.network.manifest, gameId ?? null))
        .filter(Boolean);

      if (translatedEvents.some((event) => event === 'Fatal Error')) {
        const error = new Error('Received Fatal Error event when translating transaction logs.');
        onReset?.();
        throw error;
      }

      return translatedEvents.filter((event): event is TranslatedActionEvent => typeof event === 'object');
    } catch (error) {
      onReset?.();
      throw error;
    }
  }

  startGame(gameId: number): Call {
    const starterWeapons = [12, 16, 46, 76];
    const weapon = starterWeapons[Math.floor(Math.random() * starterWeapons.length)];

    return {
      contractAddress: this.gameAddress,
      entrypoint: 'start_game',
      calldata: [gameId, weapon],
    };
  }

  requestRandom(salt: bigint): Call {
    return {
      contractAddress: this.config.vrfProviderAddress,
      entrypoint: 'request_random',
      calldata: CallData.compile({
        caller: this.gameAddress,
        source: { type: 1, salt },
      }),
    };
  }

  explore(gameId: number, untilBeast: boolean): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'explore',
      calldata: [gameId, untilBeast],
    };
  }

  attack(gameId: number, toTheDeath: boolean): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'attack',
      calldata: [gameId, toTheDeath],
    };
  }

  flee(gameId: number, toTheDeath: boolean): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'flee',
      calldata: [gameId, toTheDeath],
    };
  }

  equip(gameId: number, items: number[]): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'equip',
      calldata: [gameId, items],
    };
  }

  drop(gameId: number, items: number[]): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'drop',
      calldata: [gameId, items],
    };
  }

  buyItems(gameId: number, potions: number, items: ItemPurchase[]): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'buy_items',
      calldata: [gameId, potions, items],
    };
  }

  selectStatUpgrades(gameId: number, statUpgrades: Stats): Call {
    return {
      contractAddress: this.gameAddress,
      entrypoint: 'select_stat_upgrades',
      calldata: [gameId, statUpgrades],
    };
  }

  async claimBeast(
    gameId: number,
    beast: Pick<Beast, 'id' | 'specialPrefix' | 'specialSuffix'>,
  ): Promise<{ tokenId: number; tokenURI: string | null } | undefined> {
    await this.waitForBeastClaim(gameId);
    await delay(1000);

    const prefix = this.getBeastSpecialIndex(beast.specialPrefix, true);
    const suffix = this.getBeastSpecialIndex(beast.specialSuffix, false);

    const tx = await this.account.execute([
      {
        contractAddress: this.config.network.dungeon,
        entrypoint: 'claim_beast',
        calldata: [gameId, beast.id, prefix, suffix],
      },
    ]);

    const receipt = await this.waitForTransaction(tx.transaction_hash, 0);
    const tokenIdHex = receipt.events[receipt.events.length - 2]?.data?.[2];
    const tokenId = tokenIdHex ? parseInt(tokenIdHex, 16) : undefined;

    if (tokenId === undefined) {
      return undefined;
    }

    const tokenURI = await this.fetchTokenURI(tokenId);

    if (this.isJackpotCombo(beast.id, prefix, suffix)) {
      await this.claimJackpot(tokenId);
    }

    return { tokenId, tokenURI };
  }

  async claimSurvivorTokens(gameId: number): Promise<TranslatedActionEvent[] | undefined> {
    return this.executeAction([
      {
        contractAddress: this.config.network.dungeon,
        entrypoint: 'claim_reward_token',
        calldata: [gameId],
      },
    ]);
  }

  async claimJackpot(tokenId: number): Promise<TranslatedActionEvent[] | undefined> {
    return this.executeAction([
      {
        contractAddress: this.config.network.dungeon,
        entrypoint: 'claim_jackpot',
        calldata: [tokenId],
      },
    ]);
  }

  async createSettings(settings: GameSettingsData): Promise<TranslatedActionEvent[] | undefined> {
    const bag = this.serializeBag(settings);

    return this.executeAction([
      {
        contractAddress: this.settingsAddress,
        entrypoint: 'add_settings',
        calldata: [
          settings.vrf_address,
          settings.name,
          byteArray.byteArrayFromString(`${settings.name} settings`),
          settings.adventurer,
          bag,
          settings.game_seed,
          settings.game_seed_until_xp,
          settings.in_battle,
          settings.stats_mode === 'Dodge' ? 0 : 1,
          settings.base_damage_reduction,
          settings.market_size,
        ],
      },
    ]);
  }

  async buyGame(payment: Payment, name: string, preCalls: Call[] = [], callback: () => void = () => {}): Promise<number> {
    const paymentData =
      payment.paymentType === 'Ticket'
        ? [0]
        : [1, payment.goldenPass!.address, payment.goldenPass!.tokenId];

    if (payment.paymentType === 'Ticket') {
      preCalls.push({
        contractAddress: this.config.network.dungeonTicket,
        entrypoint: 'approve',
        calldata: CallData.compile([this.config.network.dungeon, 1e18, '0']),
      });
    }

    const tx = await this.account.execute([
      ...preCalls,
      {
        contractAddress: this.config.network.dungeon,
        entrypoint: 'buy_game',
        calldata: CallData.compile([
          ...paymentData,
          new CairoOption(CairoOptionVariant.Some, stringToFelt(name)),
          this.account.address,
          false,
        ]),
      },
    ]);

    callback();

    const receipt = await this.waitForTransaction(tx.transaction_hash, 0);
    const tokenMetadataEvent = receipt.events.find((event: any) => event.data.length === 14);
    if (!tokenMetadataEvent) {
      throw new Error('Unable to parse token metadata event after buy_game');
    }

    return parseInt(tokenMetadataEvent.data[1], 16);
  }

  async mintGame(name: string, settingsId = 0): Promise<number> {
    const tx = await this.account.execute([
      {
        contractAddress: this.gameTokenAddress,
        entrypoint: 'mint_game',
        calldata: CallData.compile([
          new CairoOption(CairoOptionVariant.Some, stringToFelt(name)),
          new CairoOption(CairoOptionVariant.Some, settingsId),
          1,
          1,
          1,
          1,
          1,
          1,
          this.account.address,
          false,
        ]),
      },
    ]);

    const receipt = await this.waitForTransaction(tx.transaction_hash, 0);
    const tokenMetadataEvent = receipt.events.find((event: any) => event.data.length === 14);
    if (!tokenMetadataEvent) {
      throw new Error('Unable to parse token metadata event after mint_game');
    }

    return parseInt(tokenMetadataEvent.data[1], 16);
  }

  private async waitForPreConfirmedTransaction(txHash: string, retries: number): Promise<any> {
    if (retries > 5) {
      throw new Error('Transaction failed');
    }

    try {
      const receipt = await this.account.waitForTransaction(txHash, {
        retryInterval: 275,
        successStates: ['ACCEPTED_ON_L2', 'ACCEPTED_ON_L1'],
      });

      return receipt;
    } catch (error) {
      await delay(500);
      return this.waitForPreConfirmedTransaction(txHash, retries + 1);
    }
  }

  private async waitForTransaction(txHash: string, retries: number, customAccount?: AccountInterface): Promise<any> {
    if (retries > 9) {
      throw new Error('Transaction failed');
    }

    try {
      const receipt = await (customAccount ?? this.account).waitForTransaction(txHash, {
        retryInterval: 350,
      });

      return receipt;
    } catch (error) {
      await delay(500);
      return this.waitForTransaction(txHash, retries + 1, customAccount);
    }
  }

  private async waitForBeastClaim(gameId: number, retries = 0): Promise<boolean> {
    const adventurerState = await this.getAdventurerState(gameId);

    if (adventurerState?.beast_health === 0 || retries > 19) {
      return true;
    }

    await delay(1000);
    return this.waitForBeastClaim(gameId, retries + 1);
  }

  private serializeBag(settings: GameSettingsData) {
    const bag: Record<string, { id: number; xp: number }> = {};

    for (let i = 0; i < 15; i++) {
      const item = settings.bag[i];
      bag[`item_${i + 1}`] = item ? { id: item.id, xp: item.xp } : { id: 0, xp: 0 };
    }

    return {
      ...bag,
      mutated: false,
    };
  }

  private getBeastSpecialIndex(value: string | null, isPrefix: boolean): number {
    if (!value) {
      return 0;
    }

    const entries = Object.entries(isPrefix ? BEAST_NAME_PREFIXES : BEAST_NAME_SUFFIXES);
    const entry = entries.find(([, label]) => label === value);
    return entry ? Number(entry[0]) : 0;
  }

  private isJackpotCombo(beastId: number, prefixIndex: number, suffixIndex: number): boolean {
    return (
      (beastId === 29 && prefixIndex === 18 && suffixIndex === 6) ||
      (beastId === 1 && prefixIndex === 47 && suffixIndex === 11) ||
      (beastId === 53 && prefixIndex === 61 && suffixIndex === 1)
    );
  }

  private async getAdventurerState(adventurerId: number): Promise<{ beast_health: number; action_count: number } | null> {
    try {
      const data = await this.callRpc({
        jsonrpc: '2.0',
        method: 'starknet_call',
        params: [
          {
            contract_address: getContractByName(this.config.network.manifest, this.config.network.namespace, 'adventurer_systems')?.address,
            entry_point_selector: '0x3d3148be1dfdfcfcd22f79afe7aee5a3147ef412bfb2ea27949e7f8c8937a7',
            calldata: [num.toHex(adventurerId)],
          },
          'latest',
        ],
        id: 0,
      });
      return {
        beast_health: parseInt(data?.result?.[3] ?? '0', 16),
        action_count: parseInt(data?.result?.[29] ?? '0', 16),
      };
    } catch (error) {
      return null;
    }
  }

  private async fetchTokenURI(tokenId: number, retries = 0): Promise<string | null> {
    const tokenURI = await this.getBeastTokenURI(tokenId);

    if (tokenURI || retries > 9) {
      return tokenURI;
    }

    await delay(1000);
    return this.fetchTokenURI(tokenId, retries + 1);
  }

  private async getBeastTokenURI(beastId: number): Promise<string | null> {
    try {
      const data = await this.callRpc({
        jsonrpc: '2.0',
        method: 'starknet_call',
        params: [
          {
            contract_address: this.config.network.beasts,
            entry_point_selector: '0x226ad7e84c1fe08eb4c525ed93cccadf9517670341304571e66f7c4f95cbe54',
            calldata: [num.toHex(beastId), '0x0'],
          },
          'latest',
        ],
        id: 0,
      });
      if (data?.result && Array.isArray(data.result)) {
        return decodeHexByteArray(data.result);
      }

      return data?.result ?? null;
    } catch (error) {
      return null;
    }
  }
}

function resolveChainId(envValue: string | undefined): ChainId {
  if (!envValue) {
    return ChainId.SN_MAIN;
  }

  if (envValue in ChainId) {
    return envValue as ChainId;
  }

  throw new Error(`Unsupported chain id ${envValue} supplied for system calls service`);
}

function mapToStarknetChain(chainId: ChainId): constants.StarknetChainId {
  switch (chainId) {
    case ChainId.SN_MAIN:
      return constants.StarknetChainId.SN_MAIN;
    case ChainId.SN_SEPOLIA:
      return constants.StarknetChainId.SN_SEPOLIA;
    case ChainId.WP_PG_SLOT:
      return constants.StarknetChainId.SN_SEPOLIA;
    default:
      return constants.StarknetChainId.SN_MAIN;
  }
}

function buildConfig(): SystemCallsConfig {
  const chainId = resolveChainId(process.env.VITE_PUBLIC_CHAIN);
  const network = getNetworkConfig(chainId);
  const vrfProviderAddress = process.env.VITE_PUBLIC_VRF_PROVIDER_ADDRESS ?? '';
  const storagePath = process.env.CARTRIDGE_STORAGE_PATH || path.join(process.cwd(), '.cartridge');

  if (!vrfProviderAddress) {
    throw new Error('VITE_PUBLIC_VRF_PROVIDER_ADDRESS must be configured to initialize system calls service');
  }

  return {
    network,
    vrfProviderAddress,
    storagePath,
  };
}

export const systemCallsService = service({
  register: (container) => {
    container.singleton('system.calls.config', () => buildConfig());
  },
  boot: async (container) => {
    const require = createRequire(import.meta.url);
    require('@cartridge/controller-wasm');
    require('@cartridge/controller-wasm/session');

    const { default: SessionProvider } = require('@cartridge/controller/session/node');

    const config = container.resolve('system.calls.config') as SystemCallsConfig;

    const policyContracts = new Map<string, { methods: Array<{ name: string; entrypoint: string; authorized: boolean }> }>();
    for (const policy of config.network.policies ?? []) {
      if (!policy.target) {
        continue;
      }
      const entry = policyContracts.get(policy.target) ?? { methods: [] };
      entry.methods.push({
        name: policy.method,
        entrypoint: policy.method,
        authorized: true,
      });
      policyContracts.set(policy.target, entry);
    }

    const provider = new SessionProvider({
      rpc: config.network.rpcUrl,
      chainId: mapToStarknetChain(config.network.chainId),
      policies: {
        contracts: Object.fromEntries(policyContracts.entries()),
      },
      basePath: config.storagePath,
    });
    container.instance('system.calls.provider', provider);

    const walletAccount = await provider.connect();

    if (!walletAccount) {
      throw new Error('Cartridge session could not be established. Complete session setup and retry.');
    }

    const connectedAccount = walletAccount as unknown as AccountInterface;
    container.instance('system.calls.account', connectedAccount);
    container.singleton('system.calls.client', () => new SystemCallsClient(connectedAccount, config));
  },
});

export function resolveSystemCalls(container: any): SystemCallsClient {
  return container.resolve('system.calls.client') as SystemCallsClient;
}

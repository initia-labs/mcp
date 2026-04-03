import {
  MnemonicKey, RawKey, Key,
  createInitiaContext, createMinievmContext,
  createMinimoveContext, createMiniwasmContext,
  createTransport,
} from '@initia/initia.js';
import { createRegistryProvider } from '@initia/initia.js/provider';
import type { AppConfig, KeyConfig } from '../config/index.js';
import { CHAIN_TYPE_ALIASES } from '../config/chains.js';
import { ChainNotFoundError, SignerRequiredError, UnsupportedCapabilityError, LedgerConnectionError, LedgerSignError } from '../errors.js';
import { ScanApiClient } from './scan-api.js';
import { logger } from '../logger.js';

type Network = 'mainnet' | 'testnet';

export class ChainManager {
  private readonly config: AppConfig;
  private readonly providerCache = new Map<Network, any>();
  private readonly contextCache = new Map<string, any>();
  private readonly scanApi: ScanApiClient | null;
  private key: Key | null = null;
  private ledgerTransport: any | null = null;

  private constructor(config: AppConfig) {
    this.config = config;
    this.scanApi = config.useScanApi ? new ScanApiClient() : null;
  }

  static async create(config: AppConfig): Promise<ChainManager> {
    const manager = new ChainManager(config);
    await manager.initKey();
    // Clear raw secret material — no longer needed after key derivation
    if (config.key.mnemonic) config.key.mnemonic = '';
    if (config.key.privateKey) config.key.privateKey = '';
    return manager;
  }

  private async initKey(): Promise<void> {
    const kc = this.config.key;

    try {
      switch (kc.type) {
        case 'mnemonic':
          this.key = new MnemonicKey({ mnemonic: kc.mnemonic!, index: kc.index });
          break;
        case 'raw':
          this.key = RawKey.fromHex(kc.privateKey!);
          break;
        case 'ledger':
          this.key = await this.initLedgerKey(kc);
          break;
        case 'none':
          break;
      }
    } catch (e: unknown) {
      if (kc.type !== 'ledger') throw e;
      const { LedgerError } = await import('@initia/ledger-key');
      if (e instanceof LedgerError) {
        throw new LedgerSignError((e as Error).message);
      }
      if (e instanceof Error) {
        throw new LedgerConnectionError(e.message);
      }
      throw e;
    }
  }

  private async initLedgerKey(kc: KeyConfig): Promise<Key> {
    const TransportNodeHid = await import('@ledgerhq/hw-transport-node-hid');
    const { LedgerKey } = await import('@initia/ledger-key');

    // hw-transport-node-hid exports default as .default or directly
    const TransportClass = ('default' in TransportNodeHid ? TransportNodeHid.default : TransportNodeHid) as any;
    const transport = await TransportClass.create();
    this.ledgerTransport = transport;

    if (kc.ledgerApp === 'cosmos') {
      return LedgerKey.createCosmosApp(transport, { index: kc.index });
    }
    return LedgerKey.createEthereumApp(transport, { index: kc.index });
  }

  async close(): Promise<void> {
    if (this.ledgerTransport) {
      await this.ledgerTransport.close();
      this.ledgerTransport = null;
    }
  }

  private resolveNetwork(network?: Network): Network {
    return network ?? this.config.network;
  }

  getScanApi(): ScanApiClient | null { return this.scanApi; }

  getKey(): Key | null { return this.key; }
  hasSigner(): boolean { return this.key !== null; }
  requireSigner(): void { if (!this.key) throw new SignerRequiredError(); }
  getSignerAddress(): string | undefined { return this.key?.address; }

  async getLedgerInfo(): Promise<{ connected: boolean; app?: string; version?: string; address?: string; path?: string } | null> {
    if (this.config.key.type !== 'ledger' || !this.key) return null;
    try {
      const { LedgerKey } = await import('@initia/ledger-key');
      if (!(this.key instanceof LedgerKey)) return { connected: false };
      const lk = this.key as any;
      const appConfig = await lk.getAppConfiguration() as { version?: string };
      return {
        connected: true,
        app: lk.getApplicationKind(),
        version: appConfig.version ?? undefined,
        address: this.key.address,
        path: lk.getPath(),
      };
    } catch {
      return { connected: false };
    }
  }

  async ledgerShowAddress(): Promise<string> {
    if (!this.key) throw new SignerRequiredError();
    const { LedgerKey } = await import('@initia/ledger-key');
    if (!(this.key instanceof LedgerKey)) {
      throw new LedgerConnectionError('Key is not a LedgerKey instance.');
    }
    const lk = this.key as any;
    await lk.showAddressAndPubKey();
    return this.key.address;
  }

  async getProvider(network?: Network): Promise<any> {
    const net = this.resolveNetwork(network);
    let provider = this.providerCache.get(net);
    if (!provider) {
      provider = await createRegistryProvider({ network: net });
      provider.createTransport = createTransport;
      this.providerCache.set(net, provider);
    }
    return provider;
  }

  async listChains(network?: Network): Promise<any[]> {
    const provider = await this.getProvider(network);
    return provider.listChains();
  }

  /**
   * Resolve a chain query to a chain info object.
   * Resolution order:
   *   1. chainName match (case-insensitive) — e.g., "Tucana", "noon"
   *   2. Type alias fallback — e.g., "initia"/"l1" → chainType "initia"
   *   3. Direct chainId match — e.g., "interwoven-1", "minievm-1"
   */
  private resolveChain(chains: any[], chainQuery: string): any {
    const q = chainQuery.toLowerCase();
    return chains.find((c: any) => c.chainName?.toLowerCase() === q)
      ?? chains.find((c: any) => c.chainType === (CHAIN_TYPE_ALIASES[q] ?? ''))
      ?? chains.find((c: any) => c.chainId === chainQuery);
  }

  async getChainInfo(chainQuery: string, network?: Network): Promise<any> {
    const net = this.resolveNetwork(network);
    const chains = await (await this.getProvider(net)).listChains();
    const chainInfo = this.resolveChain(chains, chainQuery);
    if (!chainInfo) throw new ChainNotFoundError(chainQuery);
    return chainInfo;
  }

  async getContext(chainQuery: string, network?: Network): Promise<any> {
    const net = this.resolveNetwork(network);
    const chains = await (await this.getProvider(net)).listChains();
    const chainInfo = this.resolveChain(chains, chainQuery);
    if (!chainInfo) throw new ChainNotFoundError(chainQuery);

    const chainId: string = chainInfo.chainId;
    const cacheKey = `${net}:${chainId}`;
    const cached = this.contextCache.get(cacheKey);
    if (cached) return cached;

    const chainType: string = chainInfo.chainType ?? 'other';
    logger.info('Building chain context', { chainId, chainType, network: net });

    const baseOpts: any = {
      network: net,
      ...(this.key ? { signer: this.key } : {}),
    };

    let ctx: any;
    switch (chainType) {
      case 'initia':
        ctx = await createInitiaContext({ ...baseOpts });
        break;
      case 'minievm':
        ctx = await createMinievmContext({ ...baseOpts, chainId });
        break;
      case 'minimove':
        ctx = await createMinimoveContext({ ...baseOpts, chainId });
        break;
      case 'miniwasm':
        ctx = await createMiniwasmContext({ ...baseOpts, chainId });
        break;
      default:
        throw new UnsupportedCapabilityError('context creation', `${chainId} (type: ${chainType})`);
    }

    this.contextCache.set(cacheKey, ctx);
    return ctx;
  }
}

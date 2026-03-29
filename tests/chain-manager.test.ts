import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChainManager } from '../src/initia/chain-manager.js';
import { AppConfig } from '../src/config/index.js';

vi.mock('@initia/initia.js', () => {
  const MnemonicKey = vi.fn().mockImplementation(function (this: any) {
    this.address = 'init1test';
  });
  const RawKey = {
    fromHex: vi.fn().mockReturnValue({ address: 'init1test' }),
  };
  const Key = vi.fn();
  return {
    MnemonicKey,
    RawKey,
    Key,
    createInitiaContext: vi.fn().mockResolvedValue({ chainType: 'initia', chainId: 'initiation-2', client: {} }),
    createMinievmContext: vi.fn().mockResolvedValue({ chainType: 'minievm', chainId: 'minievm-1', client: {} }),
    createMinimoveContext: vi.fn().mockResolvedValue({ chainType: 'minimove', chainId: 'minimove-1', client: {} }),
    createMiniwasmContext: vi.fn().mockResolvedValue({ chainType: 'miniwasm', chainId: 'miniwasm-1', client: {} }),
    createTransport: vi.fn(),
  };
});

vi.mock('@initia/initia.js/provider', () => ({
  createRegistryProvider: vi.fn().mockResolvedValue({
    listChains: vi.fn().mockReturnValue([
      { chainId: 'initiation-2', chainType: 'initia' },
      { chainId: 'minievm-1', chainType: 'minievm' },
    ]),
  }),
}));

const baseConfig: AppConfig = {
  key: { type: 'none', index: 0, ledgerApp: 'ethereum' },
  autoConfirm: false, logLevel: 'info',
  network: 'testnet', useScanApi: false,
};

describe('ChainManager', () => {
  let manager: ChainManager;
  beforeEach(async () => { manager = await ChainManager.create(baseConfig); });

  it('should report signer availability', async () => {
    expect(manager.hasSigner()).toBe(false);
    const m2 = await ChainManager.create({
      ...baseConfig,
      key: { type: 'mnemonic', mnemonic: 'abandon '.repeat(11) + 'about', index: 0, ledgerApp: 'ethereum' },
    });
    expect(m2.hasSigner()).toBe(true);
  });

  it('should resolve type alias "initia" to L1 chain from registry', async () => {
    const ctx = await manager.getContext('initia');
    expect(ctx.chainType).toBe('initia');
    expect(ctx.chainId).toBe('initiation-2');
  });
  it('should resolve type alias "l1" to L1 chain from registry', async () => {
    const ctx = await manager.getContext('l1');
    expect(ctx.chainId).toBe('initiation-2');
  });
  it('should create context via direct chainId', async () => {
    const ctx = await manager.getContext('minievm-1');
    expect(ctx.chainType).toBe('minievm');
  });
  it('should cache contexts by chainId', async () => {
    const ctx1 = await manager.getContext('initia');
    const ctx2 = await manager.getContext('initia');
    expect(ctx1).toBe(ctx2);
  });
  it('should throw for unknown chain', async () => {
    await expect(manager.getContext('nonexistent-99')).rejects.toThrow('Chain not found');
  });
  it('should expose key via getKey()', async () => {
    expect(manager.getKey()).toBeNull();
    const m2 = await ChainManager.create({
      ...baseConfig,
      key: { type: 'mnemonic', mnemonic: 'abandon '.repeat(11) + 'about', index: 0, ledgerApp: 'ethereum' },
    });
    expect(m2.getKey()).not.toBeNull();
  });
  it('should close without error when no ledger', async () => {
    await expect(manager.close()).resolves.toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';

// Mock initia.js modules to prevent real network calls
vi.mock('@initia/initia.js', () => ({
  MnemonicKey: vi.fn().mockImplementation(function (this: any) { this.address = 'init1test'; }),
  RawKey: { fromHex: vi.fn(() => ({ address: 'init1test' })) },
  Key: vi.fn(),
  createTransport: vi.fn(),
  createInitiaContext: vi.fn(),
  createMinievmContext: vi.fn(),
  createMinimoveContext: vi.fn(),
  createMiniwasmContext: vi.fn(),
  getGasPrices: vi.fn(),
  coin: vi.fn(),
}));

vi.mock('@initia/initia.js/provider', () => ({
  createRegistryProvider: vi.fn(),
}));

vi.mock('@initia/initia.js/move', () => ({
  callViewFunction: vi.fn(),
  queryResource: vi.fn(),
  createExecuteMsg: vi.fn(),
}));

vi.mock('@initia/initia.js/wasm', () => ({
  queryContract: vi.fn(),
  createWasmExecuteMsg: vi.fn(),
}));

vi.mock('@initia/initia.js/vip', () => ({
  createVip: vi.fn(),
}));

// Mock getAddressProfile from @initia/initia.js/client
const mockGetAddressProfile = vi.fn();
vi.mock('@initia/initia.js/client', () => ({
  getAddressProfile: mockGetAddressProfile,
}));

const VALID_BECH32 = 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
const VALID_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const INVALID_ADDRESS = 'not-an-address';

describe('address_validate tool', () => {
  let registry: ToolRegistry;
  let mockChainManager: any;

  beforeEach(async () => {
    mockGetAddressProfile.mockReset();

    mockChainManager = {
      getContext: vi.fn().mockResolvedValue({ chainId: 'initiation-2' }),
    };

    const mod = await import('../src/tools/index.js');
    registry = mod.registry;
  });

  it('is registered in the registry', () => {
    const tool = registry.get('address_validate');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('address_validate');
    expect(tool!.group).toBe('address');
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it('returns valid bech32 result without profile when chain is omitted', async () => {
    const tool = registry.get('address_validate')!;
    const result = await tool.handler({ address: VALID_BECH32 }, { chainManager: mockChainManager } as any);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.valid).toBe(true);
    expect(data.format).toBe('bech32');
    expect(data.address).toBe(VALID_BECH32);
    expect(data.profile).toBeUndefined();
    expect(mockChainManager.getContext).not.toHaveBeenCalled();
    expect(mockGetAddressProfile).not.toHaveBeenCalled();
  });

  it('returns invalid result without profile when address is invalid and chain is omitted', async () => {
    const tool = registry.get('address_validate')!;
    const result = await tool.handler({ address: INVALID_ADDRESS }, { chainManager: mockChainManager } as any);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.valid).toBe(false);
    expect(data.format).toBe('invalid');
    expect(data.profile).toBeUndefined();
    expect(mockGetAddressProfile).not.toHaveBeenCalled();
  });

  it('returns profile when chain is provided and bech32 address is valid', async () => {
    const sampleProfile = {
      address: VALID_BECH32,
      account: 'base',
      contract: 'none',
    };
    mockGetAddressProfile.mockResolvedValue(sampleProfile);

    const tool = registry.get('address_validate')!;
    const result = await tool.handler(
      { address: VALID_BECH32, chain: 'initia' },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.valid).toBe(true);
    expect(data.format).toBe('bech32');
    expect(data.profile).toBeDefined();
    // address field stripped from profile
    expect(data.profile.address).toBeUndefined();
    expect(data.profile.account).toBe('base');
    expect(data.profile.contract).toBe('none');
    expect(mockChainManager.getContext).toHaveBeenCalledWith('initia', undefined);
    expect(mockGetAddressProfile).toHaveBeenCalledWith({ chainId: 'initiation-2' }, VALID_BECH32);
  });

  it('returns profile when chain is provided and EVM address is valid', async () => {
    const sampleProfile = {
      address: VALID_EVM,
      account: 'evm-code',
      contract: 'evm',
    };
    mockGetAddressProfile.mockResolvedValue(sampleProfile);

    const tool = registry.get('address_validate')!;
    const result = await tool.handler(
      { address: VALID_EVM, chain: 'minievm' },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.valid).toBe(true);
    expect(data.format).toBe('evm');
    expect(data.profile).toBeDefined();
    expect(data.profile.address).toBeUndefined();
    expect(data.profile.account).toBe('evm-code');
  });

  it('skips profile fetch for invalid address even when chain is provided', async () => {
    const tool = registry.get('address_validate')!;
    const result = await tool.handler(
      { address: INVALID_ADDRESS, chain: 'initia' },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.valid).toBe(false);
    expect(data.format).toBe('invalid');
    expect(data.profile).toBeUndefined();
    expect(mockChainManager.getContext).not.toHaveBeenCalled();
    expect(mockGetAddressProfile).not.toHaveBeenCalled();
  });

  it('converts Uint8Array codeHash to truncated hex string', async () => {
    const codeHashBytes = new Uint8Array(32).fill(0xab);
    const sampleProfile = {
      address: VALID_BECH32,
      account: 'evm-code',
      contract: 'evm',
      codeHash: codeHashBytes,
    };
    mockGetAddressProfile.mockResolvedValue(sampleProfile);

    const tool = registry.get('address_validate')!;
    const result = await tool.handler(
      { address: VALID_BECH32, chain: 'minievm' },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(typeof data.profile.codeHash).toBe('string');
    expect(data.profile.codeHash).toHaveLength(64);
    expect(data.profile.codeHash).toBe('ab'.repeat(32));
  });

  it('passes network param to getContext when provided', async () => {
    const sampleProfile = { address: VALID_BECH32, account: 'base', contract: 'none' };
    mockGetAddressProfile.mockResolvedValue(sampleProfile);

    const tool = registry.get('address_validate')!;
    await tool.handler(
      { address: VALID_BECH32, chain: 'initia', network: 'testnet' },
      { chainManager: mockChainManager } as any,
    );

    expect(mockChainManager.getContext).toHaveBeenCalledWith('initia', 'testnet');
  });
});

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

vi.mock('@initia/initia.js/util', () => ({
  AccAddress: { validate: (a: string) => a.startsWith('init1') },
  isValidEvmAddress: (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a),
}));

vi.mock('@initia/initia.js/client', () => ({
  getAddressProfile: vi.fn(),
}));

const VALID_BECH32 = 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
const VALID_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const INVALID_ADDRESS = 'not-an-address';

describe('feegrant_allowances tool', () => {
  let registry: ToolRegistry;
  let mockAllowances: ReturnType<typeof vi.fn>;
  let mockChainManager: any;

  beforeEach(async () => {
    mockAllowances = vi.fn().mockResolvedValue({ allowances: [], pagination: null });

    mockChainManager = {
      getContext: vi.fn().mockResolvedValue({
        chainId: 'initiation-2',
        client: {
          feegrant: {
            allowances: mockAllowances,
          },
        },
      }),
    };

    const mod = await import('../src/tools/index.js');
    registry = mod.registry;
  });

  it('is registered as read-only in the feegrant group', () => {
    const tool = registry.get('feegrant_allowances');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('feegrant_allowances');
    expect(tool!.group).toBe('feegrant');
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it('queries allowances by grantee and returns result', async () => {
    const mockResult = {
      allowances: [{ granter: 'init1granter', grantee: VALID_BECH32, allowance: {} }],
      pagination: null,
    };
    mockAllowances.mockResolvedValue(mockResult);

    const tool = registry.get('feegrant_allowances')!;
    const result = await tool.handler(
      { chain: 'initia', grantee: VALID_BECH32 },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.allowances).toHaveLength(1);
    expect(data.allowances[0].grantee).toBe(VALID_BECH32);
    expect(mockChainManager.getContext).toHaveBeenCalledWith('initia', undefined);
    expect(mockAllowances).toHaveBeenCalledWith({ grantee: VALID_BECH32 });
  });

  it('accepts a valid EVM address as grantee', async () => {
    const tool = registry.get('feegrant_allowances')!;
    const result = await tool.handler(
      { chain: 'minievm', grantee: VALID_EVM },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    expect(mockAllowances).toHaveBeenCalledWith({ grantee: VALID_EVM });
  });

  it('rejects an invalid grantee address with ValidationError', async () => {
    const tool = registry.get('feegrant_allowances')!;

    await expect(
      tool.handler(
        { chain: 'initia', grantee: INVALID_ADDRESS },
        { chainManager: mockChainManager } as any,
      ),
    ).rejects.toThrow('Invalid grantee address');

    expect(mockChainManager.getContext).not.toHaveBeenCalled();
    expect(mockAllowances).not.toHaveBeenCalled();
  });

  it('passes network param to getContext', async () => {
    const tool = registry.get('feegrant_allowances')!;
    await tool.handler(
      { chain: 'initia', grantee: VALID_BECH32, network: 'testnet' },
      { chainManager: mockChainManager } as any,
    );

    expect(mockChainManager.getContext).toHaveBeenCalledWith('initia', 'testnet');
  });
});

describe('feegrant_grant tool', () => {
  it('registers with destructiveHint false', async () => {
    const { registry } = await import('../src/tools/index.js');
    const tool = registry.get('feegrant_grant');
    expect(tool).toBeDefined();
    expect(tool!.annotations.destructiveHint).toBe(false);
  });

  it('rejects when neither spendLimit nor expiration is provided', async () => {
    const { registry } = await import('../src/tools/index.js');
    const tool = registry.get('feegrant_grant')!;
    const mockCtx = {
      chainManager: { requireSigner: vi.fn(), getSignerAddress: () => 'init1signer', getContext: vi.fn() },
      config: { key: { type: 'mnemonic' }, autoConfirm: false, logLevel: 'error', network: 'testnet', useScanApi: false },
    };
    await expect(
      tool.handler({ chain: 'initia', grantee: 'init1grantee', dryRun: true, confirm: false } as any, mockCtx as any),
    ).rejects.toThrow(/spendLimit.*expiration/i);
  });

  it('accepts when only spendLimit is provided', async () => {
    const { registry } = await import('../src/tools/index.js');
    const tool = registry.get('feegrant_grant')!;
    const mockGrantAllowance = vi.fn().mockReturnValue({ typeUrl: 'test', toAmino: () => ({}) });
    const mockCtx = {
      chainManager: {
        requireSigner: vi.fn(),
        getSignerAddress: () => 'init1signer',
        getContext: vi.fn().mockResolvedValue({
          chainId: 'initia-1',
          msgs: { feegrant: { grantAllowance: mockGrantAllowance } },
          estimateGas: vi.fn().mockResolvedValue({ gasLimit: 200000 }),
        }),
      },
      config: { key: { type: 'mnemonic' }, autoConfirm: false, logLevel: 'error', network: 'testnet', useScanApi: false },
    };
    await tool.handler({
      chain: 'initia', grantee: 'init1grantee', spendLimit: '1000000',
      dryRun: false, confirm: false,
    } as any, mockCtx as any);
    expect(mockGrantAllowance).toHaveBeenCalled();
  });
});

describe('feegrant_revoke tool', () => {
  it('registers with destructiveHint false', async () => {
    const { registry } = await import('../src/tools/index.js');
    const tool = registry.get('feegrant_revoke');
    expect(tool).toBeDefined();
    expect(tool!.annotations.destructiveHint).toBe(false);
  });

  it('validates grantee address', async () => {
    const { registry } = await import('../src/tools/index.js');
    const tool = registry.get('feegrant_revoke')!;
    const mockCtx = {
      chainManager: { requireSigner: vi.fn(), getSignerAddress: () => 'init1signer', getContext: vi.fn() },
      config: { key: { type: 'mnemonic' }, autoConfirm: false, logLevel: 'error', network: 'testnet', useScanApi: false },
    };
    await expect(
      tool.handler({ chain: 'initia', grantee: 'invalid', dryRun: true, confirm: false } as any, mockCtx as any),
    ).rejects.toThrow(/Invalid address/i);
  });
});

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

describe('authz_grants tool', () => {
  let registry: ToolRegistry;
  let mockGrants: ReturnType<typeof vi.fn>;
  let mockGranterGrants: ReturnType<typeof vi.fn>;
  let mockGranteeGrants: ReturnType<typeof vi.fn>;
  let mockChainManager: any;

  beforeEach(async () => {
    mockGrants = vi.fn().mockResolvedValue({ grants: [], pagination: null });
    mockGranterGrants = vi.fn().mockResolvedValue({ grants: [], pagination: null });
    mockGranteeGrants = vi.fn().mockResolvedValue({ grants: [], pagination: null });

    mockChainManager = {
      getContext: vi.fn().mockResolvedValue({
        chainId: 'initiation-2',
        client: {
          authz: {
            grants: mockGrants,
            granterGrants: mockGranterGrants,
            granteeGrants: mockGranteeGrants,
          },
        },
      }),
    };

    const mod = await import('../src/tools/index.js');
    registry = mod.registry;
  });

  it('is registered as read-only in the authz group', () => {
    const tool = registry.get('authz_grants');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('authz_grants');
    expect(tool!.group).toBe('authz');
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it('queries grants by granter and returns result', async () => {
    const mockResult = {
      grants: [{ authorization: {}, expiration: null }],
      pagination: null,
    };
    mockGranterGrants.mockResolvedValue(mockResult);

    const tool = registry.get('authz_grants')!;
    const result = await tool.handler(
      { chain: 'initia', granter: VALID_BECH32 },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.grants).toHaveLength(1);
    expect(mockChainManager.getContext).toHaveBeenCalledWith('initia', undefined);
    expect(mockGranterGrants).toHaveBeenCalledWith({ granter: VALID_BECH32 });
  });

  it('queries grants by grantee and returns result', async () => {
    const tool = registry.get('authz_grants')!;
    await tool.handler(
      { chain: 'initia', grantee: VALID_BECH32 },
      { chainManager: mockChainManager } as any,
    );

    expect(mockGranteeGrants).toHaveBeenCalledWith({ grantee: VALID_BECH32 });
  });

  it('queries grants with both granter and grantee', async () => {
    const granter = 'init1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const grantee = VALID_BECH32;
    const tool = registry.get('authz_grants')!;
    await tool.handler(
      { chain: 'initia', granter, grantee },
      { chainManager: mockChainManager } as any,
    );

    expect(mockGrants).toHaveBeenCalledWith({ granter, grantee });
  });

  it('rejects when both granter and grantee are omitted', async () => {
    const tool = registry.get('authz_grants')!;

    await expect(
      tool.handler(
        { chain: 'initia' },
        { chainManager: mockChainManager } as any,
      ),
    ).rejects.toThrow('At least one of granter or grantee must be provided.');

    expect(mockChainManager.getContext).not.toHaveBeenCalled();
    expect(mockGrants).not.toHaveBeenCalled();
  });

  it('rejects invalid granter address with ValidationError', async () => {
    const tool = registry.get('authz_grants')!;

    await expect(
      tool.handler(
        { chain: 'initia', granter: INVALID_ADDRESS },
        { chainManager: mockChainManager } as any,
      ),
    ).rejects.toThrow('Invalid address');

    expect(mockChainManager.getContext).not.toHaveBeenCalled();
    expect(mockGrants).not.toHaveBeenCalled();
  });

  it('rejects invalid grantee address with ValidationError', async () => {
    const tool = registry.get('authz_grants')!;

    await expect(
      tool.handler(
        { chain: 'initia', grantee: INVALID_ADDRESS },
        { chainManager: mockChainManager } as any,
      ),
    ).rejects.toThrow('Invalid address');

    expect(mockChainManager.getContext).not.toHaveBeenCalled();
    expect(mockGrants).not.toHaveBeenCalled();
  });

  it('accepts a valid EVM address as granter', async () => {
    const tool = registry.get('authz_grants')!;
    const result = await tool.handler(
      { chain: 'minievm', granter: VALID_EVM },
      { chainManager: mockChainManager } as any,
    );

    expect(result.isError).toBeFalsy();
    expect(mockGranterGrants).toHaveBeenCalledWith({ granter: VALID_EVM });
  });

  it('passes network param to getContext', async () => {
    const tool = registry.get('authz_grants')!;
    await tool.handler(
      { chain: 'initia', granter: VALID_BECH32, network: 'testnet' },
      { chainManager: mockChainManager } as any,
    );

    expect(mockChainManager.getContext).toHaveBeenCalledWith('initia', 'testnet');
  });
});

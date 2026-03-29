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

describe('chain_block tool', () => {
  let registry: ToolRegistry;
  let mockBlock: ReturnType<typeof vi.fn>;
  let mockChainManager: any;

  beforeEach(async () => {
    mockBlock = vi.fn();

    mockChainManager = {
      getContext: vi.fn().mockResolvedValue({
        chainId: 'initiation-2',
        rpc: {
          block: mockBlock,
        },
      }),
    };

    // Import the singleton registry (side-effect registration)
    const mod = await import('../src/tools/index.js');
    registry = mod.registry;
  });

  it('is registered in the registry', () => {
    const tool = registry.get('chain_block');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('chain_block');
    expect(tool!.group).toBe('chain');
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it('calls ctx.rpc.block with no height when height is omitted', async () => {
    const tool = registry.get('chain_block')!;
    const fakeBlock = { block_id: 'abc123', block: { header: { height: '100' }, data: { txs: [] } } };
    mockBlock.mockResolvedValue(fakeBlock);

    const result = await tool.handler({ chain: 'initia' }, { chainManager: mockChainManager } as any);

    expect(mockBlock).toHaveBeenCalledWith(undefined);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data).toEqual(fakeBlock);
  });

  it('calls ctx.rpc.block with the provided height', async () => {
    const tool = registry.get('chain_block')!;
    const fakeBlock = { block_id: 'def456', block: { header: { height: '42' }, data: { txs: ['tx1'] } } };
    mockBlock.mockResolvedValue(fakeBlock);

    const result = await tool.handler({ chain: 'initia', height: 42 }, { chainManager: mockChainManager } as any);

    expect(mockBlock).toHaveBeenCalledWith(42);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.block.header.height).toBe('42');
  });

  it('propagates RPC errors', async () => {
    const tool = registry.get('chain_block')!;
    mockBlock.mockRejectedValue(new Error('RPC unreachable'));

    await expect(
      tool.handler({ chain: 'initia', height: 1 }, { chainManager: mockChainManager } as any),
    ).rejects.toThrow('RPC unreachable');
  });
});

describe('chain_block_results tool', () => {
  let registry: ToolRegistry;
  let mockBlockResults: ReturnType<typeof vi.fn>;
  let mockChainManager: any;

  beforeEach(async () => {
    mockBlockResults = vi.fn();

    mockChainManager = {
      getContext: vi.fn().mockResolvedValue({
        chainId: 'initiation-2',
        rpc: {
          blockResults: mockBlockResults,
        },
      }),
    };

    const mod = await import('../src/tools/index.js');
    registry = mod.registry;
  });

  it('is registered in the registry', () => {
    const tool = registry.get('chain_block_results');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('chain_block_results');
    expect(tool!.group).toBe('chain');
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it('calls ctx.rpc.blockResults with the required height', async () => {
    const tool = registry.get('chain_block_results')!;
    const fakeResults = {
      height: '99',
      txs_results: [{ code: 0, log: 'ok' }],
      validator_updates: [],
      consensus_param_updates: null,
    };
    mockBlockResults.mockResolvedValue(fakeResults);

    const result = await tool.handler({ chain: 'initia', height: 99 }, { chainManager: mockChainManager } as any);

    expect(mockBlockResults).toHaveBeenCalledWith(99);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.height).toBe('99');
    expect(data.txs_results).toHaveLength(1);
  });

  it('propagates RPC errors', async () => {
    const tool = registry.get('chain_block_results')!;
    mockBlockResults.mockRejectedValue(new Error('block not found'));

    await expect(
      tool.handler({ chain: 'initia', height: 9999999 }, { chainManager: mockChainManager } as any),
    ).rejects.toThrow('block not found');
  });
});

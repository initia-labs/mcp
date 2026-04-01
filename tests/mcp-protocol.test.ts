import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChainManager } from '../src/initia/chain-manager.js';
import { AppConfig } from '../src/config/index.js';
import { registry } from '../src/tools/index.js';
import { bindToMcpServer } from '../src/mcp/adapter.js';

// Mock initia.js to prevent real network calls
vi.mock('@initia/initia.js', () => {
  const MnemonicKey = vi.fn().mockImplementation(function (this: any) { this.address = 'init1test'; });
  const RawKey = { fromHex: vi.fn(() => ({ address: 'init1test' })) };
  return {
    MnemonicKey, RawKey,
    Key: vi.fn(),
    createTransport: vi.fn(),
    createInitiaContext: vi.fn().mockResolvedValue({
      chainType: 'initia', chainId: 'initiation-2',
      client: {
        bank: { allBalances: vi.fn().mockResolvedValue({ balances: [{ denom: 'uinit', amount: '1000000' }] }) },
        auth: { account: vi.fn().mockResolvedValue({ account: { address: 'init1test' } }) },
      },
    }),
    createMinievmContext: vi.fn(),
    createMinimoveContext: vi.fn(),
    createMiniwasmContext: vi.fn(),
    coin: vi.fn((d: string, a: string) => ({ denom: d, amount: a })),
  };
});

vi.mock('@initia/initia.js/provider', () => ({
  createRegistryProvider: vi.fn().mockResolvedValue({
    listChains: vi.fn().mockReturnValue([
      { chainId: 'initiation-2', chainType: 'initia' },
      { chainId: 'minievm-1', chainType: 'minievm' },
      { chainId: 'miniwasm-1', chainType: 'miniwasm' },
    ]),
  }),
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

vi.mock('@initia/initia.js/client', () => ({
  getAddressProfile: vi.fn().mockResolvedValue(null),
}));

describe('MCP Protocol Integration', () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    const config: AppConfig = {
      key: { type: 'mnemonic', mnemonic: 'abandon '.repeat(11) + 'about', index: 0, ledgerApp: 'ethereum' },
      autoConfirm: false,
      logLevel: 'error',
      network: 'testnet',
      useScanApi: false,
    };

    const chainManager = await ChainManager.create(config);
    server = new McpServer({ name: '@initia/mcp', version: '0.1.0' });
    bindToMcpServer(server, registry, { chainManager, config });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it('lists all tools via MCP protocol', async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(55);
    const names = result.tools.map(t => t.name);
    expect(names).toContain('chain_list');
    expect(names).toContain('bridge_execute');
    expect(names).toContain('wasm_execute');
  });

  it('each tool has a description and inputSchema', async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('calls chain_list tool successfully', async () => {
    const result = await client.callTool({ name: 'chain_list', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const text = (result.content as any)[0]?.text;
    expect(text).toContain('initiation-2');
  });

  it('calls account_get tool successfully', async () => {
    const result = await client.callTool({
      name: 'account_get',
      arguments: { chain: 'initia', address: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as any)[0]?.text;
    expect(text).toContain('uinit');
  });

  it('returns error for unknown chain', async () => {
    const result = await client.callTool({
      name: 'chain_capabilities',
      arguments: { chain: 'nonexistent-99' },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0]?.text;
    expect(text).toContain('CHAIN_NOT_FOUND');
  });

  it('returns WRONG_VM error for incompatible tool', async () => {
    const result = await client.callTool({
      name: 'evm_call',
      arguments: { chain: 'initia', contractAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', input: '0x00' },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0]?.text;
    expect(text).toContain('WRONG_VM');
  });

  it('returns SIGNER_REQUIRED for mutation without signer', async () => {
    // Create a separate server without signer
    const noSignerConfig: AppConfig = { key: { type: 'none', index: 0, ledgerApp: 'ethereum' }, autoConfirm: false, logLevel: 'error', network: 'testnet', useScanApi: false };
    const noSignerServer = new McpServer({ name: 'initia-mcp-nosigner', version: '0.1.0' });
    const noSignerChainManager = await ChainManager.create(noSignerConfig);
    bindToMcpServer(noSignerServer, registry, { chainManager: noSignerChainManager, config: noSignerConfig });

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const noSignerClient = new Client({ name: 'test-nosigner', version: '1.0.0' });
    await Promise.all([noSignerClient.connect(ct), noSignerServer.connect(st)]);

    const result = await noSignerClient.callTool({
      name: 'bank_send',
      arguments: { chain: 'initia', sends: [{ to: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d', amount: '1000', denom: 'uinit' }] },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0]?.text;
    expect(text).toContain('SIGNER_REQUIRED');

    await noSignerClient.close();
    await noSignerServer.close();
  });

  it('each tool has annotations', async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations!.readOnlyHint).toBe('boolean');
    }
  });

  it('read-only tools are annotated as readOnlyHint=true', async () => {
    const result = await client.listTools();
    const readOnlyTools = ['chain_list', 'chain_capabilities', 'account_get', 'validator_list',
      'delegation_get', 'denom_metadata', 'tx_get', 'tx_search', 'portfolio_get',
      'vip_stage_info', 'vip_positions', 'vip_voting_power', 'vip_claimable_rewards',
      'distribution_rewards', 'username_record', 'username_metadata', 'username_check'];
    for (const name of readOnlyTools) {
      const tool = result.tools.find(t => t.name === name);
      expect(tool?.annotations?.readOnlyHint, `${name} should be readOnly`).toBe(true);
    }
  });

  it('mutation tools are annotated as readOnlyHint=false', async () => {
    const result = await client.listTools();
    const mutationTools = ['bank_send', 'ibc_transfer', 'staking_manage', 'governance_vote',
      'bridge_execute', 'move_execute', 'evm_send', 'wasm_execute',
      'vip_delegate', 'vip_undelegate', 'vip_redelegate', 'vip_extend_lock',
      'vip_gauge_vote', 'vip_gauge_vote_by_amount',
      'vip_claim_rewards', 'vip_claim_staking_rewards',
      'vip_provide_and_delegate', 'vip_stableswap_provide_and_delegate',
      'bridge_deposit', 'bridge_withdraw'];
    for (const name of mutationTools) {
      const tool = result.tools.find(t => t.name === name);
      expect(tool?.annotations?.readOnlyHint, `${name} should not be readOnly`).toBe(false);
    }
  });

  it('handles concurrent tool calls without errors', async () => {
    const results = await Promise.all([
      client.callTool({ name: 'chain_list', arguments: {} }),
      client.callTool({ name: 'chain_list', arguments: {} }),
      client.callTool({ name: 'chain_list', arguments: {} }),
    ]);
    for (const result of results) {
      expect(result.isError).toBeFalsy();
      const data = JSON.parse((result.content as any)[0].text);
      expect(data).toContainEqual(expect.objectContaining({ chainId: 'initiation-2' }));
    }
  });

  it('returns error for unknown tool name', async () => {
    const result = await client.callTool({ name: 'nonexistent_tool', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('not found');
  });
});

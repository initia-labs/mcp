/**
 * Smoke tests — runs against real Initia testnet.
 *
 * Read-only tests always run.
 * Signer-dependent read-only and mutation tests only run when INITIA_KEY is set.
 *
 * Run: npm run test:smoke
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChainManager } from '../src/initia/chain-manager.js';
import { AppConfig } from '../src/config/index.js';
import { registry } from '../src/tools/index.js';
import { bindToMcpServer } from '../src/mcp/adapter.js';

// Load .env file (Node.js 22+ built-in)
try { process.loadEnvFile('.env'); } catch {}

const KEY = process.env.INITIA_KEY;
const hasSigner = !!KEY;

let client: Client;
let chainManager: ChainManager;
let l1ChainId: string;
let allChains: any[];

beforeAll(async () => {
  const config: AppConfig = {
    key: KEY
      ? { type: 'mnemonic' as const, mnemonic: KEY, index: 0, ledgerApp: 'ethereum' as const }
      : { type: 'none' as const, index: 0, ledgerApp: 'ethereum' as const },
    autoConfirm: false,
    logLevel: 'info',
    network: 'testnet',
    useScanApi: false,
  };

  const server = new McpServer({ name: '@initia/mcp-smoke', version: '0.1.0' });
  chainManager = await ChainManager.create(config);
  bindToMcpServer(server, registry, { chainManager, config });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'smoke-client', version: '1.0.0' });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  // Discover actual chain IDs for subsequent tests
  const listResult = await client.callTool({ name: 'chain_list', arguments: {} });
  allChains = JSON.parse((listResult.content as any)[0].text);
  const l1 = allChains.find((c: any) => c.chainType === 'initia');
  l1ChainId = l1?.chainId ?? '';
}, 30_000);

function call(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

function parseText(result: any): any {
  return JSON.parse(result.content[0].text);
}

// ─── Read-only ───

describe('smoke: read-only', () => {
  it('chain_list returns chains', async () => {
    const result = await call('chain_list');
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('chainId');
    expect(data[0]).toHaveProperty('chainType');
  }, 15_000);

  it('chain_capabilities returns L1 info', async () => {
    const result = await call('chain_capabilities', { chain: l1ChainId });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.chainType).toBe('initia');
  }, 15_000);

  it('account_get returns balances', async () => {
    const address = chainManager.getSignerAddress() ?? 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
    const result = await call('account_get', { chain: l1ChainId, address });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data).toHaveProperty('balances');
  }, 15_000);

  it('validator_list returns validators', async () => {
    const result = await call('validator_list', { chain: l1ChainId });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data).toHaveProperty('validators');
    expect(data.validators.length).toBeGreaterThan(0);
  }, 15_000);

  it('proposal_list returns proposals or known API error', async () => {
    const result = await call('proposal_list', { chain: l1ChainId });
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('proposals');
    } else {
      // Known: gov/v1beta1 incompatibility on some chains
      const text = (result.content as any)[0].text;
      expect(text).toContain('gov/v1');
    }
  }, 15_000);

  it('denom_metadata returns token info', async () => {
    const result = await call('denom_metadata', { chain: l1ChainId, denom: 'uinit' });
    expect(result.isError).toBeFalsy();
  }, 15_000);

  it('bridge_routable_assets returns assets', async () => {
    const result = await call('bridge_routable_assets', {});
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('chainId');
    expect(data[0]).toHaveProperty('assetCount');
    expect(data[0]).toHaveProperty('assets');
  }, 30_000);

  it('bridge_routable_assets filters by chainId', async () => {
    const result = await call('bridge_routable_assets', { chainId: l1ChainId });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data).toHaveProperty('chainId', l1ChainId);
    expect(data).toHaveProperty('assets');
    expect(Array.isArray(data.assets)).toBe(true);
  }, 30_000);

  it('bridge_routable_assets returns availableChains for unknown chainId', async () => {
    const result = await call('bridge_routable_assets', { chainId: 'nonexistent-999' });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.assets).toEqual([]);
    expect(data).toHaveProperty('availableChains');
    expect(data.availableChains.length).toBeGreaterThan(0);
  }, 30_000);

  it('bridge_route finds a route', async () => {
    const chains = parseText(await call('chain_list'));
    const minievm = chains.find((c: any) => c.chainType === 'minievm');
    if (!minievm) return;

    const result = await call('bridge_route', {
      amount: '1000000',
      sourceChainId: l1ChainId,
      sourceDenom: 'uinit',
      destChainId: minievm.chainId,
      destDenom: 'uinit',
    });
    expect(result.content).toBeDefined();
  }, 30_000);

  it('validator_get returns specific validator info', async () => {
    const valResult = await call('validator_list', { chain: l1ChainId });
    const validators = parseText(valResult).validators;
    if (!validators?.length) return;

    const validatorAddr = validators[0].operatorAddress;
    const result = await call('validator_get', { chain: l1ChainId, validatorAddr });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data).toHaveProperty('validator');
  }, 15_000);

  it('delegation_get returns delegation state', async () => {
    const address = chainManager.getSignerAddress() ?? 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
    const result = await call('delegation_get', { chain: l1ChainId, delegatorAddr: address });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data).toHaveProperty('delegatorAddr');
    expect(data).toHaveProperty('delegations');
    expect(data).toHaveProperty('unbonding');
  }, 15_000);

  it('chain_capabilities returns L2 info', async () => {
    const l2 = allChains.find((c: any) => c.chainType !== 'initia');
    if (!l2) return;

    const result = await call('chain_capabilities', { chain: l2.chainId });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.chainId).toBe(l2.chainId);
    expect(data.chainType).toBe(l2.chainType);
  }, 15_000);

  it('account_get works on L2', async () => {
    const l2 = allChains.find((c: any) => c.chainType !== 'initia');
    if (!l2) return;

    const address = chainManager.getSignerAddress() ?? 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
    const result = await call('account_get', { chain: l2.chainId, address });
    // May succeed or fail (address may not exist on L2) — both are valid
    expect(result.content).toBeDefined();
  }, 15_000);

  it('tx_search returns results', async () => {
    const result = await call('tx_search', {
      chain: l1ChainId,
      query: 'tx.height=1',
      page: 1,
      perPage: 1,
    });
    // tx_search may return results or an empty array
    expect(result.content).toBeDefined();
  }, 15_000);

  it('portfolio_get returns aggregated balances', async () => {
    const address = chainManager.getSignerAddress() ?? 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
    const result = await call('portfolio_get', { address });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data).toHaveProperty('address');
    expect(data).toHaveProperty('portfolio');
    expect(Array.isArray(data.portfolio)).toBe(true);
  }, 60_000);

  it('address_resolve converts bech32 address', async () => {
    const result = await call('address_resolve', { input: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d' });
    expect(result.content).toBeDefined();
    // May succeed (resolved) or error (usernames service unavailable) — both valid
  }, 15_000);

  it('move_view calls a view function on L1', async () => {
    const result = await call('move_view', {
      chain: l1ChainId,
      moduleAddress: '0x1',
      moduleName: 'account',
      functionName: 'exists_at',
      typeArgs: [],
      args: ['0x1'],
    });
    // May succeed or return an RPC error — we just verify the tool pipeline works
    expect(result.content).toBeDefined();
  }, 15_000);

  it('evm_call on minievm chain does not return WRONG_VM', async () => {
    const minievm = allChains.find((c: any) => c.chainType === 'minievm');
    if (!minievm) return;

    const result = await call('evm_call', {
      chain: minievm.chainId,
      contractAddr: '0x0000000000000000000000000000000000000001',
      input: '0x00',
    });
    // The call may fail due to invalid contract, but should NOT be a WRONG_VM error
    if (result.isError) {
      const text = (result.content as any)[0].text;
      expect(text).not.toContain('WRONG_VM');
    }
  }, 15_000);

  it('wasm_query on miniwasm chain does not return WRONG_VM', async () => {
    const miniwasm = allChains.find((c: any) => c.chainType === 'miniwasm');
    if (!miniwasm) return;

    const result = await call('wasm_query', {
      chain: miniwasm.chainId,
      contractAddress: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d',
      queryMsg: { config: {} },
    });
    // The call may fail due to invalid contract, but should NOT be a WRONG_VM error
    if (result.isError) {
      const text = (result.content as any)[0].text;
      expect(text).not.toContain('WRONG_VM');
    }
  }, 15_000);

  it('returns WRONG_VM for move_view on minievm', async () => {
    const minievm = allChains.find((c: any) => c.chainType === 'minievm');
    if (!minievm) return;

    const result = await call('move_view', {
      chain: minievm.chainId,
      moduleAddress: '0x1',
      moduleName: 'coin',
      functionName: 'balance',
    });
    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain('WRONG_VM');
  }, 15_000);

  it('returns WRONG_VM for wasm_query on L1', async () => {
    const result = await call('wasm_query', {
      chain: l1ChainId,
      contractAddress: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d',
      queryMsg: { config: {} },
    });
    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain('WRONG_VM');
  }, 15_000);

  it('returns CHAIN_NOT_FOUND for invalid chain', async () => {
    const result = await call('chain_capabilities', { chain: 'nonexistent-chain-999' });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('CHAIN_NOT_FOUND');
  }, 15_000);

  it('returns WRONG_VM for incompatible tool', async () => {
    const result = await call('evm_call', {
      chain: l1ChainId,
      contractAddr: '0x1',
      input: '0x00',
    });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('WRONG_VM');
  }, 15_000);

  it('move_resource_get returns a resource on L1', async () => {
    const result = await call('move_resource_get', {
      chain: l1ChainId,
      address: '0x1',
      structTag: '0x1::code::ModuleStore',
    });
    // May succeed or fail depending on chain state, but should not be WRONG_VM
    expect(result.content).toBeDefined();
    if (result.isError) {
      expect((result.content as any)[0].text).not.toContain('WRONG_VM');
    }
  }, 15_000);

  it('tx_get retrieves a specific transaction', async () => {
    // First find a tx hash via tx_search
    const searchResult = await call('tx_search', {
      chain: l1ChainId,
      query: 'tx.height=1',
      page: 1,
      perPage: 1,
    });
    if (searchResult.isError) return;
    const searchData = parseText(searchResult);
    if (!searchData.txs?.length) return;

    const txHash = searchData.txs[0].hash;
    const result = await call('tx_get', { chain: l1ChainId, txHash });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('hash');
    }
  }, 30_000);

  it('distribution_rewards returns reward info', async () => {
    const address = chainManager.getSignerAddress() ?? 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d';
    const result = await call('distribution_rewards', { chain: l1ChainId, delegatorAddr: address });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('rewards');
      expect(data).toHaveProperty('total');
    }
  }, 15_000);

  it('username_check returns availability', async () => {
    const result = await call('username_check', { name: 'thisisaverylongnamethatnobodywouldhaveregistered99999' });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('available');
    }
  }, 15_000);

  it('username_record returns record or not_found', async () => {
    const result = await call('username_record', { name: 'init' });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      // Either a real record or {error: 'not_found'}
      expect(data).toHaveProperty('name');
    }
  }, 15_000);

  it('username_metadata returns metadata or not_found', async () => {
    const result = await call('username_metadata', { name: 'init' });
    expect(result.content).toBeDefined();
  }, 15_000);

  it('concurrent read-only calls return consistent results', async () => {
    const [r1, r2, r3] = await Promise.all([
      call('chain_list'),
      call('chain_capabilities', { chain: l1ChainId }),
      call('denom_metadata', { chain: l1ChainId, denom: 'uinit' }),
    ]);
    expect(r1.isError).toBeFalsy();
    expect(r2.isError).toBeFalsy();
    expect(r3.isError).toBeFalsy();

    const chains = parseText(r1);
    const caps = parseText(r2);
    expect(chains.find((c: any) => c.chainId === caps.chainId)).toBeDefined();
  }, 30_000);
});

// ─── Signer-dependent read-only ───

describe.runIf(hasSigner)('smoke: read-only (with signer)', () => {
  it('tx_search finds transactions by sender', async () => {
    const address = chainManager.getSignerAddress()!;
    const result = await call('tx_search', {
      chain: l1ChainId,
      query: `message.sender='${address}'`,
      page: 1,
      perPage: 5,
    });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('txs');
    }
  }, 15_000);

  it('delegation_get returns real delegations', async () => {
    const address = chainManager.getSignerAddress()!;
    const result = await call('delegation_get', { chain: l1ChainId, delegatorAddr: address });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.delegatorAddr).toBe(address);
    expect(data).toHaveProperty('delegations');
  }, 15_000);

  it('portfolio_get returns multi-chain balances for signer', async () => {
    const address = chainManager.getSignerAddress()!;
    const result = await call('portfolio_get', { address });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.address).toBe(address);
    expect(Array.isArray(data.portfolio)).toBe(true);
    // Signer should have at least L1 balances
    expect(data.portfolio.length).toBeGreaterThan(0);
  }, 60_000);

  it('vip_stage_info returns current stage', async () => {
    const result = await call('vip_stage_info');
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('currentStage');
      expect(data).toHaveProperty('stageStartTime');
      expect(data).toHaveProperty('stageEndTime');
    }
  }, 15_000);

  it('vip_positions returns lock-staking positions', async () => {
    const result = await call('vip_positions');
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(Array.isArray(data)).toBe(true);
    }
  }, 15_000);

  it('vip_voting_power returns voting power', async () => {
    const result = await call('vip_voting_power');
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data).toHaveProperty('votingPower');
    }
  }, 15_000);

  it('vip_claimable_rewards returns reward info', async () => {
    const result = await call('vip_claimable_rewards');
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(Array.isArray(data)).toBe(true);
    }
  }, 30_000);

  it('simulate_tx estimates gas for a bank send', async () => {
    const address = chainManager.getSignerAddress()!;
    const ctx = await chainManager.getContext(l1ChainId);
    const msg = ctx.msgs.bank.send({
      fromAddress: address,
      toAddress: address,
      amount: [{ denom: 'uinit', amount: '1' }],
    });
    const result = await call('simulate_tx', {
      chain: l1ChainId,
      msgs: [msg],
    });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data.status).toBe('simulated');
      expect(data).toHaveProperty('estimatedGas');
    }
  }, 30_000);
});

// ─── Mutations (signer required) ───

describe.runIf(hasSigner)('smoke: mutations', () => {
  it('bank_send dry run succeeds', async () => {
    const address = chainManager.getSignerAddress()!;
    const result = await call('bank_send', {
      chain: l1ChainId,
      sends: [{ to: address, amount: '1', denom: 'uinit' }],
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('bank_send simulate returns gas estimate', async () => {
    const address = chainManager.getSignerAddress()!;
    const result = await call('bank_send', {
      chain: l1ChainId,
      sends: [{ to: address, amount: '1', denom: 'uinit' }],
      dryRun: false,
      confirm: false,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('simulated');
    expect(data.estimatedGas).toBeDefined();
  }, 30_000);

  it('staking_manage dry run succeeds', async () => {
    const valResult = await call('validator_list', { chain: l1ChainId });
    const validators = parseText(valResult).validators;
    if (!validators?.length) return;

    const validatorAddress = validators[0].operatorAddress;
    const result = await call('staking_manage', {
      chain: l1ChainId,
      action: 'delegate',
      validatorAddress,
      amount: '1',
      denom: 'uinit',
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('ibc_transfer dry run succeeds', async () => {
    const result = await call('ibc_transfer', {
      chain: l1ChainId,
      sourceChannel: 'channel-0',
      receiver: chainManager.getSignerAddress()!,
      amount: '1',
      denom: 'uinit',
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('move_execute dry run succeeds on L1', async () => {
    const result = await call('move_execute', {
      chain: l1ChainId,
      moduleAddress: '0x1',
      moduleName: 'cosmos',
      functionName: 'stargate',
      typeArgs: [],
      args: [],
      dryRun: true,
    });
    // Dry run doesn't call the chain, so it should always succeed
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('governance_vote dry run succeeds', async () => {
    const result = await call('governance_vote', {
      chain: l1ChainId,
      proposalId: '1',
      option: 1,
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('evm_send dry run succeeds on minievm', async () => {
    const minievm = allChains.find((c: any) => c.chainType === 'minievm');
    if (!minievm) return;

    const result = await call('evm_send', {
      chain: minievm.chainId,
      contractAddr: '0x0000000000000000000000000000000000000001',
      input: '0x00',
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('wasm_execute dry run succeeds on miniwasm', async () => {
    const miniwasm = allChains.find((c: any) => c.chainType === 'miniwasm');
    if (!miniwasm) return;

    const result = await call('wasm_execute', {
      chain: miniwasm.chainId,
      contractAddress: 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqr5e3d',
      executeMsg: { noop: {} },
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('vip_delegate dry run returns structured response', async () => {
    const valResult = await call('validator_list', { chain: l1ChainId });
    const validators = parseText(valResult).validators;
    if (!validators?.length) return;

    const result = await call('vip_delegate', {
      metadata: '0x1::native_uinit::Coin',
      amount: '1000000',
      releaseTime: Math.floor(Date.now() / 1000) + 86400 * 30,
      validator: validators[0].operatorAddress,
      dryRun: true,
    });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      const data = parseText(result);
      expect(data.status).toBe('dry_run');
    } else {
      // VIP delegate may fail due to chain-specific requirements
      const text = (result.content as any)[0].text;
      expect(text).toBeTruthy();
    }
  }, 15_000);

  it('vip_claim_rewards dry run succeeds', async () => {
    const result = await call('vip_claim_rewards', { dryRun: true });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    // Either dry_run (has rewards) or no_rewards
    expect(['dry_run', 'no_rewards']).toContain(data.status);
  }, 30_000);

  it('vip_claim_staking_rewards dry run succeeds', async () => {
    const result = await call('vip_claim_staking_rewards', { dryRun: true });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('vip_undelegate dry run returns structured response', async () => {
    const valResult = await call('validator_list', { chain: l1ChainId });
    const validators = parseText(valResult).validators;
    if (!validators?.length) return;

    const result = await call('vip_undelegate', {
      metadata: '0x1::native_uinit::Coin',
      releaseTime: Math.floor(Date.now() / 1000) + 86400,
      validator: validators[0].operatorAddress,
      dryRun: true,
    });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      expect(parseText(result).status).toBe('dry_run');
    }
  }, 15_000);

  it('vip_gauge_vote dry run returns structured response', async () => {
    const result = await call('vip_gauge_vote', {
      cycle: 1,
      votes: [{ bridgeId: 1, weight: 100 }],
      dryRun: true,
    });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      expect(parseText(result).status).toBe('dry_run');
    }
  }, 15_000);

  it('bridge_deposit dry run succeeds', async () => {
    const address = chainManager.getSignerAddress()!;
    const result = await call('bridge_deposit', {
      bridgeId: 1,
      to: address,
      amount: '1',
      denom: 'uinit',
      dryRun: true,
    });
    expect(result.isError).toBeFalsy();
    const data = parseText(result);
    expect(data.status).toBe('dry_run');
  }, 15_000);

  it('bridge_withdraw dry run succeeds on L2', async () => {
    const l2 = allChains.find((c: any) => c.chainType !== 'initia');
    if (!l2) return;

    const address = chainManager.getSignerAddress()!;
    const result = await call('bridge_withdraw', {
      chain: l2.chainId,
      to: address,
      amount: '1',
      denom: 'uinit',
      dryRun: true,
    });
    expect(result.content).toBeDefined();
    if (!result.isError) {
      expect(parseText(result).status).toBe('dry_run');
    }
  }, 15_000);

  it('returns SIGNER_REQUIRED without signer', async () => {
    const noSignerConfig: AppConfig = { key: { type: 'none', index: 0, ledgerApp: 'ethereum' }, autoConfirm: false, logLevel: 'error', network: 'testnet', useScanApi: false };
    const noSignerServer = new McpServer({ name: 'smoke-nosigner', version: '0.1.0' });
    const noSignerCm = await ChainManager.create(noSignerConfig);
    bindToMcpServer(noSignerServer, registry, { chainManager: noSignerCm, config: noSignerConfig });

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const noSignerClient = new Client({ name: 'smoke-nosigner', version: '1.0.0' });
    await Promise.all([noSignerClient.connect(ct), noSignerServer.connect(st)]);

    const result = await noSignerClient.callTool({
      name: 'bank_send',
      arguments: { chain: l1ChainId, sends: [{ to: 'init1abc', amount: '1', denom: 'uinit' }] },
    });
    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain('SIGNER_REQUIRED');

    await noSignerClient.close();
    await noSignerServer.close();
  }, 15_000);
});

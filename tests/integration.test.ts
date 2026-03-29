import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ChainManager } from '../src/initia/chain-manager.js';
import { AppConfig } from '../src/config/index.js';

// Mock initia.js — prevent real network calls
vi.mock('@initia/initia.js', () => ({
  MnemonicKey: vi.fn().mockImplementation(function (this: any) { this.address = 'init1test'; }),
  RawKey: { fromHex: vi.fn(() => ({ address: 'init1test' })) },
  Key: vi.fn(),
  createTransport: vi.fn(),
  createInitiaContext: vi.fn(),
  createMinievmContext: vi.fn(),
  createMinimoveContext: vi.fn(),
  createMiniwasmContext: vi.fn(),
  coin: vi.fn((denom: string, amount: string) => ({ denom, amount })),
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

const EXPECTED_TOOLS = [
  // Read-only: Chain & Account
  'chain_list', 'chain_capabilities', 'chain_gas_prices',
  'account_get', 'portfolio_get',
  'address_validate', 'address_convert', 'amount_format',
  'tx_get', 'tx_search', 'tx_by_address',
  'validator_list', 'validator_get',
  'proposal_list', 'proposal_get',
  'delegation_get', 'distribution_rewards',
  'denom_metadata', 'denom_classify',
  'simulate_tx',
  'staking_pool', 'staking_annual_provisions',
  'username_resolve', 'username_record', 'username_metadata', 'username_check',
  'token_info', 'token_balance', 'token_list', 'token_search',
  'event_parse_tx', 'event_parse_move', 'event_parse_wasm',
  'vip_stage_info', 'vip_positions', 'vip_voting_power', 'vip_claimable_rewards',
  'vip_vesting_positions', 'vip_vote_info',
  // Read-only: Bridge
  'bridge_list_chains', 'bridge_route', 'bridge_transfer_status',
  'bridge_withdrawal_status', 'bridge_withdrawals',
  // Read-only: OPBridge
  'opbridge_list', 'opbridge_get',
  'opbridge_token_pairs', 'opbridge_token_pair_by_l1_denom', 'opbridge_token_pair_by_l2_denom',
  // Read-only: IBC
  'ibc_channels', 'ibc_denom_hash',
  // Read-only: Move
  'move_view', 'move_resource_get', 'move_module_abi', 'move_modules', 'move_resources',
  'move_table_entry', 'move_bcs_encode', 'move_bcs_decode',
  'move_denom_metadata', 'move_metadata_denom', 'move_dex_pairs',
  // Read-only: EVM
  'evm_call', 'evm_get_block', 'evm_get_tx_receipt', 'evm_get_logs',
  'evm_get_code', 'evm_get_storage_at', 'evm_decode_logs', 'evm_decode_revert',
  // Read-only: Wasm
  'wasm_query', 'wasm_code_info', 'wasm_contract_info', 'wasm_contract_history',
  'wasm_contracts_by_code', 'wasm_raw_state',
  // Ledger
  'ledger_status', 'ledger_verify_address',
  // Chain (new)
  'chain_block', 'chain_block_results',
  // Authz
  'authz_grants',
  // Feegrant
  'feegrant_allowances',
  // Mutations
  'bank_send', 'ibc_transfer', 'staking_manage', 'governance_vote',
  'vip_delegate', 'vip_undelegate', 'vip_redelegate', 'vip_extend_lock',
  'vip_gauge_vote', 'vip_gauge_vote_by_amount',
  'vip_claim_rewards', 'vip_claim_staking_rewards',
  'vip_provide_and_delegate', 'vip_stableswap_provide_and_delegate',
  'bridge_execute', 'bridge_deposit', 'bridge_withdraw',
  'move_execute', 'move_publish', 'move_script',
  'evm_send', 'evm_deploy',
  'wasm_execute', 'wasm_instantiate', 'wasm_store_code',
  'wasm_migrate', 'wasm_update_admin', 'wasm_clear_admin',
  // Bridge routable assets
  'bridge_routable_assets',
  // Feegrant mutations
  'feegrant_grant', 'feegrant_revoke',
];

describe('Integration: registry tool registration', () => {
  let registeredTools: string[];
  let server: McpServer;

  beforeEach(async () => {
    registeredTools = [];
    server = {
      registerTool: vi.fn((name: string) => { registeredTools.push(name); }),
    } as unknown as McpServer;

    const config: AppConfig = {
      key: { type: 'mnemonic', mnemonic: 'test mnemonic here abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', index: 0, ledgerApp: 'ethereum' },
      autoConfirm: false,
      logLevel: 'error',
      network: 'testnet',
      useScanApi: false,
    };

    const chainManager = await ChainManager.create(config);

    // Import triggers side-effect registration on the singleton registry
    const { registry } = await import('../src/tools/index.js');
    const { bindToMcpServer } = await import('../src/mcp/adapter.js');
    bindToMcpServer(server, registry, { chainManager, config });
  });

  it('registers all expected tools', () => {
    expect(registeredTools.length).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
  });

  it('registers every expected tool name', () => {
    for (const name of EXPECTED_TOOLS) {
      expect(registeredTools, `Missing tool: ${name}`).toContain(name);
    }
  });

  it('has no duplicate registrations', () => {
    const unique = new Set(registeredTools);
    expect(unique.size).toBe(registeredTools.length);
  });
});

import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { assertVmCompatible } from './vm-guard.js';
import { coin } from '@initia/initia.js';
import { queryContract, createWasmExecuteMsg, createStoreCodeMsg, createInstantiateMsg, createMigrateMsg, createUpdateAdminMsg, createClearAdminMsg, getContractInfo, getCodeInfo, getContractsByCode, getContractHistory, getRawContractState } from '@initia/initia.js/wasm';

registry.register({
  name: 'wasm_contract_info',
  group: 'wasm',
  description: 'Get CosmWasm contract metadata: code_id, admin, label, creator. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (bech32)'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, contractAddress, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_contract_info', ctx.chainType);
    const result = await getContractInfo(ctx, contractAddress);
    return success(result);
  },
});

registry.register({
  name: 'wasm_code_info',
  group: 'wasm',
  description: 'Get CosmWasm code info by code ID: creator, checksum, instantiate permission. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    codeId: z.number().describe('Code ID'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, codeId, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_code_info', ctx.chainType);
    const result = await getCodeInfo(ctx, codeId);
    return success(result);
  },
});

registry.register({
  name: 'wasm_contracts_by_code',
  group: 'wasm',
  description: 'List all contract addresses instantiated from a given code ID. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    codeId: z.number().describe('Code ID'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, codeId, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_contracts_by_code', ctx.chainType);
    const contracts = await getContractsByCode(ctx, codeId);
    return success({ codeId, contracts });
  },
});

registry.register({
  name: 'wasm_contract_history',
  group: 'wasm',
  description: 'Get migration history (init/migrate entries) for a CosmWasm contract. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (bech32)'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, contractAddress, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_contract_history', ctx.chainType);
    const entries = await getContractHistory(ctx, contractAddress);
    return success({ contractAddress, entries });
  },
});

registry.register({
  name: 'wasm_raw_state',
  group: 'wasm',
  description: 'Query raw key-value state of a CosmWasm contract. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (bech32)'),
    key: z.string().describe('State key (hex-encoded or UTF-8 string)'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, contractAddress, key, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_raw_state', ctx.chainType);
    const data = await getRawContractState(ctx, contractAddress, key);
    const decoded = new TextDecoder().decode(data);
    try {
      return success({ contractAddress, key, value: JSON.parse(decoded) });
    } catch {
      return success({ contractAddress, key, rawBase64: Buffer.from(data).toString('base64') });
    }
  },
});

registry.register({
  name: 'wasm_query',
  group: 'wasm',
  description: 'Query a CosmWasm smart contract (read-only). Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (bech32)'),
    queryMsg: z.record(z.string(), z.unknown()).describe('Query message as JSON object'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, contractAddress, queryMsg, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_query', ctx.chainType);
    const result = await queryContract(ctx, contractAddress, queryMsg);
    return success(result);
  },
});

registry.register({
  name: 'wasm_store_code',
  group: 'wasm',
  description: 'Upload CosmWasm contract bytecode to chain. The code ID can be found in the transaction events. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    wasmByteCode: z.string().describe('Wasm bytecode as base64-encoded string'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, wasmByteCode, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_store_code', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = createStoreCodeMsg({ sender, wasmByteCode: Uint8Array.from(Buffer.from(wasmByteCode, 'base64')) });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'wasm_instantiate',
  group: 'wasm',
  description: 'Instantiate a CosmWasm contract from an uploaded code ID. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    codeId: z.number().describe('Code ID of the uploaded wasm'),
    label: z.string().describe('Human-readable label for the contract'),
    msg: z.record(z.string(), z.unknown()).describe('Instantiate message as JSON object'),
    admin: z.string().optional().describe('Admin address (allows future migrations). Omit for no admin.'),
    funds: z.array(z.object({
      denom: z.string(),
      amount: z.string(),
    })).optional().default([]).describe('Coins to send with instantiation'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, codeId, label, msg, admin, funds, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_instantiate', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const m = createInstantiateMsg({ sender, codeId, label, msg, admin, funds: funds.map(f => coin(f.denom, f.amount)) });
    return executeMutation({ msgs: [m], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'wasm_migrate',
  group: 'wasm',
  description: 'Migrate a CosmWasm contract to a new code ID. Requires admin permission. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address to migrate'),
    codeId: z.number().describe('New code ID to migrate to'),
    msg: z.record(z.string(), z.unknown()).describe('Migration message as JSON object'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: async ({ chain, contractAddress, codeId, msg, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_migrate', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const m = createMigrateMsg({ sender, contract: contractAddress, codeId, msg });
    return executeMutation({ msgs: [m], chainId: ctx.chainId, dryRun, confirm, memo, destructive: true }, config, ctx);
  },
});

registry.register({
  name: 'wasm_update_admin',
  group: 'wasm',
  description: 'Change the admin of a CosmWasm contract. Only current admin can call. Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address'),
    newAdmin: z.string().describe('New admin address'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: async ({ chain, contractAddress, newAdmin, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_update_admin', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = createUpdateAdminMsg({ sender, contract: contractAddress, newAdmin });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo, destructive: true }, config, ctx);
  },
});

registry.register({
  name: 'wasm_clear_admin',
  group: 'wasm',
  description: 'Remove the admin of a CosmWasm contract, making it immutable (no more migrations). Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: async ({ chain, contractAddress, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_clear_admin', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = createClearAdminMsg({ sender, contract: contractAddress });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo, destructive: true }, config, ctx);
  },
});

registry.register({
  name: 'wasm_execute',
  group: 'wasm',
  description: 'Execute a CosmWasm smart contract function (state-changing). Available on Miniwasm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (bech32)'),
    executeMsg: z.record(z.string(), z.unknown()).describe('Execute message as JSON object'),
    funds: z.array(z.object({
      denom: z.string(),
      amount: z.string(),
    })).optional().default([]).describe('Coins to send with the execution'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, contractAddress, executeMsg, funds, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('wasm_execute', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = createWasmExecuteMsg(sender, contractAddress, executeMsg, funds.map(f => coin(f.denom, f.amount)));
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

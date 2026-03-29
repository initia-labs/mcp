import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { assertVmCompatible } from './vm-guard.js';
import { callViewFunction, queryResource, queryTableEntry, createExecuteMsg, createPublishMsg, createScriptMsg, getModuleAbi, hexToBytes, bytesToHex, encodeMoveArgs, decodeMoveResults } from '@initia/initia.js/move';

registry.register({
  name: 'move_modules',
  group: 'move',
  description: 'List all Move modules deployed at an address. Use this to discover available modules before calling move_module_abi. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    address: z.string().describe('Account address to list modules for (e.g., "0x1")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_modules', ctx.chainType);
    const response = await ctx.client.move.modules({ address });
    const modules = response.modules.map((m: any) => m.moduleName).filter(Boolean);
    return success({ address, modules });
  },
});

registry.register({
  name: 'move_denom_metadata',
  group: 'move',
  description: 'Convert a token denom to its Move metadata address. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    denom: z.string().describe('Token denomination (e.g., "uinit")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, denom, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_denom_metadata', ctx.chainType);
    const response = await ctx.client.move.metadata({ denom });
    return success({ denom, metadata: response.metadata });
  },
});

registry.register({
  name: 'move_metadata_denom',
  group: 'move',
  description: 'Convert a Move metadata address to its token denom. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    metadata: z.string().describe('Move metadata address (e.g., "0x1::native_uinit::Coin")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, metadata, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_metadata_denom', ctx.chainType);
    const response = await ctx.client.move.denom({ metadata });
    return success({ metadata, denom: response.denom });
  },
});

registry.register({
  name: 'move_dex_pairs',
  group: 'move',
  description: 'List DEX liquidity pool pairs, or look up a specific pair by quote token metadata. Returns LP metadata needed for vip_provide_and_delegate. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    metadataQuote: z.string().optional().describe('Quote token metadata address to look up a specific pair'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, metadataQuote, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_dex_pairs', ctx.chainType);
    if (metadataQuote) {
      const response = await ctx.client.move.dexPair({ metadataQuote });
      return success(response.dexPair ?? null);
    }
    const response = await ctx.client.move.dexPairs({});
    return success(response.dexPairs);
  },
});

registry.register({
  name: 'move_resources',
  group: 'move',
  description: 'List all Move resources held by an address. Use this to discover available resources before calling move_resource_get with a specific struct tag. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    address: z.string().describe('Account address to list resources for'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_resources', ctx.chainType);
    const response = await ctx.client.move.resources({ address });
    return success({ address, resources: response.resources });
  },
});

registry.register({
  name: 'move_module_abi',
  group: 'move',
  description: 'Get the ABI (functions, structs, type params) of a Move module. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    moduleAddress: z.string().describe('Module owner address (e.g., "0x1")'),
    moduleName: z.string().describe('Module name (e.g., "coin")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, moduleAddress, moduleName, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_module_abi', ctx.chainType);
    const abi = await getModuleAbi(ctx, moduleAddress, moduleName);
    return success(abi);
  },
});

registry.register({
  name: 'move_table_entry',
  group: 'move',
  description: 'Query a Move table entry by handle and key. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    tableHandle: z.string().describe('Table handle (hex string)'),
    key: z.unknown().describe('Table key value'),
    keyType: z.string().describe('Move type of the key (e.g., "address", "u64")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, tableHandle, key, keyType, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_table_entry', ctx.chainType);
    const result = await queryTableEntry(ctx, tableHandle, key, keyType);
    return success(result);
  },
});

registry.register({
  name: 'move_view',
  group: 'move',
  description: 'Call a Move view function (read-only). Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    moduleAddress: z.string().describe('Module owner address (e.g., "0x1")'),
    moduleName: z.string().describe('Module name (e.g., "coin")'),
    functionName: z.string().describe('View function name (e.g., "balance")'),
    typeArgs: z.array(z.string()).optional().default([]).describe('Type arguments'),
    args: z.array(z.unknown()).optional().default([]).describe('Function arguments'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, moduleAddress, moduleName, functionName, typeArgs, args, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_view', ctx.chainType);
    const result = await callViewFunction(ctx, moduleAddress, moduleName, functionName, typeArgs, args);
    return success(result);
  },
});

registry.register({
  name: 'move_resource_get',
  group: 'move',
  description: 'Query a Move resource at an address. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    address: z.string().describe('Account address holding the resource'),
    structTag: z.string().describe('Resource struct tag (e.g., "0x1::coin::CoinStore<0x1::native_uinit::Coin>")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, structTag, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_resource_get', ctx.chainType);
    const result = await queryResource(ctx, address, structTag);
    return success(result);
  },
});

registry.register({
  name: 'move_bcs_encode',
  group: 'move',
  description: 'Encode values to Move BCS (Binary Canonical Serialization) format. Useful for preparing complex arguments for move_execute.',
  schema: {
    values: z.array(z.unknown()).describe('Values to encode'),
    types: z.array(z.string()).describe('Move type for each value (e.g., ["address", "u64", "vector<u8>"])'),
  },
  annotations: { readOnlyHint: true },
  handler: async ({ values, types }) => {
    const encoded = encodeMoveArgs(values, types);
    return success({ encoded: encoded.map(b => bytesToHex(b)) });
  },
});

registry.register({
  name: 'move_bcs_decode',
  group: 'move',
  description: 'Decode Move BCS bytes back to human-readable values.',
  schema: {
    hexValues: z.array(z.string()).describe('Hex-encoded BCS bytes for each value'),
    types: z.array(z.string()).describe('Move type for each value (e.g., ["address", "u64", "vector<u8>"])'),
  },
  annotations: { readOnlyHint: true },
  handler: async ({ hexValues, types }) => {
    const bytesArray = hexValues.map(h => hexToBytes(h));
    const decoded = decodeMoveResults(bytesArray, types);
    return success({ decoded });
  },
});

registry.register({
  name: 'move_publish',
  group: 'move',
  description: 'Publish (deploy) Move module bytecode to chain. Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    codeBytes: z.string().describe('Module bytecode as hex string'),
    upgradePolicy: z.enum(['arbitrary', 'compatible', 'immutable']).optional().default('compatible').describe('Upgrade policy for the module'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, codeBytes, upgradePolicy, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_publish', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const policyMap: Record<string, number> = { arbitrary: 0, compatible: 1, immutable: 2 };
    const msg = createPublishMsg({ sender, codeBytes: [hexToBytes(codeBytes)], upgradePolicy: policyMap[upgradePolicy] ?? 1 });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'move_script',
  group: 'move',
  description: 'Execute a Move script (one-off bytecode, not published). Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    codeBytes: z.string().describe('Script bytecode as hex string'),
    typeArgs: z.array(z.string()).optional().default([]).describe('Type arguments'),
    args: z.array(z.string()).optional().default([]).describe('Function arguments as JSON-encoded strings'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, codeBytes, typeArgs, args, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_script', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = createScriptMsg({ sender, codeBytes: hexToBytes(codeBytes), typeArgs, args });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'move_execute',
  group: 'move',
  description: 'Execute a Move entry function (state-changing). Available on Initia L1 and Minimove chains.',
  schema: {
    chain: chainParam,
    moduleAddress: z.string().describe('Module owner address (e.g., "0x1")'),
    moduleName: z.string().describe('Module name'),
    functionName: z.string().describe('Entry function name'),
    typeArgs: z.array(z.string()).optional().default([]).describe('Type arguments'),
    args: z.array(z.unknown()).optional().default([]).describe('Function arguments'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, moduleAddress, moduleName, functionName, typeArgs, args, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('move_execute', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = createExecuteMsg(sender, moduleAddress, moduleName, functionName, typeArgs, args);
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

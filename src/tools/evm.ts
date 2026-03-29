import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { assertVmCompatible } from './vm-guard.js';
import { createEvmRpcClient, decodeRevertReason, decodeEvmLogs } from '@initia/initia.js/evm';

// Zero address (0x0000...0000) used as default sender for read-only EVM calls
const ZERO_SENDER = 'init1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqa4qvvl';

registry.register({
  name: 'evm_get_logs',
  group: 'evm',
  description: 'Query EVM event logs with filters. Available on Minievm chains.',
  schema: {
    chain: chainParam,
    address: z.string().optional().describe('Contract address to filter logs'),
    topics: z.array(z.string().nullable()).optional().describe('Event topic filters (array of topic hashes, null for wildcard)'),
    fromBlock: z.string().optional().default('latest').describe('Start block (number or "latest")'),
    toBlock: z.string().optional().default('latest').describe('End block (number or "latest")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, topics, fromBlock, toBlock, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    assertVmCompatible('evm_get_logs', chainInfo.chainType);
    if (!chainInfo.evmRpc) throw new Error(`No EVM RPC endpoint for chain ${chain}`);
    const rpc = createEvmRpcClient(chainInfo.evmRpc);
    const logs = await rpc.getLogs({
      address: address ?? undefined,
      topics: topics as any ?? undefined,
      fromBlock: fromBlock ?? 'latest',
      toBlock: toBlock ?? 'latest',
    });
    return success(logs);
  },
});

registry.register({
  name: 'evm_get_tx_receipt',
  group: 'evm',
  description: 'Get an EVM transaction receipt by hash. Available on Minievm chains.',
  schema: {
    chain: chainParam,
    txHash: z.string().describe('Transaction hash (0x-prefixed)'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, txHash, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    assertVmCompatible('evm_get_tx_receipt', chainInfo.chainType);
    if (!chainInfo.evmRpc) throw new Error(`No EVM RPC endpoint for chain ${chain}`);
    const rpc = createEvmRpcClient(chainInfo.evmRpc);
    const receipt = await rpc.getTransactionReceipt(txHash);
    return success(receipt);
  },
});

registry.register({
  name: 'evm_get_block',
  group: 'evm',
  description: 'Get EVM block information by number. Available on Minievm chains.',
  schema: {
    chain: chainParam,
    blockNumber: z.string().default('latest').describe('Block number or "latest"'),
    includeTransactions: z.boolean().optional().default(false).describe('Include full transaction objects'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, blockNumber, includeTransactions, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    assertVmCompatible('evm_get_block', chainInfo.chainType);
    if (!chainInfo.evmRpc) throw new Error(`No EVM RPC endpoint for chain ${chain}`);
    const rpc = createEvmRpcClient(chainInfo.evmRpc);
    const block = await rpc.getBlockByNumber(blockNumber, includeTransactions);
    return success(block);
  },
});

registry.register({
  name: 'evm_get_code',
  group: 'evm',
  description: 'Get the bytecode deployed at an address. Returns empty if the address is an EOA (not a contract). Only available on Minievm rollup chains.',
  schema: {
    chain: chainParam,
    address: z.string().describe('Contract or account address (0x hex)'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    assertVmCompatible('evm_get_code', chainInfo.chainType);
    if (!chainInfo.evmRpc) throw new Error(`No EVM RPC endpoint for chain ${chain}`);
    const rpc = createEvmRpcClient(chainInfo.evmRpc);
    const code = await rpc.getCode(address);
    return success({ address, code, isContract: code !== '0x' && code !== '0x0' });
  },
});

registry.register({
  name: 'evm_get_storage_at',
  group: 'evm',
  description: 'Read a raw storage slot of an EVM contract. Only available on Minievm rollup chains.',
  schema: {
    chain: chainParam,
    address: z.string().describe('Contract address (0x hex)'),
    slot: z.string().describe('Storage slot position (0x hex, e.g., "0x0")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, slot, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    assertVmCompatible('evm_get_storage_at', chainInfo.chainType);
    if (!chainInfo.evmRpc) throw new Error(`No EVM RPC endpoint for chain ${chain}`);
    const rpc = createEvmRpcClient(chainInfo.evmRpc);
    const value = await rpc.getStorageAt(address, slot);
    return success({ address, slot, value });
  },
});

registry.register({
  name: 'evm_call',
  group: 'evm',
  description: 'Call an EVM contract function (read-only). Provide ABI-encoded calldata. Available on Minievm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (hex or bech32)'),
    input: z.string().describe('ABI-encoded calldata (hex string starting with 0x)'),
    sender: z.string().optional().describe('Sender address for the call context'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, contractAddress, input, sender, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('evm_call', ctx.chainType);
    const result = await ctx.client.evm.call({
      sender: sender ?? ZERO_SENDER,
      contractAddress,
      input,
      value: '0',
    });
    return success(result);
  },
});

registry.register({
  name: 'evm_decode_revert',
  group: 'evm',
  description: 'Decode an EVM revert reason from hex data. Optionally provide ABI JSON to decode custom errors.',
  schema: {
    data: z.string().describe('Revert data (hex string, 0x-prefixed)'),
    abi: z.array(z.unknown()).optional().describe('Contract ABI JSON array (for custom error decoding)'),
  },
  annotations: { readOnlyHint: true },
  handler: async ({ data, abi }) => {
    const reason = decodeRevertReason(data, abi as any);
    return success({ data, reason });
  },
});

registry.register({
  name: 'evm_decode_logs',
  group: 'evm',
  description: 'Decode EVM event logs using an ABI. Takes raw logs (from evm_get_logs or tx receipt) and returns decoded event names and args.',
  schema: {
    logs: z.array(z.object({
      address: z.string(),
      topics: z.array(z.string()),
      data: z.string(),
      blockNumber: z.string().optional(),
      transactionHash: z.string().optional(),
      logIndex: z.string().optional(),
    })).describe('Array of raw EVM log objects'),
    abi: z.array(z.unknown()).describe('Contract ABI JSON array'),
  },
  annotations: { readOnlyHint: true },
  handler: async ({ logs, abi }) => {
    const decoded = decodeEvmLogs(abi as any, logs as any);
    return success(decoded);
  },
});

registry.register({
  name: 'evm_deploy',
  group: 'evm',
  description: 'Deploy an EVM contract by submitting creation bytecode. Available on Minievm chains.',
  schema: {
    chain: chainParam,
    input: z.string().describe('Contract creation bytecode (hex, 0x-prefixed). Append ABI-encoded constructor args if needed.'),
    value: z.string().optional().default('0').describe('Native token value to send (smallest unit)'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, input, value, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('evm_deploy', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = ctx.msgs.evm.create({ sender, code: input, value });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'evm_send',
  group: 'evm',
  description: 'Send a state-changing EVM transaction. Provide ABI-encoded calldata. Available on Minievm chains.',
  schema: {
    chain: chainParam,
    contractAddress: z.string().describe('Contract address (hex or bech32)'),
    input: z.string().describe('ABI-encoded calldata (hex string starting with 0x)'),
    value: z.string().optional().default('0').describe('Native token value to send (smallest unit)'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, contractAddress, input, value, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    assertVmCompatible('evm_send', ctx.chainType);
    const sender = chainManager.getSignerAddress()!;
    const msg = ctx.msgs.evm.call({
      sender,
      contractAddress,
      input,
      value,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

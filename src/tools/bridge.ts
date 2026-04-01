import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, addressParam, txHashParam, confirmParam, dryRunParam, memoParam, networkParam, paginationParams } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { BridgeError } from '../errors.js';
import { fetchWithdrawals, fetchWithdrawal } from '@initia/initia.js/bridge';

registry.register({
  name: 'bridge_withdrawal_status',
  group: 'bridge',
  description: 'Get the status and details of a specific L2->L1 withdrawal by sequence number.',
  schema: {
    chain: chainParam.describe('L2 chain the withdrawal was made from (e.g., "minievm", "minimove")'),
    sequence: z.number().describe('Withdrawal sequence number'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, sequence, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    if (!chainInfo.executorUri) throw new Error(`No executor URI for chain ${chain}`);
    const result = await fetchWithdrawal(chainInfo.executorUri, sequence);
    return success(result);
  },
});

registry.register({
  name: 'bridge_withdrawals',
  group: 'bridge',
  description: 'List L2->L1 withdrawals for an address on a specific L2 chain.',
  schema: {
    chain: chainParam.describe('L2 chain to query withdrawals from (e.g., "minievm", "minimove")'),
    address: addressParam,
    ...paginationParams,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  addressFields: { address: 'bech32' },
  handler: async ({ chain, address, limit, offset, network }, { chainManager }) => {
    const chainInfo = await chainManager.getChainInfo(chain, network);
    if (!chainInfo.executorUri) throw new Error(`No executor URI for chain ${chain}`);
    const results = await fetchWithdrawals(chainInfo.executorUri, address, { limit, offset });
    return success({ chain, address, withdrawals: results });
  },
});

registry.register({
  name: 'bridge_route',
  group: 'bridge',
  description: 'Find the optimal cross-chain transfer route between two chains.',
  schema: {
    amount: z.string().describe('Transfer amount in minimal denomination'),
    sourceChainId: z.string().describe('Source chain ID'),
    sourceDenom: z.string().describe('Source token denomination'),
    destChainId: z.string().describe('Destination chain ID'),
    destDenom: z.string().describe('Destination token denomination'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ amount, sourceChainId, sourceDenom, destChainId, destDenom, network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    const route = await provider.bridge.route({
      amount,
      source: { chainId: sourceChainId, denom: sourceDenom },
      dest: { chainId: destChainId, denom: destDenom },
    });
    return success(route);
  },
});

registry.register({
  name: 'bridge_transfer_status',
  group: 'bridge',
  description: 'Track the status of a cross-chain transfer initiated via bridge_execute. Call with the txHash and chainId returned from bridge_execute.',
  schema: {
    txHash: txHashParam,
    chainId: z.string().describe('Chain ID where the transfer was initiated'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ txHash, chainId, network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    await provider.bridge.trackTransfer(txHash, chainId);
    const status = await provider.bridge.getTransferStatus(txHash, chainId);
    return success({ txHash, chainId, ...status });
  },
});

registry.register({
  name: 'bridge_list_chains',
  group: 'bridge',
  description: 'List all L2 chains that support OPInit bridging from/to L1.',
  schema: {
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    const chains = provider.bridge.listBridgeableChains();
    return success(chains.map((c: any) => ({
      chainId: c.chainId,
      chainType: c.chainType,
      opBridgeId: c.opBridgeId,
      rpc: c.rpc,
    })));
  },
});

registry.register({
  name: 'bridge_routable_assets',
  group: 'bridge',
  description: 'List all assets available for cross-chain routing via the Router API. Use this to discover valid chain/denom pairs before calling bridge_route or bridge_execute. Optionally filter by a specific chain ID.',
  schema: {
    chainId: z.string().optional().describe('Filter assets by chain ID (e.g., "initiation-2", "11155111")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chainId, network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    const allAssets: Record<string, any[]> = await provider.bridge.getRoutableAssets();

    if (chainId) {
      const assets = allAssets[chainId];
      if (!assets) return success({ chainId, assets: [], availableChains: Object.keys(allAssets) });
      return success({ chainId, assets });
    }

    // Return summary: chain IDs with asset count + symbols
    const summary = Object.entries(allAssets).map(([chain, assets]) => ({
      chainId: chain,
      assetCount: assets.length,
      assets: assets.map((a: any) => ({
        denom: a.denom,
        symbol: a.symbol ?? a.recommendedSymbol,
        decimals: a.decimals,
        originChainId: a.originChainId,
      })),
    }));
    return success(summary);
  },
});

registry.register({
  name: 'bridge_execute',
  group: 'bridge',
  description: 'Execute a cross-chain transfer. Automatically finds the optimal route and broadcasts the source chain transaction.',
  schema: {
    amount: z.string().describe('Transfer amount in minimal denomination'),
    sourceChainId: z.string().describe('Source chain ID'),
    sourceDenom: z.string().describe('Source token denomination'),
    destChainId: z.string().describe('Destination chain ID'),
    destDenom: z.string().describe('Destination token denomination'),
    receiver: z.string().describe('Receiver address on destination chain'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ amount, sourceChainId, sourceDenom, destChainId, destDenom, receiver, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const provider = await chainManager.getProvider(network);
    const sender = chainManager.getSignerAddress()!;

    // Get route first
    const route = await provider.bridge.route({
      amount,
      source: { chainId: sourceChainId, denom: sourceDenom },
      dest: { chainId: destChainId, denom: destDenom },
    });

    // Build transfer messages
    const transferTxs = await provider.bridge.buildTransferMsgs({
      route,
      addresses: [sender, receiver],
    });

    const sourceTx = transferTxs[0];
    if (!sourceTx?.cosmosMsgs || sourceTx.cosmosMsgs.length === 0) {
      throw new BridgeError(
        sourceTx?.evmTx
          ? 'EVM-originated bridge transfers are not yet supported. Use a Cosmos-based source chain.'
          : 'Bridge returned no executable messages for the source chain.',
      );
    }

    const ctx = await chainManager.getContext(sourceTx.chainId, network);
    return executeMutation({
      msgs: sourceTx.cosmosMsgs,
      chainId: sourceTx.chainId,
      dryRun, confirm, memo,
    }, config, ctx);
  },
});

registry.register({
  name: 'bridge_deposit',
  group: 'bridge',
  description: 'Deposit tokens from L1 to an L2 rollup via OPInit bridge. Requires the bridge ID for the target rollup.',
  schema: {
    bridgeId: z.number().describe('OPInit bridge ID for the target rollup'),
    to: z.string().describe('Recipient address on the L2 rollup'),
    amount: z.string().describe('Amount to deposit (e.g., "1000000")'),
    denom: z.string().describe('Token denomination (e.g., "uinit")'),
    data: z.string().optional().default('').describe('Optional hex-encoded data payload'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  addressFields: { to: 'bech32' },
  handler: async ({ bridgeId, to, amount, denom, data, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext('initia', network);
    const sender = chainManager.getSignerAddress()!;
    const dataBytes = data ? new Uint8Array(Buffer.from(data, 'hex')) : new Uint8Array();
    const msg = ctx.msgs.ophost.initiateTokenDeposit({
      sender,
      bridgeId: BigInt(bridgeId),
      to,
      amount: { denom, amount },
      data: dataBytes,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'bridge_withdraw',
  group: 'bridge',
  description: 'Withdraw tokens from an L2 rollup back to L1 via OPInit bridge.',
  schema: {
    chain: chainParam.describe('L2 chain to withdraw from (e.g., "minievm-1", "minimove-1")'),
    to: z.string().describe('Recipient address on L1'),
    amount: z.string().describe('Amount to withdraw (e.g., "1000000")'),
    denom: z.string().describe('Token denomination on the L2 chain'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  addressFields: { to: 'bech32' },
  handler: async ({ chain, to, amount, denom, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    const sender = chainManager.getSignerAddress()!;
    const msg = ctx.msgs.opchild.initiateTokenWithdrawal({
      sender,
      to,
      amount: { denom, amount },
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

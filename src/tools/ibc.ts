import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { createIbcDenom } from '@initia/initia.js/util';

registry.register({
  name: 'ibc_channels',
  group: 'ibc',
  description: 'List IBC channels for a chain, or find the channel between two specific chains. Useful before ibc_transfer to discover the correct sourceChannel.',
  schema: {
    chain: chainParam.describe('Chain to list IBC channels for'),
    counterparty: chainParam.optional().describe('Optional counterparty chain to find the specific channel between the two chains'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, counterparty, network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    const info = await chainManager.getChainInfo(chain, network);

    if (counterparty) {
      const cpInfo = await chainManager.getChainInfo(counterparty, network);
      const channel = provider.getIbcChannel(info.chainId, cpInfo.chainId);
      if (!channel) {
        return success({ found: false, from: info.chainId, to: cpInfo.chainId, message: 'No direct IBC channel found. Try bridge_route for cross-chain transfers.' });
      }
      return success({ found: true, from: info.chainId, to: cpInfo.chainId, ...channel });
    }

    const channels = provider.getIbcChannels(info.chainId);
    return success({ chainId: info.chainId, channels });
  },
});

registry.register({
  name: 'ibc_denom_hash',
  group: 'ibc',
  description: 'Compute the IBC denomination hash from a transfer path. E.g., "transfer/channel-0/uatom" -> "ibc/27394..."',
  schema: { path: z.string().describe('IBC transfer path (e.g., "transfer/channel-0/uatom")') },
  annotations: { readOnlyHint: true },
  handler: async ({ path }) => {
    const ibcDenom = createIbcDenom(path);
    return success({ path, ibcDenom });
  },
});

registry.register({
  name: 'ibc_transfer',
  group: 'ibc',
  description: 'Send tokens via IBC to another chain. Use bridge_route for automatic path discovery.',
  schema: {
    chain: chainParam,
    sourceChannel: z.string().describe('IBC source channel (e.g., "channel-0")'),
    receiver: z.string().describe('Receiver address on the destination chain'),
    amount: z.string().describe('Amount to transfer'),
    denom: z.string().describe('Token denomination'),
    sourcePort: z.string().optional().default('transfer').describe('IBC source port'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, sourceChannel, receiver, amount, denom, sourcePort, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    const sender = chainManager.getSignerAddress()!;
    const msg = ctx.msgs.ibc.transfer({
      sourcePort,
      sourceChannel,
      token: { denom, amount },
      sender,
      receiver,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { getGasPrices } from '@initia/initia.js';

registry.register({
  name: 'chain_list',
  group: 'chain',
  description: 'List all supported chains in the Initia ecosystem with their chain IDs and types.',
  schema: { network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ network }, { chainManager }) => {
    const chains = await chainManager.listChains(network);
    return success(chains.map((c: any) => ({
      chainId: c.chainId,
      chainType: c.chainType,
      chainName: c.chainName,
    })));
  },
});

registry.register({
  name: 'chain_gas_prices',
  group: 'chain',
  description: 'Get current on-chain gas prices for any chain (L1 or L2). Returns accepted denoms and their gas price amounts.',
  schema: { chain: chainParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const prices = await getGasPrices(ctx.client);
    return success({ chainId: ctx.chainId, gasPrices: prices.toJSON() });
  },
});

registry.register({
  name: 'chain_capabilities',
  group: 'chain',
  description: 'Get detailed capabilities for a specific chain: VM type, supported features, and endpoints.',
  schema: { chain: chainParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    return success({
      chainId: ctx.chainId,
      chainType: ctx.chainType,
      network: ctx.network,
      canSign: ctx.canSign,
    });
  },
});

registry.register({
  name: 'chain_block',
  group: 'chain',
  description: 'Get block header and transaction list by height. Omit height to get the latest block.',
  schema: {
    chain: chainParam,
    height: z.number().int().positive().optional().describe('Block height. Omit for latest block.'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, height, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const block = await ctx.rpc.block(height);
    return success(block);
  },
});

registry.register({
  name: 'chain_block_results',
  group: 'chain',
  description: 'Get block execution results (transaction results, validator updates, consensus param updates) for a given height.',
  schema: {
    chain: chainParam,
    height: z.number().int().positive().describe('Block height (required).'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, height, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const results = await ctx.rpc.blockResults(height);
    return success(results);
  },
});

import { z } from 'zod';
import { registry } from './registry.js';
import { paginationParams, networkParam } from '../schemas/common.js';
import { success } from '../response.js';

registry.register({
  name: 'opbridge_list',
  group: 'opbridge',
  description: 'List all OPInit bridges with their config. Returns paginated results (default 10).',
  schema: { ...paginationParams, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ limit, offset, reverse, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.ophost.bridges({
      pagination: { limit: BigInt(limit ?? 10), offset: BigInt(offset ?? 0), reverse },
    });
    return success(result);
  },
});

registry.register({
  name: 'opbridge_get',
  group: 'opbridge',
  description: 'Get detailed information about a specific OPInit bridge by its ID.',
  schema: {
    bridgeId: z.number().describe('OPInit bridge ID'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ bridgeId, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.ophost.bridge({ bridgeId: BigInt(bridgeId) });
    return success(result);
  },
});

registry.register({
  name: 'opbridge_token_pairs',
  group: 'opbridge',
  description: 'List token pair mappings (L1 <-> L2) for a specific bridge. Returns paginated results (default 10).',
  schema: {
    bridgeId: z.number().describe('OPInit bridge ID'),
    ...paginationParams,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ bridgeId, limit, offset, reverse, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.ophost.tokenPairs({
      bridgeId: BigInt(bridgeId),
      pagination: { limit: BigInt(limit ?? 10), offset: BigInt(offset ?? 0), reverse },
    });
    return success(result);
  },
});

registry.register({
  name: 'opbridge_token_pair_by_l1_denom',
  group: 'opbridge',
  description: 'Find the L2 token for a given L1 denomination on a specific bridge.',
  schema: {
    bridgeId: z.number().describe('OPInit bridge ID'),
    l1Denom: z.string().describe('L1 token denomination (e.g., "uinit")'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ bridgeId, l1Denom, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.ophost.tokenPairByL1Denom({
      bridgeId: BigInt(bridgeId),
      l1Denom,
    });
    return success(result);
  },
});

registry.register({
  name: 'opbridge_token_pair_by_l2_denom',
  group: 'opbridge',
  description: 'Find the L1 token for a given L2 denomination on a specific bridge.',
  schema: {
    bridgeId: z.number().describe('OPInit bridge ID'),
    l2Denom: z.string().describe('L2 token denomination'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ bridgeId, l2Denom, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.ophost.tokenPairByL2Denom({
      bridgeId: BigInt(bridgeId),
      l2Denom,
    });
    return success(result);
  },
});

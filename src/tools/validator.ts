import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, paginationParams, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { resolveValidatorAddress } from './resolver.js';

registry.register({
  name: 'validator_list',
  group: 'validator',
  description: 'List validators on a chain with their status, voting power, and commission. Returns paginated results (default 10). Use limit/offset to navigate. Filter by status to narrow results.',
  schema: {
    chain: chainParam,
    status: z.enum(['BOND_STATUS_BONDED', 'BOND_STATUS_UNBONDED', 'BOND_STATUS_UNBONDING']).optional()
      .describe('Filter by validator status. Omit to list all.'),
    ...paginationParams,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, status, limit, offset, reverse, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const result = await ctx.client.mstaking.validators({
      status: status ?? '',
      pagination: { limit: BigInt(limit ?? 10), offset: BigInt(offset ?? 0), reverse },
    });
    return success(result);
  },
});

registry.register({
  name: 'validator_get',
  group: 'validator',
  description: 'Get detailed information about a specific validator.',
  schema: {
    chain: chainParam,
    validatorAddr: z.string().describe('Validator address or moniker name'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, validatorAddr, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const resolved = await resolveValidatorAddress(ctx, validatorAddr);
    const result = await ctx.client.mstaking.validator({ validatorAddr: resolved });
    return success(result);
  },
});

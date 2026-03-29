import { registry } from './registry.js';
import { chainParam, addressParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { resolveAddress } from './resolver.js';

registry.register({
  name: 'distribution_rewards',
  group: 'distribution',
  description: 'Get pending staking rewards for a delegator across all validators.',
  schema: { chain: chainParam, delegatorAddr: addressParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, delegatorAddr: rawAddr, network }, { chainManager }) => {
    const delegatorAddr = resolveAddress(rawAddr, chainManager);
    const ctx = await chainManager.getContext(chain, network);
    const result = await ctx.client.distribution.delegationTotalRewards({
      delegatorAddress: delegatorAddr,
    });
    return success(result);
  },
});

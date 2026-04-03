import { registry } from './registry.js';
import { chainParam, addressParam, paginationParams, networkParam } from '../schemas/common.js';
import { success } from '../response.js';

registry.register({
  name: 'delegation_get',
  group: 'delegation',
  description: 'Get staking state for an address: delegations, rewards, and unbonding entries. Returns paginated results (default 10). Use limit/offset to navigate.',
  schema: { chain: chainParam, delegatorAddr: addressParam, ...paginationParams, network: networkParam },
  annotations: { readOnlyHint: true },
  addressFields: { delegatorAddr: 'bech32' },
  formatCoins: { chainParam: 'chain' },
  handler: async ({ chain, delegatorAddr, limit, offset, reverse, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const pagination = { limit: BigInt(limit ?? 10), offset: BigInt(offset ?? 0), reverse };
    const [delegations, unbonding] = await Promise.all([
      ctx.client.mstaking.delegatorDelegations({ delegatorAddr, pagination }),
      ctx.client.mstaking.delegatorUnbondingDelegations({ delegatorAddr, pagination }),
    ]);
    return success({ delegatorAddr, delegations, unbonding });
  },
});

import { registry } from './registry.js';
import { addressParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';

registry.register({
  name: 'portfolio_get',
  group: 'portfolio',
  description: 'Get aggregated token balances across all chains (L1 + all L2s) for an address.',
  schema: { address: addressParam, network: networkParam },
  annotations: { readOnlyHint: true },
  addressFields: { address: 'bech32' },
  handler: async ({ address, network }, { chainManager }) => {
    const chains = await chainManager.listChains(network);
    const results = await Promise.allSettled(
      chains.map(async (c: any) => {
        const ctx = await chainManager.getContext(c.chainId, network);
        const balances = await ctx.client.bank.allBalances({ address });
        return {
          chainId: c.chainId,
          chainType: c.chainType,
          balances: balances.balances ?? balances,
        };
      }),
    );

    const portfolio = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((r) => {
        const b = Array.isArray(r.balances) ? r.balances : [];
        return b.length > 0;
      });

    return success({ address, portfolio });
  },
});

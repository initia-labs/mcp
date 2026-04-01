import { registry } from './registry.js';
import { chainParam, addressParam, paginationParams, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { getAddressProfile } from '@initia/initia.js/client';

registry.register({
  name: 'account_get',
  group: 'account',
  description: 'Get account info, token balances, and address profile for an address on a specific chain. Balances are paginated (default 10). Describe account/contract types using the terminology appropriate for the chain\'s VM (see chainType in response).',
  schema: { chain: chainParam, address: addressParam, ...paginationParams, network: networkParam },
  annotations: { readOnlyHint: true },
  addressFields: { address: 'bech32' },
  handler: async ({ chain, address, limit, offset, reverse, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const [account, balances, profile] = await Promise.allSettled([
      ctx.client.auth.account({ address }),
      ctx.client.bank.allBalances({
        address,
        pagination: { limit: BigInt(limit ?? 10), offset: BigInt(offset ?? 0), reverse },
      }),
      getAddressProfile(ctx, address),
    ]);

    return success({
      chainType: ctx.chainType,
      account: account.status === 'fulfilled' ? account.value : null,
      balances: balances.status === 'fulfilled' ? (balances.value.balances ?? balances.value) : [],
      profile: profile.status === 'fulfilled' ? profile.value : null,
    });
  },
});

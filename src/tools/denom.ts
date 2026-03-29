import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, denomParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { getDenomType } from '@initia/initia.js/util';

registry.register({
  name: 'denom_classify',
  group: 'denom',
  description: 'Classify a token denomination into its type: native, ibc, evm, move, cw20, factory, or l2.',
  schema: { denom: z.string().describe('Token denomination string to classify') },
  annotations: { readOnlyHint: true },
  handler: async ({ denom }) => {
    const denomType = getDenomType(denom);
    return success({ denom, type: denomType });
  },
});

registry.register({
  name: 'denom_metadata',
  group: 'denom',
  description: 'Get on-chain bank module metadata for a native denomination (name, symbol, decimals). For contract tokens (ERC20/CW20/FA), use token_info instead.',
  schema: { chain: chainParam, denom: denomParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, denom, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    try {
      const metadata = await ctx.client.bank.denomMetadata({ denom });
      return success(metadata);
    } catch {
      // Fallback to VM-based token info for contract tokens
      const info = await ctx.getTokenInfo({ token: denom });
      return success(info);
    }
  },
});

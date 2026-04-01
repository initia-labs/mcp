import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { ValidationError } from '../errors.js';

registry.register({
  name: 'authz_grants',
  group: 'authz',
  description: 'Query authorization grants. Provide granter, grantee, or both to filter.',
  schema: {
    chain: chainParam,
    granter: z.string().optional().describe('Granter address'),
    grantee: z.string().optional().describe('Grantee address'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  addressFields: { granter: 'bech32', grantee: 'bech32' },
  handler: async ({ chain, granter, grantee, network }, { chainManager }) => {
    if (!granter && !grantee) {
      throw new ValidationError('At least one of granter or grantee must be provided.');
    }

    const ctx = await chainManager.getContext(chain, network);
    let result;
    if (granter && grantee) {
      result = await ctx.client.authz.grants({ granter, grantee });
    } else if (granter) {
      result = await ctx.client.authz.granterGrants({ granter });
    } else {
      result = await ctx.client.authz.granteeGrants({ grantee: grantee! });
    }
    return success(result);
  },
});

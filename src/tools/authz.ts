import { z } from 'zod';
import { AccAddress, isValidEvmAddress } from '@initia/initia.js/util';
import { registry } from './registry.js';
import { chainParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { ValidationError } from '../errors.js';

/**
 * Validate that an address is either a valid bech32 or EVM address.
 * Throws ValidationError if neither format matches.
 */
export function validateAddress(addr: string): void {
  if (!AccAddress.validate(addr) && !isValidEvmAddress(addr)) {
    throw new ValidationError(`Invalid address: "${addr}"`);
  }
}

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
  handler: async ({ chain, granter, grantee, network }, { chainManager }) => {
    if (!granter && !grantee) {
      throw new ValidationError('At least one of granter or grantee must be provided.');
    }
    if (granter) validateAddress(granter);
    if (grantee) validateAddress(grantee);

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

import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, networkParam, confirmParam, dryRunParam, memoParam } from '../schemas/common.js';
import { success } from '../response.js';
import { ValidationError } from '../errors.js';
import { executeMutation } from './tx-executor.js';

registry.register({
  name: 'feegrant_allowances',
  group: 'feegrant',
  description: 'Query fee grant allowances for an address. Returns all grants where the address is the grantee.',
  schema: {
    chain: chainParam,
    grantee: z.string().describe('Grantee address'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  addressFields: { grantee: 'bech32' },
  handler: async ({ chain, grantee, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const result = await ctx.client.feegrant.allowances({ grantee });
    return success(result);
  },
});

const DEFAULT_EXPIRATION_DAYS = 30;

registry.register({
  name: 'feegrant_grant',
  group: 'feegrant',
  description: 'Grant fee allowance to another address for gas fee sponsorship. At least one of spendLimit or expiration must be provided.',
  schema: {
    chain: chainParam,
    grantee: z.string().describe('Address to grant fee allowance to'),
    spendLimit: z.string().optional().describe('Maximum spend amount (e.g., "1000000uinit")'),
    expiration: z.number().optional().describe('Expiration in days from now (default: 30 when only spendLimit is provided)'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  addressFields: { grantee: 'bech32' },
  handler: async ({ chain, grantee, spendLimit, expiration, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();

    if (!spendLimit && expiration === undefined) {
      throw new ValidationError('At least one of spendLimit or expiration is required to prevent unbounded fee grants.');
    }

    const expirationDays = expiration ?? (spendLimit ? DEFAULT_EXPIRATION_DAYS : undefined);
    const expirationDate = expirationDays !== undefined
      ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
      : undefined;

    const ctx = await chainManager.getContext(chain, network);
    const granter = chainManager.getSignerAddress()!;

    const msg = ctx.msgs.feegrant.grantAllowance({
      granter,
      grantee,
      allowance: {
        spendLimit: spendLimit ? [{ denom: 'uinit', amount: spendLimit }] : undefined,
        expiration: expirationDate
          ? { seconds: BigInt(Math.floor(expirationDate.getTime() / 1000)), nanos: 0 }
          : undefined,
      },
    });

    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'feegrant_revoke',
  group: 'feegrant',
  description: 'Revoke a fee grant allowance previously granted to an address.',
  schema: {
    chain: chainParam,
    grantee: z.string().describe('Address to revoke fee allowance from'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  addressFields: { grantee: 'bech32' },
  handler: async ({ chain, grantee, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();

    const ctx = await chainManager.getContext(chain, network);
    const granter = chainManager.getSignerAddress()!;
    const msg = ctx.msgs.feegrant.revokeAllowance({ granter, grantee });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

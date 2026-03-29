import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { ValidationError } from '../errors.js';
import { resolveValidatorAddress } from './resolver.js';

registry.register({
  name: 'staking_pool',
  group: 'staking',
  description: 'Get the network staking pool summary: total bonded tokens, unbonded tokens, and voting power weights. L1 only.',
  schema: { network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.mstaking.pool({});
    return success(result.pool);
  },
});

registry.register({
  name: 'staking_annual_provisions',
  group: 'staking',
  description: 'Get the current annual token provisions (inflation). Useful for estimating staking APR. L1 only.',
  schema: { network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const result = await ctx.client.reward.annualProvisions({});
    const provisions = new TextDecoder().decode(result.annualProvisions);
    return success({ annualProvisions: provisions });
  },
});

registry.register({
  name: 'staking_manage',
  group: 'staking',
  description: 'Manage staking: delegate, undelegate, redelegate, or claim rewards.',
  schema: {
    chain: chainParam,
    action: z.enum(['delegate', 'undelegate', 'redelegate', 'claim_rewards']).describe('Staking action to perform'),
    validatorAddress: z.string().describe('Target validator address or moniker name'),
    amount: z.string().optional().describe('Amount to stake/unstake (required for delegate/undelegate/redelegate)'),
    denom: z.string().optional().default('uinit').describe('Token denomination'),
    redelegateToValidator: z.string().optional().describe('Destination validator address or moniker name (for redelegate)'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, action, validatorAddress: rawValidator, amount, denom, redelegateToValidator: rawRedelegate, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    const delegator = chainManager.getSignerAddress()!;
    const validatorAddress = await resolveValidatorAddress(ctx, rawValidator);

    let msg: any;
    switch (action) {
      case 'delegate':
        if (!amount) throw new ValidationError('amount is required for delegate');
        msg = ctx.msgs.mstaking.delegate({
          delegatorAddress: delegator,
          validatorAddress,
          amount: [{ denom: denom!, amount }],
        });
        break;
      case 'undelegate':
        if (!amount) throw new ValidationError('amount is required for undelegate');
        msg = ctx.msgs.mstaking.undelegate({
          delegatorAddress: delegator,
          validatorAddress,
          amount: [{ denom: denom!, amount }],
        });
        break;
      case 'redelegate': {
        if (!amount) throw new ValidationError('amount is required for redelegate');
        if (!rawRedelegate) throw new ValidationError('redelegateToValidator is required for redelegate');
        const validatorDstAddress = await resolveValidatorAddress(ctx, rawRedelegate);
        msg = ctx.msgs.mstaking.beginRedelegate({
          delegatorAddress: delegator,
          validatorSrcAddress: validatorAddress,
          validatorDstAddress,
          amount: [{ denom: denom!, amount }],
        });
        break;
      }
      case 'claim_rewards':
        msg = ctx.msgs.distribution.withdrawDelegatorReward({
          delegatorAddress: delegator,
          validatorAddress,
        });
        break;
    }

    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

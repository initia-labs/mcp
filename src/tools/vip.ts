import { z } from 'zod';
import { registry } from './registry.js';
import type { ChainManager } from '../initia/chain-manager.js';
import { addressParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';
import { createVip } from '@initia/initia.js/vip';
import { resolveValidatorAddress, resolveAddress } from './resolver.js';

async function getVip(chainManager: ChainManager, network?: 'mainnet' | 'testnet') {
  const ctx = await chainManager.getContext('initia', network);
  return { vip: createVip(ctx), ctx };
}

registry.register({
  name: 'vip_stage_info',
  group: 'vip',
  description: 'Get the current VIP stage number, start time, and end time.',
  schema: { network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ network }, { chainManager }) => {
    const { vip } = await getVip(chainManager, network);
    const info = await vip.getStageInfo();
    return success(info);
  },
});

registry.register({
  name: 'vip_positions',
  group: 'vip',
  description: 'Get all VIP lock-staking positions for an address. Shows locked delegations with metadata, validator, amount, and release time.',
  schema: { address: addressParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ address, network }, { chainManager }) => {
    const addr = resolveAddress(address, chainManager);
    const { vip } = await getVip(chainManager, network);
    const positions = await vip.getPositions(addr);
    return success(positions);
  },
});

registry.register({
  name: 'vip_voting_power',
  group: 'vip',
  description: 'Get VIP gauge voting power for an address.',
  schema: { address: addressParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ address, network }, { chainManager }) => {
    const addr = resolveAddress(address, chainManager);
    const { vip } = await getVip(chainManager, network);
    const power = await vip.getVotingPower(addr);
    return success({ votingPower: power.toString() });
  },
});

registry.register({
  name: 'vip_vesting_positions',
  group: 'vip',
  description: 'Get VIP vesting positions for an address from the indexer API. Shows bridge rewards with vesting schedules, including initial/claimable/claimed/locked reward breakdowns.',
  schema: { address: addressParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ address, network }, { chainManager }) => {
    const addr = resolveAddress(address, chainManager);
    const { vip } = await getVip(chainManager, network);
    const positions = await vip.getVestingPositions(addr);
    return success(positions.map(p => ({
      bridgeId: p.bridgeId,
      version: p.version,
      startStage: p.startStage,
      endStage: p.endStage,
      startTime: p.startTime,
      initialReward: p.initialReward.toString(),
      claimableReward: p.claimableReward.toString(),
      claimedReward: p.claimedReward.toString(),
      lockedReward: p.lockedReward.toString(),
      claimed: p.claimed,
    })));
  },
});

registry.register({
  name: 'vip_vote_info',
  group: 'vip',
  description: 'Get VIP gauge vote info for an address: max voting power, used voting power, and per-bridge weight allocations.',
  schema: {
    address: addressParam,
    cycle: z.number().optional().describe('Voting cycle number (omit for current cycle)'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ address, cycle, network }, { chainManager }) => {
    const addr = resolveAddress(address, chainManager);
    const { vip } = await getVip(chainManager, network);
    const info = await vip.getVoteInfo(cycle, addr);
    return success({
      maxVotingPower: info.maxVotingPower.toString(),
      votingPower: info.votingPower.toString(),
      weights: info.weights.map(w => ({ bridgeId: w.bridgeId, weight: w.weight.toString() })),
    });
  },
});

registry.register({
  name: 'vip_claimable_rewards',
  group: 'vip',
  description: 'Get claimable VIP rewards for an address from the VIP indexer API.',
  schema: { address: addressParam, network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ address, network }, { chainManager }) => {
    const addr = resolveAddress(address, chainManager);
    const { vip } = await getVip(chainManager, network);
    const rewards = await vip.getClaimableRewards(addr);
    return success(rewards.map(r => ({
      bridgeId: r.bridgeId,
      version: r.version,
      startStage: r.startStage,
      endStage: r.endStage,
      claimableReward: r.claimableReward.toString(),
    })));
  },
});

registry.register({
  name: 'vip_delegate',
  group: 'vip',
  description: 'Lock-delegate tokens to a validator via VIP. Tokens are locked until the specified release time.',
  schema: {
    metadata: z.string().describe('Coin metadata identifier (e.g., "0x1::native_uinit::Coin")'),
    amount: z.string().describe('Amount to delegate'),
    releaseTime: z.number().describe('Unix timestamp when tokens can be unlocked'),
    validator: z.string().describe('Validator address or moniker name'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ metadata, amount, releaseTime, validator: rawValidator, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const validator = await resolveValidatorAddress(ctx, rawValidator);
    const msg = vip.delegate({ metadata, amount: BigInt(amount), releaseTime, validator });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_undelegate',
  group: 'vip',
  description: 'Undelegate (unlock) tokens from a VIP lock-staking position.',
  schema: {
    metadata: z.string().describe('Coin metadata identifier (e.g., "0x1::native_uinit::Coin")'),
    amount: z.string().optional().describe('Amount to undelegate (omit for full position)'),
    releaseTime: z.number().describe('Original lock release time'),
    validator: z.string().describe('Validator address or moniker name'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ metadata, amount, releaseTime, validator: rawValidator, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const validator = await resolveValidatorAddress(ctx, rawValidator);
    const msg = vip.undelegate({ metadata, amount: amount ? BigInt(amount) : undefined, releaseTime, validator });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_redelegate',
  group: 'vip',
  description: 'Move a VIP lock-staking position from one validator to another, optionally changing the lock duration.',
  schema: {
    metadata: z.string().describe('Coin metadata identifier'),
    amount: z.string().optional().describe('Amount to redelegate (omit for full position)'),
    srcReleaseTime: z.number().describe('Source lock release time'),
    srcValidator: z.string().describe('Source validator address or moniker name'),
    dstReleaseTime: z.number().describe('Destination lock release time'),
    dstValidator: z.string().describe('Destination validator address or moniker name'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ metadata, amount, srcReleaseTime, srcValidator: rawSrc, dstReleaseTime, dstValidator: rawDst, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const [srcValidator, dstValidator] = await Promise.all([
      resolveValidatorAddress(ctx, rawSrc),
      resolveValidatorAddress(ctx, rawDst),
    ]);
    const msg = vip.redelegate({
      metadata, amount: amount ? BigInt(amount) : undefined,
      srcReleaseTime, srcValidator, dstReleaseTime, dstValidator,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_extend_lock',
  group: 'vip',
  description: 'Extend the lock duration of a VIP lock-staking position.',
  schema: {
    metadata: z.string().describe('Coin metadata identifier'),
    amount: z.string().optional().describe('Amount (omit for full position)'),
    releaseTime: z.number().describe('Current lock release time'),
    validator: z.string().describe('Validator address or moniker name'),
    newReleaseTime: z.number().describe('New lock release time (must be later than current)'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ metadata, amount, releaseTime, validator: rawValidator, newReleaseTime, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const validator = await resolveValidatorAddress(ctx, rawValidator);
    const msg = vip.extendLock({
      metadata, amount: amount ? BigInt(amount) : undefined,
      releaseTime, validator, newReleaseTime,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_gauge_vote',
  group: 'vip',
  description: 'Vote on VIP gauge weight distribution by specifying weights for each bridge.',
  schema: {
    cycle: z.number().describe('Voting cycle number'),
    votes: z.array(z.object({
      bridgeId: z.number().describe('Bridge ID'),
      weight: z.number().describe('Vote weight'),
    })).describe('Array of bridge votes with weights'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ cycle, votes, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const msg = vip.voteGauge({ cycle, votes });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_gauge_vote_by_amount',
  group: 'vip',
  description: 'Vote on VIP gauge weight distribution by specifying exact amounts for each bridge.',
  schema: {
    cycle: z.number().describe('Voting cycle number'),
    votes: z.array(z.object({
      bridgeId: z.number().describe('Bridge ID'),
      amount: z.string().describe('Vote amount'),
    })).describe('Array of bridge votes with amounts'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ cycle, votes, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const msg = vip.voteGaugeByAmount({ cycle, votes: votes.map(v => ({ bridgeId: v.bridgeId, amount: BigInt(v.amount) })) });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_claim_rewards',
  group: 'vip',
  description: 'Claim all pending VIP rewards. Fetches proofs from the VIP indexer and submits claim transactions.',
  schema: {
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const rewards = await vip.getClaimableRewards();
    if (rewards.length === 0) {
      return success({ status: 'no_rewards', message: 'No claimable VIP rewards found.' });
    }
    const msgs = vip.claimRewards(rewards);
    return executeMutation({ msgs, chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_claim_staking_rewards',
  group: 'vip',
  description: 'Claim staking rewards from VIP lock-staking delegations.',
  schema: {
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const msg = vip.claimStakingRewards();
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_provide_and_delegate',
  group: 'vip',
  description: 'Provide liquidity to a pair pool and lock-delegate the LP tokens to a validator in a single transaction.',
  schema: {
    lpMetadata: z.string().describe('LP pool metadata identifier (e.g., "0x1::pair::INIT_USDC")'),
    coinAAmount: z.string().describe('Amount of coin A to provide'),
    coinBAmount: z.string().describe('Amount of coin B to provide'),
    minLiquidity: z.string().optional().describe('Minimum LP tokens to receive (slippage protection, default 0)'),
    releaseTime: z.number().describe('Unix timestamp when tokens can be unlocked'),
    validator: z.string().describe('Validator address or moniker name'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ lpMetadata, coinAAmount, coinBAmount, minLiquidity, releaseTime, validator: rawValidator, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const validator = await resolveValidatorAddress(ctx, rawValidator);
    const msg = vip.provideAndDelegate({
      lpMetadata,
      coinAAmount: BigInt(coinAAmount),
      coinBAmount: BigInt(coinBAmount),
      minLiquidity: minLiquidity ? BigInt(minLiquidity) : undefined,
      releaseTime,
      validator,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

registry.register({
  name: 'vip_stableswap_provide_and_delegate',
  group: 'vip',
  description: 'Provide liquidity to a stableswap pool (3+ tokens) and lock-delegate the LP tokens to a validator in a single transaction.',
  schema: {
    lpMetadata: z.string().describe('Stableswap pool metadata identifier (e.g., "0x1::stableswap::USDC_USDT_DAI")'),
    amounts: z.array(z.string()).describe('Amounts for each token in the pool, in order'),
    minLiquidity: z.string().optional().describe('Minimum LP tokens to receive (slippage protection, default 0)'),
    releaseTime: z.number().describe('Unix timestamp when tokens can be unlocked'),
    validator: z.string().describe('Validator address or moniker name'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ lpMetadata, amounts, minLiquidity, releaseTime, validator: rawValidator, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const { vip, ctx } = await getVip(chainManager, network);
    const validator = await resolveValidatorAddress(ctx, rawValidator);
    const msg = vip.stableswapProvideAndDelegate({
      lpMetadata,
      amounts: amounts.map(a => BigInt(a)),
      minLiquidity: minLiquidity ? BigInt(minLiquidity) : undefined,
      releaseTime,
      validator,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

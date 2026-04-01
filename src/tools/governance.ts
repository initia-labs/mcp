import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, paginationParams, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { executeMutation } from './tx-executor.js';

registry.register({
  name: 'proposal_list',
  group: 'governance',
  description: 'List governance proposals on a chain. Returns paginated results (default 10). Use limit/offset to navigate. Filter by status, voter, or depositor.',
  schema: {
    chain: chainParam,
    proposalStatus: z.enum(['DEPOSIT_PERIOD', 'VOTING_PERIOD', 'PASSED', 'REJECTED', 'FAILED']).optional()
      .describe('Filter by proposal status. Omit to list all.'),
    voter: z.string().optional().describe('Filter by voter address'),
    depositor: z.string().optional().describe('Filter by depositor address'),
    ...paginationParams,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  addressFields: { voter: 'bech32', depositor: 'bech32' },
  handler: async ({ chain, proposalStatus, voter, depositor, limit, offset, reverse, network }, { chainManager }) => {
    const statusMap: Record<string, number> = {
      DEPOSIT_PERIOD: 1, VOTING_PERIOD: 2, PASSED: 3, REJECTED: 4, FAILED: 5,
    };
    const ctx = await chainManager.getContext(chain, network);
    const result = await ctx.client.gov.proposals({
      proposalStatus: proposalStatus ? statusMap[proposalStatus] : 0,
      voter: voter ?? '',
      depositor: depositor ?? '',
      pagination: { limit: BigInt(limit ?? 10), offset: BigInt(offset ?? 0), reverse },
    });
    return success(result);
  },
});

registry.register({
  name: 'proposal_get',
  group: 'governance',
  description: 'Get detailed information about a specific governance proposal.',
  schema: {
    chain: chainParam,
    proposalId: z.string().describe('Proposal ID'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, proposalId, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const result = await ctx.client.gov.proposal({ proposalId: BigInt(proposalId) });
    return success(result);
  },
});

registry.register({
  name: 'governance_vote',
  group: 'governance',
  description: 'Vote on a governance proposal. Options: YES=1, ABSTAIN=2, NO=3, NO_WITH_VETO=4.',
  schema: {
    chain: chainParam,
    proposalId: z.string().describe('Proposal ID'),
    option: z.number().min(1).max(4).describe('Vote option: 1=YES, 2=ABSTAIN, 3=NO, 4=NO_WITH_VETO'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, proposalId, option, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    const voter = chainManager.getSignerAddress()!;
    const msg = ctx.msgs.gov.vote({
      proposalId: BigInt(proposalId),
      voter,
      option,
    });
    return executeMutation({ msgs: [msg], chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, memoParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';

registry.register({
  name: 'simulate_tx',
  group: 'simulate',
  description: 'Simulate a transaction to estimate gas and verify execution feasibility. Requires signer to be configured.',
  schema: {
    chain: chainParam,
    msgs: z.array(z.record(z.string(), z.unknown())).describe('Array of message objects to simulate'),
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, msgs, memo, network }, { chainManager }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    const estimate = await ctx.estimateGas(msgs, { memo });
    return success({
      status: 'simulated',
      chainId: ctx.chainId,
      estimatedGas: String(estimate.gasLimit),
      fee: estimate.fee,
    });
  },
});

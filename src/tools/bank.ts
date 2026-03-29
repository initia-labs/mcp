import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, confirmParam, dryRunParam, memoParam, networkParam } from '../schemas/common.js';
import { executeMutation } from './tx-executor.js';

registry.register({
  name: 'bank_send',
  group: 'bank',
  description: 'Send tokens to one or more recipients in a single transaction.',
  schema: {
    chain: chainParam,
    sends: z.array(z.object({
      to: z.string().describe('Recipient address'),
      amount: z.string().describe('Amount to send (e.g., "1000000")'),
      denom: z.string().describe('Token denomination (e.g., "uinit")'),
    })).describe('Array of send operations to batch in one tx'),
    dryRun: dryRunParam,
    confirm: confirmParam,
    memo: memoParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async ({ chain, sends, dryRun, confirm, memo, network }, { chainManager, config }) => {
    chainManager.requireSigner();
    const ctx = await chainManager.getContext(chain, network);
    const sender = chainManager.getSignerAddress()!;
    const msgs = sends.map((s: any) =>
      ctx.msgs.bank.send({
        fromAddress: sender,
        toAddress: s.to,
        amount: [{ denom: s.denom, amount: s.amount }],
      }),
    );
    return executeMutation({ msgs, chainId: ctx.chainId, dryRun, confirm, memo }, config, ctx);
  },
});

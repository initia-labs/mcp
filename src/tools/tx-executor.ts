import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AppConfig } from '../config/index.js';
import { dryRunResult, simulateResult, txResult } from '../response.js';
import { BroadcastError, LedgerSignError, LedgerConnectionError } from '../errors.js';
import { logger } from '../logger.js';

export const LEDGER_SIGN_TIMEOUT = 90_000;

export interface MutationParams {
  msgs: unknown[];
  chainId: string;
  dryRun: boolean;
  confirm: boolean;
  memo?: string;
  destructive?: boolean;
}

/**
 * Execute mutation with confirm flow.
 * ctx is the initia.js v2 ChainContext (has signAndBroadcast, estimateGas).
 */
export async function executeMutation(
  params: MutationParams,
  config: AppConfig,
  ctx: any,
): Promise<CallToolResult> {
  const { msgs, chainId, dryRun, confirm, memo, destructive } = params;

  // Dry run — preview only, no chain communication
  if (dryRun) {
    return dryRunResult({ msgs, chainId, memo });
  }

  // Estimate gas via simulation
  const estimate = await ctx.estimateGas(msgs, { memo });
  const estimatedGas = String(estimate.gasLimit);

  // AUTO_CONFIRM never bypasses destructive tools — require explicit confirm
  const autoAllowed = config.autoConfirm && !destructive;

  // If not confirmed (and auto-confirm not applicable), return simulation
  if (!confirm && !autoAllowed) {
    return simulateResult({
      msgs, estimatedGas, chainId, memo,
      ...(config.key.type === 'ledger' && {
        notice: 'Next step requires physical confirmation on Ledger device.',
      }),
      ...(destructive && config.autoConfirm && {
        notice: 'Destructive operations require explicit confirm even with AUTO_CONFIRM.',
      }),
    });
  }

  // Broadcast (with Ledger timeout if applicable)
  logger.info('Broadcasting transaction', { chainId, msgCount: msgs.length });

  let result: any;
  try {
    const broadcastPromise = ctx.signAndBroadcast(msgs, { memo, waitForConfirmation: true });

    result = config.key.type === 'ledger'
      ? await Promise.race([
          broadcastPromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new LedgerSignError('Signing timed out. Check device is connected and confirm on screen.')),
              LEDGER_SIGN_TIMEOUT,
            ),
          ),
        ])
      : await broadcastPromise;
  } catch (e: unknown) {
    if (config.key.type === 'ledger' && !(e instanceof LedgerSignError)) {
      const { LedgerError } = await import('@initia/ledger-key');
      if (e instanceof LedgerError) {
        throw new LedgerSignError((e as Error).message);
      }
      if (e instanceof Error) {
        throw new LedgerConnectionError(e.message);
      }
    }
    throw e;
  }

  logger.info('Transaction broadcast', { chainId, txHash: result.txHash, code: result.code });

  if (result.code && result.code !== 0) {
    throw new BroadcastError(result.rawLog || 'Transaction failed', result.code, result.txHash);
  }

  return txResult({
    txHash: result.txHash,
    chainId,
    code: result.code ?? 0,
    rawLog: result.rawLog ?? '',
    events: result.events ?? [],
    gasUsed: String(result.gasUsed ?? ''),
    gasWanted: String(result.gasWanted ?? ''),
    height: String(result.height ?? ''),
  });
}

import { createInterface } from 'node:readline/promises';
import pc from 'picocolors';

export async function promptConfirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

export function formatSimulationSummary(data: Record<string, unknown>): string {
  const lines: string[] = [];
  if (data.chainId) lines.push(`  ${pc.dim('Chain')}     ${data.chainId}`);
  if (data.estimatedGas) lines.push(`  ${pc.dim('Gas')}       ~${pc.cyan(String(data.estimatedGas))} (estimated)`);
  if (data.msgs) {
    const msgs = data.msgs as unknown[];
    lines.push(`  ${pc.dim('Messages')}  ${msgs.length} message(s)`);
  }
  if (data.memo) lines.push(`  ${pc.dim('Memo')}      ${data.memo}`);
  return lines.join('\n');
}

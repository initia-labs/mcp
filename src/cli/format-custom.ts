import pc from 'picocolors';
import { registerFormatter, formatNumber, isRecord } from './format.js';

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

function field(label: string, value: string, labelWidth: number): string {
  return `  ${pc.dim(label.padEnd(labelWidth))}  ${value}`;
}

// ---------------------------------------------------------------------------
// account_get
// ---------------------------------------------------------------------------

function formatAccountGet(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;

  const address = data.address;
  const accountNumber = pick(data, 'accountNumber', 'account_number');
  const sequence = data.sequence;
  const balances = data.balances;

  if (typeof address !== 'string') return undefined;

  const lines: string[] = [];

  lines.push(pc.bold('Account'));
  const labelW = 13;
  lines.push(field('address', String(address), labelW));
  if (accountNumber !== undefined) {
    lines.push(field('number', formatNumber(String(accountNumber)), labelW));
  }
  if (sequence !== undefined) {
    lines.push(field('sequence', formatNumber(String(sequence)), labelW));
  }

  if (Array.isArray(balances) && balances.length > 0) {
    lines.push('');
    lines.push(pc.bold('Balances'));
    const denomW = balances.reduce((max, b) => Math.max(max, String(isRecord(b) ? (b.denom ?? '') : '').length), 5);
    lines.push(`  ${pc.dim('DENOM'.padEnd(denomW))}  ${pc.dim('AMOUNT')}`);
    for (const bal of balances) {
      if (!isRecord(bal)) continue;
      const denom = String(bal.denom ?? '');
      const amount = String(bal.amount ?? '');
      lines.push(`  ${denom.padEnd(denomW)}  ${formatNumber(amount)}`);
    }
  } else if (Array.isArray(balances) && balances.length === 0) {
    lines.push('');
    lines.push(pc.bold('Balances'));
    lines.push(`  ${pc.dim('No balances found.')}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// tx_get
// ---------------------------------------------------------------------------

function formatTxGet(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;

  // Must have at least a hash or height to be a tx-like response
  const hash = pick(data, 'hash', 'txhash');
  const height = data.height;
  if (hash === undefined && height === undefined) return undefined;

  const lines: string[] = [];

  lines.push(pc.bold('Transaction'));
  const labelW = 11;
  if (hash !== undefined) lines.push(field('hash', String(hash), labelW));
  if (height !== undefined) lines.push(field('height', formatNumber(String(height)), labelW));
  if (data.code !== undefined) {
    const code = Number(data.code);
    const codeStr = code === 0 ? pc.green('0 (success)') : pc.red(String(code));
    lines.push(field('code', codeStr, labelW));
  }
  const gasUsed = pick(data, 'gasUsed', 'gas_used');
  if (gasUsed !== undefined) {
    lines.push(field('gasUsed', formatNumber(String(gasUsed)), labelW));
  }
  const gasWanted = pick(data, 'gasWanted', 'gas_wanted');
  if (gasWanted !== undefined) {
    lines.push(field('gasWanted', formatNumber(String(gasWanted)), labelW));
  }

  // Messages
  const tx = data.tx;
  const msgs: unknown[] =
    isRecord(tx) && isRecord(tx.body) && Array.isArray(tx.body.messages)
      ? tx.body.messages
      : Array.isArray(data.messages)
        ? data.messages
        : [];

  if (msgs.length > 0) {
    lines.push('');
    lines.push(pc.bold('Messages'));
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (isRecord(msg)) {
        const typeUrl = String(msg['@type'] ?? msg.type_url ?? msg.typeUrl ?? `message[${i}]`);
        // Strip cosmos/initia module prefix for readability: /cosmos.bank.v1beta1.MsgSend -> MsgSend
        const shortType = typeUrl.split('.').pop() ?? typeUrl;
        lines.push(`  ${pc.dim(String(i + 1) + '.')} ${shortType}`);
      } else {
        lines.push(`  ${pc.dim(String(i + 1) + '.')} ${String(msg)}`);
      }
    }
  }

  // Events
  const events: unknown[] = Array.isArray(data.events) ? data.events : [];
  if (events.length > 0) {
    lines.push('');
    lines.push(pc.bold('Events'));
    for (const ev of events) {
      if (!isRecord(ev)) continue;
      const evType = String(ev.type ?? 'unknown');
      const attrs = Array.isArray(ev.attributes) ? ev.attributes : [];
      const attrStr = attrs
        .filter(isRecord)
        .map(a => `${a.key}=${a.value}`)
        .join(', ');
      lines.push(`  ${pc.cyan(evType)}${attrStr ? `  ${pc.dim(attrStr)}` : ''}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// bridge_route
// ---------------------------------------------------------------------------

function formatBridgeRoute(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;

  const source = pick(data, 'source', 'srcChainId', 'src_chain_id');
  const dest = pick(data, 'dest', 'dstChainId', 'dst_chain_id');
  const operations = data.operations;
  const amountIn = pick(data, 'amountIn', 'amount_in');
  const amountOut = pick(data, 'amountOut', 'amount_out');
  const durationSecs = pick(data, 'estimatedDurationSeconds', 'estimated_duration_seconds', 'duration');

  if (source === undefined && dest === undefined && !Array.isArray(operations)) return undefined;

  const lines: string[] = [];

  const srcStr = source !== undefined ? String(source) : '?';
  const dstStr = dest !== undefined ? String(dest) : '?';
  lines.push(pc.bold(`Route: ${srcStr} \u2192 ${dstStr}`));

  if (amountIn !== undefined || amountOut !== undefined) {
    const inStr = amountIn !== undefined ? formatAmountToken(amountIn) : '?';
    const outStr = amountOut !== undefined ? formatAmountToken(amountOut) : '?';
    lines.push(`  ${pc.dim('Amount  ')} ${inStr} \u2192 ${outStr}`);
  }

  if (durationSecs !== undefined) {
    lines.push(`  ${pc.dim('Duration')} ~${formatNumber(String(durationSecs))}s`);
  }

  if (Array.isArray(operations) && operations.length > 0) {
    lines.push(`  ${pc.dim('Operations:')}`);
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (isRecord(op)) {
        const opType = String(op.type ?? op.action ?? op.kind ?? 'op');
        const detail = op.channel ?? op.pool ?? op.poolId ?? op.pool_id ?? op.dex ?? op.bridge;
        const detailStr = detail !== undefined ? ` (${detail})` : '';
        lines.push(`    ${i + 1}. ${opType}${detailStr}`);
      } else {
        lines.push(`    ${i + 1}. ${String(op)}`);
      }
    }
  }

  return lines.join('\n');
}

function formatAmountToken(val: unknown): string {
  if (isRecord(val)) {
    const amount = val.amount !== undefined ? formatNumber(String(val.amount)) : '?';
    const denom = val.denom !== undefined ? ` ${val.denom}` : '';
    return `${amount}${denom}`;
  }
  return formatNumber(String(val));
}

// ---------------------------------------------------------------------------
// delegation_get
// ---------------------------------------------------------------------------

function formatDelegationGet(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;

  const delegations = pick(data, 'delegations', 'delegation_responses');
  const rewards = pick(data, 'rewards', 'total');
  const unbonding = pick(data, 'unbonding', 'unbondingDelegations', 'unbonding_delegations');

  // Must have at least one delegation-related key
  if (delegations === undefined && rewards === undefined && unbonding === undefined) return undefined;

  const lines: string[] = [];

  if (Array.isArray(delegations)) {
    lines.push(pc.bold('Delegations'));
    if (delegations.length === 0) {
      lines.push(`  ${pc.dim('None.')}`);
    } else {
      const rows = delegations.map(d => {
        if (!isRecord(d)) return {};
        const del = isRecord(d.delegation) ? d.delegation : d;
        return {
          validator: String(pick(del, 'validatorAddress', 'validator_address', 'validator') ?? ''),
          amount: formatNumber(String(
            isRecord(d.balance)
              ? (d.balance.amount ?? '')
              : (del.shares ?? del.amount ?? ''),
          )),
          denom: String(
            isRecord(d.balance) ? (d.balance.denom ?? '') : '',
          ),
        };
      });
      const valW = rows.reduce((max, r) => Math.max(max, r.validator?.length ?? 0), 9);
      const amtW = rows.reduce((max, r) => Math.max(max, r.amount?.length ?? 0), 6);
      lines.push(`  ${'VALIDATOR'.padEnd(valW)}  ${'AMOUNT'.padStart(amtW)}  DENOM`);
      for (const row of rows) {
        lines.push(`  ${(row.validator ?? '').padEnd(valW)}  ${(row.amount ?? '').padStart(amtW)}  ${row.denom ?? ''}`);
      }
    }
  }

  if (Array.isArray(rewards) && rewards.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(pc.bold('Rewards'));
    const rewardsArr = rewards as unknown[];
    const denomW = rewardsArr.reduce<number>((max, r) => Math.max(max, String(isRecord(r) ? (r.denom ?? '') : '').length), 5);
    lines.push(`  ${'DENOM'.padEnd(denomW)}  AMOUNT`);
    for (const r of rewardsArr) {
      if (!isRecord(r)) continue;
      lines.push(`  ${String(r.denom ?? '').padEnd(denomW)}  ${formatNumber(String(r.amount ?? ''))}`);
    }
  } else if (isRecord(rewards)) {
    // rewards might be a nested object with validator -> coins
    if (lines.length > 0) lines.push('');
    lines.push(pc.bold('Rewards'));
    lines.push(`  ${pc.dim(JSON.stringify(rewards))}`);
  }

  if (Array.isArray(unbonding)) {
    if (lines.length > 0) lines.push('');
    lines.push(pc.bold('Unbonding'));
    if (unbonding.length === 0) {
      lines.push(`  ${pc.dim('None.')}`);
    } else {
      const rows = unbonding.map(u => {
        if (!isRecord(u)) return {};
        const entries = Array.isArray(u.entries) ? u.entries : [];
        const firstEntry = entries.length > 0 && isRecord(entries[0]) ? entries[0] : null;
        return {
          validator: String(pick(u, 'validatorAddress', 'validator_address', 'validator') ?? ''),
          balance: firstEntry
            ? formatNumber(String(pick(firstEntry, 'balance', 'initialBalance') ?? ''))
            : '',
          completionTime: firstEntry
            ? String(pick(firstEntry, 'completionTime', 'completion_time') ?? '')
            : '',
        };
      });
      const valW = rows.reduce((max, r) => Math.max(max, r.validator?.length ?? 0), 9);
      lines.push(`  ${'VALIDATOR'.padEnd(valW)}  BALANCE      COMPLETION`);
      for (const row of rows) {
        lines.push(`  ${(row.validator ?? '').padEnd(valW)}  ${(row.balance ?? '').padEnd(12)} ${row.completionTime ?? ''}`);
      }
    }
  }

  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerFormatter('account_get', formatAccountGet);
registerFormatter('tx_get', formatTxGet);
registerFormatter('bridge_route', formatBridgeRoute);
registerFormatter('delegation_get', formatDelegationGet);

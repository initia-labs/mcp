import { describe, it, expect } from 'vitest';
import { formatOutput } from '../src/cli/format.js';
// Side-effect import registers the custom formatters
import '../src/cli/format-custom.js';

function makeResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

// ---------------------------------------------------------------------------
// account_get
// ---------------------------------------------------------------------------

describe('account_get formatter', () => {
  it('formats valid account data with sections', () => {
    const data = {
      address: 'init1abc123',
      accountNumber: 42,
      sequence: 7,
      balances: [
        { denom: 'uinit', amount: '1000000' },
        { denom: 'uusdc', amount: '500000' },
      ],
    };
    const output = formatOutput(makeResult(data), false, 'account_get');
    expect(output).toContain('Account');
    expect(output).toContain('init1abc123');
    expect(output).toContain('42');
    expect(output).toContain('7');
    expect(output).toContain('Balances');
    expect(output).toContain('uinit');
    expect(output).toContain('1,000,000');
    expect(output).toContain('uusdc');
    expect(output).toContain('500,000');
  });

  it('formats account with empty balances', () => {
    const data = { address: 'init1abc', accountNumber: 1, sequence: 0, balances: [] };
    const output = formatOutput(makeResult(data), false, 'account_get');
    expect(output).toContain('Account');
    expect(output).toContain('Balances');
    expect(output).toContain('No balances found');
  });

  it('falls back for missing address', () => {
    const data = { accountNumber: 1, sequence: 0 };
    const output = formatOutput(makeResult(data), false, 'account_get');
    // Falls back to auto-formatter (key-value), does not throw
    expect(output).toContain('accountNumber');
  });

  it('falls back for non-object data', () => {
    const output = formatOutput(makeResult([1, 2, 3]), false, 'account_get');
    // Falls back to auto-formatter (table/list), does not throw
    expect(output).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// tx_get
// ---------------------------------------------------------------------------

describe('tx_get formatter', () => {
  it('formats valid tx data with all sections', () => {
    const data = {
      hash: 'ABCDEF1234',
      height: 123456,
      code: 0,
      gasUsed: 80000,
      gasWanted: 100000,
      tx: {
        body: {
          messages: [
            { '@type': '/cosmos.bank.v1beta1.MsgSend' },
            { '@type': '/cosmos.staking.v1beta1.MsgDelegate' },
          ],
        },
      },
      events: [
        { type: 'coin_spent', attributes: [{ key: 'spender', value: 'init1abc' }] },
        { type: 'message', attributes: [{ key: 'action', value: '/cosmos.bank.v1beta1.MsgSend' }] },
      ],
    };
    const output = formatOutput(makeResult(data), false, 'tx_get');
    expect(output).toContain('Transaction');
    expect(output).toContain('ABCDEF1234');
    expect(output).toContain('123,456');
    expect(output).toContain('success');
    expect(output).toContain('80,000');
    expect(output).toContain('100,000');
    expect(output).toContain('Messages');
    expect(output).toContain('MsgSend');
    expect(output).toContain('MsgDelegate');
    expect(output).toContain('Events');
    expect(output).toContain('coin_spent');
    expect(output).toContain('message');
  });

  it('formats tx with non-zero error code in red color', () => {
    const data = { hash: 'DEADBEEF', height: 1, code: 5, gasUsed: 10000, gasWanted: 10000 };
    const output = formatOutput(makeResult(data), false, 'tx_get');
    expect(output).toContain('Transaction');
    expect(output).toContain('DEADBEEF');
    expect(output).toContain('5');
  });

  it('falls back for missing hash and height', () => {
    const data = { foo: 'bar', baz: 42 };
    const output = formatOutput(makeResult(data), false, 'tx_get');
    // Falls back to auto-formatter (key-value)
    expect(output).toContain('foo');
  });

  it('falls back for array input', () => {
    const output = formatOutput(makeResult([{ hash: 'a' }]), false, 'tx_get');
    expect(output).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// bridge_route
// ---------------------------------------------------------------------------

describe('bridge_route formatter', () => {
  it('formats valid route with operations', () => {
    const data = {
      source: 'initiation-2',
      dest: 'minievm-1',
      amountIn: { amount: '1000000', denom: 'uinit' },
      amountOut: { amount: '1000000', denom: 'uinit' },
      estimatedDurationSeconds: 60,
      operations: [
        { type: 'transfer', channel: 'channel-0' },
        { type: 'swap', pool: 'pool-1' },
      ],
    };
    const output = formatOutput(makeResult(data), false, 'bridge_route');
    expect(output).toContain('Route:');
    expect(output).toContain('initiation-2');
    expect(output).toContain('minievm-1');
    expect(output).toContain('1,000,000');
    expect(output).toContain('uinit');
    expect(output).toContain('~60s');
    expect(output).toContain('Operations');
    expect(output).toContain('transfer');
    expect(output).toContain('channel-0');
    expect(output).toContain('swap');
    expect(output).toContain('pool-1');
  });

  it('formats route with scalar amountIn/amountOut', () => {
    const data = {
      source: 'chain-a',
      dest: 'chain-b',
      amountIn: '5000000',
      amountOut: '4990000',
      operations: [],
    };
    const output = formatOutput(makeResult(data), false, 'bridge_route');
    expect(output).toContain('Route:');
    expect(output).toContain('5,000,000');
    expect(output).toContain('4,990,000');
  });

  it('falls back for missing source, dest, and operations', () => {
    const data = { foo: 'bar' };
    const output = formatOutput(makeResult(data), false, 'bridge_route');
    // Falls back to auto-formatter
    expect(output).toContain('foo');
  });

  it('falls back for array input', () => {
    const output = formatOutput(makeResult(['a', 'b']), false, 'bridge_route');
    expect(output).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// delegation_get
// ---------------------------------------------------------------------------

describe('delegation_get formatter', () => {
  it('formats valid delegation data with all sections', () => {
    const data = {
      delegations: [
        {
          delegation: { validatorAddress: 'initvaloper1abc', shares: '1000000' },
          balance: { denom: 'uinit', amount: '1000000' },
        },
      ],
      rewards: [
        { denom: 'uinit', amount: '5000' },
      ],
      unbonding: [
        {
          validatorAddress: 'initvaloper1xyz',
          entries: [{ balance: '200000', completionTime: '2026-04-01T00:00:00Z' }],
        },
      ],
    };
    const output = formatOutput(makeResult(data), false, 'delegation_get');
    expect(output).toContain('Delegations');
    expect(output).toContain('initvaloper1abc');
    expect(output).toContain('1,000,000');
    expect(output).toContain('Rewards');
    expect(output).toContain('uinit');
    expect(output).toContain('5,000');
    expect(output).toContain('Unbonding');
    expect(output).toContain('initvaloper1xyz');
    expect(output).toContain('200,000');
    expect(output).toContain('2026-04-01');
  });

  it('formats delegation with empty arrays', () => {
    const data = { delegations: [], rewards: [], unbonding: [] };
    const output = formatOutput(makeResult(data), false, 'delegation_get');
    expect(output).toContain('Delegations');
    expect(output).toContain('None');
    expect(output).toContain('Unbonding');
  });

  it('falls back for missing delegation-related keys', () => {
    const data = { foo: 'bar', baz: 42 };
    const output = formatOutput(makeResult(data), false, 'delegation_get');
    // Falls back to auto-formatter
    expect(output).toContain('foo');
  });

  it('falls back for non-object data', () => {
    const output = formatOutput(makeResult('hello'), false, 'delegation_get');
    expect(output).toContain('hello');
  });
});

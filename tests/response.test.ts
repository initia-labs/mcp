import { describe, it, expect } from 'vitest';
import { success, error, txResult, simulateResult, dryRunResult } from '../src/response.js';

describe('response helpers', () => {
  it('success wraps JSON', () => {
    const r = success({ x: 1 });
    expect(JSON.parse(r.content[0].text)).toEqual({ x: 1 });
  });
  it('error sets isError', () => {
    expect(error('fail').isError).toBe(true);
  });
  it('txResult includes success flag', () => {
    const r = txResult({ txHash: 'A', chainId: 'c', code: 0, rawLog: '', events: [] });
    expect(JSON.parse(r.content[0].text).success).toBe(true);
  });
  it('txResult marks failure when code != 0', () => {
    const r = txResult({ txHash: 'B', chainId: 'c', code: 5, rawLog: 'out of gas', events: [] });
    const data = JSON.parse(r.content[0].text);
    expect(data.success).toBe(false);
    expect(data.code).toBe(5);
  });
  it('simulateResult has status', () => {
    const r = simulateResult({ msgs: [], estimatedGas: '100', chainId: 'c' });
    expect(JSON.parse(r.content[0].text).status).toBe('simulated');
  });
  it('dryRunResult has status', () => {
    const r = dryRunResult({ msgs: [], chainId: 'c' });
    expect(JSON.parse(r.content[0].text).status).toBe('dry_run');
  });

  it('success serializes BigInt values as strings', () => {
    const r = success({ amount: 123456789012345678901234567890n, name: 'test' });
    const data = JSON.parse(r.content[0].text);
    expect(data.amount).toBe('123456789012345678901234567890');
    expect(data.name).toBe('test');
  });

  it('simulateResult serializes msgs with toAmino()', () => {
    const msg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      toAmino: () => ({ from_address: 'init1a', to_address: 'init1b', amount: [{ denom: 'uinit', amount: '100' }] }),
    };
    const r = simulateResult({ msgs: [msg], estimatedGas: '200000', chainId: 'test-1' });
    const data = JSON.parse(r.content[0].text);
    expect(data.msgs[0].typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(data.msgs[0].from_address).toBe('init1a');
  });

  it('dryRunResult serializes msgs with toAmino()', () => {
    const msg = {
      typeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
      toAmino: () => ({ delegator_address: 'init1a', validator_address: 'initvaloper1b' }),
    };
    const r = dryRunResult({ msgs: [msg], chainId: 'test-1' });
    const data = JSON.parse(r.content[0].text);
    expect(data.msgs[0].typeUrl).toBe('/cosmos.staking.v1beta1.MsgDelegate');
    expect(data.msgs[0].delegator_address).toBe('init1a');
  });

  it('simulateResult falls back to typeUrl for msgs without toAmino', () => {
    const msg = { typeUrl: '/custom.MsgFoo' };
    const r = simulateResult({ msgs: [msg], estimatedGas: '100', chainId: 'c' });
    const data = JSON.parse(r.content[0].text);
    expect(data.msgs[0]).toEqual({ typeUrl: '/custom.MsgFoo' });
  });

  it('dryRunResult passes through plain objects', () => {
    const msg = { type: 'custom', value: { foo: 'bar' } };
    const r = dryRunResult({ msgs: [msg], chainId: 'c' });
    const data = JSON.parse(r.content[0].text);
    expect(data.msgs[0]).toEqual({ type: 'custom', value: { foo: 'bar' } });
  });

  it('simulateResult does not throw on msgs with circular references when toAmino is present', () => {
    const circular: any = { typeUrl: '/test.Circular', data: {} };
    circular.data.self = circular; // create circular reference
    circular.toAmino = () => ({ simple: 'data' });
    expect(() => simulateResult({ msgs: [circular], estimatedGas: '100', chainId: 'c' })).not.toThrow();
    const data = JSON.parse(simulateResult({ msgs: [circular], estimatedGas: '100', chainId: 'c' }).content[0].text);
    expect(data.msgs[0].simple).toBe('data');
  });

  it('simulateResult includes memo when provided', () => {
    const r = simulateResult({ msgs: [], estimatedGas: '100', chainId: 'c', memo: 'test memo' });
    const data = JSON.parse(r.content[0].text);
    expect(data.memo).toBe('test memo');
  });

  it('dryRunResult includes memo when provided', () => {
    const r = dryRunResult({ msgs: [], chainId: 'c', memo: 'test memo' });
    const data = JSON.parse(r.content[0].text);
    expect(data.memo).toBe('test memo');
  });
});

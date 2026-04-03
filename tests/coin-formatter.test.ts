import { describe, it, expect } from 'vitest';
import { stripDenomPrefix, truncateDecAmount, isContractDenom } from '../src/tools/coin-formatter.js';

describe('isContractDenom', () => {
  it('returns true for evm/ prefix', () => { expect(isContractDenom('evm/0x1234')).toBe(true); });
  it('returns true for cw20: prefix', () => { expect(isContractDenom('cw20:init1abc')).toBe(true); });
  it('returns true for move/ prefix', () => { expect(isContractDenom('move/0x1::m::N')).toBe(true); });
  it('returns false for native denom', () => { expect(isContractDenom('uinit')).toBe(false); });
  it('returns false for ibc denom', () => { expect(isContractDenom('ibc/ABC123')).toBe(false); });
  it('returns false for factory denom', () => { expect(isContractDenom('factory/init1.../sub')).toBe(false); });
  it('returns false for l2 denom', () => { expect(isContractDenom('l2/something')).toBe(false); });
});

describe('stripDenomPrefix', () => {
  it('strips evm/ prefix', () => { expect(stripDenomPrefix('evm/0x1234abcd')).toBe('0x1234abcd'); });
  it('strips cw20: prefix', () => { expect(stripDenomPrefix('cw20:init1abc')).toBe('init1abc'); });
  it('strips move/ prefix with 0x', () => { expect(stripDenomPrefix('move/0x1::module::Name')).toBe('0x1::module::Name'); });
  it('strips move/ prefix and adds 0x if missing', () => { expect(stripDenomPrefix('move/abcd1234')).toBe('0xabcd1234'); });
  it('returns native denoms unchanged', () => { expect(stripDenomPrefix('uinit')).toBe('uinit'); });
});

describe('truncateDecAmount', () => {
  it('truncates decimal string to integer', () => { expect(truncateDecAmount('8215255248.024179286264953')).toBe('8215255248'); });
  it('returns integer strings unchanged', () => { expect(truncateDecAmount('1000000')).toBe('1000000'); });
  it('handles zero decimal', () => { expect(truncateDecAmount('0.000000000000000000')).toBe('0'); });
});

import { resolveDenom, enrichCoins, type DenomMeta } from '../src/tools/coin-formatter.js';

function makeMockCtx(opts: {
  bankMetadata?: { symbol: string; display: string; denomUnits: { denom: string; exponent: number }[] };
  bankThrows?: boolean;
  tokenInfo?: { symbol: string; decimals: number };
  tokenThrows?: boolean;
} = {}) {
  return {
    client: {
      bank: {
        denomMetadata: opts.bankThrows
          ? async () => { throw new Error('not found'); }
          : async () => ({ metadata: opts.bankMetadata }),
      },
    },
    getTokenContract: () => ({
      getInfo: opts.tokenThrows
        ? async () => { throw new Error('not found'); }
        : async () => opts.tokenInfo,
    }),
  };
}

describe('resolveDenom', () => {
  it('resolves native denom via bank metadata', async () => {
    const ctx = makeMockCtx({
      bankMetadata: { symbol: 'INIT', display: 'init', denomUnits: [{ denom: 'uinit', exponent: 0 }, { denom: 'init', exponent: 6 }] },
    });
    const cache = new Map<string, DenomMeta | null>();
    const result = await resolveDenom('uinit', ctx, cache);
    expect(result).toEqual({ symbol: 'INIT', decimals: 6 });
    expect(cache.get('uinit')).toEqual({ symbol: 'INIT', decimals: 6 });
  });

  it('resolves contract denom via getTokenContract', async () => {
    const ctx = makeMockCtx({ tokenInfo: { symbol: 'USDC', decimals: 6 } });
    const cache = new Map<string, DenomMeta | null>();
    const result = await resolveDenom('evm/0x1234', ctx, cache);
    expect(result).toEqual({ symbol: 'USDC', decimals: 6 });
  });

  it('returns cached result on second call', async () => {
    const ctx = makeMockCtx({
      bankMetadata: { symbol: 'INIT', display: 'init', denomUnits: [{ denom: 'uinit', exponent: 0 }, { denom: 'init', exponent: 6 }] },
    });
    const cache = new Map<string, DenomMeta | null>();
    await resolveDenom('uinit', ctx, cache);
    ctx.client.bank.denomMetadata = async () => { throw new Error('should not be called'); };
    const result = await resolveDenom('uinit', ctx, cache);
    expect(result).toEqual({ symbol: 'INIT', decimals: 6 });
  });

  it('returns null and caches on bank failure', async () => {
    const ctx = makeMockCtx({ bankThrows: true });
    const cache = new Map<string, DenomMeta | null>();
    const result = await resolveDenom('ibc/UNKNOWN', ctx, cache);
    expect(result).toBeNull();
    expect(cache.get('ibc/UNKNOWN')).toBeNull();
  });

  it('returns null and caches on token contract failure', async () => {
    const ctx = makeMockCtx({ tokenThrows: true });
    const cache = new Map<string, DenomMeta | null>();
    const result = await resolveDenom('evm/0xdead', ctx, cache);
    expect(result).toBeNull();
  });

  it('falls back to max exponent when display field is empty', async () => {
    const ctx = makeMockCtx({
      bankMetadata: { symbol: '', display: '', denomUnits: [{ denom: 'utoken', exponent: 0 }, { denom: 'token', exponent: 8 }] },
    });
    const cache = new Map<string, DenomMeta | null>();
    const result = await resolveDenom('utoken', ctx, cache);
    expect(result).toEqual({ symbol: 'utoken', decimals: 8 });
  });
});

describe('enrichCoins', () => {
  const ctx = makeMockCtx({
    bankMetadata: { symbol: 'INIT', display: 'init', denomUnits: [{ denom: 'uinit', exponent: 0 }, { denom: 'init', exponent: 6 }] },
  });

  it('enriches a coin object', async () => {
    const data = { denom: 'uinit', amount: '1000000' };
    const result = await enrichCoins(data, ctx, new Map()) as any;
    expect(result.symbol).toBe('INIT');
    expect(result.decimals).toBe(6);
    expect(result.formatted).toBe('1 INIT');
  });

  it('enriches nested coin objects', async () => {
    const data = { balance: [{ denom: 'uinit', amount: '2500000' }] };
    const result = await enrichCoins(data, ctx, new Map()) as any;
    expect(result.balance[0].formatted).toBe('2.5 INIT');
  });

  it('handles DecCoin amounts with decimals', async () => {
    const data = { denom: 'uinit', amount: '8215255248.024179286264953' };
    const result = await enrichCoins(data, ctx, new Map()) as any;
    expect(result.formatted).toBe('8215.255248 INIT');
  });

  it('preserves non-coin objects', async () => {
    const data = { delegatorAddr: 'init1abc', count: 42 };
    const result = await enrichCoins(data, ctx, new Map()) as any;
    expect(result).toEqual(data);
  });

  it('skips enrichment when resolveDenom returns null', async () => {
    const failCtx = makeMockCtx({ bankThrows: true });
    const data = { denom: 'ibc/UNKNOWN', amount: '100' };
    const result = await enrichCoins(data, failCtx, new Map()) as any;
    expect(result.formatted).toBeUndefined();
    expect(result.amount).toBe('100');
  });

  it('handles null and primitive values', async () => {
    expect(await enrichCoins(null, ctx, new Map())).toBeNull();
    expect(await enrichCoins(undefined, ctx, new Map())).toBeUndefined();
    expect(await enrichCoins('hello', ctx, new Map())).toBe('hello');
    expect(await enrichCoins(42, ctx, new Map())).toBe(42);
  });
});

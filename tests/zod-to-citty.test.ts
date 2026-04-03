import { describe, it, expect } from 'vitest';
import { zodToCittyArgs, parseComplexArgs, restoreParamKeys } from '../src/cli/adapter.js';
import { z } from 'zod';

describe('zodToCittyArgs', () => {
  it('converts string param', () => {
    const args = zodToCittyArgs({ name: z.string().describe('Your name') });
    expect(args.name).toEqual({ type: 'string', description: 'Your name', required: true });
  });

  it('converts optional param', () => {
    const args = zodToCittyArgs({ name: z.string().optional().describe('Optional name') });
    expect(args.name.required).toBe(false);
  });

  it('converts boolean param', () => {
    const args = zodToCittyArgs({ flag: z.boolean().describe('A flag') });
    expect(args.flag.type).toBe('boolean');
  });

  it('converts number param', () => {
    const args = zodToCittyArgs({ count: z.number().describe('Count') });
    expect(args.count.type).toBe('string');
  });

  it('converts enum param', () => {
    const args = zodToCittyArgs({ network: z.enum(['mainnet', 'testnet']).describe('Network') });
    expect(args.network.type).toBe('string');
  });

  it('converts default value', () => {
    const args = zodToCittyArgs({ limit: z.number().optional().default(10).describe('Limit') });
    expect(args.limit.default).toBe('10');
    expect(args.limit.required).toBe(false);
  });

  it('skips confirm field', () => {
    const args = zodToCittyArgs({
      confirm: z.boolean().describe('Confirm'),
      name: z.string().describe('Name'),
    });
    expect(args.confirm).toBeUndefined();
    expect(args.name).toBeDefined();
  });

  it('converts camelCase keys to kebab-case', () => {
    const args = zodToCittyArgs({ sourceChainId: z.string().describe('Source chain') });
    expect(args['source-chain-id']).toBeDefined();
    expect(args['sourceChainId']).toBeUndefined();
  });

  it('handles array/object params as string type', () => {
    const args = zodToCittyArgs({
      items: z.array(z.object({ to: z.string() })).describe('Items as JSON'),
    });
    expect(args.items.type).toBe('string');
  });
});

describe('parseComplexArgs', () => {
  it('parses JSON string for array param', () => {
    const schema = { items: z.array(z.object({ to: z.string() })) };
    const result = parseComplexArgs({ items: '[{"to":"addr"}]' }, schema);
    expect(result.items).toEqual([{ to: 'addr' }]);
  });

  it('converts string to number for number param', () => {
    const schema = { count: z.number() };
    const result = parseComplexArgs({ count: '42' }, schema);
    expect(result.count).toBe(42);
  });

  it('throws on malformed JSON', () => {
    const schema = { items: z.array(z.string()) };
    expect(() => parseComplexArgs({ items: '{broken' }, schema)).toThrow(/Invalid JSON/);
  });
});

describe('restoreParamKeys', () => {
  it('converts kebab-case args back to camelCase', () => {
    const schema = { sourceChainId: z.string(), destChainId: z.string() };
    const args = { 'source-chain-id': 'chain-a', 'dest-chain-id': 'chain-b' };
    const result = restoreParamKeys(args, schema);
    expect(result).toEqual({ sourceChainId: 'chain-a', destChainId: 'chain-b' });
  });
});

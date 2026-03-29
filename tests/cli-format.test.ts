import { describe, it, expect } from 'vitest';
import { formatOutput } from '../src/cli/format.js';

describe('formatOutput', () => {
  // JSON mode unchanged
  it('returns raw JSON in json mode', () => {
    const result = { content: [{ type: 'text' as const, text: '{"foo":"bar"}' }] };
    expect(formatOutput(result, true)).toBe('{"foo":"bar"}');
  });

  // TTY mode: single object -> key-value
  it('formats single object as key-value', () => {
    const result = { content: [{ type: 'text' as const, text: '{"chainId":"initiation-2","chainType":"initia"}' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('chainId');
    expect(output).toContain('initiation-2');
  });

  // TTY mode: array of objects -> table with headers
  it('formats array of objects as table', () => {
    const data = [{ name: 'alice', age: 30 }, { name: 'bob', age: 25 }];
    const result = { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    const output = formatOutput(result, false);
    expect(output).toContain('NAME');
    expect(output).toContain('AGE');
    expect(output).toContain('alice');
    expect(output).toContain('bob');
  });

  // Empty array
  it('shows "No results found" for empty array', () => {
    const result = { content: [{ type: 'text' as const, text: '[]' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('No results found');
  });

  // Number formatting
  it('formats large numbers with commas', () => {
    const result = { content: [{ type: 'text' as const, text: '{"amount":"1000000"}' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('1,000,000');
  });

  // Error with hint
  it('formats error with hint', () => {
    const result = { isError: true, content: [{ type: 'text' as const, text: '[CHAIN_NOT_FOUND] Chain not found: abc' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('Chain not found: abc');
    expect(output).toContain('initctl chain list');
  });

  // Error as JSON unchanged
  it('formats error as JSON', () => {
    const result = { isError: true, content: [{ type: 'text' as const, text: '[SIGNER_REQUIRED] No signer' }] };
    const output = formatOutput(result, true);
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('SIGNER_REQUIRED');
  });

  // Scalar value
  it('formats scalar value', () => {
    const result = { content: [{ type: 'text' as const, text: '"hello"' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('hello');
  });

  // Error without code
  it('formats error without code', () => {
    const result = { isError: true, content: [{ type: 'text' as const, text: 'Something went wrong' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('Something went wrong');
  });

  // Nested object with sections
  it('formats nested object with sections', () => {
    const data = { name: 'test', details: { foo: 'bar', baz: 42 } };
    const result = { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    const output = formatOutput(result, false);
    expect(output).toContain('name');
    expect(output).toContain('test');
    expect(output).toContain('Details');
    expect(output).toContain('foo');
  });

  // Boolean formatting
  it('formats boolean values', () => {
    const data = { active: true, deleted: false };
    const result = { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    const output = formatOutput(result, false);
    expect(output).toContain('true');
    expect(output).toContain('false');
  });

  // Passes toolName through
  it('accepts optional toolName parameter', () => {
    const result = { content: [{ type: 'text' as const, text: '{"a":1}' }] };
    // Should not throw with or without toolName
    expect(() => formatOutput(result, false)).not.toThrow();
    expect(() => formatOutput(result, false, 'chain_list')).not.toThrow();
  });

  // Decimal number formatting
  it('formats decimal numbers', () => {
    const result = { content: [{ type: 'text' as const, text: '{"amount":"1234567.89"}' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('1,234,567.89');
  });

  // Negative number formatting
  it('formats negative numbers', () => {
    const result = { content: [{ type: 'text' as const, text: '{"change":"-1000000"}' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('-1,000,000');
  });

  // Empty array edge case
  it('handles empty array results', () => {
    const result = { content: [{ type: 'text' as const, text: '[]' }] };
    const output = formatOutput(result, false);
    expect(output).toContain('No results found');
  });

  // Empty content
  it('handles empty content gracefully', () => {
    const result = { content: [] };
    const output = formatOutput(result as any, false);
    expect(output).toContain('no output');
  });
});

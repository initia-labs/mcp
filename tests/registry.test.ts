import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'test_tool',
      group: 'test',
      description: 'A test tool',
      schema: { input: z.string() },
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    const tool = registry.get('test_tool');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('test_tool');
    expect(tool!.group).toBe('test');
  });

  it('lists all tools', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'a_first', group: 'a', description: 'First', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    registry.register({
      name: 'b_second', group: 'b', description: 'Second', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    expect(registry.list()).toHaveLength(2);
  });

  it('lists tools by group', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'token_search', group: 'token', description: 'Search', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    registry.register({
      name: 'token_info', group: 'token', description: 'Info', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    registry.register({
      name: 'chain_list', group: 'chain', description: 'List', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    expect(registry.listByGroup('token')).toHaveLength(2);
    expect(registry.listByGroup('chain')).toHaveLength(1);
    expect(registry.listByGroup('nonexistent')).toHaveLength(0);
  });

  it('lists group names', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'token_search', group: 'token', description: 'Search', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    registry.register({
      name: 'chain_list', group: 'chain', description: 'List', schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    expect(registry.listGroups().sort()).toEqual(['chain', 'token']);
  });

  it('registers and retrieves group descriptions', () => {
    const registry = new ToolRegistry();
    registry.registerGroup('token', 'Token operations');
    expect(registry.getGroupDescription('token')).toBe('Token operations');
    expect(registry.getGroupDescription('nonexistent')).toBeUndefined();
  });

  it('rejects duplicate tool names', () => {
    const registry = new ToolRegistry();
    const def = {
      name: 'test_tool', group: 'test', description: 'Test', schema: {},
      annotations: { readOnlyHint: true } as const,
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    };
    registry.register(def);
    expect(() => registry.register(def)).toThrow(/already registered/);
  });

  it('accepts addressFields in tool definition', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'test_addr',
      group: 'test',
      description: 'Test with address fields',
      schema: { address: z.string() },
      annotations: { readOnlyHint: true },
      addressFields: { address: 'bech32' },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    const tool = registry.get('test_addr');
    expect(tool).toBeDefined();
    expect(tool!.addressFields).toEqual({ address: 'bech32' });
  });

  it('registers tool without addressFields', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'test_no_addr',
      group: 'test',
      description: 'Test without address fields',
      schema: { input: z.string() },
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    const tool = registry.get('test_no_addr');
    expect(tool).toBeDefined();
    expect(tool!.addressFields).toBeUndefined();
  });

  it('wraps handler with address normalization when addressFields is set', async () => {
    const registry = new ToolRegistry();
    const originalHandler = vi.fn(async ({ address }: any) => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ address }) }],
    }));

    registry.register({
      name: 'test_wrap',
      group: 'test',
      description: 'Test wrapping',
      schema: { address: z.string() },
      annotations: { readOnlyHint: true },
      addressFields: { address: 'bech32' },
      handler: originalHandler,
    });

    const tool = registry.get('test_wrap')!;
    const hexAddr = '0x0000000000000000000000000000000000000001';
    const { AccAddress } = await import('@initia/initia.js/util');
    const expectedBech32 = AccAddress.fromHex(hexAddr);

    const result = await tool.handler(
      { address: hexAddr } as any,
      { chainManager: {} } as any,
    );
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.address).toBe(expectedBech32);
    expect(originalHandler).toHaveBeenCalledWith(
      expect.objectContaining({ address: expectedBech32 }),
      expect.anything(),
    );
  });

  it('does not wrap handler when addressFields is absent', async () => {
    const registry = new ToolRegistry();
    const originalHandler = vi.fn(async ({ input }: any) => ({
      content: [{ type: 'text' as const, text: input }],
    }));

    registry.register({
      name: 'test_no_wrap',
      group: 'test',
      description: 'No wrapping',
      schema: { input: z.string() },
      annotations: { readOnlyHint: true },
      handler: originalHandler,
    });

    const tool = registry.get('test_no_wrap')!;
    await tool.handler({ input: 'hello' } as any, { chainManager: {} } as any);
    expect(originalHandler).toHaveBeenCalledWith({ input: 'hello' }, expect.anything());
  });
});

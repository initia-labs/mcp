import { describe, it, expect } from 'vitest';
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
});

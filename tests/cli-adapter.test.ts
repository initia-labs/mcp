import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { buildCittyCommands, toolNameToSubcommand } from '../src/cli/adapter.js';
import { z } from 'zod';

describe('toolNameToSubcommand', () => {
  it('strips group prefix', () => {
    expect(toolNameToSubcommand('token_search', 'token')).toBe('search');
  });

  it('converts remaining underscores to hyphens', () => {
    expect(toolNameToSubcommand('tx_by_address', 'tx')).toBe('by-address');
  });

  it('keeps full name with hyphens when no group prefix', () => {
    expect(toolNameToSubcommand('proposal_list', 'governance')).toBe('proposal-list');
  });

  it('handles single-segment name after strip', () => {
    expect(toolNameToSubcommand('chain_list', 'chain')).toBe('list');
  });
});

describe('buildCittyCommands', () => {
  it('creates command tree from registry', () => {
    const registry = new ToolRegistry();
    registry.registerGroup('test', 'Test tools');
    registry.register({
      name: 'test_hello',
      group: 'test',
      description: 'Say hello',
      schema: { name: z.string().describe('Your name') },
      annotations: { readOnlyHint: true },
      handler: async ({ name }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify({ greeting: `hello ${name}` }) }],
      }),
    });

    const ctx = { chainManager: {}, config: {} } as any;
    const main = buildCittyCommands(registry, ctx, '0.1.0');

    expect(main.meta?.name).toBe('initctl');
    expect(main.meta?.version).toBe('0.1.0');
    expect(main.subCommands).toBeDefined();
    expect(main.subCommands!.test).toBeDefined();
    expect((main.subCommands!.test as any).subCommands.hello).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import { generateBashCompletion, generateZshCompletion, generateFishCompletion } from '../src/cli/completion.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { z } from 'zod';

function createTestRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerGroup('token', 'Token operations');
  registry.register({
    name: 'token_search',
    group: 'token',
    description: 'Search tokens',
    schema: { symbol: z.string().describe('Symbol'), network: z.enum(['mainnet', 'testnet']).optional().describe('Network') },
    annotations: { readOnlyHint: true },
    handler: async () => ({ content: [{ type: 'text' as const, text: '{}' }] }),
  });
  return registry;
}

describe('bash completion', () => {
  it('generates valid bash script', () => {
    const script = generateBashCompletion(createTestRegistry());
    expect(script).toContain('_initctl_completions');
    expect(script).toContain('token');
    expect(script).toContain('search');
    expect(script).toContain('--symbol');
  });
});

describe('zsh completion', () => {
  it('generates valid zsh script', () => {
    const script = generateZshCompletion(createTestRegistry());
    expect(script).toContain('#compdef initctl');
    expect(script).toContain('token');
  });
});

describe('fish completion', () => {
  it('generates valid fish script', () => {
    const script = generateFishCompletion(createTestRegistry());
    expect(script).toContain('complete -c initctl');
    expect(script).toContain('token');
  });
});

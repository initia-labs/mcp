// tests/mcp-adapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { bindToMcpServer } from '../src/mcp/adapter.js';
import { z } from 'zod';

describe('bindToMcpServer', () => {
  it('registers all tools from registry onto McpServer', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'test_tool',
      group: 'test',
      description: 'A test',
      schema: { input: z.string() },
      annotations: { readOnlyHint: true },
      handler: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
    });

    const registerTool = vi.fn();
    const server = { registerTool } as any;
    const ctx = { chainManager: {}, config: {} } as any;

    bindToMcpServer(server, registry, ctx);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerTool.mock.calls[0][0]).toBe('test_tool');
    expect(registerTool.mock.calls[0][1].description).toBe('A test');
  });

  it('wraps handler with error handling', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'fail_tool',
      group: 'test',
      description: 'Fails',
      schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => { throw new Error('boom'); },
    });

    const registerTool = vi.fn();
    const server = { registerTool } as any;
    const ctx = { chainManager: {}, config: {} } as any;

    bindToMcpServer(server, registry, ctx);

    const handler = registerTool.mock.calls[0][2];
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('INTERNAL_ERROR');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { bindToMcpServer } from '../src/mcp/adapter.js';
import { ValidationError, ChainNotFoundError } from '../src/errors.js';
import { z } from 'zod';

describe('MCP adapter error handling', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: 'tool_success',
      group: 'test',
      description: 'Returns success',
      schema: { input: z.string() },
      annotations: { readOnlyHint: true },
      handler: async ({ input }) => ({ content: [{ type: 'text', text: `ok: ${input}` }] }),
    });

    registry.register({
      name: 'tool_mcp_error',
      group: 'test',
      description: 'Throws McpToolError',
      schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => { throw new ValidationError('bad input'); },
    });

    registry.register({
      name: 'tool_chain_not_found',
      group: 'test',
      description: 'Throws ChainNotFoundError',
      schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => { throw new ChainNotFoundError('nonexistent-99'); },
    });

    registry.register({
      name: 'tool_generic_error',
      group: 'test',
      description: 'Throws generic Error',
      schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => { throw new Error('something unexpected'); },
    });

    registry.register({
      name: 'tool_string_throw',
      group: 'test',
      description: 'Throws string',
      schema: {},
      annotations: { readOnlyHint: true },
      handler: async () => { throw 'raw string error'; },
    });

    server = new McpServer({ name: 'helper-test', version: '0.1.0' });
    const ctx = { chainManager: {}, config: {} } as any;
    bindToMcpServer(server, registry, ctx);

    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'helper-test-client', version: '1.0.0' });
    await Promise.all([client.connect(ct), server.connect(st)]);
  });

  it('returns successful result for normal handlers', async () => {
    const result = await client.callTool({ name: 'tool_success', arguments: { input: 'hello' } });
    expect(result.isError).toBeFalsy();
    expect((result.content as any)[0].text).toBe('ok: hello');
  });

  it('converts McpToolError to isError response with error code', async () => {
    const result = await client.callTool({ name: 'tool_mcp_error', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('VALIDATION_ERROR');
    expect(text).toContain('bad input');
  });

  it('converts ChainNotFoundError to isError response', async () => {
    const result = await client.callTool({ name: 'tool_chain_not_found', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('CHAIN_NOT_FOUND');
  });

  it('converts generic Error to INTERNAL_ERROR response', async () => {
    const result = await client.callTool({ name: 'tool_generic_error', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('something unexpected');
  });

  it('converts non-Error throws to INTERNAL_ERROR response', async () => {
    const result = await client.callTool({ name: 'tool_string_throw', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as any)[0].text;
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('raw string error');
  });
});

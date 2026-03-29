import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry, ToolContext } from '../tools/registry.js';
import { McpToolError } from '../errors.js';
import { logger } from '../logger.js';

export function bindToMcpServer(server: McpServer, registry: ToolRegistry, ctx: ToolContext): void {
  for (const tool of registry.list()) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    }, (async (params: Record<string, unknown>): Promise<any> => {
      const start = Date.now();
      const requestId = crypto.randomUUID();
      const chain = params?.chain;
      try {
        const result = await tool.handler(params as any, ctx);
        logger.info('Tool completed', { requestId, tool: tool.name, chain, latency: Date.now() - start });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        logger.error('Tool failed', {
          requestId, tool: tool.name, chain, error: message, latency: Date.now() - start,
        });
        if (stack) logger.debug('Stack trace', { requestId, stack });
        if (err instanceof McpToolError) return err.toToolResult();
        return { isError: true, content: [{ type: 'text', text: '[INTERNAL_ERROR] An unexpected error occurred. Check server logs for details.' }] };
      }
    }) as any);
  }
}

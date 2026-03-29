#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import './tools/index.js';
import { registry } from './tools/registry.js';
import { bindToMcpServer } from './mcp/adapter.js';
import { loadConfig } from './config/index.js';
import { ChainManager } from './initia/chain-manager.js';
import { setLogLevel, logger } from './logger.js';

async function main() {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  const server = new McpServer({ name: '@initia/mcp', version: '0.1.0' });
  const chainManager = await ChainManager.create(config);
  const ctx = { chainManager, config };

  if (config.autoConfirm) {
    logger.warn('AUTO_CONFIRM is enabled — transactions will broadcast without human confirmation. Destructive operations (migrate, clear_admin, update_admin) still require explicit confirm.');
  }

  bindToMcpServer(server, registry, ctx);

  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down...');
    await chainManager.close();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // When the client disconnects, stdin emits 'end'. Without this handler
  // the server process hangs indefinitely, blocking client reconnection.
  process.stdin.on('end', shutdown);

  // Suppress EPIPE errors on stdout that occur when the client disconnects
  // mid-write. Without this, the process crashes with an unhandled error.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      shutdown();
      return;
    }
    logger.error('stdout error', { error: err.message });
  });

  await server.connect(transport);
  logger.info('@initia/mcp server started on stdio');
}

main().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});

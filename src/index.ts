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

  const shutdown = async () => {
    logger.info('Shutting down...');
    await chainManager.close();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(transport);
  logger.info('@initia/mcp server started on stdio');
}

main().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});

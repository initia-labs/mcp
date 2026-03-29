#!/usr/bin/env node
import './tools/index.js';
import { loadConfig } from './config/index.js';
import { ChainManager } from './initia/chain-manager.js';
import { registry } from './tools/registry.js';
import { buildCittyCommands } from './cli/adapter.js';
import { runMain } from 'citty';
import { setLogLevel, logger } from './logger.js';

const config = loadConfig();
setLogLevel(config.logLevel);
if (config.autoConfirm) {
  logger.warn('AUTO_CONFIRM is enabled — transactions will broadcast without human confirmation. Destructive operations (migrate, clear_admin, update_admin) still require explicit confirm.');
}
const chainManager = await ChainManager.create(config);
const ctx = { chainManager, config };
const version = '0.1.0';
const main = buildCittyCommands(registry, ctx, version);

const shutdown = async () => { await chainManager.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

runMain(main);

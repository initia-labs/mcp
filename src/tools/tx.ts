import { z } from 'zod';
import { AccAddress, isValidEvmAddress } from '@initia/initia.js/util';
import { registry } from './registry.js';
import { chainParam, addressParam, txHashParam, paginationParams, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { resolveAddress } from './resolver.js';
import { ValidationError } from '../errors.js';
import { logger } from '../logger.js';

registry.register({
  name: 'tx_get',
  group: 'tx',
  description: 'Get transaction info by hash. Default: human-readable decoded output with VM-aware decoding (Move/EVM/Wasm function names, decoded args). Use raw=true only when you need raw proto data.',
  schema: {
    chain: chainParam,
    txHash: txHashParam,
    raw: z.boolean().optional().default(false).describe('Return raw proto data instead of decoded output'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, txHash, raw, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    if (raw) {
      const tx = await ctx.rpc.tx(txHash);
      return success(tx);
    }
    const tx = await ctx.getTx(txHash, { decodeArgs: 'best-effort' });
    return success(tx);
  },
});

registry.register({
  name: 'tx_search',
  group: 'tx',
  description: 'Search transactions using CometBFT query syntax (e.g., "transfer.sender=\'init1...\'", "tx.height=12345").',
  schema: {
    chain: chainParam,
    query: z.string().describe('CometBFT TMQL query string'),
    page: z.number().optional().default(1).describe('Page number (1-based)'),
    perPage: z.number().optional().default(10).describe('Results per page'),
    orderBy: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort order by block height'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, query, page, perPage, orderBy, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const results = await ctx.rpc.txSearch(query, { page, perPage, orderBy });
    return success(results);
  },
});

registry.register({
  name: 'tx_by_address',
  group: 'tx',
  description: 'Get recent transactions signed by an address. Returns paginated results in reverse chronological order (default 10). Use limit/offset to navigate.',
  schema: {
    chain: chainParam,
    address: addressParam,
    ...paginationParams,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, address, limit, offset, reverse, network }, { chainManager }) => {
    const addr = resolveAddress(address, chainManager);
    if (!AccAddress.validate(addr) && !isValidEvmAddress(addr)) {
      throw new ValidationError(`Invalid address format: ${addr}`);
    }
    const ctx = await chainManager.getContext(chain, network);
    const chainId: string = ctx.chainId;

    const scanApi = chainManager.getScanApi();
    if (scanApi) {
      try {
        const result = await scanApi.getAccountTxs(chainId, addr, { limit, offset });
        return success({
          source: 'scan-api',
          address: addr,
          txs: result.items,
          totalCount: result.total,
          hasMore: result.total > offset + limit,
        });
      } catch (err) {
        logger.warn('scan-api fallback to RPC', { error: String(err), address: addr });
      }
    }

    // RPC fallback — try unbounded query first, then windowed iteration for
    // L2 chains that require a height range (<=100 blocks) on txSearch.
    const baseQuery = `message.sender='${addr}'`;
    const order = reverse ? 'asc' : 'desc';

    try {
      const page = Math.floor(offset / limit) + 1;
      const result = await ctx.rpc.txSearch(baseQuery, { page, perPage: limit, orderBy: order });
      const totalCount = Number(result.total_count);
      return success({
        source: 'rpc',
        address: addr,
        txs: result.txs,
        totalCount,
        hasMore: totalCount > offset + limit,
      });
    } catch {
      // Height-bounded windowed search for L2 chains
      logger.info('RPC txSearch unbounded failed, falling back to windowed search', { chainId });
    }

    const WINDOW = 100;
    const MAX_ITERATIONS = 50;
    const status = await ctx.rpc.status();
    const latestHeight = Number(status.sync_info.latest_block_height);
    const collected: unknown[] = [];
    let skipped = 0;
    let cursor = latestHeight;

    for (let i = 0; i < MAX_ITERATIONS && cursor > 0 && collected.length < limit; i++) {
      const minH = Math.max(cursor - WINDOW + 1, 1);
      const windowQuery = `${baseQuery} AND tx.height>=${minH} AND tx.height<=${cursor}`;
      try {
        const result = await ctx.rpc.txSearch(windowQuery, { page: 1, perPage: limit, orderBy: 'desc' });
        for (const tx of result.txs) {
          if (skipped < offset) { skipped++; continue; }
          collected.push(tx);
          if (collected.length >= limit) break;
        }
      } catch (err) {
        logger.warn('Windowed txSearch failed', { minH, cursor, error: String(err) });
      }
      cursor = minH - 1;
    }

    return success({
      source: 'rpc-windowed',
      address: addr,
      txs: collected,
      scannedDownTo: cursor + 1,
      hasMore: cursor > 0 && collected.length >= limit,
    });
  },
});

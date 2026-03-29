import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, txHashParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import {
  findEvents, getEventAttributes,
  parseWasmEvents, parseMoveEvents, parseMoveEventData,
  type CosmosEvent,
} from '@initia/initia.js/events';

const eventTypeParam = z.string().optional().describe('Filter by event type (e.g., "transfer", "coin_spent")');

/** Fetch raw Cosmos events from a tx hash and normalize to CosmosEvent[]. */
async function fetchTxEvents(ctx: any, txHash: string): Promise<CosmosEvent[]> {
  const txResult = await ctx.rpc.tx(txHash);
  return (txResult.tx_result?.events ?? []).map((e: any) => ({
    type: e.type,
    attributes: (e.attributes ?? []).map((a: any) => ({ key: a.key, value: a.value })),
  }));
}

registry.register({
  name: 'event_parse_tx',
  group: 'event',
  description: 'Parse and extract Cosmos events from a transaction. Optionally filter by event type.',
  schema: {
    chain: chainParam,
    txHash: txHashParam,
    eventType: eventTypeParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, txHash, eventType, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const events = await fetchTxEvents(ctx, txHash);

    if (eventType) {
      const filtered = findEvents(events, eventType);
      return success({ txHash, eventType, events: filtered.map(e => ({ type: e.type, ...getEventAttributes(e) })) });
    }
    return success({ txHash, events });
  },
});

registry.register({
  name: 'event_parse_move',
  group: 'event',
  description: 'Extract and decode Move module events from a transaction. Optionally filter by type tag for auto-parsed JSON data.',
  schema: {
    chain: chainParam,
    txHash: txHashParam,
    typeTag: z.string().optional().describe('Move type tag to filter (e.g., "0x1::coin::WithdrawEvent"). When set, data is auto-parsed from JSON.'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, txHash, typeTag, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const events = await fetchTxEvents(ctx, txHash);

    if (typeTag) {
      const parsed = parseMoveEventData(events, typeTag);
      return success({ txHash, typeTag, events: parsed });
    }
    const moveEvents = parseMoveEvents(events);
    return success({ txHash, moveEvents });
  },
});

registry.register({
  name: 'event_parse_wasm',
  group: 'event',
  description: 'Extract and decode CosmWasm contract events from a transaction. Filters wasm.* event types.',
  schema: {
    chain: chainParam,
    txHash: txHashParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, txHash, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    const events = await fetchTxEvents(ctx, txHash);
    const wasmEvents = parseWasmEvents(events);
    return success({ txHash, wasmEvents });
  },
});

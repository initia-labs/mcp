import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function safeReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
}

export function success(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, safeReplacer(), 2) }] };
}

/** Convert initia.js Message objects to JSON-safe format for response serialization. */
function serializeMsgs(msgs: unknown[]): unknown[] {
  return msgs.map((m: any) => {
    if (m && typeof m.toAmino === 'function') {
      return { typeUrl: m.typeUrl, ...m.toAmino() };
    }
    if (m && typeof m.typeUrl === 'string') {
      return { typeUrl: m.typeUrl };
    }
    return m;
  });
}

export function error(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export interface TxResultData {
  txHash: string; chainId: string; code: number; rawLog: string;
  events: unknown[]; gasUsed?: string; gasWanted?: string; height?: string;
}

export function txResult(data: TxResultData): CallToolResult {
  return success({ success: data.code === 0, ...data });
}

export function simulateResult(data: { msgs: unknown[]; estimatedGas: string; chainId: string; memo?: string; notice?: string }): CallToolResult {
  return success({ status: 'simulated', message: 'Call again with confirm: true to broadcast.', ...data, msgs: serializeMsgs(data.msgs) });
}

export function dryRunResult(data: { msgs: unknown[]; chainId: string; memo?: string }): CallToolResult {
  return success({ status: 'dry_run', message: 'Preview only (no chain communication).', ...data, msgs: serializeMsgs(data.msgs) });
}

import { getDenomType, formatTokenAmount } from '@initia/initia.js/util';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './registry.js';

export interface DenomMeta {
  symbol: string;
  decimals: number;
}

export function isContractDenom(denom: string): boolean {
  const type = getDenomType(denom);
  return type === 'evm' || type === 'cw20' || type === 'move';
}

export function stripDenomPrefix(denom: string): string {
  if (denom.startsWith('evm/')) return denom.slice(4);
  if (denom.startsWith('cw20:')) return denom.slice(5);
  if (denom.startsWith('move/')) return denom.slice(5);
  return denom;
}

export function truncateDecAmount(amount: string): string {
  const dotIdx = amount.indexOf('.');
  return dotIdx === -1 ? amount : amount.slice(0, dotIdx);
}

export async function resolveDenom(
  denom: string,
  ctx: any,
  cache: Map<string, DenomMeta | null>,
): Promise<DenomMeta | null> {
  if (cache.has(denom)) return cache.get(denom)!;

  try {
    let meta: DenomMeta;

    if (isContractDenom(denom)) {
      const bareAddr = stripDenomPrefix(denom);
      const info = await ctx.getTokenContract(bareAddr).getInfo();
      meta = { symbol: info.symbol, decimals: info.decimals };
    } else {
      const response = await ctx.client.bank.denomMetadata({ denom });
      const md = response.metadata;
      if (!md) throw new Error('No metadata');
      const displayName = md.display || md.symbol;
      const displayUnit = displayName
        ? md.denomUnits?.find((u: any) => u.denom === displayName)
        : undefined;
      const decimals = displayUnit?.exponent
        ?? Math.max(0, ...(md.denomUnits?.map((u: any) => u.exponent) ?? [0]));
      meta = { symbol: md.symbol || displayName || denom, decimals };
    }

    cache.set(denom, meta);
    return meta;
  } catch {
    cache.set(denom, null);
    return null;
  }
}

export async function enrichCoins(
  data: unknown,
  ctx: any,
  cache: Map<string, DenomMeta | null>,
): Promise<unknown> {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return Promise.all(data.map(item => enrichCoins(item, ctx, cache)));
  }
  if (typeof data !== 'object') return data;

  const obj = data as Record<string, unknown>;

  if (
    typeof obj.denom === 'string' &&
    (typeof obj.amount === 'string' || typeof obj.amount === 'number')
  ) {
    const rawAmount = String(obj.amount);
    const meta = await resolveDenom(obj.denom, ctx, cache);
    if (meta) {
      const intAmount = truncateDecAmount(rawAmount);
      return {
        ...obj,
        symbol: meta.symbol,
        decimals: meta.decimals,
        formatted: `${formatTokenAmount(intAmount, meta.decimals)} ${meta.symbol}`,
      };
    }
    return obj;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = await enrichCoins(value, ctx, cache);
  }
  return result;
}

export function withCoinFormatting(
  handler: (params: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult>,
  config: { chainParam: string },
): (params: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult> {
  return async (params, toolCtx) => {
    const result = await handler(params, toolCtx);

    const chainQuery = params[config.chainParam];
    if (result.isError || typeof chainQuery !== 'string') return result;

    try {
      const network = typeof params.network === 'string' ? params.network as 'mainnet' | 'testnet' : undefined;
      const chainCtx = await toolCtx.chainManager.getContext(chainQuery, network);
      const cache = new Map<string, DenomMeta | null>();

      for (const content of result.content) {
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            const enriched = await enrichCoins(data, chainCtx, cache);
            content.text = JSON.stringify(enriched, null, 2);
          } catch { /* not JSON, skip */ }
        }
      }
    } catch { /* context resolution failed, return original */ }

    return result;
  };
}

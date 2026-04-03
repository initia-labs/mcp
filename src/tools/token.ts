import { z } from 'zod';
import { registry } from './registry.js';
import { chainParam, addressParam, denomParam, networkParam } from '../schemas/common.js';
import { success } from '../response.js';
import { getDenomType, formatTokenAmount } from '@initia/initia.js/util';

function isContractDenom(denom: string): boolean {
  const type = getDenomType(denom);
  return type === 'evm' || type === 'cw20' || type === 'move';
}

function toAssetSummary(a: any) {
  return {
    chainId: a.chainId,
    denom: a.denom,
    symbol: a.symbol,
    name: a.name,
    decimals: a.decimals,
    contractAddress: a.contractAddress,
    logoUrl: a.logoUrl,
    originChainId: a.originChainId,
    originDenom: a.originDenom,
    typeAsset: a.typeAsset,
  };
}

registry.register({
  name: 'token_search',
  group: 'token',
  description: 'Search tokens by symbol (e.g., "USDC", "INIT") across all chains or on a specific chain. Returns matching assets with denom, decimals, and chain info.',
  schema: {
    symbol: z.string().describe('Token symbol to search for (case-insensitive, e.g., "USDC", "INIT")'),
    chain: chainParam.optional().describe('Optional chain to restrict search to'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ symbol, chain, network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    let chainId: string | undefined;
    if (chain) {
      const info = await chainManager.getChainInfo(chain, network);
      chainId = info.chainId;
    }
    const assets = await provider.findAssetBySymbol(symbol, chainId);
    return success(assets.map(toAssetSummary));
  },
});

registry.register({
  name: 'token_list',
  group: 'token',
  description: 'List all registered tokens on a specific chain. Returns known assets from the registry with denom, symbol, decimals, and metadata.',
  schema: {
    chain: chainParam,
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, network }, { chainManager }) => {
    const provider = await chainManager.getProvider(network);
    const info = await chainManager.getChainInfo(chain, network);
    const assets = await provider.getAssets(info.chainId);
    return success(assets.map(toAssetSummary));
  },
});

registry.register({
  name: 'token_info',
  group: 'token',
  description: 'Get token metadata (name, symbol, decimals) by resolving the token contract for the chain VM. Works with contract tokens (ERC20, CW20, Move FA) and native denoms.',
  schema: {
    chain: chainParam,
    denom: denomParam.describe('Token denomination, contract address, or Move asset type'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ chain, denom, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    if (isContractDenom(denom)) {
      const contract = ctx.getTokenContract(denom);
      const info = await contract.getInfo();
      return success({ chainType: ctx.chainType, denom, ...info });
    }
    // Native denom — fall back to bank metadata
    try {
      const metadata = await ctx.client.bank.denomMetadata({ denom });
      return success({ chainType: ctx.chainType, denom, ...metadata });
    } catch {
      return success({ chainType: ctx.chainType, denom, name: denom, symbol: denom, decimals: 0, note: 'No metadata available for this denom' });
    }
  },
});

registry.register({
  name: 'token_balance',
  group: 'token',
  description: 'Get token balance for any token type: native denoms, ERC20, CW20, or Move FA. Automatically resolves contract tokens via the chain VM.',
  schema: {
    chain: chainParam,
    address: addressParam,
    denom: denomParam.describe('Token denomination, contract address, or Move asset type'),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  addressFields: { address: 'bech32' },
  formatCoins: { chainParam: 'chain' },
  handler: async ({ chain, address, denom, network }, { chainManager }) => {
    const ctx = await chainManager.getContext(chain, network);
    if (isContractDenom(denom)) {
      const contract = ctx.getTokenContract(denom);
      const balance = await contract.balanceOf(address);
      return success({ chainType: ctx.chainType, address, denom, balance: balance.toString() });
    }
    // Native denom — use bank module
    const balances = await ctx.getBalance({ address, denom });
    return success({ chainType: ctx.chainType, address, denom, balance: balances });
  },
});

registry.register({
  name: 'amount_format',
  group: 'token',
  description: 'Format a raw token amount with decimals into human-readable form (e.g., "1000000" with 6 decimals -> "1.0").',
  schema: {
    amount: z.string().describe('Raw token amount (smallest unit)'),
    decimals: z.number().describe('Number of decimal places for the token'),
  },
  annotations: { readOnlyHint: true },
  handler: async ({ amount, decimals }) => {
    const formatted = formatTokenAmount(amount, decimals);
    return success({ raw: amount, decimals, formatted });
  },
});

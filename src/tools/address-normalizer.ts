import { AccAddress, toChecksumAddress } from '@initia/initia.js/util';
import type { ChainManager } from '../initia/chain-manager.js';
import { ValidationError } from '../errors.js';
import type { AddressFormat } from './registry.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './registry.js';

const SELF_ALIASES = new Set(['me', 'self', 'my', 'signer']);

/**
 * Returns true if the input is a hex address (0x-prefixed or unprefixed, 40-64 hex chars).
 */
function isHex(input: string): boolean {
  const body = input.replace(/^0[xX]/, '');
  return /^[0-9a-fA-F]{40,64}$/.test(body);
}

/**
 * Normalize an address string to the given format.
 *
 * Resolution order:
 * 1. Self aliases (me, self, my, signer) → signer address → bech32, then convert if hex target
 * 2. .init usernames → ctx.usernames.resolve() → bech32, then convert if hex target
 * 3. Format conversion from current format to target
 */
export async function normalizeAddress(
  input: string,
  target: AddressFormat,
  chainManager: ChainManager,
  network?: string,
): Promise<string> {
  // Step 1: Self aliases
  if (SELF_ALIASES.has(input.toLowerCase())) {
    chainManager.requireSigner();
    const addr = chainManager.getSignerAddress();
    if (!addr) {
      throw new ValidationError('Signer is configured but address is unavailable.');
    }
    return applyFormat(addr, target);
  }

  // Step 2: .init username resolution
  if (input.endsWith('.init')) {
    const ctx = await chainManager.getContext('initia', network as 'mainnet' | 'testnet' | undefined);
    let resolved: any;
    try {
      resolved = await ctx.usernames.resolve(input);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new ValidationError(`Failed to resolve username "${input}": ${cause}`);
    }
    if (!resolved || !resolved.address) {
      throw new ValidationError(`Username "${input}" could not be resolved to an address.`);
    }
    // Resolved address is bech32; apply conversion if target is hex
    return applyFormat(resolved.address as string, target);
  }

  // Step 3: Format conversion
  return applyFormat(input, target);
}

/**
 * Convert an already-resolved address (bech32 or hex) to the target format.
 * Throws ValidationError if the input is neither valid bech32 nor hex.
 */
function applyFormat(input: string, target: AddressFormat): string {
  if (target === 'bech32') {
    if (AccAddress.validate(input)) {
      return input;
    }
    if (isHex(input)) {
      // AccAddress.fromHex handles both 0x-prefixed and raw hex
      return AccAddress.fromHex(input);
    }
    throw new ValidationError(`Invalid address: "${input}". Expected bech32 or hex.`);
  }

  if (target === 'hex') {
    if (isHex(input)) {
      // Normalize to checksummed EIP-55 hex; ensure 0x prefix for toChecksumAddress
      const prefixed = input.startsWith('0x') || input.startsWith('0X') ? input : `0x${input}`;
      return toChecksumAddress(prefixed);
    }
    if (AccAddress.validate(input)) {
      return toChecksumAddress(AccAddress.toHex(input));
    }
    throw new ValidationError(`Invalid address: "${input}". Expected bech32 or hex.`);
  }

  throw new ValidationError(`Unknown address format: "${target}".`);
}

/**
 * Normalize address fields within a params object.
 *
 * - Flat fields: `{ address: 'bech32' }` → normalize params.address
 * - Nested array fields: `{ 'sends[].to': 'bech32' }` → normalize params.sends[n].to
 * - Skips undefined and empty string ("")
 * - Passes non-address fields through unchanged
 */
export async function normalizeParams(
  params: Record<string, unknown>,
  addressFields: Record<string, AddressFormat>,
  chainManager: ChainManager,
): Promise<Record<string, unknown>> {
  const network = typeof params.network === 'string' ? params.network : undefined;
  const result = { ...params };

  for (const [field, format] of Object.entries(addressFields)) {
    // Nested array field pattern: "items[].key"
    if (field.includes('[].')) {
      const [arrayKey, nestedKey] = field.split('[].');
      const arr = result[arrayKey];
      if (!Array.isArray(arr)) continue;

      result[arrayKey] = await Promise.all(
        arr.map(async (item: unknown) => {
          if (item === null || typeof item !== 'object') return item;
          const obj = item as Record<string, unknown>;
          const val = obj[nestedKey];
          if (typeof val !== 'string' || val === '') return obj;
          const normalized = await normalizeAddress(val, format, chainManager, network);
          return { ...obj, [nestedKey]: normalized };
        }),
      );
      continue;
    }

    // Flat field
    const val = result[field];
    if (typeof val !== 'string' || val === '') continue;
    result[field] = await normalizeAddress(val, format, chainManager, network);
  }

  return result;
}

/**
 * HOF that wraps a tool handler with address normalization.
 * Normalizes params before delegating to the original handler.
 */
export function withAddressNormalization(
  handler: (params: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult>,
  addressFields: Record<string, AddressFormat>,
): (params: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult> {
  return async (params, ctx) => {
    const normalized = await normalizeParams(params, addressFields, ctx.chainManager);
    return handler(normalized, ctx);
  };
}

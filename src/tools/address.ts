import { z } from 'zod';
import { registry } from './registry.js';
import { success } from '../response.js';
import { AccAddress, isValidEvmAddress, toChecksumAddress } from '@initia/initia.js/util';
import { chainParam, networkParam } from '../schemas/common.js';

registry.register({
  name: 'address_validate',
  group: 'address',
  description: 'Validate whether a string is a valid Initia address (bech32) or EVM address (0x hex). Optionally provide a chain to fetch the on-chain address profile (account type, contract classification, etc.).',
  schema: {
    address: z.string().describe('Address to validate'),
    chain: chainParam.optional(),
    network: networkParam,
  },
  annotations: { readOnlyHint: true },
  handler: async ({ address, chain, network }, { chainManager }) => {
    const isBech32 = AccAddress.validate(address);
    const isEvm = isValidEvmAddress(address);
    const base = { address, valid: isBech32 || isEvm, format: isBech32 ? 'bech32' : isEvm ? 'evm' : 'invalid' };

    if (chain && (isBech32 || isEvm)) {
      const ctx = await chainManager.getContext(chain, network);
      const { getAddressProfile } = await import('@initia/initia.js/client');
      const rawProfile = await getAddressProfile(ctx, address);
      // Strip the address field (already in base response) and normalize codeHash
      const { address: _addr, ...rest } = rawProfile as Record<string, unknown>;
      const profileData: Record<string, unknown> = rest;
      if (profileData.codeHash instanceof Uint8Array) {
        const hex = Buffer.from(profileData.codeHash).toString('hex');
        profileData.codeHash = hex.slice(0, 64);
      }
      return success({ ...base, profile: profileData });
    }

    return success(base);
  },
});

registry.register({
  name: 'address_convert',
  group: 'address',
  description: 'Convert an address between bech32 (init1...) and hex (0x...) formats.',
  schema: { address: z.string().describe('Address in bech32 or hex format') },
  annotations: { readOnlyHint: true },
  handler: async ({ address }) => {
    if (address.startsWith('0x') || /^[0-9a-fA-F]{40,64}$/.test(address)) {
      const bech32 = AccAddress.fromHex(address);
      return success({ input: address, bech32, hex: toChecksumAddress(address.startsWith('0x') ? address : `0x${address}`) });
    }
    if (AccAddress.validate(address)) {
      const hex = AccAddress.toHex(address);
      return success({ input: address, bech32: address, hex: toChecksumAddress(hex) });
    }
    return success({ input: address, error: 'Invalid address format' });
  },
});

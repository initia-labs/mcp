import { z } from 'zod';
import { registry } from './registry.js';
import { networkParam } from '../schemas/common.js';
import { success } from '../response.js';

registry.register({
  name: 'username_resolve',
  group: 'username',
  description: 'Resolve .init names to addresses or addresses to .init names. For hex<->bech32 conversion, use address_convert instead.',
  schema: { input: z.string().describe('Address or .init name to resolve'), network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ input, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const resolved = await ctx.usernames.resolve(input);
    return success({ input, resolved });
  },
});

registry.register({
  name: 'username_record',
  group: 'username',
  description: 'Get the full record for a .init username, including address and expiration.',
  schema: { name: z.string().describe('.init username (e.g., "alice" or "alice.init")'), network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ name, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const record = await ctx.usernames.getRecord(name);
    return success(record ?? { error: 'not_found', name });
  },
});

registry.register({
  name: 'username_metadata',
  group: 'username',
  description: 'Get NFT metadata for a .init username (avatar, description, attributes).',
  schema: { name: z.string().describe('.init username (e.g., "alice" or "alice.init")'), network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ name, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const metadata = await ctx.usernames.getMetadata(name);
    return success(metadata ?? { error: 'not_found', name });
  },
});

registry.register({
  name: 'username_check',
  group: 'username',
  description: 'Check if a .init username is available for registration.',
  schema: { name: z.string().describe('.init username to check (e.g., "alice")'), network: networkParam },
  annotations: { readOnlyHint: true },
  handler: async ({ name, network }, { chainManager }) => {
    const ctx = await chainManager.getContext('initia', network);
    const available = await ctx.usernames.isAvailable(name);
    return success({ name, available });
  },
});

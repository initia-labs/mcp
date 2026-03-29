import { z } from 'zod';

export const chainParam = z.string().describe('Chain type alias (e.g., "initia", "minievm", "minimove", "miniwasm") or exact chain ID. Prefer aliases — they auto-resolve to the correct chain ID for the selected network.');
export const networkParam = z.enum(['mainnet', 'testnet']).optional().describe('Network to use. Defaults to mainnet.');
export const addressParam = z.string().describe('Address in bech32, hex, or .init format. Use "me" for the signer\'s own address.');
export const denomParam = z.string().describe('Token denomination (e.g., "uinit")');
export const txHashParam = z.string().describe('Transaction hash');
export const paginationParams = {
  limit: z.number().optional().default(10).describe('Max results per page (default 10). Use with offset to paginate.'),
  offset: z.number().optional().default(0).describe('Results to skip for pagination'),
  reverse: z.boolean().optional().default(false).describe('Reverse result order (e.g., newest first for proposals)'),
};
export const confirmParam = z.boolean().optional().default(false).describe('Set true to broadcast. Otherwise returns simulation only.');
export const dryRunParam = z.boolean().optional().default(false).describe('Preview tx without chain communication.');
export const memoParam = z.string().optional().describe('Optional transaction memo');

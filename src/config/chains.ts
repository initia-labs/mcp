/**
 * Network-agnostic alias map: friendly name → chainType.
 * Resolution to actual chainId happens in ChainManager using the registry.
 */
export const CHAIN_TYPE_ALIASES: Record<string, string> = {
  initia: 'initia',
  l1: 'initia',
  // L2 aliases can be added (e.g., 'evm' → 'minievm')
};

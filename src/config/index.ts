import { AppConfig, KeyConfig } from './types.js';
export { AppConfig, ChainType, KeyType, KeyConfig } from './types.js';

function parseKeyConfig(): KeyConfig {
  const raw = process.env.INITIA_KEY?.trim();
  const index = parseInt(process.env.INITIA_KEY_INDEX ?? '0', 10);
  const ledgerApp = (process.env.INITIA_LEDGER_APP ?? 'ethereum') as 'ethereum' | 'cosmos';

  if (!raw) {
    return { type: 'none', index: 0, ledgerApp };
  }

  if (raw.toLowerCase() === 'ledger') {
    return { type: 'ledger', index, ledgerApp };
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    return { type: 'raw', privateKey: raw, index: 0, ledgerApp };
  }

  const words = raw.split(/\s+/);
  if (words.length === 12 || words.length === 24) {
    return { type: 'mnemonic', mnemonic: raw, index, ledgerApp };
  }

  throw new Error(
    'Invalid INITIA_KEY format. Expected: mnemonic (12/24 words), raw key (0x + 64 hex), or "ledger".',
  );
}

const VALID_LOG_LEVELS = new Set<AppConfig['logLevel']>(['debug', 'info', 'warn', 'error']);
const VALID_NETWORKS = new Set<AppConfig['network']>(['mainnet', 'testnet']);

export function loadConfig(): AppConfig {
  const rawLogLevel = process.env.INITIA_LOG_LEVEL ?? 'info';
  if (!VALID_LOG_LEVELS.has(rawLogLevel as AppConfig['logLevel'])) {
    throw new Error(`Invalid INITIA_LOG_LEVEL: "${rawLogLevel}". Expected: ${[...VALID_LOG_LEVELS].join(', ')}`);
  }

  const rawNetwork = process.env.INITIA_NETWORK ?? 'mainnet';
  if (!VALID_NETWORKS.has(rawNetwork as AppConfig['network'])) {
    throw new Error(`Invalid INITIA_NETWORK: "${rawNetwork}". Expected: ${[...VALID_NETWORKS].join(', ')}`);
  }

  return {
    key: parseKeyConfig(),
    autoConfirm: process.env.AUTO_CONFIRM === 'true',
    logLevel: rawLogLevel as AppConfig['logLevel'],
    network: rawNetwork as AppConfig['network'],
    useScanApi: process.env.INITIA_USE_SCAN_API === 'true',
  };
}

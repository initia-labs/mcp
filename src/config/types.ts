export type ChainType = 'initia' | 'minievm' | 'minimove' | 'miniwasm' | 'other';

export type KeyType = 'mnemonic' | 'raw' | 'ledger' | 'none';

export interface KeyConfig {
  type: KeyType;
  mnemonic?: string;
  privateKey?: string;
  index: number;
  ledgerApp: 'ethereum' | 'cosmos';
}

export interface AppConfig {
  key: KeyConfig;
  autoConfirm: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  network: 'mainnet' | 'testnet';
  useScanApi: boolean;
}

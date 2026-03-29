import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { CHAIN_TYPE_ALIASES } from '../src/config/chains.js';

describe('loadConfig', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('should load default config when no env vars set', () => {
    const config = loadConfig();
    expect(config.autoConfirm).toBe(false);
    expect(config.logLevel).toBe('info');
    expect(config.key.type).toBe('none');
  });

  it('should respect AUTO_CONFIRM env var', () => {
    process.env.AUTO_CONFIRM = 'true';
    expect(loadConfig().autoConfirm).toBe(true);
  });

  it('should detect mnemonic from INITIA_KEY', () => {
    process.env.INITIA_KEY = 'abandon '.repeat(11) + 'about';
    const config = loadConfig();
    expect(config.key.type).toBe('mnemonic');
    expect(config.key.mnemonic).toBe('abandon '.repeat(11) + 'about');
  });

  it('should detect raw key from INITIA_KEY', () => {
    process.env.INITIA_KEY = '0x' + 'ab'.repeat(32);
    const config = loadConfig();
    expect(config.key.type).toBe('raw');
    expect(config.key.privateKey).toBe('0x' + 'ab'.repeat(32));
  });

  it('should detect ledger from INITIA_KEY', () => {
    process.env.INITIA_KEY = 'ledger';
    const config = loadConfig();
    expect(config.key.type).toBe('ledger');
    expect(config.key.ledgerApp).toBe('ethereum');
  });

  it('should detect ledger case-insensitively', () => {
    process.env.INITIA_KEY = 'LEDGER';
    expect(loadConfig().key.type).toBe('ledger');
  });

  it('should parse INITIA_KEY_INDEX', () => {
    process.env.INITIA_KEY = 'abandon '.repeat(11) + 'about';
    process.env.INITIA_KEY_INDEX = '3';
    expect(loadConfig().key.index).toBe(3);
  });

  it('should parse INITIA_LEDGER_APP', () => {
    process.env.INITIA_KEY = 'ledger';
    process.env.INITIA_LEDGER_APP = 'cosmos';
    expect(loadConfig().key.ledgerApp).toBe('cosmos');
  });

  it('should default index to 0', () => {
    process.env.INITIA_KEY = 'ledger';
    expect(loadConfig().key.index).toBe(0);
  });

  it('should ignore index for raw key', () => {
    process.env.INITIA_KEY = '0x' + 'ab'.repeat(32);
    process.env.INITIA_KEY_INDEX = '5';
    expect(loadConfig().key.index).toBe(0);
  });

  it('should throw for invalid INITIA_KEY format', () => {
    process.env.INITIA_KEY = 'not-valid-format';
    expect(() => loadConfig()).toThrow('Invalid INITIA_KEY format');
  });

  it('should return none when INITIA_KEY is not set', () => {
    delete process.env.INITIA_KEY;
    expect(loadConfig().key.type).toBe('none');
  });
});

describe('CHAIN_TYPE_ALIASES', () => {
  it('should map initia to chain type', () => {
    expect(CHAIN_TYPE_ALIASES['initia']).toBe('initia');
  });
  it('should map l1 to initia type', () => {
    expect(CHAIN_TYPE_ALIASES['l1']).toBe('initia');
  });
  it('should return undefined for unknown aliases', () => {
    expect(CHAIN_TYPE_ALIASES['unknown']).toBeUndefined();
  });
});

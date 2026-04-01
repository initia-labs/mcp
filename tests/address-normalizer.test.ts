import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@initia/initia.js', () => ({
  MnemonicKey: vi.fn(),
  RawKey: { fromHex: vi.fn() },
  Key: vi.fn(),
  createTransport: vi.fn(),
  createInitiaContext: vi.fn(),
  createMinievmContext: vi.fn(),
  createMinimoveContext: vi.fn(),
  createMiniwasmContext: vi.fn(),
  getGasPrices: vi.fn(),
  coin: vi.fn(),
}));

vi.mock('@initia/initia.js/provider', () => ({
  createRegistryProvider: vi.fn(),
}));

import { AccAddress, toChecksumAddress } from '@initia/initia.js/util';
import { normalizeAddress, normalizeParams } from '../src/tools/address-normalizer.js';
import { ValidationError } from '../src/errors.js';
import { SignerRequiredError } from '../src/errors.js';

const TEST_HEX = '0x0000000000000000000000000000000000000001';
const TEST_BECH32 = AccAddress.fromHex(TEST_HEX);
const TEST_CHECKSUM_HEX = toChecksumAddress(TEST_HEX);

function makeMockChainManager(opts: {
  hasSigner?: boolean;
  signerAddress?: string;
  usernameResult?: { address: string } | null;
} = {}) {
  const {
    hasSigner = false,
    signerAddress = TEST_BECH32,
    usernameResult = undefined,
  } = opts;

  const mockResolve = vi.fn().mockResolvedValue(usernameResult ?? null);

  return {
    requireSigner: vi.fn(() => {
      if (!hasSigner) throw new SignerRequiredError();
    }),
    getSignerAddress: vi.fn(() => (hasSigner ? signerAddress : undefined)),
    getContext: vi.fn().mockResolvedValue({
      usernames: { resolve: mockResolve },
    }),
    _mockResolve: mockResolve,
  };
}

describe('normalizeAddress', () => {
  describe('bech32 target', () => {
    it('bech32 + target bech32 → pass-through', async () => {
      const cm = makeMockChainManager();
      const result = await normalizeAddress(TEST_BECH32, 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
    });

    it('0x hex + target bech32 → bech32', async () => {
      const cm = makeMockChainManager();
      const result = await normalizeAddress(TEST_HEX, 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
    });

    it('raw hex (no 0x) + target bech32 → bech32', async () => {
      const cm = makeMockChainManager();
      const rawHex = TEST_HEX.slice(2); // without 0x prefix
      const result = await normalizeAddress(rawHex, 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
    });

    it('invalid string → ValidationError', async () => {
      const cm = makeMockChainManager();
      await expect(normalizeAddress('not-a-valid-address', 'bech32', cm as any))
        .rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('hex target', () => {
    it('bech32 + target hex → EIP-55 checksum hex', async () => {
      const cm = makeMockChainManager();
      const result = await normalizeAddress(TEST_BECH32, 'hex', cm as any);
      expect(result).toBe(TEST_CHECKSUM_HEX);
    });

    it('hex + target hex → checksum hex', async () => {
      // Use non-checksummed hex
      const lowerHex = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
      const cm2 = makeMockChainManager();
      const result = await normalizeAddress(lowerHex, 'hex', cm2 as any);
      // Should be checksummed
      expect(result).toBe(toChecksumAddress(lowerHex));
    });
  });

  describe('self aliases', () => {
    it('`me` with signer → signer address (bech32 target)', async () => {
      const cm = makeMockChainManager({ hasSigner: true, signerAddress: TEST_BECH32 });
      const result = await normalizeAddress('me', 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
      expect(cm.requireSigner).toHaveBeenCalled();
    });

    it('`self` with signer → works', async () => {
      const cm = makeMockChainManager({ hasSigner: true, signerAddress: TEST_BECH32 });
      const result = await normalizeAddress('self', 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
    });

    it('`my` with signer → works', async () => {
      const cm = makeMockChainManager({ hasSigner: true, signerAddress: TEST_BECH32 });
      const result = await normalizeAddress('my', 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
    });

    it('`signer` with signer → works', async () => {
      const cm = makeMockChainManager({ hasSigner: true, signerAddress: TEST_BECH32 });
      const result = await normalizeAddress('signer', 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
    });

    it('`self` with signer → works with hex target too', async () => {
      const cm = makeMockChainManager({ hasSigner: true, signerAddress: TEST_BECH32 });
      const result = await normalizeAddress('self', 'hex', cm as any);
      expect(result).toBe(TEST_CHECKSUM_HEX);
    });

    it('`me` without signer → SignerRequiredError', async () => {
      const cm = makeMockChainManager({ hasSigner: false });
      await expect(normalizeAddress('me', 'bech32', cm as any))
        .rejects.toBeInstanceOf(SignerRequiredError);
    });
  });

  describe('.init username resolution', () => {
    it('`alice.init` → resolved bech32', async () => {
      const cm = makeMockChainManager({ usernameResult: { address: TEST_BECH32 } });
      const result = await normalizeAddress('alice.init', 'bech32', cm as any);
      expect(result).toBe(TEST_BECH32);
      expect(cm.getContext).toHaveBeenCalledWith('initia', undefined);
      expect(cm._mockResolve).toHaveBeenCalledWith('alice.init');
    });

    it('`alice.init` + hex target → resolved then converted to hex', async () => {
      const cm = makeMockChainManager({ usernameResult: { address: TEST_BECH32 } });
      const result = await normalizeAddress('alice.init', 'hex', cm as any);
      expect(result).toBe(TEST_CHECKSUM_HEX);
    });

    it('`alice.init` with network → passes network to getContext', async () => {
      const cm = makeMockChainManager({ usernameResult: { address: TEST_BECH32 } });
      await normalizeAddress('alice.init', 'bech32', cm as any, 'testnet');
      expect(cm.getContext).toHaveBeenCalledWith('initia', 'testnet');
    });

    it('non-existent `.init` → ValidationError when null result', async () => {
      const cm = makeMockChainManager({ usernameResult: null });
      await expect(normalizeAddress('nobody.init', 'bech32', cm as any))
        .rejects.toBeInstanceOf(ValidationError);
    });

    it('non-existent `.init` → ValidationError when result has no address', async () => {
      const cm = makeMockChainManager({ usernameResult: {} as any });
      await expect(normalizeAddress('nobody.init', 'bech32', cm as any))
        .rejects.toBeInstanceOf(ValidationError);
    });
  });
});

describe('normalizeParams', () => {
  let cm: ReturnType<typeof makeMockChainManager>;

  beforeEach(() => {
    cm = makeMockChainManager();
  });

  it('flat field normalization: hex → bech32', async () => {
    const result = await normalizeParams(
      { address: TEST_HEX },
      { address: 'bech32' },
      cm as any,
    );
    expect(result.address).toBe(TEST_BECH32);
  });

  it('flat field normalization: bech32 → hex', async () => {
    const result = await normalizeParams(
      { address: TEST_BECH32 },
      { address: 'hex' },
      cm as any,
    );
    expect(result.address).toBe(TEST_CHECKSUM_HEX);
  });

  it('nested []. array field normalization', async () => {
    const result = await normalizeParams(
      {
        sends: [
          { to: TEST_HEX, amount: '100' },
          { to: TEST_HEX, amount: '200' },
        ],
      },
      { 'sends[].to': 'bech32' },
      cm as any,
    );
    const sends = result.sends as Array<{ to: string; amount: string }>;
    expect(sends[0].to).toBe(TEST_BECH32);
    expect(sends[1].to).toBe(TEST_BECH32);
    // non-address fields should pass through
    expect(sends[0].amount).toBe('100');
  });

  it('skip undefined optional fields', async () => {
    const result = await normalizeParams(
      { address: undefined },
      { address: 'bech32' },
      cm as any,
    );
    expect(result.address).toBeUndefined();
  });

  it('skip empty string fields', async () => {
    const result = await normalizeParams(
      { address: '' },
      { address: 'bech32' },
      cm as any,
    );
    expect(result.address).toBe('');
  });

  it('non-address fields pass through unchanged', async () => {
    const result = await normalizeParams(
      { address: TEST_HEX, network: 'testnet', amount: '100' },
      { address: 'bech32' },
      cm as any,
    );
    expect(result.network).toBe('testnet');
    expect(result.amount).toBe('100');
  });

  it('network param from params is passed to normalizeAddress for .init resolution', async () => {
    const mockResolve = vi.fn().mockResolvedValue({ address: TEST_BECH32 });
    const cmWithNetwork = {
      requireSigner: vi.fn(),
      getSignerAddress: vi.fn(),
      getContext: vi.fn().mockResolvedValue({ usernames: { resolve: mockResolve } }),
    };

    await normalizeParams(
      { address: 'alice.init', network: 'testnet' },
      { address: 'bech32' },
      cmWithNetwork as any,
    );

    expect(cmWithNetwork.getContext).toHaveBeenCalledWith('initia', 'testnet');
  });
});

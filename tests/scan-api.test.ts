import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScanApiClient } from '../src/initia/scan-api.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ScanApiClient', () => {
  let client: ScanApiClient;

  beforeEach(() => {
    client = new ScanApiClient();
    mockFetch.mockReset();
  });

  it('builds correct URL for getAccountTxs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });

    await client.getAccountTxs('interwoven-1', 'init1abc', { limit: 10, offset: 0 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://scan-api.initia.xyz/v1/initia/interwoven-1/accounts/init1abc/txs?limit=10&offset=0&count_total=true&reverse=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns parsed response on success', async () => {
    const mockData = { items: [{ hash: '0xabc' }], total: 1 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await client.getAccountTxs('interwoven-1', 'init1abc', { limit: 10, offset: 0 });
    expect(result).toEqual(mockData);
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(
      client.getAccountTxs('interwoven-1', 'init1abc', { limit: 10, offset: 0 }),
    ).rejects.toThrow('scan-api error 500');
  });

  it('throws on fetch failure (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      client.getAccountTxs('interwoven-1', 'init1abc', { limit: 10, offset: 0 }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('uses custom base URL when provided', async () => {
    const customClient = new ScanApiClient('https://custom-api.example.com');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });

    await customClient.getAccountTxs('interwoven-1', 'init1abc', { limit: 5, offset: 0 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://custom-api.example.com/v1/initia/interwoven-1/'),
      expect.any(Object),
    );
  });
});

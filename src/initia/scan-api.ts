import { logger } from '../logger.js';

const BASE_URL = 'https://scan-api.initia.xyz';
const TIMEOUT_MS = 10_000;

export interface ScanApiTxsResponse {
  items: unknown[];
  total: number;
}

export class ScanApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? BASE_URL;
  }

  async getAccountTxs(
    chainId: string,
    address: string,
    opts: { limit: number; offset: number },
  ): Promise<ScanApiTxsResponse> {
    const params = new URLSearchParams({
      limit: String(opts.limit),
      offset: String(opts.offset),
      count_total: 'true',
      reverse: 'true',
    });
    const url = `${this.baseUrl}/v1/initia/${chainId}/accounts/${address}/txs?${params}`;
    return this.fetch(url);
  }

  private async fetch<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await globalThis.fetch(url, { signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error(`scan-api error ${res.status}: ${body}`);
        throw new Error(`scan-api error ${res.status}: ${body}`);
      }
      return await res.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

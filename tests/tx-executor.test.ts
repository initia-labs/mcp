import { describe, it, expect, vi } from 'vitest';
import { executeMutation, MutationParams } from '../src/tools/tx-executor.js';
import { AppConfig } from '../src/config/index.js';

const baseConfig: AppConfig = {
  key: { type: 'none', index: 0, ledgerApp: 'ethereum' },
  autoConfirm: false, logLevel: 'info',
  network: 'testnet', useScanApi: false,
};

describe('executeMutation', () => {
  it('should return dry_run when dryRun=true', async () => {
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: true, confirm: false };
    const result = await executeMutation(params, baseConfig, {} as any);
    expect(JSON.parse(result.content[0].text as string).status).toBe('dry_run');
  });

  it('should return simulated when confirm=false', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: false };
    const result = await executeMutation(params, baseConfig, mockCtx);
    expect(JSON.parse(result.content[0].text as string).status).toBe('simulated');
  });

  it('should broadcast when confirm=true', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
      signAndBroadcast: vi.fn().mockResolvedValue({ txHash: 'ABC', code: 0, events: [] }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: true };
    const result = await executeMutation(params, baseConfig, mockCtx);
    expect(JSON.parse(result.content[0].text as string).txHash).toBe('ABC');
  });

  it('should broadcast when autoConfirm=true', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
      signAndBroadcast: vi.fn().mockResolvedValue({ txHash: 'DEF', code: 0, events: [] }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: false };
    const result = await executeMutation(params, { ...baseConfig, autoConfirm: true }, mockCtx);
    expect(JSON.parse(result.content[0].text as string).txHash).toBe('DEF');
  });

  it('should throw BroadcastError when tx code != 0', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
      signAndBroadcast: vi.fn().mockResolvedValue({ txHash: 'FAIL1', code: 11, rawLog: 'out of gas', events: [] }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: true };
    await expect(executeMutation(params, baseConfig, mockCtx)).rejects.toThrow('out of gas');
  });

  it('should pass memo to estimateGas and signAndBroadcast', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 50000n }),
      signAndBroadcast: vi.fn().mockResolvedValue({ txHash: 'MEMO1', code: 0, events: [] }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: true, memo: 'hello' };
    await executeMutation(params, baseConfig, mockCtx);
    expect(mockCtx.estimateGas).toHaveBeenCalledWith([{}], { memo: 'hello' });
    expect(mockCtx.signAndBroadcast).toHaveBeenCalledWith([{}], { memo: 'hello', waitForConfirmation: true });
  });

  it('should include gasUsed, gasWanted, height in broadcast result', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
      signAndBroadcast: vi.fn().mockResolvedValue({
        txHash: 'FULL1', code: 0, rawLog: 'ok', events: [{ type: 'transfer' }],
        gasUsed: 85000n, gasWanted: 100000n, height: 12345n,
      }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: true };
    const result = await executeMutation(params, baseConfig, mockCtx);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.gasUsed).toBe('85000');
    expect(data.gasWanted).toBe('100000');
    expect(data.height).toBe('12345');
  });

  it('should propagate estimateGas errors', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockRejectedValue(new Error('simulation failed: insufficient funds')),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: false };
    await expect(executeMutation(params, baseConfig, mockCtx)).rejects.toThrow('insufficient funds');
  });

  it('should include memo in dry_run result', async () => {
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: true, confirm: false, memo: 'dry memo' };
    const result = await executeMutation(params, baseConfig, {} as any);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.memo).toBe('dry memo');
  });

  it('should include memo in simulated result', async () => {
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: false, memo: 'sim memo' };
    const result = await executeMutation(params, baseConfig, mockCtx);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.memo).toBe('sim memo');
  });

  it('should include ledger notice in simulate response', async () => {
    const ledgerConfig: AppConfig = {
      ...baseConfig,
      key: { type: 'ledger', index: 0, ledgerApp: 'ethereum' },
    };
    const mockCtx = {
      estimateGas: vi.fn().mockResolvedValue({ gasLimit: 100000n }),
    };
    const params: MutationParams = { msgs: [{}], chainId: 'test', dryRun: false, confirm: false };
    const result = await executeMutation(params, ledgerConfig, mockCtx);
    const data = JSON.parse(result.content[0].text as string);
    expect(data.notice).toContain('Ledger');
  });
});

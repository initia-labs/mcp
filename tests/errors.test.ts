import { describe, it, expect } from 'vitest';
import {
  ValidationError, ChainNotFoundError, SignerRequiredError,
  WrongVmError, BroadcastError, BridgeError, UnsupportedCapabilityError,
} from '../src/errors.js';

describe('McpToolError', () => {
  it('should create ValidationError', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.toToolResult().isError).toBe(true);
  });
  it('should create ChainNotFoundError', () => {
    expect(new ChainNotFoundError('x').code).toBe('CHAIN_NOT_FOUND');
  });
  it('should create SignerRequiredError', () => {
    expect(new SignerRequiredError().code).toBe('SIGNER_REQUIRED');
  });
  it('should create WrongVmError with suggestions', () => {
    const err = new WrongVmError('move_view', 'minievm');
    expect(err.code).toBe('WRONG_VM');
    expect(err.message).toContain('evm_call');
  });
  it('should create BroadcastError', () => {
    const err = new BroadcastError('out of gas', 11, 'ABCD');
    expect(err.txHash).toBe('ABCD');
  });
  it('should create BridgeError', () => {
    const err = new BridgeError('route not found');
    expect(err.code).toBe('BRIDGE_ERROR');
    expect(err.message).toContain('route not found');
  });
  it('should create UnsupportedCapabilityError', () => {
    const err = new UnsupportedCapabilityError('wasm', 'minievm-1');
    expect(err.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(err.message).toContain('wasm');
  });
});

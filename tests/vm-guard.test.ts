import { describe, it, expect } from 'vitest';
import { assertVmCompatible } from '../src/tools/vm-guard.js';
import { WrongVmError } from '../src/errors.js';

describe('assertVmCompatible', () => {
  it('allows move tools on initia chains', () => {
    expect(() => assertVmCompatible('move_view', 'initia')).not.toThrow();
    expect(() => assertVmCompatible('move_execute', 'initia')).not.toThrow();
    expect(() => assertVmCompatible('move_resource_get', 'initia')).not.toThrow();
  });

  it('allows move tools on minimove chains', () => {
    expect(() => assertVmCompatible('move_view', 'minimove')).not.toThrow();
    expect(() => assertVmCompatible('move_execute', 'minimove')).not.toThrow();
    expect(() => assertVmCompatible('move_resource_get', 'minimove')).not.toThrow();
  });

  it('allows evm tools on minievm chains', () => {
    expect(() => assertVmCompatible('evm_call', 'minievm')).not.toThrow();
    expect(() => assertVmCompatible('evm_send', 'minievm')).not.toThrow();
  });

  it('allows wasm tools on miniwasm chains', () => {
    expect(() => assertVmCompatible('wasm_query', 'miniwasm')).not.toThrow();
    expect(() => assertVmCompatible('wasm_execute', 'miniwasm')).not.toThrow();
  });

  it('throws WrongVmError for move tools on minievm', () => {
    expect(() => assertVmCompatible('move_view', 'minievm')).toThrow(WrongVmError);
  });

  it('throws WrongVmError for evm tools on minimove', () => {
    expect(() => assertVmCompatible('evm_call', 'minimove')).toThrow(WrongVmError);
  });

  it('throws WrongVmError for wasm tools on initia', () => {
    expect(() => assertVmCompatible('wasm_query', 'initia')).toThrow(WrongVmError);
  });

  it('includes suggested tools in error message', () => {
    try {
      assertVmCompatible('move_view', 'minievm');
    } catch (e) {
      expect((e as WrongVmError).message).toContain('evm_call');
      expect((e as WrongVmError).message).toContain('evm_send');
    }
  });

  it('passes through for non-VM-specific tools', () => {
    expect(() => assertVmCompatible('bank_send', 'initia')).not.toThrow();
    expect(() => assertVmCompatible('chain_list', 'minievm')).not.toThrow();
  });
});

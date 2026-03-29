import { WrongVmError } from '../errors.js';

const VM_TOOLS: Record<string, string[]> = {
  // Move (Initia L1 + Minimove)
  move_view: ['initia', 'minimove'],
  move_execute: ['initia', 'minimove'],
  move_resource_get: ['initia', 'minimove'],
  move_module_abi: ['initia', 'minimove'],
  move_table_entry: ['initia', 'minimove'],
  move_publish: ['initia', 'minimove'],
  move_script: ['initia', 'minimove'],
  // EVM (Minievm)
  evm_call: ['minievm'],
  evm_send: ['minievm'],
  evm_deploy: ['minievm'],
  evm_get_logs: ['minievm'],
  evm_get_tx_receipt: ['minievm'],
  evm_get_block: ['minievm'],
  // Wasm (Miniwasm)
  wasm_query: ['miniwasm'],
  wasm_execute: ['miniwasm'],
  wasm_store_code: ['miniwasm'],
  wasm_instantiate: ['miniwasm'],
  wasm_migrate: ['miniwasm'],
  wasm_update_admin: ['miniwasm'],
  wasm_clear_admin: ['miniwasm'],
  wasm_contract_info: ['miniwasm'],
  wasm_code_info: ['miniwasm'],
  wasm_contracts_by_code: ['miniwasm'],
  wasm_contract_history: ['miniwasm'],
  wasm_raw_state: ['miniwasm'],
};

/**
 * Validates that a contract tool is compatible with the chain's VM type.
 * Throws WrongVmError with suggested tools if incompatible.
 */
export function assertVmCompatible(toolName: string, chainType: string): void {
  const allowed = VM_TOOLS[toolName];
  if (!allowed) return; // not a VM-specific tool
  if (!allowed.includes(chainType)) {
    throw new WrongVmError(toolName, chainType);
  }
}

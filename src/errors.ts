export type ErrorCode =
  | 'VALIDATION_ERROR' | 'CHAIN_NOT_FOUND' | 'SIGNER_REQUIRED'
  | 'WRONG_VM' | 'BROADCAST_ERROR' | 'BRIDGE_ERROR'
  | 'UNSUPPORTED_CAPABILITY' | 'INTERNAL_ERROR'
  | 'LEDGER_CONNECTION' | 'LEDGER_SIGN';

export class McpToolError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'McpToolError';
  }
  toToolResult() {
    return { isError: true as const, content: [{ type: 'text' as const, text: `[${this.code}] ${this.message}` }] };
  }
}

export class ValidationError extends McpToolError {
  constructor(msg: string) { super('VALIDATION_ERROR', msg); }
}
export class ChainNotFoundError extends McpToolError {
  constructor(chain: string) { super('CHAIN_NOT_FOUND', `Chain not found: "${chain}". Use chain_list to see available chains.`); }
}
export class SignerRequiredError extends McpToolError {
  constructor() { super('SIGNER_REQUIRED', 'Signer not configured. Set INITIA_KEY environment variable.'); }
}
export class WrongVmError extends McpToolError {
  constructor(tool: string, actualVm: string) {
    const map: Record<string, string[]> = {
      initia: ['move_view', 'move_execute', 'move_resource_get'],
      minimove: ['move_view', 'move_execute', 'move_resource_get'],
      minievm: ['evm_call', 'evm_send'],
      miniwasm: ['wasm_query', 'wasm_execute'],
    };
    const suggested = map[actualVm]?.join(', ') ?? 'N/A';
    super('WRONG_VM', `Tool "${tool}" incompatible with VM "${actualVm}". Try: ${suggested}`);
  }
}
export class BroadcastError extends McpToolError {
  constructor(msg: string, public readonly txCode?: number, public readonly txHash?: string) {
    super('BROADCAST_ERROR', msg);
  }
}
export class BridgeError extends McpToolError {
  constructor(msg: string) { super('BRIDGE_ERROR', msg); }
}
export class UnsupportedCapabilityError extends McpToolError {
  constructor(capability: string, chain: string) {
    super('UNSUPPORTED_CAPABILITY', `"${capability}" is not supported on chain "${chain}".`);
  }
}
export class LedgerConnectionError extends McpToolError {
  constructor(cause?: string) {
    super('LEDGER_CONNECTION', `Ledger device not found or not ready. ${cause ?? 'Check the device is connected and unlocked.'}`);
  }
}
export class LedgerSignError extends McpToolError {
  constructor(cause: string) {
    super('LEDGER_SIGN', `Ledger signing failed: ${cause}`);
  }
}

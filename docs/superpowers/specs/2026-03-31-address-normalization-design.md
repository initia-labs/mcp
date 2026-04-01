# Address Normalization Design

## Problem

In the Initia interwoven ecosystem, addresses appear in multiple formats:

- **bech32**: `init1abc...` (Cosmos SDK standard)
- **hex**: `0x1234...ABCD` (EVM standard)
- **.init username**: `alice.init` (Initia naming service)

The MCP tools and CLI (`initctl`) do not auto-convert between formats. When a user provides a hex address to a tool expecting bech32 (or vice versa), the call fails. This affects both MCP (LLM-driven) and CLI (human-driven) usage.

## Requirements

- **Bidirectional conversion**: hex ↔ bech32 + `.init` → bech32/hex
- **Per-tool target format**: each tool declares which format each address field needs
- **Centralized pipeline**: conversion happens automatically before handler execution
- **Both MCP and CLI**: applied at registration time, so all call paths benefit
- **`.init` failure = error**: throw `ValidationError` with descriptive message
- **Hex output**: EIP-55 checksum format via `toChecksumAddress()`

## Approach: Decorator Pattern (Approach C)

Wrap each tool's handler at `registry.register()` time. The decorator normalizes address fields before the original handler sees them.

### Why not alternatives?

- **Registry-level middleware (A)**: Bloats registry with address resolution responsibility and context awareness.
- **Separate middleware (B)**: Requires MCP and CLI to each call the middleware — risk of forgetting one call site.
- **Decorator (C)**: Single wrapping point at registration. Handler code untouched. Both MCP and CLI get it for free.

## Design

### 1. AddressFields Metadata

Added to `ToolDef`:

```ts
type AddressFormat = 'bech32' | 'hex';

// ToolDef extension
interface ToolDef {
  // ... existing fields
  addressFields?: Record<string, AddressFormat>;
}
```

Key is a parameter name or `arrayField[].nestedKey` for arrays. Value is the target format.

Examples:

```ts
// EVM tool — needs hex
addressFields: { contractAddress: 'hex' }

// Cosmos tool — needs bech32
addressFields: { address: 'bech32' }

// Nested array — bank_send
addressFields: { 'sends[].to': 'bech32' }
```

### 2. Address Normalizer Module

New file: `src/tools/address-normalizer.ts`

#### `normalizeAddress(input: string, target: AddressFormat, chainManager, network?)`

Resolution order:

1. **Self aliases** (`me`, `self`, `my`, `signer`) → signer's bech32 address
2. **`.init` username** (strings ending in `.init`, e.g., `alice.init`) → resolve via `chainManager.getContext('initia', network)` then `ctx.usernames.resolve()` → bech32 address. The `network` parameter is read from the tool's params to ensure mainnet/testnet registry consistency. Bare usernames without `.init` suffix are NOT resolved — they would be ambiguous with other string inputs. Throws `ValidationError` on failure.
3. **Format conversion**:
   - target `bech32`: hex input → `AccAddress.fromHex()`. bech32 input → pass-through.
   - target `hex`: bech32 input → `toChecksumAddress(AccAddress.toHex())`. hex input → `toChecksumAddress()`.
   - Invalid format → `ValidationError`

#### `normalizeParams(params, addressFields: Record<string, AddressFormat>, chainManager)`

Extracts `params.network` and passes it to each `normalizeAddress()` call. The `network` parameter is only used when `.init` resolution is needed; pure hex/bech32 conversion is a local operation and does not require it.

Iterates `addressFields`:

- **Flat fields** (`"address"`, `"contractAddress"`): normalize if value is a string.
- **Nested array fields** (`"sends[].to"`): split on `[].`, iterate array elements, normalize nested key. Uses `Promise.all` for parallel resolution.
- Fields not in `addressFields` pass through untouched.
- `undefined`/missing optional fields and empty strings (`""`) are skipped.

#### `withAddressNormalization(handler, addressFields)`

Returns a wrapped handler that calls `normalizeParams` before delegating to the original.

### 3. Registry Integration

In `registry.register()`:

```ts
register(tool: ToolDef) {
  if (tool.addressFields) {
    tool.handler = withAddressNormalization(tool.handler, tool.addressFields);
  }
  // ... existing registration logic
}
```

### 4. Migration Plan

#### Excluded tools — NO `addressFields`

These tools must NOT have `addressFields` because they operate on raw address input:

- `address_validate` — purpose is to detect the input format; normalizing first would defeat this.
- `address_convert` — purpose is to convert between formats; normalizing first would make it a no-op.
- `move_*` tools (`move_modules`, `move_resources`, `move_resource_get`, `move_module_abi`, `move_view`, `move_execute`) — Move addresses use shorthand like `0x1` which is standard for framework module queries. The Move API already accepts these natively. Forcing bech32 conversion would break shorthand addresses and add no value.
- `bridge_execute` `receiver` field — destination chain determines the required format (hex for minievm, bech32 for cosmos). This is a runtime decision; handler must resolve it using destination chain type.
- `ibc_transfer` `receiver` field — destination chain may use a different bech32 prefix (e.g., `cosmos1...`, `osmo1...`). `AccAddress.fromHex()` always produces `init1...` which would be wrong for external chains.

#### Tool files — add `addressFields`, remove `resolveAddress()` calls

| File | Tool(s) | addressFields | Remove |
|---|---|---|---|
| `account.ts` | account_get | `{ address: 'bech32' }` | `resolveAddress()` call |
| `delegation.ts` | delegation_get | `{ delegatorAddr: 'bech32' }` | `resolveAddress()` call |
| `distribution.ts` | distribution_rewards | `{ delegatorAddr: 'bech32' }` | `resolveAddress()` call |
| `portfolio.ts` | portfolio_get | `{ address: 'bech32' }` | `resolveAddress()` call |
| `token.ts` | token_balance | `{ address: 'bech32' }` | `resolveAddress()` call |
| `tx.ts` | tx_by_address | `{ address: 'bech32' }` | `resolveAddress()` call, inline `AccAddress.validate() && !isValidEvmAddress()` check, related imports |
| `vip.ts` | vip_positions, vip_voting_power, vip_vesting_positions, vip_vote_info, vip_claimable_rewards | `{ address: 'bech32' }` | `resolveAddress()` calls |
| `bridge.ts` | bridge_withdrawals | `{ address: 'bech32' }` | `resolveAddress()` call |
| `bridge.ts` | bridge_deposit | `{ to: 'bech32' }` | — |
| `bridge.ts` | bridge_withdraw | `{ to: 'bech32' }` | — |
| `bridge.ts` | bridge_execute | _(receiver excluded — destination chain format varies)_ | — |
| `bank.ts` | bank_send | `{ 'sends[].to': 'bech32' }` | — |
| `authz.ts` | authz_grants | `{ granter: 'bech32', grantee: 'bech32' }` | `validateAddress()` function + calls, `AccAddress`/`isValidEvmAddress` imports |
| `feegrant.ts` | feegrant_allowances | `{ grantee: 'bech32' }` | inline `AccAddress.validate() && !isValidEvmAddress()` check, related imports |
| `feegrant.ts` | feegrant_grant | `{ grantee: 'bech32' }` | inline validation check, related imports |
| `feegrant.ts` | feegrant_revoke | `{ grantee: 'bech32' }` | inline validation check, related imports |
| `ibc.ts` | ibc_transfer | _(receiver excluded — destination chain prefix varies)_ | — |
| `governance.ts` | proposal_list | `{ voter: 'bech32', depositor: 'bech32' }` | — |
| `evm.ts` | evm_call, evm_send | `{ contractAddress: 'hex' }` | — |
| `evm.ts` | evm_get_code, evm_get_storage_at | `{ address: 'hex' }` | — |
| `evm.ts` | evm_get_logs | `{ address: 'hex' }` | — (optional field) |
| `wasm.ts` | wasm_contract_info, wasm_contract_history, wasm_raw_state, wasm_query, wasm_execute, wasm_migrate, wasm_clear_admin | `{ contractAddress: 'bech32' }` | — |
| `wasm.ts` | wasm_update_admin | `{ contractAddress: 'bech32', newAdmin: 'bech32' }` | — |
| `wasm.ts` | wasm_instantiate | `{ admin: 'bech32' }` | — (optional field) |
| `move.ts` | all move_* tools | _(excluded — Move shorthand addresses)_ | — |

#### `resolver.ts` cleanup

- Remove `resolveAddress()` (replaced by address-normalizer)
- Keep `resolveValidatorAddress()` (validator addresses have a separate prefix: `initvaloper`)

#### `ToolDef` type in `registry.ts`

- Add `addressFields?: Record<string, AddressFormat>`

### 5. Test Strategy

#### Unit tests — `address-normalizer.test.ts`

`normalizeAddress()`:

- bech32 + target bech32 → pass-through
- bech32 + target hex → EIP-55 checksum
- `0x...` hex + target bech32 → bech32
- raw hex (no prefix) + target bech32 → bech32
- `me` + signer present → signer address
- `me` + no signer → `SignerRequiredError`
- invalid string → `ValidationError`

`normalizeParams()`:

- Flat field normalization
- Nested `[].` array field normalization
- Fields not in addressFields pass through
- `undefined` optional fields skipped
- Empty string `""` fields skipped

#### Integration tests — `.init` resolution

- `alice.init` → resolved bech32 (mock `ctx.usernames.resolve`)
- Non-existent `.init` → `ValidationError`

#### Regression

- Existing tool tests pass after `resolveAddress()` removal

## Files to Create

- `src/tools/address-normalizer.ts`
- `tests/address-normalizer.test.ts`

## Files to Modify

- `src/tools/registry.ts` — ToolDef type + register() wrapping
- `src/tools/resolver.ts` — remove `resolveAddress()`
- `src/tools/account.ts`
- `src/tools/delegation.ts`
- `src/tools/distribution.ts`
- `src/tools/portfolio.ts`
- `src/tools/token.ts`
- `src/tools/tx.ts`
- `src/tools/vip.ts`
- `src/tools/bridge.ts`
- `src/tools/bank.ts`
- `src/tools/authz.ts`
- `src/tools/feegrant.ts`
- `src/tools/governance.ts`
- `src/tools/evm.ts`
- `src/tools/wasm.ts`

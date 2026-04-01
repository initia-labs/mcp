# Address Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically normalize address formats (bech32/hex/.init) in MCP tool handlers via a decorator pattern applied at registration time.

**Architecture:** Each tool declares `addressFields` mapping param names to target formats (`'bech32'` or `'hex'`). `registry.register()` wraps the handler with a decorator that normalizes addresses before the original handler executes. This covers both MCP and CLI call paths.

**Tech Stack:** TypeScript, Zod, `@initia/initia.js` (AccAddress, toChecksumAddress, isValidEvmAddress), Vitest

**Spec:** `docs/superpowers/specs/2026-03-31-address-normalization-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/tools/address-normalizer.ts` | Create | `normalizeAddress()`, `normalizeParams()`, `withAddressNormalization()` |
| `tests/address-normalizer.test.ts` | Create | Unit tests for normalizer |
| `src/tools/registry.ts` | Modify | Add `AddressFormat` type, `addressFields` to `ToolDef`, wrapping in `register()` |
| `src/tools/resolver.ts` | Modify | Remove `resolveAddress()`, keep `resolveValidatorAddress()` |
| `src/tools/account.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/delegation.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/distribution.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/portfolio.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/token.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/tx.ts` | Modify | Add `addressFields`, remove `resolveAddress()` + manual validation |
| `src/tools/vip.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/bridge.ts` | Modify | Add `addressFields`, remove `resolveAddress()` |
| `src/tools/bank.ts` | Modify | Add `addressFields` (nested array) |
| `src/tools/authz.ts` | Modify | Add `addressFields`, remove `validateAddress()` |
| `src/tools/feegrant.ts` | Modify | Add `addressFields`, remove inline validation |
| `src/tools/governance.ts` | Modify | Add `addressFields` |
| `src/tools/evm.ts` | Modify | Add `addressFields` (hex target) |
| `src/tools/wasm.ts` | Modify | Add `addressFields` |

---

### Task 1: Extend ToolDef type in registry

**Files:**
- Modify: `src/tools/registry.ts`
- Test: `tests/registry.test.ts`

- [ ] **Step 1: Add AddressFormat type and addressFields to ToolDef**

In `src/tools/registry.ts`, add the type and extend `ToolDef`:

```ts
// Add after the existing imports
export type AddressFormat = 'bech32' | 'hex';
```

Add `addressFields` to `ToolDef`:

```ts
export interface ToolDef<T extends ZodShape = ZodShape> {
  name: string;
  group: string;
  description: string;
  schema: T;
  annotations: ToolAnnotations;
  addressFields?: Record<string, AddressFormat>;
  handler: (params: { [K in keyof T]: z.infer<T[K]> }, ctx: ToolContext) => Promise<CallToolResult>;
  cliOverrides?: {
    flatArgs: ZodShape;
    toParams: (flat: Record<string, unknown>) => Record<string, unknown>;
  };
}
```

- [ ] **Step 2: Write test for addressFields in registration**

Append to `tests/registry.test.ts`:

```ts
it('accepts addressFields in tool definition', () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'test_addr',
    group: 'test',
    description: 'Test with address fields',
    schema: { address: z.string() },
    annotations: { readOnlyHint: true },
    addressFields: { address: 'bech32' },
    handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
  });
  const tool = registry.get('test_addr');
  expect(tool).toBeDefined();
  expect(tool!.addressFields).toEqual({ address: 'bech32' });
});

it('registers tool without addressFields', () => {
  const registry = new ToolRegistry();
  registry.register({
    name: 'test_no_addr',
    group: 'test',
    description: 'Test without address fields',
    schema: { input: z.string() },
    annotations: { readOnlyHint: true },
    handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
  });
  const tool = registry.get('test_no_addr');
  expect(tool).toBeDefined();
  expect(tool!.addressFields).toBeUndefined();
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/registry.test.ts`
Expected: All pass (including new tests)

- [ ] **Step 4: Commit**

```bash
git add src/tools/registry.ts tests/registry.test.ts
git commit -m "feat: add AddressFormat type and addressFields to ToolDef"
```

---

### Task 2: Implement address normalizer module

**Files:**
- Create: `src/tools/address-normalizer.ts`
- Create: `tests/address-normalizer.test.ts`

- [ ] **Step 1: Write failing tests for normalizeAddress()**

Create `tests/address-normalizer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

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

// Generate a consistent test address pair
const TEST_HEX = '0x0000000000000000000000000000000000000001';
const TEST_BECH32 = AccAddress.fromHex(TEST_HEX);
const TEST_CHECKSUM_HEX = toChecksumAddress(TEST_HEX);

describe('normalizeAddress', () => {
  let normalizeAddress: typeof import('../src/tools/address-normalizer.js').normalizeAddress;

  beforeEach(async () => {
    const mod = await import('../src/tools/address-normalizer.js');
    normalizeAddress = mod.normalizeAddress;
  });

  it('passes through bech32 when target is bech32', async () => {
    const mockCM = {} as any;
    const result = await normalizeAddress(TEST_BECH32, 'bech32', mockCM);
    expect(result).toBe(TEST_BECH32);
  });

  it('converts bech32 to checksum hex when target is hex', async () => {
    const mockCM = {} as any;
    const result = await normalizeAddress(TEST_BECH32, 'hex', mockCM);
    expect(result).toBe(TEST_CHECKSUM_HEX);
  });

  it('converts 0x hex to bech32 when target is bech32', async () => {
    const mockCM = {} as any;
    const result = await normalizeAddress(TEST_HEX, 'bech32', mockCM);
    expect(result).toBe(TEST_BECH32);
  });

  it('converts raw hex (no 0x prefix) to bech32', async () => {
    const mockCM = {} as any;
    const raw = TEST_HEX.slice(2); // remove 0x
    const result = await normalizeAddress(raw, 'bech32', mockCM);
    expect(result).toBe(TEST_BECH32);
  });

  it('normalizes hex input to checksum hex when target is hex', async () => {
    const mockCM = {} as any;
    const lower = TEST_HEX.toLowerCase();
    const result = await normalizeAddress(lower, 'hex', mockCM);
    expect(result).toBe(TEST_CHECKSUM_HEX);
  });

  it('resolves "me" to signer address', async () => {
    const mockCM = {
      requireSigner: vi.fn(),
      getSignerAddress: vi.fn(() => TEST_BECH32),
    } as any;
    const result = await normalizeAddress('me', 'bech32', mockCM);
    expect(mockCM.requireSigner).toHaveBeenCalled();
    expect(result).toBe(TEST_BECH32);
  });

  it('resolves "self" to signer address', async () => {
    const mockCM = {
      requireSigner: vi.fn(),
      getSignerAddress: vi.fn(() => TEST_BECH32),
    } as any;
    const result = await normalizeAddress('self', 'hex', mockCM);
    expect(result).toBe(TEST_CHECKSUM_HEX);
  });

  it('throws SignerRequiredError when "me" used without signer', async () => {
    const { SignerRequiredError } = await import('../src/errors.js');
    const mockCM = {
      requireSigner: vi.fn(() => { throw new SignerRequiredError(); }),
    } as any;
    await expect(normalizeAddress('me', 'bech32', mockCM)).rejects.toThrow(SignerRequiredError);
  });

  it('throws ValidationError for invalid address', async () => {
    const { ValidationError } = await import('../src/errors.js');
    const mockCM = {} as any;
    await expect(normalizeAddress('not-an-address', 'bech32', mockCM)).rejects.toThrow(ValidationError);
  });
});

describe('normalizeAddress .init resolution', () => {
  let normalizeAddress: typeof import('../src/tools/address-normalizer.js').normalizeAddress;
  const RESOLVED_BECH32 = AccAddress.fromHex('0x0000000000000000000000000000000000000099');

  beforeEach(async () => {
    const mod = await import('../src/tools/address-normalizer.js');
    normalizeAddress = mod.normalizeAddress;
  });

  it('resolves alice.init to bech32 address', async () => {
    const mockCM = {
      getContext: vi.fn().mockResolvedValue({
        usernames: { resolve: vi.fn().mockResolvedValue({ address: RESOLVED_BECH32 }) },
      }),
    } as any;
    const result = await normalizeAddress('alice.init', 'bech32', mockCM, 'mainnet');
    expect(mockCM.getContext).toHaveBeenCalledWith('initia', 'mainnet');
    expect(result).toBe(RESOLVED_BECH32);
  });

  it('resolves alice.init to hex when target is hex', async () => {
    const mockCM = {
      getContext: vi.fn().mockResolvedValue({
        usernames: { resolve: vi.fn().mockResolvedValue({ address: RESOLVED_BECH32 }) },
      }),
    } as any;
    const result = await normalizeAddress('alice.init', 'hex', mockCM, 'testnet');
    expect(mockCM.getContext).toHaveBeenCalledWith('initia', 'testnet');
    expect(result).toBe(toChecksumAddress(AccAddress.toHex(RESOLVED_BECH32)));
  });

  it('throws ValidationError when .init name cannot be resolved', async () => {
    const { ValidationError } = await import('../src/errors.js');
    const mockCM = {
      getContext: vi.fn().mockResolvedValue({
        usernames: { resolve: vi.fn().mockResolvedValue(null) },
      }),
    } as any;
    await expect(normalizeAddress('nonexistent.init', 'bech32', mockCM)).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/address-normalizer.test.ts`
Expected: FAIL — module `src/tools/address-normalizer.js` does not exist

- [ ] **Step 3: Write failing tests for normalizeParams()**

Append to `tests/address-normalizer.test.ts`:

```ts
describe('normalizeParams', () => {
  let normalizeParams: typeof import('../src/tools/address-normalizer.js').normalizeParams;

  beforeEach(async () => {
    const mod = await import('../src/tools/address-normalizer.js');
    normalizeParams = mod.normalizeParams;
  });

  it('normalizes flat address fields', async () => {
    const mockCM = {} as any;
    const params = { address: TEST_HEX, chain: 'initia' };
    const result = await normalizeParams(params, { address: 'bech32' }, mockCM);
    expect(result.address).toBe(TEST_BECH32);
    expect(result.chain).toBe('initia'); // untouched
  });

  it('normalizes nested array fields', async () => {
    const mockCM = {} as any;
    const params = {
      sends: [
        { to: TEST_HEX, amount: '1000', denom: 'uinit' },
        { to: TEST_BECH32, amount: '2000', denom: 'uinit' },
      ],
    };
    const result = await normalizeParams(params, { 'sends[].to': 'bech32' }, mockCM);
    const sends = result.sends as any[];
    expect(sends[0].to).toBe(TEST_BECH32);
    expect(sends[1].to).toBe(TEST_BECH32);
    expect(sends[0].amount).toBe('1000'); // untouched
  });

  it('skips undefined optional fields', async () => {
    const mockCM = {} as any;
    const params = { address: undefined, chain: 'initia' };
    const result = await normalizeParams(params, { address: 'bech32' }, mockCM);
    expect(result.address).toBeUndefined();
  });

  it('skips empty string fields', async () => {
    const mockCM = {} as any;
    const params = { voter: '', chain: 'initia' };
    const result = await normalizeParams(params, { voter: 'bech32' }, mockCM);
    expect(result.voter).toBe('');
  });

  it('passes through fields not in addressFields', async () => {
    const mockCM = {} as any;
    const params = { chain: 'initia', limit: 10, address: TEST_HEX };
    const result = await normalizeParams(params, { address: 'bech32' }, mockCM);
    expect(result.chain).toBe('initia');
    expect(result.limit).toBe(10);
  });

  it('passes network from params to normalizeAddress for .init resolution', async () => {
    const RESOLVED = AccAddress.fromHex('0x0000000000000000000000000000000000000099');
    const mockCM = {
      getContext: vi.fn().mockResolvedValue({
        usernames: { resolve: vi.fn().mockResolvedValue({ address: RESOLVED }) },
      }),
    } as any;
    const params = { address: 'alice.init', network: 'testnet' };
    const result = await normalizeParams(params, { address: 'bech32' }, mockCM);
    expect(result.address).toBe(RESOLVED);
    expect(mockCM.getContext).toHaveBeenCalledWith('initia', 'testnet');
  });
});
```

- [ ] **Step 4: Implement address-normalizer.ts**

Create `src/tools/address-normalizer.ts`:

```ts
import { AccAddress, isValidEvmAddress, toChecksumAddress } from '@initia/initia.js/util';
import type { ChainManager } from '../initia/chain-manager.js';
import { ValidationError } from '../errors.js';
import type { AddressFormat } from './registry.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './registry.js';

const SELF_ALIASES = new Set(['me', 'self', 'my', 'signer']);

function isHex(input: string): boolean {
  if (input.startsWith('0x')) return /^0x[0-9a-fA-F]{40,64}$/.test(input);
  return /^[0-9a-fA-F]{40,64}$/.test(input);
}

function ensure0x(input: string): string {
  return input.startsWith('0x') ? input : `0x${input}`;
}

export async function normalizeAddress(
  input: string,
  target: AddressFormat,
  chainManager: ChainManager,
  network?: string,
): Promise<string> {
  let resolved = input;

  // 1. Self aliases
  if (SELF_ALIASES.has(input.toLowerCase())) {
    chainManager.requireSigner();
    resolved = chainManager.getSignerAddress()!;
  }

  // 2. .init username
  if (resolved.endsWith('.init')) {
    const ctx = await chainManager.getContext('initia', network as any);
    const result = await ctx.usernames.resolve(resolved);
    if (!result?.address) {
      throw new ValidationError(`Could not resolve "${resolved}" as .init username`);
    }
    resolved = result.address;
  }

  // 3. Format conversion
  if (target === 'bech32') {
    if (AccAddress.validate(resolved)) return resolved;
    if (isHex(resolved)) return AccAddress.fromHex(resolved);
    throw new ValidationError(`Invalid address format: "${input}"`);
  }

  if (target === 'hex') {
    if (isHex(resolved)) return toChecksumAddress(ensure0x(resolved));
    if (AccAddress.validate(resolved)) return toChecksumAddress(AccAddress.toHex(resolved));
    throw new ValidationError(`Invalid address format: "${input}"`);
  }

  throw new ValidationError(`Invalid address format: "${input}"`);
}

export async function normalizeParams(
  params: Record<string, unknown>,
  addressFields: Record<string, AddressFormat>,
  chainManager: ChainManager,
): Promise<Record<string, unknown>> {
  const result = { ...params };
  const network = params.network as string | undefined;

  for (const [fieldPath, target] of Object.entries(addressFields)) {
    if (fieldPath.includes('[].')) {
      const [arrayKey, nestedKey] = fieldPath.split('[].');
      const arr = result[arrayKey];
      if (Array.isArray(arr)) {
        result[arrayKey] = await Promise.all(
          arr.map(async (item: any) => ({
            ...item,
            [nestedKey]: await normalizeAddress(item[nestedKey], target, chainManager, network),
          })),
        );
      }
    } else {
      const value = result[fieldPath];
      if (typeof value !== 'string' || value === '') continue;
      result[fieldPath] = await normalizeAddress(value, target, chainManager, network);
    }
  }

  return result;
}

export function withAddressNormalization(
  handler: (params: any, ctx: ToolContext) => Promise<CallToolResult>,
  addressFields: Record<string, AddressFormat>,
): (params: any, ctx: ToolContext) => Promise<CallToolResult> {
  return async (params, ctx) => {
    const normalized = await normalizeParams(params, addressFields, ctx.chainManager);
    return handler(normalized, ctx);
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/address-normalizer.test.ts`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/tools/address-normalizer.ts tests/address-normalizer.test.ts
git commit -m "feat: implement address normalizer with tests"
```

---

### Task 3: Integrate decorator into registry.register()

**Files:**
- Modify: `src/tools/registry.ts`
- Test: `tests/registry.test.ts`

- [ ] **Step 1: Write failing test for decorator wrapping**

Append to `tests/registry.test.ts`:

```ts
it('wraps handler with address normalization when addressFields is set', async () => {
  const registry = new ToolRegistry();
  const originalHandler = vi.fn(async ({ address }: any) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ address }) }],
  }));

  registry.register({
    name: 'test_wrap',
    group: 'test',
    description: 'Test wrapping',
    schema: { address: z.string() },
    annotations: { readOnlyHint: true },
    addressFields: { address: 'bech32' },
    handler: originalHandler,
  });

  const tool = registry.get('test_wrap')!;
  // The handler should be wrapped — calling with hex should convert to bech32
  const hexAddr = '0x0000000000000000000000000000000000000001';
  const { AccAddress } = await import('@initia/initia.js/util');
  const expectedBech32 = AccAddress.fromHex(hexAddr);

  const result = await tool.handler(
    { address: hexAddr } as any,
    { chainManager: {} } as any,
  );
  const data = JSON.parse((result.content as any)[0].text);
  expect(data.address).toBe(expectedBech32);
  expect(originalHandler).toHaveBeenCalledWith(
    expect.objectContaining({ address: expectedBech32 }),
    expect.anything(),
  );
});

it('does not wrap handler when addressFields is absent', async () => {
  const registry = new ToolRegistry();
  const originalHandler = vi.fn(async ({ input }: any) => ({
    content: [{ type: 'text' as const, text: input }],
  }));

  registry.register({
    name: 'test_no_wrap',
    group: 'test',
    description: 'No wrapping',
    schema: { input: z.string() },
    annotations: { readOnlyHint: true },
    handler: originalHandler,
  });

  const tool = registry.get('test_no_wrap')!;
  await tool.handler({ input: 'hello' } as any, { chainManager: {} } as any);
  expect(originalHandler).toHaveBeenCalledWith({ input: 'hello' }, expect.anything());
});
```

Add the needed import at the top of the file:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

(Replace the existing `import { describe, it, expect } from 'vitest';` line.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/registry.test.ts`
Expected: FAIL — handler is not wrapped yet

- [ ] **Step 3: Add wrapping logic to register()**

In `src/tools/registry.ts`, add the import and modify `register()`:

```ts
import { withAddressNormalization } from './address-normalizer.js';
```

Modify the `register` method:

```ts
register<T extends ZodShape>(def: ToolDef<T>): void {
  if (this.tools.has(def.name)) {
    throw new Error(`Tool '${def.name}' is already registered`);
  }
  if (def.addressFields) {
    def.handler = withAddressNormalization(def.handler, def.addressFields) as any;
  }
  this.tools.set(def.name, def as ToolDef);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/registry.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry.ts tests/registry.test.ts
git commit -m "feat: integrate address normalization decorator into registry"
```

---

### Task 4: Migrate tools with resolveAddress() — Group 1 (account, delegation, distribution, portfolio)

**Files:**
- Modify: `src/tools/account.ts`
- Modify: `src/tools/delegation.ts`
- Modify: `src/tools/distribution.ts`
- Modify: `src/tools/portfolio.ts`

- [ ] **Step 1: Migrate account.ts**

Add `addressFields` to the registration and remove `resolveAddress()` usage:

```ts
// Remove: import { resolveAddress } from './resolver.js';
// Add addressFields to the register call:
registry.register({
  name: 'account_get',
  group: 'account',
  // ... existing fields
  addressFields: { address: 'bech32' },
  handler: async ({ chain, address, limit, offset, reverse, network }, { chainManager }) => {
    // Remove: const addr = resolveAddress(address, chainManager);
    // Use `address` directly — it's already normalized
    const ctx = await chainManager.getContext(chain, network);
    // ... rest of handler uses `address` instead of `addr`
```

- [ ] **Step 2: Migrate delegation.ts**

Same pattern — add `addressFields: { delegatorAddr: 'bech32' }`, remove `resolveAddress()` import and call, use `delegatorAddr` directly.

- [ ] **Step 3: Migrate distribution.ts**

Add `addressFields: { delegatorAddr: 'bech32' }`, remove `resolveAddress()` import and call.

- [ ] **Step 4: Migrate portfolio.ts**

Add `addressFields: { address: 'bech32' }`, remove `resolveAddress()` import and call.

- [ ] **Step 5: Run existing tests + lint**

Run: `npx vitest run && npm run lint`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/tools/account.ts src/tools/delegation.ts src/tools/distribution.ts src/tools/portfolio.ts
git commit -m "refactor: migrate account/delegation/distribution/portfolio to addressFields"
```

---

### Task 5: Migrate tools with resolveAddress() — Group 2 (token, tx, vip, bridge)

**Files:**
- Modify: `src/tools/token.ts`
- Modify: `src/tools/tx.ts`
- Modify: `src/tools/vip.ts`
- Modify: `src/tools/bridge.ts`

- [ ] **Step 1: Migrate token.ts**

Add `addressFields: { address: 'bech32' }` to `token_balance`, remove `resolveAddress()` import and call.

- [ ] **Step 2: Migrate tx.ts**

For `tx_by_address`: add `addressFields: { address: 'bech32' }`. Remove:
- `import { resolveAddress } from './resolver.js';`
- `const addr = resolveAddress(address, chainManager);`
- The manual validation block: `if (!AccAddress.validate(addr) && !isValidEvmAddress(addr)) { throw new ValidationError(...) }`
- `import { AccAddress, isValidEvmAddress } from '@initia/initia.js/util';` (if no longer used)

Use `address` directly in the handler body instead of `addr`.

- [ ] **Step 3: Migrate vip.ts**

For all 5 read tools (`vip_positions`, `vip_voting_power`, `vip_vesting_positions`, `vip_vote_info`, `vip_claimable_rewards`): add `addressFields: { address: 'bech32' }` to each. Remove all `resolveAddress()` calls and use `address` directly. Remove the `resolveAddress` import (keep `resolveValidatorAddress`).

- [ ] **Step 4: Migrate bridge.ts**

For `bridge_withdrawals`: add `addressFields: { address: 'bech32' }`, remove `resolveAddress()` call.
For `bridge_deposit`: add `addressFields: { to: 'bech32' }`.
For `bridge_withdraw`: add `addressFields: { to: 'bech32' }`.
`bridge_execute` `receiver` stays **excluded** — no `addressFields` for that field.
Remove the `resolveAddress` import.

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run && npm run lint`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/tools/token.ts src/tools/tx.ts src/tools/vip.ts src/tools/bridge.ts
git commit -m "refactor: migrate token/tx/vip/bridge to addressFields"
```

---

### Task 6: Migrate tools with manual validation — Group 3 (authz, feegrant)

**Files:**
- Modify: `src/tools/authz.ts`
- Modify: `src/tools/feegrant.ts`
- Test: `tests/authz-tools.test.ts`
- Test: `tests/feegrant-tools.test.ts`

- [ ] **Step 1: Migrate authz.ts**

Add `addressFields: { granter: 'bech32', grantee: 'bech32' }` to `authz_grants`. Remove:
- `export function validateAddress(addr: string): void { ... }` (entire function)
- `if (granter) validateAddress(granter);` and `if (grantee) validateAddress(grantee);`
- `import { AccAddress, isValidEvmAddress } from '@initia/initia.js/util';`
- `import { ValidationError } from '../errors.js';`

- [ ] **Step 2: Migrate feegrant.ts**

For `feegrant_allowances`: add `addressFields: { grantee: 'bech32' }`, remove inline `if (!AccAddress.validate(grantee) && !isValidEvmAddress(grantee))` check.
For `feegrant_grant`: add `addressFields: { grantee: 'bech32' }`, remove inline validation.
For `feegrant_revoke`: add `addressFields: { grantee: 'bech32' }`, remove inline validation.
Remove `import { AccAddress, isValidEvmAddress } from '@initia/initia.js/util';` and `import { ValidationError } from '../errors.js';` (keep `ValidationError` if still used for other checks like `!spendLimit && expiration === undefined`).

- [ ] **Step 3: Run existing tests + lint**

Run: `npx vitest run tests/authz-tools.test.ts tests/feegrant-tools.test.ts && npm run lint`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/authz.ts src/tools/feegrant.ts
git commit -m "refactor: migrate authz/feegrant to addressFields, remove manual validation"
```

---

### Task 7: Add addressFields to remaining tools (bank, governance, evm, wasm)

**Files:**
- Modify: `src/tools/bank.ts`
- Modify: `src/tools/governance.ts`
- Modify: `src/tools/evm.ts`
- Modify: `src/tools/wasm.ts`

- [ ] **Step 1: Migrate bank.ts**

Add `addressFields: { 'sends[].to': 'bech32' }` to `bank_send`.

- [ ] **Step 2: Migrate governance.ts**

Add `addressFields: { voter: 'bech32', depositor: 'bech32' }` to `proposal_list`.

- [ ] **Step 3: Migrate evm.ts**

Add to each tool:
- `evm_get_logs`: `addressFields: { address: 'hex' }`
- `evm_get_code`: `addressFields: { address: 'hex' }`
- `evm_get_storage_at`: `addressFields: { address: 'hex' }`
- `evm_call`: `addressFields: { contractAddress: 'hex' }`
- `evm_send`: `addressFields: { contractAddress: 'hex' }`
- `evm_deploy`, `evm_get_tx_receipt`, `evm_get_block`, `evm_decode_revert`, `evm_decode_logs`: no address fields — skip.

- [ ] **Step 4: Migrate wasm.ts**

Add to each tool that takes `contractAddress`:
- `wasm_contract_info`, `wasm_contract_history`, `wasm_raw_state`, `wasm_query`, `wasm_execute`, `wasm_migrate`, `wasm_clear_admin`: `addressFields: { contractAddress: 'bech32' }`
- `wasm_update_admin`: `addressFields: { contractAddress: 'bech32', newAdmin: 'bech32' }`
- `wasm_instantiate`: `addressFields: { admin: 'bech32' }`
- `wasm_store_code`, `wasm_code_info`, `wasm_contracts_by_code`: no address fields — skip.

- [ ] **Step 5: Run full test suite + lint**

Run: `npx vitest run && npm run lint`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/tools/bank.ts src/tools/governance.ts src/tools/evm.ts src/tools/wasm.ts
git commit -m "refactor: add addressFields to bank/governance/evm/wasm tools"
```

---

### Task 8: Clean up resolver.ts

**Files:**
- Modify: `src/tools/resolver.ts`

- [ ] **Step 1: Remove resolveAddress() from resolver.ts**

Remove the `resolveAddress` function and the `SELF_ALIASES` constant. Keep `resolveValidatorAddress()` as-is.

After cleanup, `resolver.ts` should contain only:

```ts
import { ValidationError } from '../errors.js';

/**
 * Resolve a validator by moniker (name) or address.
 * If the input looks like a bech32 validator address, returns it as-is.
 * Otherwise queries the validator set and matches by moniker (case-insensitive).
 */
export async function resolveValidatorAddress(ctx: any, input: string): Promise<string> {
  if (input.startsWith('initvaloper') || input.startsWith('0x')) return input;

  const result = await ctx.client.mstaking.validators({});
  const validators = result.validators ?? result;
  const lower = input.toLowerCase();
  const match = (validators as any[]).find(
    (v: any) => v.description?.moniker?.toLowerCase() === lower,
  );
  if (!match) {
    const available = (validators as any[])
      .slice(0, 10)
      .map((v: any) => v.description?.moniker)
      .filter(Boolean)
      .join(', ');
    throw new ValidationError(
      `Validator "${input}" not found. Use validator_list to see available validators. Examples: ${available}`,
    );
  }
  return match.operatorAddress;
}
```

Remove the unused `ChainManager` import.

- [ ] **Step 2: Verify no remaining imports of resolveAddress**

Run: `grep -r "resolveAddress" src/` — should only find `resolveValidatorAddress` references.

- [ ] **Step 3: Run full test suite + lint**

Run: `npx vitest run && npm run lint`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/resolver.ts
git commit -m "refactor: remove resolveAddress from resolver, replaced by address-normalizer"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 2: Run lint + typecheck**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Verify no stale imports**

Run: `grep -r "from './resolver.js'" src/tools/ | grep -v resolveValidatorAddress`
Expected: No results (no tool imports `resolveAddress` from resolver anymore)

Run: `grep -r "resolveAddress" src/tools/ | grep -v resolveValidatorAddress | grep -v address-normalizer`
Expected: No results

- [ ] **Step 4: Commit any remaining fixes**

If any issues were found, fix and commit.

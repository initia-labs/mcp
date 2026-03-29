# @initia/mcp

MCP server and CLI for the [Initia](https://initia.xyz) blockchain ecosystem. Tools for querying chain state, managing assets, and executing transactions across Initia L1 and L2 rollups (MiniEVM, MiniMove, MiniWasm).

Two interfaces, one codebase:
- **`@initia/mcp`** — MCP server (stdio transport, for Claude Desktop / LLM agents)
- **`initctl`** — CLI (for humans and scripts)

## Quick Start

```bash
npm install
npm run build
```

### CLI (initctl)

```bash
# Global install
npm install -g .
initctl chain list

# Or run directly without global install
node dist/cli.js chain list

# Or via npx (after npm install)
npx initctl chain list
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "initia": {
      "command": "node",
      "args": ["/path/to/initia-mcp/dist/index.js"],
      "env": {
        "INITIA_KEY": "your mnemonic words ...",
        "INITIA_NETWORK": "mainnet"
      }
    }
  }
}
```

### CLI

```bash
# Query
initctl chain list
initctl token search --symbol USDC
initctl move view --module-address 0x1 --module-name coin --function-name balance --args '["0x1"]'

# Transaction (interactive confirm)
initctl bank send --to init1abc... --amount 1000000 --denom uinit

# Transaction (skip confirm)
initctl bank send --to init1abc... --amount 1000000 --denom uinit --yes

# JSON output (for scripts)
initctl token search --symbol INIT --json

# Shell completion
eval "$(initctl completion bash)"   # bash
eval "$(initctl completion zsh)"    # zsh
initctl completion fish | source    # fish
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `INITIA_KEY` | No | — | Mnemonic (12/24 words), hex private key (`0x...`), or `"ledger"` |
| `INITIA_KEY_INDEX` | No | `0` | HD derivation index (for mnemonic/ledger) |
| `INITIA_LEDGER_APP` | No | `ethereum` | Ledger app: `ethereum` or `cosmos` |
| `INITIA_NETWORK` | No | `mainnet` | `mainnet` or `testnet` |
| `AUTO_CONFIRM` | No | `false` | Skip confirmation for mutations (MCP only) |
| `INITIA_LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `INITIA_USE_SCAN_API` | No | `false` | Use Scan API for enhanced chain data |

Without a signer key, read-only tools still work. Mutation tools return `SIGNER_REQUIRED`.

## Tools (107)

### Chain & Account (10)

| Tool | Description |
|---|---|
| `chain_list` | List all supported chains (L1 + L2 rollups) |
| `chain_capabilities` | Get chain VM type, features, and endpoints |
| `chain_gas_prices` | Current on-chain gas prices (L1 or L2) |
| `account_get` | Account info and balances |
| `portfolio_get` | Aggregated balances across all chains |
| `address_validate` | Validate bech32 or EVM address format |
| `address_convert` | Convert between bech32 and hex |
| `delegation_get` | Staking delegations, rewards, and unbonding |
| `distribution_rewards` | Pending staking rewards across validators |
| `simulate_tx` | Simulate a transaction and estimate gas |

### Token & Denom (7)

| Tool | Description |
|---|---|
| `token_search` | Search tokens by symbol across all chains |
| `token_list` | List registered tokens on a chain |
| `token_info` | Token metadata (name, symbol, decimals) for any type |
| `token_balance` | Token balance for native, ERC20, CW20, or Move FA |
| `amount_format` | Format raw amount with decimals |
| `denom_classify` | Classify denomination type (native, ibc, evm, etc.) |
| `denom_metadata` | On-chain bank module metadata |

### Transaction (3)

| Tool | Description |
|---|---|
| `tx_get` | Get transaction by hash with VM-aware decoding |
| `tx_search` | Search transactions (CometBFT query syntax) |
| `tx_by_address` | Recent transactions for an address |

### Validator & Staking (7)

| Tool | Description |
|---|---|
| `validator_list` | List validators with status and voting power |
| `validator_get` | Detailed validator information |
| `staking_pool` | Network bonded/unbonded token totals |
| `staking_annual_provisions` | Current annual token provisions (inflation) |
| `staking_manage` | Delegate, undelegate, redelegate, or claim rewards |
| `governance_vote` | Vote on a governance proposal |
| `proposal_list` / `proposal_get` | List or get governance proposals |

### Bridge (14)

| Tool | Description |
|---|---|
| `bridge_route` | Find optimal cross-chain transfer route |
| `bridge_execute` | Execute a cross-chain transfer via router |
| `bridge_transfer_status` | Track cross-chain transfer progress |
| `bridge_list_chains` | List bridgeable L2 chains |
| `bridge_routable_assets` | List assets available for routing |
| `bridge_deposit` / `bridge_withdraw` | Direct L1↔L2 OPInit deposit/withdraw |
| `bridge_withdrawals` / `bridge_withdrawal_status` | Query withdrawal status |
| `opbridge_list` / `opbridge_get` | OPInit bridge configuration |
| `opbridge_token_pairs` | L1↔L2 token pair mappings |
| `opbridge_token_pair_by_l1_denom` / `opbridge_token_pair_by_l2_denom` | Token pair lookup |

### IBC (3)

| Tool | Description |
|---|---|
| `ibc_channels` | List IBC channels or find channel between two chains |
| `ibc_denom_hash` | Compute IBC denomination hash from path |
| `ibc_transfer` | Send tokens via IBC |

### Username (4)

| Tool | Description |
|---|---|
| `username_resolve` | Resolve .init names ↔ addresses |
| `username_record` | Full .init username record |
| `username_metadata` | NFT metadata for .init username |
| `username_check` | Check username availability |

### Move VM (14)

| Tool | Description |
|---|---|
| `move_modules` | List modules deployed at an address |
| `move_module_abi` | Get module ABI (functions, structs) |
| `move_resources` | List resources held by an address |
| `move_resource_get` | Query a specific resource |
| `move_view` | Call a view function (read-only) |
| `move_execute` | Execute an entry function |
| `move_publish` / `move_script` | Deploy module or run script |
| `move_table_entry` | Query a table entry |
| `move_dex_pairs` | List DEX liquidity pool pairs |
| `move_denom_metadata` / `move_metadata_denom` | Denom ↔ metadata conversion |
| `move_bcs_encode` / `move_bcs_decode` | BCS serialization utilities |

### EVM (10)

| Tool | Description |
|---|---|
| `evm_call` | Call a contract function (read-only) |
| `evm_send` | Send a state-changing transaction |
| `evm_deploy` | Deploy a contract |
| `evm_get_logs` | Query event logs |
| `evm_get_tx_receipt` | Get transaction receipt |
| `evm_get_block` | Get block information |
| `evm_get_code` | Get contract bytecode (Minievm only) |
| `evm_get_storage_at` | Read storage slot (Minievm only) |
| `evm_decode_revert` | Decode revert reason |
| `evm_decode_logs` | Decode event logs with ABI |

### CosmWasm (12)

| Tool | Description |
|---|---|
| `wasm_query` | Query a smart contract |
| `wasm_execute` | Execute a smart contract function |
| `wasm_store_code` | Upload contract bytecode |
| `wasm_instantiate` | Instantiate a contract |
| `wasm_migrate` | Migrate to a new code ID |
| `wasm_update_admin` / `wasm_clear_admin` | Admin management |
| `wasm_contract_info` / `wasm_code_info` | Contract/code metadata |
| `wasm_contracts_by_code` | List contracts from a code ID |
| `wasm_contract_history` | Migration history |
| `wasm_raw_state` | Raw key-value state |

### VIP (16)

| Tool | Description |
|---|---|
| `vip_stage_info` | Current VIP stage and timing |
| `vip_positions` | Lock-staking positions |
| `vip_voting_power` | Gauge voting power |
| `vip_vesting_positions` | Vesting schedules with reward breakdowns |
| `vip_vote_info` | Vote allocations per bridge |
| `vip_claimable_rewards` | Claimable VIP rewards |
| `vip_delegate` / `vip_undelegate` / `vip_redelegate` | Lock-staking management |
| `vip_extend_lock` | Extend lock duration |
| `vip_gauge_vote` / `vip_gauge_vote_by_amount` | Gauge voting |
| `vip_claim_rewards` / `vip_claim_staking_rewards` | Reward claiming |
| `vip_provide_and_delegate` | LP + lock-delegate in one tx |
| `vip_stableswap_provide_and_delegate` | Stableswap LP + lock-delegate |

### Event Parsing (3)

| Tool | Description |
|---|---|
| `event_parse_tx` | Parse Cosmos events from a transaction |
| `event_parse_move` | Decode Move module events |
| `event_parse_wasm` | Decode CosmWasm contract events |

### Ledger (2)

| Tool | Description |
|---|---|
| `ledger_status` | Check Ledger device connection |
| `ledger_verify_address` | Display address on device for verification |

### Bank (1)

| Tool | Description |
|---|---|
| `bank_send` | Send tokens (supports batch sends) |

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio)
├── cli.ts                # CLI entry point (initctl)
├── tools/
│   ├── registry.ts       # ToolRegistry — shared by MCP and CLI
│   ├── groups.ts         # Group definitions (24 groups)
│   ├── index.ts          # Side-effect imports for all tool files
│   ├── tx-executor.ts    # Mutation flow (dry-run → simulate → broadcast)
│   ├── vm-guard.ts       # VM compatibility checks
│   └── *.ts              # Tool modules (registry.register() calls)
├── mcp/
│   └── adapter.ts        # Registry → McpServer binding
├── cli/
│   ├── adapter.ts        # Registry → citty commands + zodToCittyArgs
│   ├── format.ts         # TTY / JSON output formatting
│   ├── confirm.ts        # Mutation y/N prompt
│   └── completion.ts     # Shell completion (bash/zsh/fish)
├── initia/
│   └── chain-manager.ts  # Chain context creation, caching
├── config/               # Environment config, chain aliases
├── schemas/              # Shared Zod parameter schemas
├── errors.ts             # Typed error codes
├── response.ts           # Response serialization
└── logger.ts             # Structured JSON logging
```

Tools are registered once in a transport-agnostic `ToolRegistry`. The MCP and CLI adapters consume the same registry independently — adding a tool to a `*.ts` file automatically exposes it in both interfaces.

## Smart Defaults

- **Validator by name**: Tools accepting a validator address also accept the moniker name (case-insensitive, auto-resolved)
- **"me" address**: Address parameters accept `"me"`, `"self"`, `"my"`, or `"signer"` to resolve to the configured signer
- **VM guard**: Contract tools enforce VM compatibility — calling `move_view` on a MiniEVM chain returns a `WRONG_VM` error with suggested alternatives

## Development

```bash
npm run dev          # Run MCP server with tsx (hot reload)
npm test             # Unit + integration tests
npm run test:smoke   # E2E tests against testnet
npm run lint         # ESLint + tsc --noEmit
```

## License

Apache-2.0

import { z } from 'zod';
import { defineCommand } from 'citty';
import type { ZodShape, ToolRegistry, ToolContext, ToolDef } from '../tools/registry.js';
import { McpToolError } from '../errors.js';
import { formatOutput } from './format.js';
import { promptConfirm, formatSimulationSummary } from './confirm.js';
import { generateBashCompletion, generateZshCompletion, generateFishCompletion } from './completion.js';
import './format-custom.js';

export interface ArgDef {
  type: 'string' | 'boolean';
  description?: string;
  required?: boolean;
  default?: unknown;
}

const SKIP_FIELDS = new Set(['confirm']);

export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

function peelDefault(schema: any): { value: unknown; inner: any } | null {
  if (!(schema instanceof z.ZodDefault)) return null;
  const defValue = schema._def?.defaultValue ?? (schema as any).def?.defaultValue;
  return {
    value: typeof defValue === 'function' ? defValue() : defValue,
    inner: schema._def?.innerType ?? (schema as any).def?.innerType,
  };
}

function unwrapZod(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean; defaultValue?: unknown } {
  let current: any = schema;
  let optional = false;
  let defaultValue: unknown;

  const outer = peelDefault(current);
  if (outer) { defaultValue = outer.value; current = outer.inner; }

  if (current instanceof z.ZodOptional) {
    optional = true;
    current = current._def?.innerType ?? (current as any).def?.innerType;
  }

  const inner = peelDefault(current);
  if (inner) { defaultValue = inner.value; current = inner.inner; }

  return { inner: current as z.ZodTypeAny, optional: optional || defaultValue !== undefined, defaultValue };
}

export function zodToCittyArgs(schema: ZodShape): Record<string, ArgDef> {
  const result: Record<string, ArgDef> = {};

  for (const [key, zodType] of Object.entries(schema)) {
    if (SKIP_FIELDS.has(key)) continue;

    const cliKey = camelToKebab(key);
    const { inner, optional, defaultValue } = unwrapZod(zodType);
    const description = zodType.description ?? inner.description;

    let type: 'string' | 'boolean' = 'string';
    if (inner instanceof z.ZodBoolean) {
      type = 'boolean';
    }

    const arg: ArgDef = { type, required: !optional };
    if (description) arg.description = description;
    if (defaultValue !== undefined) {
      // citty passes defaults to node:util.parseArgs which requires type-matched defaults.
      // numeric defaults on string-typed args cause parseArgs to throw, silently breaking all arg parsing.
      arg.default = type === 'string' && typeof defaultValue === 'number' ? String(defaultValue) : defaultValue;
    }

    result[cliKey] = arg;
  }

  return result;
}

export function toolNameToSubcommand(toolName: string, group: string): string {
  const prefix = `${group}_`;
  const raw = toolName.startsWith(prefix)
    ? toolName.slice(prefix.length)
    : toolName;
  return raw.replaceAll('_', '-');
}

// Restore original camelCase param keys from kebab-case CLI args
export function restoreParamKeys(args: Record<string, unknown>, schema: ZodShape): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const originalKey of Object.keys(schema)) {
    const kebabKey = camelToKebab(originalKey);
    if (kebabKey in args && args[kebabKey] !== undefined) {
      result[originalKey] = args[kebabKey];
    }
  }
  return result;
}

// Parse JSON strings for complex (array/object) params, convert string numbers
export function parseComplexArgs(params: Record<string, unknown>, schema: ZodShape): Record<string, unknown> {
  const result = { ...params };
  for (const [key, zodType] of Object.entries(schema)) {
    if (key in result && typeof result[key] === 'string') {
      const { inner } = unwrapZod(zodType);
      if (inner instanceof z.ZodArray || inner instanceof z.ZodObject) {
        try {
          result[key] = JSON.parse(result[key] as string);
        } catch (e) {
          const hint = e instanceof SyntaxError ? e.message : String(e);
          throw new Error(`Invalid JSON for --${camelToKebab(key)}: ${hint}`, { cause: e });
        }
      } else if (inner instanceof z.ZodNumber) {
        result[key] = Number(result[key]);
      }
    }
  }
  return result;
}

function printResult(result: import('@modelcontextprotocol/sdk/types.js').CallToolResult, jsonMode: boolean, toolName?: string): void {
  if (result.isError) {
    console.error(formatOutput(result, jsonMode, toolName));
    process.exit(1);
  }
  console.log(formatOutput(result, jsonMode, toolName));
}

function extractResultText(result: import('@modelcontextprotocol/sdk/types.js').CallToolResult): string | null {
  return result.content?.[0]?.type === 'text' ? (result.content[0] as any).text : null;
}

// Build a citty command for a single tool
function buildToolCommand(
  tool: ToolDef,
  ctx: ToolContext,
  globalOpts: { json: boolean; yes: boolean; network?: string },
) {
  const isMutation = tool.annotations.readOnlyHint === false;

  return defineCommand({
    meta: { name: toolNameToSubcommand(tool.name, tool.group), description: tool.description },

    args: zodToCittyArgs(tool.schema) as any,
    async run({ args }) {
      const jsonMode = globalOpts.json || !process.stdout.isTTY;
      try {
        let params = restoreParamKeys(args, tool.schema);
        if (globalOpts.network && !params.network && 'network' in tool.schema) {
          params.network = globalOpts.network;
        }
        params = parseComplexArgs(params, tool.schema);

        const zodSchema = z.object(tool.schema);
        const parsed = zodSchema.safeParse(params);
        if (!parsed.success) {
          const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
          console.error(jsonMode
            ? JSON.stringify({ error: true, code: 'VALIDATION_ERROR', message: issues })
            : `Error: ${issues}`);
          process.exit(1);
        }
        params = parsed.data;

        if (!isMutation) {
          printResult(await tool.handler(params as any, ctx), jsonMode, tool.name);
          return;
        }

        if (params.dryRun) {
          printResult(await tool.handler({ ...params, confirm: false } as any, ctx), jsonMode, tool.name);
          return;
        }

        if (globalOpts.yes) {
          printResult(await tool.handler({ ...params, confirm: true } as any, ctx), jsonMode, tool.name);
          return;
        }

        // Interactive mutation: simulate -> confirm -> broadcast
        const simResult = await tool.handler({ ...params, dryRun: false, confirm: false } as any, ctx);
        if (simResult.isError) {
          printResult(simResult, jsonMode, tool.name);
          return;
        }
        const simText = extractResultText(simResult);
        if (!simText) {
          console.error('Error: Simulation returned no data. Aborting.');
          process.exit(1);
        }
        let simData: Record<string, unknown>;
        try {
          simData = JSON.parse(simText);
        } catch {
          console.error(`Error: Simulation returned invalid data. Raw output:\n${simText}`);
          process.exit(1);
        }
        console.error(formatSimulationSummary(simData));
        console.error('');

        const confirmed = await promptConfirm('Proceed?');
        if (!confirmed) {
          console.error('Cancelled.');
          process.exit(0);
        }

        printResult(await tool.handler({ ...params, confirm: true } as any, ctx), jsonMode, tool.name);
      } catch (err) {
        if (err instanceof McpToolError) {
          console.error(formatOutput(err.toToolResult(), jsonMode, tool.name));
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(jsonMode
            ? JSON.stringify({ error: true, code: 'INTERNAL_ERROR', message: msg })
            : `Error: ${msg}`);
        }
        process.exit(1);
      }
    },
  });
}

export function buildCittyCommands(registry: ToolRegistry, ctx: ToolContext, version: string) {
  const globalOpts = {
    json: process.argv.includes('--json'),
    yes: process.argv.includes('--yes'),
    network: undefined as string | undefined,
  };
  const netIdx = process.argv.indexOf('--network');
  if (netIdx !== -1 && process.argv[netIdx + 1]) {
    globalOpts.network = process.argv[netIdx + 1];
  }

  const subCommands: Record<string, ReturnType<typeof defineCommand>> = {};

  for (const group of registry.listGroups()) {
    const tools = registry.listByGroup(group);
    const children: Record<string, ReturnType<typeof defineCommand>> = {};

    for (const tool of tools) {
      const subName = toolNameToSubcommand(tool.name, group);
      children[subName] = buildToolCommand(tool, ctx, globalOpts);
    }

    subCommands[group] = defineCommand({
      meta: { name: group, description: registry.getGroupDescription(group) ?? group },
      subCommands: children,
    });
  }

   
  (subCommands as any).completion = defineCommand({
    meta: { name: 'completion', description: 'Generate shell completion script' },
    args: {
      shell: { type: 'positional', description: 'Shell type: bash, zsh, or fish', required: true },
    },
    run({ args }) {
      switch (args.shell) {
        case 'bash': console.log(generateBashCompletion(registry)); break;
        case 'zsh': console.log(generateZshCompletion(registry)); break;
        case 'fish': console.log(generateFishCompletion(registry)); break;
        default: console.error(`Unknown shell: ${args.shell}. Use bash, zsh, or fish.`); process.exit(1);
      }
    },
  });

  return defineCommand({
    meta: { name: 'initctl', version, description: 'CLI for the Initia ecosystem' },
    args: {
      json: { type: 'boolean', description: 'Force JSON output' },
      network: { type: 'string', description: 'Network override (mainnet/testnet)' },
      yes: { type: 'boolean', description: 'Skip confirmation prompts' },
    },
    subCommands,
  });
}

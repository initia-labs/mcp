import { z } from 'zod';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ChainManager } from '../initia/chain-manager.js';
import type { AppConfig } from '../config/index.js';
import { withAddressNormalization } from './address-normalizer.js';

export type ZodShape = Record<string, z.ZodTypeAny>;

export type AddressFormat = 'bech32' | 'hex';

export interface ToolContext {
  chainManager: ChainManager;
  config: AppConfig;
}

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

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  private groups = new Map<string, string>();

  register<T extends ZodShape>(def: ToolDef<T>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool '${def.name}' is already registered`);
    }
    if (def.addressFields) {
      (def as any).handler = withAddressNormalization(def.handler as any, def.addressFields);
    }
    this.tools.set(def.name, def as ToolDef);
  }

  registerGroup(name: string, description: string): void {
    this.groups.set(name, description);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  listByGroup(group: string): ToolDef[] {
    return this.list().filter(t => t.group === group);
  }

  listGroups(): string[] {
    const groups = new Set<string>();
    for (const tool of this.tools.values()) {
      groups.add(tool.group);
    }
    return [...groups].sort();
  }

  getGroupDescription(group: string): string | undefined {
    return this.groups.get(group);
  }
}

export const registry = new ToolRegistry();

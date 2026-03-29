import { describe, it, expect } from 'vitest';
import { buildCittyCommands, toolNameToSubcommand, zodToCittyArgs } from '../src/cli/adapter.js';

// Import tool registrations to populate registry
import '../src/tools/index.js';
import { registry } from '../src/tools/registry.js';

describe('CLI integration', () => {
  it('registry has all expected tools', () => {
    const tools = registry.list();
    expect(tools.length).toBeGreaterThanOrEqual(100);
  });

  it('all groups have descriptions', () => {
    for (const group of registry.listGroups()) {
      expect(registry.getGroupDescription(group)).toBeDefined();
    }
  });

  it('all tools have valid group', () => {
    const groups = new Set(registry.listGroups());
    for (const tool of registry.list()) {
      expect(groups.has(tool.group)).toBe(true);
    }
  });

  it('no duplicate CLI subcommand names within a group', () => {
    for (const group of registry.listGroups()) {
      const tools = registry.listByGroup(group);
      const names = tools.map(t => toolNameToSubcommand(t.name, group));
      const unique = new Set(names);
      expect(names.length).toBe(unique.size);
    }
  });

  it('zodToCittyArgs succeeds for all tool schemas', () => {
    for (const tool of registry.list()) {
      expect(() => zodToCittyArgs(tool.schema)).not.toThrow();
    }
  });

  it('builds citty command tree without errors', () => {
    const ctx = { chainManager: {}, config: {} } as any;
    const main = buildCittyCommands(registry, ctx, '0.1.0');
    expect(main.subCommands).toBeDefined();
    expect(Object.keys(main.subCommands!).length).toBeGreaterThanOrEqual(20);
  });
});

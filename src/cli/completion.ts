import type { ToolRegistry } from '../tools/registry.js';
import { zodToCittyArgs, toolNameToSubcommand } from './adapter.js';

function getFlags(registry: ToolRegistry, group: string, subcommand: string): string[] {
  const tool = registry.listByGroup(group).find(t => toolNameToSubcommand(t.name, group) === subcommand);
  if (!tool) return [];
  return Object.keys(zodToCittyArgs(tool.schema)).map(k => `--${k}`);
}

function getSubcommands(registry: ToolRegistry, group: string): string[] {
  return registry.listByGroup(group).map(t => toolNameToSubcommand(t.name, group));
}

export function generateBashCompletion(registry: ToolRegistry): string {
  const groups = registry.listGroups();
  const lines: string[] = [
    '# bash completion for initctl',
    '_initctl_completions() {',
    '  local cur prev groups',
    '  COMPREPLY=()',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '',
    `  groups="${groups.join(' ')}"`,
    '',
    '  if [[ ${COMP_CWORD} -eq 1 ]]; then',
    '    COMPREPLY=($(compgen -W "${groups}" -- "${cur}"))',
    '    return 0',
    '  fi',
    '',
    '  local group="${COMP_WORDS[1]}"',
    '  case "${group}" in',
  ];

  for (const group of groups) {
    const subs = getSubcommands(registry, group);
    lines.push(`    ${group})`);
    lines.push(`      if [[ \${COMP_CWORD} -eq 2 ]]; then`);
    lines.push(`        COMPREPLY=($(compgen -W "${subs.join(' ')}" -- "\${cur}"))`);
    lines.push('      else');
    lines.push('        local subcmd="${COMP_WORDS[2]}"');
    lines.push('        case "${subcmd}" in');
    for (const sub of subs) {
      const flags = getFlags(registry, group, sub);
      if (flags.length > 0) {
        lines.push(`          ${sub}) COMPREPLY=($(compgen -W "${flags.join(' ')}" -- "\${cur}")) ;;`);
      }
    }
    lines.push('        esac');
    lines.push('      fi');
    lines.push('      ;;');
  }

  lines.push('  esac');
  lines.push('}');
  lines.push('complete -F _initctl_completions initctl');
  return lines.join('\n');
}

export function generateZshCompletion(registry: ToolRegistry): string {
  const groups = registry.listGroups();
  const lines: string[] = [
    '#compdef initctl',
    '',
    '_initctl() {',
    '  local -a groups',
    `  groups=(${groups.map(g => `'${g}:${(registry.getGroupDescription(g) ?? g).replace(/'/g, "")}'`).join(' ')})`,
    '',
    '  _arguments -C \\',
    "    '1:group:->groups' \\",
    "    '*::arg:->args'",
    '',
    '  case $state in',
    '    groups) _describe "group" groups ;;',
    '    args)',
    '      case ${words[1]} in',
  ];

  for (const group of groups) {
    const subs = getSubcommands(registry, group);
    lines.push(`        ${group})`);
    lines.push(`          local -a subcmds=(${subs.map(s => `'${s}'`).join(' ')})`);
    lines.push('          _describe "command" subcmds');
    lines.push('          ;;');
  }

  lines.push('      esac');
  lines.push('    ;;');
  lines.push('  esac');
  lines.push('}');
  lines.push('_initctl');
  return lines.join('\n');
}

export function generateFishCompletion(registry: ToolRegistry): string {
  const lines: string[] = ['# fish completion for initctl'];

  for (const group of registry.listGroups()) {
    const desc = registry.getGroupDescription(group) ?? group;
    lines.push(`complete -c initctl -n '__fish_use_subcommand' -a '${group}' -d '${desc}'`);

    for (const sub of getSubcommands(registry, group)) {
      lines.push(`complete -c initctl -n '__fish_seen_subcommand_from ${group}; and not __fish_seen_subcommand_from ${sub}' -a '${sub}'`);

      const flags = getFlags(registry, group, sub);
      for (const flag of flags) {
        const flagName = flag.replace(/^--/, '');
        lines.push(`complete -c initctl -n '__fish_seen_subcommand_from ${sub}' -l '${flagName}'`);
      }
    }
  }

  return lines.join('\n');
}

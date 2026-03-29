import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Error code extraction
// ---------------------------------------------------------------------------

const ERROR_CODE_RE = /^\[([A-Z_]+)\]\s*/;

function extractErrorParts(text: string): { code: string | null; message: string } {
  const match = text.match(ERROR_CODE_RE);
  if (match) {
    return { code: match[1], message: text.slice(match[0].length) };
  }
  return { code: null, message: text };
}

// ---------------------------------------------------------------------------
// Error hints
// ---------------------------------------------------------------------------

const ERROR_HINTS: Record<string, string> = {
  SIGNER_REQUIRED: "Set INITIA_KEY environment variable to sign transactions.",
  CHAIN_NOT_FOUND: "Use 'initctl chain list' to see available chains.",
  WRONG_VM: "This tool is not compatible with this chain type.",
};

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export function formatNumber(val: string | number): string {
  const str = String(val);
  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;
  if (/^\d+(\.\d+)?$/.test(abs) && abs.length > 3) {
    const [intPart, decPart] = abs.split('.');
    const fmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = decPart ? `${fmt}.${decPart}` : fmt;
    return negative ? `-${result}` : result;
  }
  return str;
}

// ---------------------------------------------------------------------------
// Value colorizing
// ---------------------------------------------------------------------------

function colorize(val: unknown): string {
  if (val === null || val === undefined) return pc.dim('null');
  if (typeof val === 'boolean') return val ? pc.green('true') : pc.red('false');
  if (typeof val === 'number') return pc.cyan(formatNumber(val));
  if (typeof val === 'string') {
    // Numeric strings (integers, decimals, negative)
    if (/^-?\d+(\.\d+)?$/.test(val) && val.replace(/^-/, '').length > 3) return pc.cyan(formatNumber(val));
    return val;
  }
  if (Array.isArray(val)) return pc.dim(JSON.stringify(val));
  if (typeof val === 'object') return pc.dim(JSON.stringify(val));
  return String(val);
}

// ---------------------------------------------------------------------------
// camelCase → UPPER SNAKE header conversion
// ---------------------------------------------------------------------------

function toHeaderCase(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

// ---------------------------------------------------------------------------
// Truncate to max width with ellipsis
// ---------------------------------------------------------------------------

function truncate(str: string, max: number): string {
  if (max <= 0) return '';
  if (str.length <= max) return str;
  if (max === 1) return '\u2026';
  return str.slice(0, max - 1) + '\u2026';
}

// ---------------------------------------------------------------------------
// Detect if a value is a "plain" scalar (not object/array)
// ---------------------------------------------------------------------------

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isScalar(val: unknown): boolean {
  return val === null || val === undefined || typeof val !== 'object';
}

// ---------------------------------------------------------------------------
// Table formatter (kubectl-style, no borders)
// ---------------------------------------------------------------------------

const MAX_COL_WIDTH = 40;

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return pc.dim('No results found.');

  // Collect all keys preserving first-seen order
  const keySet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) keySet.add(k);
  }

  // Filter out all-null columns
  const keys = [...keySet].filter(k => rows.some(r => r[k] !== null && r[k] !== undefined));
  if (keys.length === 0) return pc.dim('No results found.');

  const headers = keys.map(toHeaderCase);

  // Build string cells
  const cells: string[][] = rows.map(row =>
    keys.map(k => {
      const v = row[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }),
  );

  // Determine if column is numeric (right-align)
  const isNumeric = keys.map((_, ci) =>
    cells.every(row => row[ci] === '' || /^\d+(\.\d+)?$/.test(row[ci])),
  );

  // Pre-format cells (number formatting changes string length)
  const formatted = cells.map(row =>
    row.map(cell => formatNumber(cell)),
  );

  // Compute column widths from formatted values
  const widths = headers.map((h, ci) => {
    const maxVal = formatted.reduce((max, row) => Math.max(max, truncate(row[ci], MAX_COL_WIDTH).length), 0);
    return Math.min(Math.max(h.length, maxVal), MAX_COL_WIDTH);
  });

  // Format header
  const headerLine = headers.map((h, ci) => h.padEnd(widths[ci])).join('  ');

  // Format rows
  const dataLines = formatted.map(row =>
    row
      .map((cell, ci) => {
        const t = truncate(cell, widths[ci]);
        if (isNumeric[ci]) {
          return pc.cyan(t.padStart(widths[ci]));
        }
        return t.padEnd(widths[ci]);
      })
      .join('  '),
  );

  return [headerLine, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// Key-value formatter (single object)
// ---------------------------------------------------------------------------

function formatKeyValue(obj: Record<string, unknown>, indent: number = 0): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return pc.dim('(empty)');

  const prefix = ' '.repeat(indent);

  // Separate scalars from nested
  const scalarEntries = entries.filter(([, v]) => isScalar(v));
  const nestedEntries = entries.filter(([, v]) => !isScalar(v));

  const lines: string[] = [];

  // Scalars: aligned key-value
  if (scalarEntries.length > 0) {
    const maxKeyLen = scalarEntries.reduce((max, [k]) => Math.max(max, k.length), 0);
    for (const [k, v] of scalarEntries) {
      lines.push(`${prefix}${pc.dim(k.padEnd(maxKeyLen))}  ${colorize(v)}`);
    }
  }

  // Nested: section headers
  for (const [k, v] of nestedEntries) {
    if (lines.length > 0) lines.push('');
    lines.push(`${prefix}${pc.bold(toSectionHeader(k))}`);
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${prefix}  ${pc.dim('(empty)')}`);
      } else if (v.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
        const table = formatTable(v as Record<string, unknown>[]);
        lines.push(table.split('\n').map(line => `${prefix}  ${line}`).join('\n'));
      } else {
        for (let i = 0; i < v.length; i++) {
          lines.push(`${prefix}  ${colorize(v[i])}`);
        }
      }
    } else if (typeof v === 'object' && v !== null) {
      lines.push(formatKeyValue(v as Record<string, unknown>, indent + 2));
    }
  }

  return lines.join('\n');
}

function toSectionHeader(key: string): string {
  // camelCase → Title Case with spaces
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Auto-format heuristics
// ---------------------------------------------------------------------------

function autoFormat(data: unknown): string {
  // Empty array
  if (Array.isArray(data) && data.length === 0) {
    return pc.dim('No results found.');
  }

  // Array of objects → table
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))
  ) {
    return formatTable(data as Record<string, unknown>[]);
  }

  // Array of scalars
  if (Array.isArray(data)) {
    return data.map(item => colorize(item)).join('\n');
  }

  // Single object
  if (typeof data === 'object' && data !== null) {
    return formatKeyValue(data as Record<string, unknown>);
  }

  // Scalar
  return colorize(data);
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function formatError(text: string, jsonMode: boolean): string {
  const { code, message } = extractErrorParts(text);

  if (jsonMode) {
    return JSON.stringify({ error: true, ...(code ? { code } : {}), message });
  }

  const lines: string[] = [];
  lines.push(`${pc.red('\u2717')} ${message}`);

  if (code) {
    const hint = ERROR_HINTS[code];
    if (hint) {
      lines.push('');
      lines.push(`  ${hint}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Custom formatter support
// ---------------------------------------------------------------------------

type ToolFormatter = (data: unknown) => string | undefined;
const customFormatters = new Map<string, ToolFormatter>();

export function registerFormatter(toolName: string, fn: ToolFormatter): void {
  if (customFormatters.has(toolName)) {
    throw new Error(`Formatter for '${toolName}' is already registered`);
  }
  customFormatters.set(toolName, fn);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function formatOutput(result: CallToolResult, jsonMode: boolean, toolName?: string): string {
  const text = result.content?.[0]?.type === 'text' ? (result.content[0] as { text: string }).text : '';

  // Error path
  if (result.isError) {
    return formatError(text, jsonMode);
  }

  // Handle empty/missing content
  if (!text && !result.isError) {
    return pc.dim('(no output)');
  }

  // JSON mode: pass through raw text
  if (jsonMode) {
    return text;
  }

  // Parse data
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON, return as-is
    return text;
  }

  // Try custom formatter; fall back to auto-format if it returns undefined
  if (toolName) {
    const custom = customFormatters.get(toolName);
    if (custom) {
      try {
        const formatted = custom(data);
        if (formatted !== undefined) return formatted;
      } catch (err) {
        console.error(`[format] Custom formatter for '${toolName}' failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return autoFormat(data);
}

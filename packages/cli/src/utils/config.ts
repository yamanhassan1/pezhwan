/**
 * PEZHWAN CLI — connection profile.
 *
 * Stored as JSON at $HOME/.pezhwan/config.json:
 *   { "baseUrl": "https://id.example.com", "token": "<access token>" }
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

export interface CliConfig {
  baseUrl: string;
  token?: string;
}

const FILE = join(homedir(), '.pezhwan', 'config.json');

export function configPath(): string {
  return FILE;
}

export function loadConfig(): CliConfig | null {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as CliConfig;
  } catch {
    return null;
  }
}

export function requireConfig(): CliConfig {
  const config = loadConfig();
  if (!config?.baseUrl) {
    throw new Error(
      'No PEZHWAN connection profile.\nRun: pezhwan config --set baseUrl <url> [--set token <token>]',
    );
  }
  return config;
}

export function saveConfig(config: CliConfig): void {
  mkdirSync(join(homedir(), '.pezhwan'), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

/** Parse `--flag value`, `--flag=value` and bare `-x` / positional args. */
export function parseFlags(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[arg.slice(2)] = next;
        i += 1;
      } else {
        flags[arg.slice(2)] = true;
      }
      continue;
    }
    positional.push(arg);
  }
  return { positional, flags };
}
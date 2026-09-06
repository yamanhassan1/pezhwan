/**
 * PEZHWAN CLI — entry point.
 *
 *   pezhwan <command> [args]
 *
 * Commands talk to a running PEZHWAN identity server through its REST surface
 * using the profile from ~/.pezhwan/config.json.
 */

import { CliConfig, configPath, loadConfig, parseFlags, requireConfig, saveConfig } from './utils/config.ts';
import { json, table } from './utils/format.ts';
import { err as errOut, ok as okOut, out, warn } from './utils/logger.ts';

import health from './commands/health.ts';
import auth from './commands/auth.ts';
import users from './commands/users.ts';
import sessions from './commands/sessions.ts';
import clients from './commands/clients.ts';
import roles from './commands/roles.ts';
import tenants from './commands/tenants.ts';
import audit from './commands/audit.ts';
import keys from './commands/keys.ts';
import migrate from './commands/migrate.ts';
import backup from './commands/backup.ts';
import config from './commands/config.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CliContext {
  loadConfig(): CliConfig | null;
  requireConfig(): CliConfig;
  saveConfig(config: CliConfig): void;
  api(path: string, init?: RequestInit): Promise<unknown>;
  out(text: string): void;
  err(text: string): unknown;
  ok(text: string): void;
  warn(text: string): void;
  json(data: unknown): string;
  table(headers: string[], rows: Array<Array<string | number>>): string;
}

export interface CliCommand {
  command: string;
  describe: string;
  run(ctx: CliContext, args: string[]): Promise<number> | number;
}

const commands: CliCommand[] = [
  health,
  auth,
  users,
  sessions,
  clients,
  roles,
  tenants,
  audit,
  keys,
  migrate,
  backup,
  config,
];

const registry = new Map(commands.map((c) => [c.command, c]));

function api(path: string, init?: RequestInit): Promise<unknown> {
  const profile = requireConfig();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (profile.token) {
    headers.set('Authorization', `Bearer ${profile.token}`);
  }
  return fetch(`${profile.baseUrl.replace(/\/+$/, '')}${path}`, {
    ...init,
    headers,
  }).then(async (res) => {
    const payload = (await res.json().catch(() => ({}))) as {
      data?: unknown;
      error?: { code?: string; message?: string };
    };
    if (!res.ok) {
      throw new ApiError(payload.error?.message ?? `HTTP ${res.status}`, res.status);
    }
    return payload;
  });
}

const ctx: CliContext = {
  loadConfig,
  requireConfig,
  saveConfig,
  api,
  out,
  err: (text: string): unknown => errOut(text),
  ok: okOut,
  warn,
  json,
  table,
};

function helpText(): string {
  const lines = [
    'PEZHWAN CLI',
    '',
    'Usage: pezhwan <command> [args]',
    '',
    'Commands:',
    ...commands.map((c) => `  ${c.command.padEnd(12)} ${c.describe}`),
    '',
    `Profile: ${configPath()}`,
  ];
  return lines.join('\n');
}

/** Dispatch argv (without node+script) and return the process exit code. */
export async function run(argv: string[]): Promise<number> {
  const { flags, positional } = parseFlags(argv);
  const name = positional[0];

  if (flags.help === true || flags.h === true || name === 'help' || name === undefined) {
    out(helpText());
    return 0;
  }

  const command = registry.get(name);
  if (!command) {
    errOut(`Unknown command "${name}"`);
    out(helpText());
    return 1;
  }

  try {
    return await command.run(ctx, positional.slice(1));
  } catch (caught) {
    const error = caught as Partial<ApiError> & { message?: string };
    errOut(error.message ?? String(caught));
    return 1;
  }
}

export { commands, registry, ctx, helpText };
export { parseFlags } from './utils/config.ts';
/**
 * PEZHWAN CLI — logging helpers.
 */

const ANSI = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

export function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function err(text: string): void {
  process.stderr.write(`${ANSI.red}${text}${ANSI.reset}\n`);
}

export function ok(text: string): void {
  process.stdout.write(`${ANSI.green}${text}${ANSI.reset}\n`);
}

export function warn(text: string): void {
  process.stdout.write(`${ANSI.yellow}${text}${ANSI.reset}\n`);
}
#!/usr/bin/env node
/**
 * PEZHWAN — Generate a secure random secret.
 *
 * Usage:
 *   node scripts/generate-secret.mjs [bytes]
 *
 * Defaults to 32 bytes (256 bits). Use 64 bytes for extra margin.
 *
 * IMPORTANT: The output of this command is a SECRET. It must NEVER be
 * committed to Git, posted in chat, or shared with anyone. Only put it in
 * your local .env file (which is gitignored).
 */

import { randomBytes } from 'node:crypto';

const bytes = Number(process.argv[2] ?? 32);
if (!Number.isInteger(bytes) || bytes < 16) {
  console.error('Usage: node scripts/generate-secret.mjs [bytes>=16]');
  process.exit(1);
}

console.log(randomBytes(bytes).toString('base64url'));
console.error('\n[pezhwan] WARNING: This is a secret. Do not commit or share it.');

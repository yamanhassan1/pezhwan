/**
 * PEZHWAN CLI — keys command.
 *
 * Generates an RSA signing keypair locally (no server round-trip) and writes
 * the PEM files under ./pezhwan-keys/. Upload the public key to the runtime's
 * KeyStore to enable external signing.
 */

import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CliContext } from '../index.ts';

export default {
  command: 'keys',
  describe: 'Generate an RSA keypair for signing/verification',
  async run(ctx: CliContext): Promise<number> {
    const dir = join(process.cwd(), 'pezhwan-keys');
    if (existsSync(join(dir, 'private.pem')) || existsSync(join(dir, 'public.pem'))) {
      return ctx.err('pezhwan-keys/ already contains keys; move them away first'), 1;
    }
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'private.pem'), privateKey);
    writeFileSync(join(dir, 'public.pem'), publicKey);
    const fp = createHash('sha256').update(publicKey).digest('hex');
    const pretty = fp.match(/.{1,2}/g)?.join(':') ?? fp;
    ctx.ok(`Keypair written to ${join(dir, 'public.pem')}`);
    ctx.out(`SHA256 fingerprint: ${pretty}`);
    return 0;
  },
};
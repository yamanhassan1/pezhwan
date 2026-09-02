/**
 * PEZHWAN — KeyStore persistence service.
 *
 * Wraps the crypto-layer KeyStore so its key material can survive restarts and
 * be shared across HA instances. On startup we load keys from storage; if none
 * exist we generate one and persist it. Keys are stored PEM-encoded with
 * restricted access (filesystem permissions) or in an encrypted secret store.
 */

import { promises as fs } from 'node:fs';
import { KeyStore, type SigningKey } from '@pezhwan/crypto';
import type { JwtAlgorithm } from '@pezhwan/shared';

export interface KeyStorePersistAdapter {
  load(): Promise<SigningKey[]>;
  save(keys: SigningKey[]): Promise<void>;
}

/** Filesystem-backed persistence (PEM files, owner-only permissions). */
export class FileKeyStoreAdapter implements KeyStorePersistAdapter {
  constructor(
    private readonly directory: string,
    private readonly algorithm: JwtAlgorithm = 'RS256',
  ) {}

  /** Serialises concurrent save() calls (rotation storms / overlapping init). */
  private writeChain: Promise<void> = Promise.resolve();

  private idFile(kid: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(kid)) {
      throw new Error(`Invalid signing key id "${kid}"`);
    }
    return `${this.directory}/${kid}.pem`;
  }

  async load(): Promise<SigningKey[]> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = await fs.readdir(this.directory);
    const keys: SigningKey[] = [];
    for (const file of files.filter((f) => f.endsWith('.pem'))) {
      const full = `${this.directory}/${file}`;
      try {
        const stat = await fs.stat(full);
        if (stat.size === 0) {
          // A zero-byte file carries no key material — it can only be the
          // leftover of an interrupted/aborted write (e.g. the process was
          // killed between create and flush). Discarding it loses nothing and
          // prevents a stray empty file from bricking startup.
          await fs.unlink(full);
          continue;
        }
        keys.push(
          JSON.parse(await fs.readFile(full, 'utf-8')) as SigningKey,
        );
      } catch (err) {
        // Fail closed: a present-but-corrupt key file must never be silently
        // skipped. Generating a fresh key in that case could desynchronise an
        // HA cluster or mask tampering of key material.
        throw new Error(
          `Failed to load signing key file '${file}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Clean up leftover temp files from atomic writes that never completed.
    for (const file of files.filter((f) => f.endsWith('.pem.tmp'))) {
      await fs.unlink(`${this.directory}/${file}`).catch(() => {});
    }
    return keys;
  }

  async save(keys: SigningKey[]): Promise<void> {
    const run = async (): Promise<void> => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      for (const key of keys) {
        // Atomic write: the key file only ever appears fully-formed. If the
        // process dies mid-save we leave a `.pem.tmp`, never a 0-byte `.pem`
        // that would fail a later load.
        const tmp = `${this.idFile(key.kid)}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(key), {
          encoding: 'utf-8',
          mode: 0o600,
        });
        await fs.rename(tmp, this.idFile(key.kid));
      }
    };
    // Same-kid .tmp filenames mean overlapping save() calls would race the
    // rename; queue them so one write finishes before the next begins.
    const next = this.writeChain.then(run, run);
    this.writeChain = next.catch(() => {});
    return next;
  }
}

/** In-memory adapter (single-process; keys lost on restart). */
export class MemoryKeyStoreAdapter implements KeyStorePersistAdapter {
  private keys: SigningKey[] = [];

  async load(): Promise<SigningKey[]> {
    return this.keys;
  }

  async save(keys: SigningKey[]): Promise<void> {
    this.keys = keys;
  }
}

export class KeyStoreService {
  private readonly keyStore: KeyStore;

  constructor(
    keyStore: KeyStore,
    private readonly persist: KeyStorePersistAdapter,
  ) {
    this.keyStore = keyStore;
  }

  get store(): KeyStore {
    return this.keyStore;
  }

  /** Ensure at least one signing key exists (sync — for startup paths). */
  ensureKey(): void {
    if (this.keyStore.all.length === 0) {
      this.keyStore.addKey();
    }
  }

  /** Load persisted keys into the store (or generate + persist on first boot). */
  async init(): Promise<void> {
    const persisted = await this.persist.load();
    for (const key of persisted) {
      this.keyStore.addKeyWithMaterial(key);
    }
    if (this.keyStore.all.length === 0) {
      const key = this.keyStore.addKey();
      await this.persist.save(this.keyStore.all);
    }
  }

  /** Rotate: generate a new key, persist all non-expired keys. */
  async rotate(): Promise<void> {
    const previous = this.keyStore.all.find((key) => key.status === 'ACTIVE');
    this.keyStore.addKey();
    if (previous) {
      this.keyStore.retire(previous.kid);
    }
    await this.persist.save(this.keyStore.all);
  }
}
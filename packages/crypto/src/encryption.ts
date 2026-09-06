/**
 * PEZHWAN — symmetric encryption (AES-256-GCM).
 *
 * Provides authenticated encryption with associated data (AEAD) for
 * encrypting sensitive data at rest (MFA secrets, session tokens,
 * verification tokens). AES-256-GCM provides both confidentiality
 * and integrity.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptionResult {
  /** Ciphertext (includes auth tag). */
  readonly ciphertext: Buffer;
  /** Initialization vector / nonce. */
  readonly iv: Buffer;
  /** Authentication tag. */
  readonly authTag: Buffer;
}

export interface EnvelopeEncryptionResult {
  /** The encrypted data. */
  readonly encrypted: EncryptionResult;
  /** The encrypted data key (encrypted with the master key). */
  readonly encryptedDataKey: Buffer;
  /** The data key IV. */
  readonly dataKeyIv: Buffer;
}

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * @param plaintext - Data to encrypt.
 * @param key - 32-byte encryption key.
 * @param associatedData - Optional additional authenticated data (AAD).
 * @returns EncryptionResult with ciphertext, IV, and auth tag.
 */
export function encryptAes256Gcm(
  plaintext: Buffer,
  key: Buffer,
  associatedData?: Buffer,
): EncryptionResult {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (associatedData) {
    cipher.setAAD(associatedData);
  }
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, authTag };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * @param encrypted - The encryption result (ciphertext + IV + auth tag).
 * @param key - 32-byte decryption key.
 * @param associatedData - Optional AAD (must match encryption).
 * @returns Decrypted plaintext.
 * @throws On authentication failure (tampered data).
 */
export function decryptAes256Gcm(
  encrypted: EncryptionResult,
  key: Buffer,
  associatedData?: Buffer,
): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  if (associatedData) {
    decipher.setAAD(associatedData);
  }
  return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Envelope Encryption (encrypt-DEK pattern)
// ---------------------------------------------------------------------------

/**
 * Encrypt data using envelope encryption.
 *
 * 1. Generate a random data encryption key (DEK).
 * 2. Encrypt the plaintext with the DEK using AES-256-GCM.
 * 3. Encrypt the DEK with the master key (caller-provided).
 *
 * The encrypted DEK is stored alongside the ciphertext. Only the master
 * key needs to be kept secret; the encrypted DEK can be stored in the clear.
 */
export function envelopeEncrypt(
  plaintext: Buffer,
  masterKey: Buffer,
  associatedData?: Buffer,
): EnvelopeEncryptionResult {
  // Generate a random data encryption key.
  const dataKey = randomBytes(32);

  // Encrypt the plaintext with the DEK.
  const encrypted = encryptAes256Gcm(plaintext, dataKey, associatedData);

  // Encrypt the DEK with the master key.
  const dekIv = randomBytes(12);
  const dekCipher = createCipheriv('aes-256-gcm', masterKey, dekIv);
  const encryptedDataKey = Buffer.concat([dekCipher.update(dataKey), dekCipher.final()]);

  return {
    encrypted,
    encryptedDataKey: Buffer.concat([dekIv, dekCipher.getAuthTag(), encryptedDataKey]),
    dataKeyIv: dekIv,
  };
}

/**
 * Decrypt data that was encrypted using envelope encryption.
 *
 * 1. Decrypt the DEK using the master key.
 * 2. Decrypt the plaintext using the DEK.
 */
export function envelopeDecrypt(
  encrypted: EnvelopeEncryptionResult,
  masterKey: Buffer,
  associatedData?: Buffer,
): Buffer {
  // Extract IV, auth tag, and encrypted DEK.
  const dekIv = encrypted.encryptedDataKey.subarray(0, 12);
  const dekAuthTag = encrypted.encryptedDataKey.subarray(12, 28);
  const dekCiphertext = encrypted.encryptedDataKey.subarray(28);

  // Decrypt the DEK.
  const dekDecipher = createDecipheriv('aes-256-gcm', masterKey, dekIv);
  dekDecipher.setAuthTag(dekAuthTag);
  const dataKey = Buffer.concat([dekDecipher.update(dekCiphertext), dekDecipher.final()]);

  // Decrypt the plaintext.
  return decryptAes256Gcm(encrypted.encrypted, dataKey, associatedData);
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive an encryption key from a password using PBKDF2.
 */
export function deriveKeyFromPassword(
  password: string,
  salt: Buffer,
  iterations = 100_000,
): Buffer {
  const { pbkdf2Sync } = require('node:crypto') as typeof import('node:crypto');
  return pbkdf2Sync(password, salt, iterations, 32, 'sha512');
}

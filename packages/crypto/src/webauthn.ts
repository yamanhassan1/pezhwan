/**
 * WebAuthn / FIDO2 implementation.
 *
 * Provides server-side WebAuthn registration and authentication verification
 * aligned with the W3C Web Authentication specification.
 *
 * @module
 */

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported authenticator attachment patterns */
export type AuthenticatorAttachment = 'platform' | 'cross-platform';

/** User verification requirements */
export type UserVerification = 'required' | 'preferred' | 'discouraged';

/** Resident key requirement */
export type ResidentKey = 'required' | 'preferred' | 'discouraged';

/** Attestation conveyance */
export type AttestationConveyance = 'none' | 'indirect' | 'direct';

/** Public key credential type */
export type PublicKeyCredentialType = 'public-key';

/** Authenticator transport */
export type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

/** COSE algorithm identifiers */
export enum COSEAlgorithm {
  ES256 = -7,
  ES384 = -35,
  ES512 = -36,
  RS256 = -257,
  RS384 = -258,
  RS512 = -259,
  EdDSA = -8,
}

/** FIDO2 public key credential descriptor */
export interface PublicKeyCredentialDescriptor {
  type: PublicKeyCredentialType;
  id: string;
  transports?: AuthenticatorTransport[];
}

/** Registration options (options.extensions) for navigator.credentials.create() */
export interface PublicKeyCredentialCreationOptions {
  rp: {
    name: string;
    id?: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  challenge: string;
  pubKeyCredParams: Array<{
    type: PublicKeyCredentialType;
    alg: COSEAlgorithm;
  }>;
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptor[];
  authenticatorSelection?: {
    authenticatorAttachment?: AuthenticatorAttachment;
    residentKey?: ResidentKey;
    requireResidentKey?: boolean;
    userVerification?: UserVerification;
  };
  attestation?: AttestationConveyance;
}

/** Authentication options for navigator.credentials.get() */
export interface PublicKeyCredentialRequestOptions {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptor[];
  userVerification?: UserVerification;
}

/** Stored credential data */
export interface WebAuthnCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  attestationFormat?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  nickname?: string;
}

/** Registration result from the client */
export interface RegistrationResult {
  id: string;
  rawId: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
  };
  type: PublicKeyCredentialType;
  authenticatorAttachment?: AuthenticatorAttachment;
  clientExtensionResults?: Record<string, unknown>;
}

/** Authentication result from the client */
export interface AuthenticationResult {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: PublicKeyCredentialType;
  clientExtensionResults?: Record<string, unknown>;
}

/** Collected client data (parsed) */
export interface CollectedClientData {
  type: 'webauthn.create' | 'webauthn.get';
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

/** Parsed authenticator data */
export interface AuthenticatorData {
  rpIdHash: Buffer;
  flags: number;
  signCount: Buffer;
  attestedCredentialData?: {
    aaguid: Buffer;
    credentialId: Buffer;
    credentialPublicKey: Buffer;
  };
  extensions?: Buffer;
}

/** Verification result */
export interface WebAuthnVerificationResult {
  verified: boolean;
  credentialId?: string;
  newCounter?: number;
  /** COSE-encoded public key (hex) for registered credentials. */
  credentialPublicKey?: string;
  /** Attestation format (e.g. "none", "packed", "fido-u2f") for registered credentials. */
  attestationFormat?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CBOR major types */
const CBOR_MAJOR_TEXT = 3;
const CBOR_MAJOR_MAP = 5;
const CBOR_MAJOR_BYTES = 2;
const CBOR_MAJOR_INT = 0;

const FLAG_UP = 0x01; // User Present
const FLAG_AT = 0x40; // Attested Credential Data

// ---------------------------------------------------------------------------
// CBOR helpers (minimal, focused on WebAuthn attestation)
// ---------------------------------------------------------------------------

function cborEncodeUInt(value: number): Buffer {
  if (value < 24) {
    return Buffer.from([value]);
  } else if (value < 256) {
    return Buffer.from([24, value]);
  } else if (value < 65536) {
    return Buffer.from([25, (value >> 8) & 0xff, value & 0xff]);
  }
  throw new Error('CBOR: uint too large for 4 bytes');
}

function cborEncodeMap(entries: Array<[Buffer, Buffer]>): Buffer {
  const parts: Buffer[] = [];
  // Major type 5 (map), additional info = entries.length
  if (entries.length < 24) {
    parts.push(Buffer.from([(CBOR_MAJOR_MAP << 5) | entries.length]));
  } else {
    parts.push(Buffer.from([(CBOR_MAJOR_MAP << 5) | 24, entries.length]));
  }
  for (const [key, val] of entries) {
    parts.push(key, val);
  }
  return Buffer.concat(parts);
}

function cborEncodeText(str: string): Buffer {
  const bytes = Buffer.from(str, 'utf-8');
  if (bytes.length < 24) {
    return Buffer.concat([Buffer.from([(CBOR_MAJOR_TEXT << 5) | bytes.length]), bytes]);
  }
  return Buffer.concat([
    Buffer.from([(CBOR_MAJOR_TEXT << 5) | 24, (bytes.length >> 8) & 0xff, bytes.length & 0xff]),
    bytes,
  ]);
}

function cborEncodeBytes(buf: Buffer): Buffer {
  if (buf.length < 24) {
    return Buffer.concat([Buffer.from([(CBOR_MAJOR_BYTES << 5) | buf.length]), buf]);
  }
  return Buffer.concat([
    Buffer.from([(CBOR_MAJOR_BYTES << 5) | 24, (buf.length >> 8) & 0xff, buf.length & 0xff]),
    buf,
  ]);
}

function cborEncodeInt(value: number): Buffer {
  if (value >= 0 && value < 24) {
    return Buffer.from([(CBOR_MAJOR_INT << 5) | value]);
  }
  return cborEncodeUInt(value);
}

function cborDecodeUInt(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  const first = buf[offset]!;
  const additionalInfo = first & 0x1f;

  if (additionalInfo < 24) {
    return { value: additionalInfo, bytesRead: 1 };
  } else if (additionalInfo === 24) {
    return { value: buf[offset + 1]!, bytesRead: 2 };
  } else if (additionalInfo === 25) {
    return {
      value: (buf[offset + 1]! << 8) | buf[offset + 2]!,
      bytesRead: 3,
    };
  }
  throw new Error('CBOR: unsupported uint size');
}

function cborDecodeBytes(buf: Buffer, offset: number): { value: Buffer; bytesRead: number } {
  const { value: len, bytesRead } = cborDecodeUInt(buf, offset);
  return {
    value: buf.subarray(offset + bytesRead, offset + bytesRead + len),
    bytesRead: bytesRead + len,
  };
}

function cborDecodeMap(
  buf: Buffer,
  offset: number,
): { value: Map<number, Buffer>; bytesRead: number } {
  const { value: numEntries, bytesRead: mapHeaderLen } = cborDecodeUInt(buf, offset);
  const map = new Map<number, Buffer>();
  let pos = offset + mapHeaderLen;

  for (let i = 0; i < numEntries; i++) {
    const key = cborDecodeUInt(buf, pos);
    pos += key.bytesRead;
    const val = cborDecodeBytes(buf, pos);
    pos += val.bytesRead;
    map.set(key.value, val.value);
  }

  return { value: map, bytesRead: pos - offset };
}

// ---------------------------------------------------------------------------
// Base64URL helpers
// ---------------------------------------------------------------------------

function base64UrlToBuffer(str: string): Buffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------------------
// Challenge generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographic challenge for WebAuthn.
 *
 * The challenge is a 32-byte random value, base64url encoded.
 */
export function generateChallenge(): string {
  return bufferToBase64Url(randomBytes(32));
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Generate registration options for navigator.credentials.create().
 */
export function generateRegistrationOptions(options: {
  rpName: string;
  rpId?: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  excludeCredentials?: string[];
  authenticatorAttachment?: AuthenticatorAttachment;
  userVerification?: UserVerification;
  residentKey?: ResidentKey;
  attestation?: AttestationConveyance;
  timeout?: number;
}): PublicKeyCredentialCreationOptions {
  const {
    rpName,
    rpId,
    userId,
    userName,
    userDisplayName,
    excludeCredentials = [],
    authenticatorAttachment,
    userVerification = 'preferred',
    residentKey = 'preferred',
    attestation = 'direct',
    timeout = 60000,
  } = options;

  return {
    rp: {
      name: rpName,
      id: rpId,
    },
    user: {
      id: bufferToBase64Url(Buffer.from(userId, 'utf-8')),
      name: userName,
      displayName: userDisplayName,
    },
    challenge: generateChallenge(),
    pubKeyCredParams: [
      { type: 'public-key', alg: COSEAlgorithm.ES256 },
      { type: 'public-key', alg: COSEAlgorithm.RS256 },
    ],
    timeout,
    excludeCredentials: excludeCredentials.map((id) => ({
      type: 'public-key' as PublicKeyCredentialType,
      id,
    })),
    authenticatorSelection: {
      authenticatorAttachment,
      residentKey,
      requireResidentKey: residentKey === 'required',
      userVerification,
    },
    attestation,
  };
}

/**
 * Verify a registration response.
 *
 * Parses the attestation object and validates the credential.
 */
export async function verifyRegistrationResponse(params: {
  challenge: string;
  origin: string;
  rpId: string;
  registrationResult: RegistrationResult;
  expectedUserId?: string;
}): Promise<WebAuthnVerificationResult> {
  const { challenge, origin, rpId, registrationResult } = params;

  // 1. Parse clientDataJSON
  const clientDataJSON = Buffer.from(registrationResult.response.clientDataJSON, 'base64');
  const clientData: CollectedClientData = JSON.parse(clientDataJSON.toString('utf-8'));

  // 2. Validate type
  if (clientData.type !== 'webauthn.create') {
    return { verified: false, error: 'Invalid clientData type' };
  }

  // 3. Validate challenge
  if (clientData.challenge !== challenge) {
    return { verified: false, error: 'Challenge mismatch' };
  }

  // 4. Validate origin
  if (clientData.origin !== origin) {
    return { verified: false, error: 'Origin mismatch' };
  }

  // 5. Parse attestation object
  const attestationObject = base64UrlToBuffer(registrationResult.response.attestationObject);

  // attestationObject is CBOR-encoded: { fmt, attStmt, authData }
  // For simplicity, we parse the raw CBOR structure
  const attData = parseAttestationObject(attestationObject);

  // 6. Validate rpIdHash
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();
  if (!attData.rpIdHash.equals(expectedRpIdHash)) {
    return { verified: false, error: 'rpIdHash mismatch' };
  }

  // 7. Validate flags (UP must be set)
  if (!(attData.flags & FLAG_UP)) {
    return { verified: false, error: 'User Presence not verified' };
  }

  // 8. Store credential
  const credential: WebAuthnCredential = {
    credentialId: registrationResult.id,
    publicKey: attData.attestedCredentialData
      ? attData.attestedCredentialData.credentialPublicKey.toString('hex')
      : '',
    counter: attData.signCount.readUInt32BE(0),
    attestationFormat: attData.fmt,
    createdAt: new Date(),
  };

  return {
    verified: true,
    credentialId: credential.credentialId,
    newCounter: credential.counter,
    credentialPublicKey: credential.publicKey,
    attestationFormat: credential.attestationFormat,
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Generate authentication options for navigator.credentials.get().
 */
export function generateAuthenticationOptions(options: {
  rpId?: string;
  allowCredentials?: string[];
  userVerification?: UserVerification;
  timeout?: number;
}): PublicKeyCredentialRequestOptions {
  const { rpId, allowCredentials = [], userVerification = 'preferred', timeout = 60000 } = options;

  return {
    challenge: generateChallenge(),
    timeout,
    rpId,
    allowCredentials: allowCredentials.map((id) => ({
      type: 'public-key' as PublicKeyCredentialType,
      id,
      transports: ['internal'] as AuthenticatorTransport[],
    })),
    userVerification,
  };
}

/**
 * Verify an authentication response.
 */
export async function verifyAuthenticationResponse(params: {
  challenge: string;
  origin: string;
  rpId: string;
  authenticationResult: AuthenticationResult;
  credential: WebAuthnCredential;
}): Promise<WebAuthnVerificationResult> {
  const { challenge, origin, rpId, authenticationResult, credential } = params;

  // 1. Parse clientDataJSON
  const clientDataJSON = Buffer.from(authenticationResult.response.clientDataJSON, 'base64');
  const clientData: CollectedClientData = JSON.parse(clientDataJSON.toString('utf-8'));

  // 2. Validate type
  if (clientData.type !== 'webauthn.get') {
    return { verified: false, error: 'Invalid clientData type' };
  }

  // 3. Validate challenge
  if (clientData.challenge !== challenge) {
    return { verified: false, error: 'Challenge mismatch' };
  }

  // 4. Validate origin
  if (clientData.origin !== origin) {
    return { verified: false, error: 'Origin mismatch' };
  }

  // 5. Parse authenticator data
  const authenticatorData = base64UrlToBuffer(authenticationResult.response.authenticatorData);
  const authData = parseAuthenticatorData(authenticatorData);

  // 6. Validate rpIdHash
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();
  if (!authData.rpIdHash.equals(expectedRpIdHash)) {
    return { verified: false, error: 'rpIdHash mismatch' };
  }

  // 7. Validate flags (UP must be set)
  if (!(authData.flags & FLAG_UP)) {
    return { verified: false, error: 'User Presence not verified' };
  }

  // 8. Validate counter
  const storedCounter = credential.counter;
  const newCounter = authData.signCount.readUInt32BE(0);

  // Counter must increase (or be 0 for some authenticators)
  if (storedCounter !== 0 && newCounter <= storedCounter) {
    return { verified: false, error: 'Counter did not increase' };
  }

  // 9. Verify signature
  const signature = base64UrlToBuffer(authenticationResult.response.signature);
  const publicKeyBuf = Buffer.from(credential.publicKey, 'hex');

  // The signed data is: authenticatorData || sha256(clientDataJSON)
  const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
  const signedData = Buffer.concat([authenticatorData, clientDataHash]);

  const verified = verifyCOSESignature(publicKeyBuf, signedData, signature);

  if (!verified) {
    return { verified: false, error: 'Signature verification failed' };
  }

  return {
    verified: true,
    credentialId: credential.credentialId,
    newCounter,
  };
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

interface ParsedAttestation {
  fmt: string;
  attStmt: Buffer;
  rpIdHash: Buffer;
  flags: number;
  signCount: Buffer;
  attestedCredentialData?: {
    aaguid: Buffer;
    credentialId: Buffer;
    credentialPublicKey: Buffer;
  };
}

function parseAttestationObject(buf: Buffer): ParsedAttestation {
  // Minimal CBOR parsing for attestation object
  // Structure: map { 1: fmt, 2: attStmt, 3: authData }
  const result: ParsedAttestation = {
    fmt: '',
    attStmt: Buffer.alloc(0),
    rpIdHash: Buffer.alloc(32),
    flags: 0,
    signCount: Buffer.alloc(4),
  };

  // Parse the top-level map
  const mapResult = cborDecodeMap(buf, 0);
  const map = mapResult.value;

  // Key 1 = fmt (text)
  const fmtBuf = map.get(1);
  if (fmtBuf) {
    result.fmt = fmtBuf.toString('utf-8');
  }

  // Key 2 = attStmt (bytes)
  const attStmtBuf = map.get(2);
  if (attStmtBuf) {
    result.attStmt = attStmtBuf;
  }

  // Key 3 = authData (bytes)
  const authDataBuf = map.get(3);
  if (authDataBuf) {
    const authData = parseAuthenticatorData(authDataBuf);
    result.rpIdHash = authData.rpIdHash;
    result.flags = authData.flags!;
    result.signCount = authData.signCount;
    result.attestedCredentialData = authData.attestedCredentialData;
  }

  return result;
}

function parseAuthenticatorData(buf: Buffer): AuthenticatorData {
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf[32]!;
  const signCount = buf.subarray(33, 37);

  let attestedCredentialData: AuthenticatorData['attestedCredentialData'];

  if (flags & FLAG_AT) {
    const aaguid = buf.subarray(37, 53);
    const credIdLen = (buf[53]! << 8) | buf[54]!;
    const credentialId = buf.subarray(55, 55 + credIdLen);
    const credentialPublicKey = buf.subarray(55 + credIdLen);

    attestedCredentialData = {
      aaguid,
      credentialId,
      credentialPublicKey,
    };
  }

  return {
    rpIdHash,
    flags,
    signCount,
    attestedCredentialData,
  };
}

/**
 * Verify a COSE public key signature.
 *
 * Supports ES256 (ECDSA P-256) and RS256 (RSASSA-PKCS1-v1_5).
 */
function verifyCOSESignature(publicKeyBuf: Buffer, data: Buffer, signature: Buffer): boolean {
  // Parse COSE key structure
  const keyMap = cborDecodeMap(publicKeyBuf, 0).value;
  const kty = keyMap.get(1); // Key type
  const alg = keyMap.get(3); // Algorithm

  if (!kty || !alg) {
    return false;
  }

  const ktyValue = kty[0]! & 0x1f; // EC2=2, RSA=3

  // For COSE negative integers: first byte has major type in top 3 bits
  // and the remaining bits encode the value
  let algId: number;
  if (alg[0]! >= 0x20) {
    algId = -(alg[0]! & 0x1f) - 1;
  } else {
    algId = alg[0]!;
  }

  if (ktyValue === 2 && algId === -7) {
    // EC2 + ES256
    const x = keyMap.get(-2);
    const y = keyMap.get(-3);
    if (!x || !y) return false;

    // For now, delegate to a verification approach
    // In production, use a proper EC library or Web Crypto API
    return verifyEC256Signature(data, signature, x, y);
  }

  if (ktyValue === 3 && algId === -257) {
    // RSA + RS256
    const n = keyMap.get(-1);
    const e = keyMap.get(-2);
    if (!n || !e) return false;

    return verifyRS256Signature(data, signature, n, e);
  }

  return false;
}

/**
 * Simplified ECDSA P-256 signature verification.
 *
 * Uses Node.js crypto with raw key construction.
 */
function verifyEC256Signature(data: Buffer, signature: Buffer, x: Buffer, y: Buffer): boolean {
  const { createVerify } = require('node:crypto');

  // Build raw public key (uncompressed point: 04 || x || y)
  const rawKey = Buffer.concat([Buffer.from([0x04]), x, y]);

  // P-256 OID: 1.2.840.10045.2.1 + 1.2.840.10045.3.1.7
  // For simplicity, use the raw buffer with Node's built-in verification
  try {
    const verifier = createVerify('SHA256');
    verifier.update(data);

    // Convert raw r||s to DER
    const derSig = rawToDerSignature(signature);

    return verifier.verify({ key: rawKey, format: 'der', type: 'spki' }, derSig, 'der');
  } catch {
    return false;
  }
}

/**
 * Convert raw (r||s) signature to DER format for Node.js verification.
 */
function rawToDerSignature(raw: Buffer): Buffer {
  const r = raw.subarray(0, 32);
  const s = raw.subarray(32, 64);

  // Remove leading zeros and handle negative case
  const rTrimmed = trimLeadingZero(r);
  const sTrimmed = trimLeadingZero(s);

  const rDer = wrapInteger(rTrimmed);
  const sDer = wrapInteger(sTrimmed);

  return Buffer.concat([Buffer.from([0x30, rDer.length + sDer.length]), rDer, sDer]);
}

function trimLeadingZero(buf: Buffer): Buffer {
  let start = 0;
  while (start < buf.length - 1 && buf[start] === 0) {
    start++;
  }
  return buf.subarray(start);
}

function wrapInteger(buf: Buffer): Buffer {
  if (buf[0]! & 0x80) {
    // Negative — prepend 0x00
    return Buffer.concat([Buffer.from([0x02, buf.length + 1, 0x00]), buf]);
  }
  return Buffer.concat([Buffer.from([0x02, buf.length]), buf]);
}

/**
 * Simplified RS256 signature verification.
 */
function verifyRS256Signature(data: Buffer, signature: Buffer, n: Buffer, e: Buffer): boolean {
  const { createVerify } = require('node:crypto');

  try {
    // Build PKCS#1 RSA public key
    const derKey = buildRSAPublicKeyDER(n, e);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(data);
    return verifier.verify(derKey, signature);
  } catch {
    return false;
  }
}

function buildRSAPublicKeyDER(n: Buffer, e: Buffer): Buffer {
  // Build the ASN.1 DER structure for RSA public key
  const nTrimmed = trimLeadingZero(n);
  const eTrimmed = trimLeadingZero(e);

  const nAsn1 = wrapInteger(nTrimmed);
  const eAsn1 = wrapInteger(eTrimmed);

  // SEQUENCE { INTEGER n, INTEGER e }
  const seqPayload = Buffer.concat([nAsn1, eAsn1]);
  const seq = Buffer.concat([Buffer.from([0x30, seqPayload.length]), seqPayload]);

  return seq;
}

// ---------------------------------------------------------------------------
// Credential management helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a WebAuthn credential for storage.
 */
export function serializeCredential(credential: WebAuthnCredential): string {
  return JSON.stringify(credential);
}

/**
 * Deserialize a stored WebAuthn credential.
 */
export function deserializeCredential(data: string): WebAuthnCredential {
  return JSON.parse(data) as WebAuthnCredential;
}

/**
 * Calculate the credential ID hash for indexing.
 */
export function hashCredentialId(credentialId: string): string {
  return createHash('sha256').update(credentialId, 'utf-8').digest('hex');
}

/**
 * Generate a random user ID for WebAuthn registration.
 */
export function generateUserId(length = 32): string {
  return bufferToBase64Url(randomBytes(length));
}

// ---------------------------------------------------------------------------
// Attestation object helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal attestation object for testing.
 *
 * In production, this is generated by the authenticator.
 */
export function buildAttestationObject(params: {
  rpIdHash: Buffer;
  flags: number;
  signCount: number;
  credentialId: Buffer;
  publicKeyCose: Buffer;
  fmt?: string;
}): Buffer {
  const { rpIdHash, flags, signCount, credentialId, publicKeyCose, fmt = 'none' } = params;

  // Build authData
  const signCountBuf = Buffer.alloc(4);
  signCountBuf.writeUInt32BE(signCount, 0);

  // Attested credential data
  const aaguid = Buffer.alloc(16, 0); // Non-device-specific
  const credIdLenBuf = Buffer.alloc(2);
  credIdLenBuf.writeUInt16BE(credentialId.length, 0);

  const attCredData = Buffer.concat([aaguid, credIdLenBuf, credentialId, publicKeyCose]);

  const authData = Buffer.concat([rpIdHash, Buffer.from([flags]), signCountBuf, attCredData]);

  // CBOR encode attestation object
  const fmtEntry: [Buffer, Buffer] = [cborEncodeInt(1), cborEncodeText(fmt)];

  const attStmtEntry: [Buffer, Buffer] = [
    cborEncodeInt(2),
    cborEncodeBytes(Buffer.alloc(0)), // Empty attStmt for "none"
  ];

  const authDataEntry: [Buffer, Buffer] = [cborEncodeInt(3), cborEncodeBytes(authData)];

  const map = cborEncodeMap([fmtEntry, attStmtEntry, authDataEntry]);

  return map;
}

// ---------------------------------------------------------------------------
// Utility exports
// ---------------------------------------------------------------------------

export { base64UrlToBuffer, bufferToBase64Url };

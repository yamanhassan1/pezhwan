/**
 * PEZHWAN — WebAuthn / passkey types.
 */

/** Registration challenge returned by the server. */
export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout?: number;
  authenticatorSelection?: Record<string, unknown>;
}

/** A stored WebAuthn credential. */
export interface WebAuthnCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports?: string[];
  createdAt: Date;
  lastUsedAt?: Date;
}

/** An authentication assertion to be verified. */
export interface WebAuthnAssertion {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string;
}

/** Authenticator detail recorded at registration. */
export interface WebAuthnAuthenticator {
  credentialId: string;
  publicKey: string;
  signCount: number;
  aaguid?: string;
  [key: string]: unknown;
}

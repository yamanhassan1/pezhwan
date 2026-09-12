/**
 * PEZHWAN — SAML 2.0 federation types.
 */

export type SamlNameIdFormat =
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient';

export type SamlBinding =
  | 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
  | 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';

/** SAML service-provider / identity-provider configuration. */
export interface SamlConfig {
  entityId: string;
  acsUrl: string;
  idpMetadataUrl?: string;
  idpEntityId?: string;
  idpSsoUrl?: string;
  idpPublicCert?: string;
  binding: SamlBinding;
  nameIdFormat: SamlNameIdFormat;
  /** Attribute names to map onto user fields. */
  attributeMapping: Record<string, string>;
  signingCert?: string;
  signingKey?: string;
}

/** A SAML attribute assertion. */
export interface SamlAttribute {
  /** Attribute name, e.g. \"emailAddress\". */
  name: string;
  values: string[];
  nameFormat?: string;
}

/** A decoded/verified SAML assertion. */
export interface SamlAssertion {
  subject: string;
  nameIdFormat?: string;
  attributes: SamlAttribute[];
  issuer: string;
  audience: string;
  /** ISO-8601 timestamps. */
  notBefore?: string;
  notOnOrAfter?: string;
}

/**
 * PEZHWAN — SAML 2.0 service-provider helpers.
 *
 * No external XML dependency: builds HTTP-Redirect AuthnRequests (deflate +
 * base64url) and parses assertions with an attribute extractor plus audience /
 * issuer validation hooks.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { SamlAssertion, SamlConfig } from '@pezhwan/shared';

export function buildAuthnRequest(
  config: SamlConfig,
  options: { requestId?: string; relayState?: string; forceAuthn?: boolean } = {},
): { samlRequest: string; relayState?: string } {
  const requestId = options.requestId ?? 'pz_' + Math.random().toString(36).slice(2).toUpperCase();
  const now = new Date().toISOString();
  const forceAuthn = options.forceAuthn ? ' ForceAuthn="true"' : '';
  const samlRequest =
    '<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"' +
    ' xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"' +
    ' ID="' + requestId + '" Version="2.0" IssueInstant="' + now + '"' +
    ' Destination="' + config.idpSsoUrl + '" ProtocolBinding="' + config.binding + '"' +
    ' AssertionConsumerServiceURL="' + config.acsUrl + '"' + forceAuthn + '>' +
    '<saml:Issuer>' + config.entityId + '</saml:Issuer>' +
    '<samlp:NameIDPolicy Format="' + config.nameIdFormat + '" AllowCreate="true"/>' +
    '</samlp:AuthnRequest>';
  return { samlRequest, relayState: options.relayState };
}

/** HTTP-Redirect binding URL (SAMLRequest = deflate + base64url). */
export function buildAuthnRequestUrl(
  config: SamlConfig,
  options: { requestId?: string; relayState?: string } = {},
): { url: string; relayState?: string } {
  const { samlRequest, relayState } = buildAuthnRequest(config, options);
  const deflated = deflateRawSync(Buffer.from(samlRequest, 'utf8')).toString('base64url');
  const url = new URL(config.idpSsoUrl ?? '');
  url.searchParams.set('SAMLRequest', deflated);
  if (relayState) {
    url.searchParams.set('RelayState', relayState);
  }
  return { url: url.toString(), relayState };
}

/** Decodes an SAMLResponse (base64, optionally deflate-compressed). */
export function decodeSaml(input: string): string {
  const normalized = input.trim();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(normalized, 'base64');
  } catch {
    return normalized;
  }
  try {
    return inflateRawSync(decoded).toString('utf8');
  } catch {
    return decoded.toString('utf8');
  }
}

function extractAll(xml: string, pattern: RegExp): string[] {
  const values: string[] = [];
  const regex = new RegExp(pattern.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1] !== undefined) values.push(match[1]);
  }
  return values;
}

/** Parses an assertion and validates issuer/audience against the SP config. */
export function parseSamlResponse(raw: string, config: SamlConfig): SamlAssertion {
  const xml = decodeSaml(raw);
  const subjects = extractAll(xml, /<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
  const issuers = extractAll(xml, /<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/);
  const audiences = extractAll(xml, /<saml:Audience[^>]*>([^<]+)<\/saml:Audience>/);
  const attributes: SamlAssertion['attributes'] = [];
  const attributeRe =
    /<saml:Attribute\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/saml:Attribute>/g;
  let m: RegExpExecArray | null;
  while ((m = attributeRe.exec(xml)) !== null) {
    const name = m[1] ?? '';
    const values = extractAll(m[2] ?? '', /<saml:AttributeValue[^>]*>([^<]*)<\/saml:AttributeValue>/);
    attributes.push({ name, values });
  }
  if (audiences.length > 0 && !audiences.includes(config.entityId)) {
    throw new Error('SAML assertion audience mismatch');
  }
  if (issuers.length > 0 && config.idpEntityId && !issuers.includes(config.idpEntityId)) {
    throw new Error('SAML assertion issuer mismatch');
  }
  const subject = subjects[0] ?? '';
  if (!subject) {
    throw new Error('SAML assertion missing subject');
  }
  return {
    subject,
    nameIdFormat: config.nameIdFormat,
    attributes,
    issuer: issuers[0] ?? '',
    audience: audiences[0] ?? '',
  };
}

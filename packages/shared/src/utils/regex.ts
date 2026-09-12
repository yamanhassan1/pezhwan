/**
 * PEZHWAN — common regular expressions used by validators and parsers.
 */

export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
export const HEX_RE = /^[0-9a-f]+$/i;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PASSWORD_LOWERCASE_RE = /[a-z]/;
export const PASSWORD_UPPERCASE_RE = /[A-Z]/;
export const PASSWORD_DIGIT_RE = /\d/;
export const PASSWORD_SYMBOL_RE = /[^A-Za-z0-9]/;

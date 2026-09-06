/**
 * PEZHWAN — Configuration validation.
 *
 * Validates a raw record (from env/files) against expected keys and types.
 * Returns normalized values or throws a ValidationError describing the first
 * problem found.
 */

import { ValidationError } from '@pezhwan/shared';
import type { EnvConfig } from './env.ts';

export type ValidationResult = { valid: true; value: EnvConfig } | { valid: false; issues: string[] };

const MANDATORY: Array<[keyof EnvConfig, 'string' | 'number' | 'boolean' | 'string[]']> = [
  ['issuer', 'string'],
  ['audience', 'string'],
  ['mongoUri', 'string'],
];

export function validateConfig(input: Partial<EnvConfig>): ValidationResult {
  const issues: string[] = [];
  for (const [key, expectedType] of MANDATORY) {
    const value = input[key];
    if (value === undefined) {
      issues.push(`config.${key} is required`);
      continue;
    }
    if (expectedType === 'string[]') {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        issues.push(`config.${key} must be an array of strings`);
      }
    } else if (typeof value !== expectedType) {
      issues.push(`config.${key} must be ${expectedType}`);
    }
  }
  if (issues.length > 0) return { valid: false, issues };
  return { valid: true, value: input as EnvConfig };
}

/** Throwing variant used at bootstrap. */
export function assertValidConfig(input: Partial<EnvConfig>): EnvConfig {
  const result = validateConfig(input);
  if (!result.valid) {
    throw new ValidationError(`Invalid configuration: ${result.issues.join('; ')}`, 'INVALID_CONFIG');
  }
  return result.value;
}
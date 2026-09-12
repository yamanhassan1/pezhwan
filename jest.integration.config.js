/**
 * DEPRECATED — keeps tools that expect a separate integration Jest config from
 * erroring. Integration suites run via `node --test`:
 *   npm run test:integration
 * If you open this with an editor that runs Jest, tests/integration runs under
 * node --test instead — do not wire this file into CI.
 */
export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
};

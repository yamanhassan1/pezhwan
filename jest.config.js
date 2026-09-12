/**
 * DEPRECATED — keeps editors/tooling that expect a Jest config from erroring.
 *
 * The project's test runner is `node --test` (root scripts: test:unit,
 * test:security-suite, test:failure, test:interop, test:integration, test:root).
 * This config intentionally matches nothing and is NOT used by CI.
 */
export default {
  testEnvironment: 'node',
  testMatch: [],
};

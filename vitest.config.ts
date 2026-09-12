/**
 * DEPRECATED — placeholder kept for editors/tooling that expect a Vitest
 * config. The project's test runner is `node --test` (root `test:*` scripts).
 * The default `include` is cleared so Vitest would match nothing.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [],
  },
});

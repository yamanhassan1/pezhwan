// eslint.config.mjs — PEZHWAN flat ESLint config (ESLint 9 + prettier).
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/build/**',
      '**/keys/**',
      '**/backups/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // NodeType-stripping + import-ext helpers require no explicit return
      // types on exported functions given this project's conventions.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'no-fallthrough': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  prettier,
);

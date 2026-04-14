/**
 * Minimal, pragmatic ESLint config for the WebhookOS backend.
 *
 * Philosophy:
 *  - Catch real bugs (no-unused-vars, no-undef, prefer-const, eqeqeq)
 *  - Stay out of the way on style (Prettier handles that separately)
 *  - Downgrade TypeScript-specific rules to warnings so CI stays green
 *    during incremental cleanup. Flip to "error" once clean.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: false, // don't typecheck here — tsc --noEmit handles that in CI
  },
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Real-bug catchers → error
    eqeqeq: ['error', 'smart'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-prototype-builtins': 'off',
    'no-case-declarations': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],

    // TS ecosystem — warnings only, fix gradually
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-var-requires': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.js',
    '*.cjs',
    'logs/',
  ],
};

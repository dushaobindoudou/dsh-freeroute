import js from '@eslint/js'

export default [
  {
    ignores: [
      'node_modules/**',
      '.npm-cache/**',
      'coverage/**',
      'dist/**',
      // Both are assembled/generated from src/ by scripts/build-dynamic.mjs
      // (+ build-static*.mjs); their free identifiers (harness, __nodeFs,
      // React, styles, host) only resolve inside the assembled scope. The
      // assembled lib/ output IS linted, so fragments stay covered there.
      'src/**',
      'freeroute-dynamic/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['lib/index.js', 'test/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        AbortSignalTimeout: 'readonly',
        Buffer: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    files: ['lib/client.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      // fire-and-forget `.catch(function () { })` guards are deliberate here
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]

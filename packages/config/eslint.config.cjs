const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const vue = require('eslint-plugin-vue');

module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '.superpowers/**',
      '.playwright-mcp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // eslint-plugin-vue flat configs (already scoped to **/*.vue internally).
  ...vue.configs['flat/recommended'],
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        // <script lang="ts"> blocks are parsed by typescript-eslint.
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      // Vue SFC <script lang="ts"> blocks rely on Nuxt auto-imports
      // (definePageMeta, useHead, ...). typescript-eslint disables no-undef
      // for TS files because the compiler already catches undefined
      // identifiers; extend that to TS-backed SFCs so auto-imports are not
      // reported as globals. `pnpm typecheck` remains the source of truth.
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.cjs', '**/*.cts', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

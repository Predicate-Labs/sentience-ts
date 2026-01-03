// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      prettier: prettier,
    },
    rules: {
      ...prettierConfig.rules,
      '@typescript-eslint/no-explicit-any': 'off', // Many any types in codebase, will fix incrementally
      '@typescript-eslint/no-unsafe-assignment': 'off', // Will fix incrementally
      '@typescript-eslint/no-unsafe-member-access': 'off', // Will fix incrementally
      '@typescript-eslint/no-unsafe-call': 'off', // Will fix incrementally
      '@typescript-eslint/no-unsafe-return': 'off', // Will fix incrementally
      '@typescript-eslint/no-unsafe-argument': 'off', // Will fix incrementally
      '@typescript-eslint/restrict-template-expressions': 'off', // Will fix incrementally
      '@typescript-eslint/unbound-method': 'off', // Will fix incrementally
      '@typescript-eslint/require-await': 'warn', // Allow async without await
      '@typescript-eslint/no-misused-promises': 'warn', // Allow promises in callbacks
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-case-declarations': 'off', // Allow declarations in case blocks
      '@typescript-eslint/no-unused-vars': [
        'warn', // Changed to warn for now
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': 'error',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      'src/extension/**',
      'examples/**',
      'tests/**',
    ],
  }
);


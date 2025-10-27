import globals from 'globals';
import pluginJs from '@eslint/js';
import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js';
import pluginJsxA11y from 'eslint-plugin-jsx-a11y';
import { fixupConfigRules } from '@eslint/compat';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules/*', 'dist/*'],
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...globals.node,
        global: 'readonly',
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'jsx-a11y': pluginJsxA11y,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Project customizations (reuse JS rules below as needed)
      'arrow-parens': ['error', 'always'],
      'no-console': ['error'],
      'max-len': ['error', { code: 120, ignoreComments: true }],
      'no-unused-vars': 'off', // handled by TS plugin
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'semi-style': ['error', 'last'],
      ...pluginJsxA11y.configs.recommended.rules,
    },
    settings: { react: { version: 'detect' } },
  },
  pluginJs.configs.recommended,
  ...fixupConfigRules(pluginReactConfig),
  {
    plugins: {
      'jsx-a11y': pluginJsxA11y,
    },
  },
  {
    rules: {
      'arrow-parens': ['error', 'always'],
      'no-console': ['error'],
      'max-len': ['error', { 'code': 120, 'ignoreComments': true }],
      'no-restricted-syntax': ['error', 'FunctionDeclaration'],
      // Disable base no-unused-vars here; TS override handles it.
      'no-unused-vars': 'off',
      'quotes': ['error', 'single'],
      'react/jsx-uses-react': ['off'],
      'react/react-in-jsx-scope': ['off'],
      'semi': ['error', 'always'],
      'semi-style': ['error', 'last'],
      ...pluginJsxA11y.configs.recommended.rules,
    },
  },
];

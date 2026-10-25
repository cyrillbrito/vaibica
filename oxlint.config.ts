import { defineConfig } from 'oxlint';
import solidV2 from 'eslint-plugin-solid/configs/v2';

export default defineConfig({
  // Oxlint's defaults plus import, which no-cycle below needs on at the top.
  plugins: ['unicorn', 'typescript', 'oxc', 'import'],
  jsPlugins: ['eslint-plugin-solid', './lint/bica.js'],
  ignorePatterns: ['**/*.gen.*', '**/dist', '**/node_modules'],
  settings: solidV2.settings,
  rules: {
    ...solidV2.rules,
    'bica/type-tokens': 'error',
    'bica/radius-tokens': 'error',
  },
  overrides: [
    {
      // Features import each other freely, so a cycle is the one mistake left
      // in the client's layout (docs/architecture.md). The server keeps one on
      // purpose: session tools start sessions, which need the session tools.
      files: ['client/**', 'shared/**'],
      rules: { 'import/no-cycle': ['error', { ignoreTypes: true }] },
    },
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
});

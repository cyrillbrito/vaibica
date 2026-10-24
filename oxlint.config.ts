import { defineConfig } from 'oxlint';
import solidV2 from 'eslint-plugin-solid/configs/v2';

export default defineConfig({
  jsPlugins: ['eslint-plugin-solid', './lint/bica.js'],
  ignorePatterns: ['**/*.gen.*', 'dist'],
  settings: solidV2.settings,
  rules: {
    ...solidV2.rules,
    'bica/type-tokens': 'error',
    'bica/radius-tokens': 'error',
    'bica/server-only': 'error',
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
});

// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*']),
  expoConfig,
  {
    rules: {
      // React Native <Text> renders quotes/apostrophes verbatim; Italian copy is full of them.
      'react/no-unescaped-entities': 'off',
    },
  },
]);

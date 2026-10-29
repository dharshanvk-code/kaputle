import globals from 'globals';
import js from '@eslint/js';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    files: ['guide/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests and the video recorder run snippets inside the guide page too.
    files: ['tests/**/*.mjs', 'tools/record-video.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
];

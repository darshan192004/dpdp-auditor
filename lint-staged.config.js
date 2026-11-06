module.exports = {
  '*.{ts,mts,cts,js,mjs,cjs}': ['eslint --fix --max-warnings 0', 'prettier --write'],
  '*.{json,jsonc,yaml,yml}': ['prettier --write'],
};

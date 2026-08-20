// `npm run lint` had no config at all and always errored out. eslint-config-expo
// ships the eslintrc-style config as its main export, which is what ESLint 8 wants.
module.exports = {
  extends: 'expo',
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', 'android/', 'ios/'],
};

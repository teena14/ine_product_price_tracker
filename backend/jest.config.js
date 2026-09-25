/** @type {import('jest').Config} */
const config = {
  // Use Node test environment
  testEnvironment: 'node',

  // ESM support — package.json has "type": "module" so .js files are treated as ESM automatically
  // extensionsToTreatAsEsm is NOT needed (and causes an error) when type:module is set

  // Test file pattern
  testMatch: ['**/tests/**/*.test.js'],

  // Don't transform node_modules; transform src files through identity (ESM native)
  transform: {},

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // entry point, not unit-testable in isolation
  ],

  // Reasonable timeout for tests that involve async I/O
  testTimeout: 15000,
};

export default config;

/** @type {import('jest').Config} */
const config = {
  // Use Node test environment
  testEnvironment: 'node',

  // ESM support — requires --experimental-vm-modules flag (set in package.json)
  extensionsToTreatAsEsm: ['.js'],

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

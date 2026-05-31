/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/apps/server/tsconfig.json',
      // Speed up tests: skip full type-checking during Jest runs.
      // Type-checking still happens via `pnpm type-check` / CI.
      diagnostics: false,
      isolatedModules: true,
    },
  },
  // Limit Jest's filesystem crawl to relevant directories.
  roots: ['<rootDir>/scripts', '<rootDir>/apps/server/src', '<rootDir>/packages'],
  testMatch: ['**/scripts/**/*.spec.ts'],
  // Idle-mode sim runs in the main test workflow; keep it out of this workflow.
  testPathIgnorePatterns: ['idle-mode-sim\\.spec\\.ts$'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@gotchiverse/(.*)$': '<rootDir>/packages/$1/src',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^src/(.*)$': '<rootDir>/apps/server/src/$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/docs'],
  transformIgnorePatterns: ['node_modules/(?!(graphql-request)/)'],
  setupFiles: ['<rootDir>/jest.env.setup.js'],
};

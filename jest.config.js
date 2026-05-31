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
  // Limit Jest's filesystem crawl to the relevant test + source roots.
  // This noticeably speeds up startup in large repos with lots of non-test files.
  roots: [
    '<rootDir>/apps/server/src',
    '<rootDir>/apps/client/src',
    '<rootDir>/scripts',
    // Note: keep Jest’s crawl surface area small. `packages/` contains shared
    // libraries but no tests matched by this config’s `testMatch`.
  ],
  testMatch: [
    // Keep CI + `pnpm test:agent` focused on Idle Mode; run other script-level specs
    // in a separate workflow (see jest.scripts.config.js).
    '**/scripts/idle-mode-sim.spec.ts',
    '**/apps/server/src/**/*.test.ts',
    '**/apps/server/src/**/*.spec.ts',
    '**/apps/client/src/**/*.test.ts',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@gotchiverse/(.*)$': '<rootDir>/packages/$1/src',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^src/(.*)$': '<rootDir>/apps/server/src/$1',
    '^graphql-request$': '<rootDir>/__mocks__/graphql-request.ts',
  },
  modulePathIgnorePatterns: ['<rootDir>/docs'],
  transformIgnorePatterns: [
    'node_modules/(?!(graphql-request)/)',
  ],
  setupFiles: ['<rootDir>/jest.env.setup.js'],
};

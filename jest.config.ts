const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/scripts/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@gotchiverse/(.*)$': '<rootDir>/packages/$1/src',
    '^src/(.*)$': '<rootDir>/apps/server/src/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>/packages'],
  modulePathIgnorePatterns: ['<rootDir>/docs'],
};

export default config;

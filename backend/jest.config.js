/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/tests/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  globalSetup: '<rootDir>/src/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/src/tests/globalTeardown.ts',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 120000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { strict: false, esModuleInterop: true, resolveJsonModule: true } }],
  },
  collectCoverageFrom: ['src/services/**/*.ts', 'src/utils/**/*.ts', 'src/models/**/*.ts'],
};

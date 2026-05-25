/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    '^.+\.jsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    '^@kilocode/sdk/server$': '<rootDir>/node_modules/@kilocode/sdk/dist/server.js',
    '^@kilocode/sdk/client$': '<rootDir>/node_modules/@kilocode/sdk/dist/client.js',
  },
  transformIgnorePatterns: [],
};

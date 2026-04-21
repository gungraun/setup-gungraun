export default {
    preset: 'ts-jest',
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
    },
    moduleNameMapper: {
        '^@actions/github$': '<rootDir>/__mocks__/@actions/github.ts'
    },
    testEnvironment: 'node',
    roots: ['<rootDir>/__tests__'],
    testMatch: ['**/*.test.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['json-summary', 'lcov', 'text']
};

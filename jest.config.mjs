export default {
    preset: 'ts-jest',
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
    },
    testEnvironment: 'node',
    roots: ['<rootDir>/__tests__'],
    testMatch: ['**/*.test.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['json-summary', 'lcov', 'text']
};

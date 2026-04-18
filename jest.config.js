module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/__tests__'],
    testMatch: ['**/*.test.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['json-summary', 'lcov', 'text']
};
